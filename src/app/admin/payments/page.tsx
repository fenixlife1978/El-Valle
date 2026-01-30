
'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Check, CheckCircle2, DollarSign, FileText, Hash, Loader2, Upload, Banknote, Info, X, Save, FileUp, UserPlus, Trash2, XCircle, Search, ChevronDown, Minus, Equal, Receipt, CheckCircle, Clock, Eye, AlertTriangle, User, Calculator } from 'lucide-react';
import { format, isBefore, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, writeBatch, orderBy, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Image from 'next/image';
import { Alert } from "@/components/ui/alert";
import { useAuthorization } from '@/hooks/use-authorization';

// --- TYPES ---
type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
    balance?: number;
    role?: string;
};
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; amount: string; selectedProperty: { street: string, house: string } | null; };
type PaymentMethod = 'movil' | 'transferencia' | '';
type Debt = { id: string; ownerId: string; year: number; month: number; amountUSD: number; description: string; status: 'pending' | 'paid' | 'vencida'; };
type PaymentDetails = { paymentMethod: 'movil' | 'transferencia' | ''; bank: string; otherBank: string; reference: string; };
type Payment = { id: string; beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[]; beneficiaryIds: string[]; totalAmount: number; exchangeRate: number; paymentDate: Timestamp; reportedAt: Timestamp; paymentMethod: 'transferencia' | 'movil' | 'efectivo' | 'zelle'; bank: string; reference: string; status: 'pendiente' | 'aprobado' | 'rechazado'; receiptUrl?: string; observations?: string; receiptNumbers?: { [ownerId: string]: string }; };

// --- CONSTANTS & HELPERS ---
const VENEZUELAN_BANKS = [
    { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'tesoro', label: 'Banco del Tesoro' },
    { value: 'otro', label: 'Otro' },
];
const MONTHS_LOCALE: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};
const formatCurrency = (num: number) => `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


// --- VERIFICATION COMPONENT ---
function VerificationComponent() {
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const { toast } = useToast();
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const { activeCondoId } = useAuth();
    const workingCondoId = (sId && user?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pendiente');
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        if (!workingCondoId) { setLoading(false); return; }
        const q = query(collection(db, 'condominios', workingCondoId, 'payments'), orderBy('reportedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
            setLoading(false);
        }, (error) => {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos.' });
            setLoading(false);
        });
        return () => unsubscribe();
    }, [workingCondoId, toast]);

    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            const statusMatch = p.status === activeTab;
            const searchMatch = searchTerm === '' || p.reference.includes(searchTerm) || p.beneficiaries.some(b => b.ownerName.toLowerCase().includes(searchTerm.toLowerCase()));
            return statusMatch && searchMatch;
        });
    }, [payments, activeTab, searchTerm]);

    const handleApprove = (payment: Payment) => {
        requestAuthorization(async () => {
            if (!workingCondoId) return;
            setIsVerifying(true);
            try {
                await runTransaction(db, async (transaction) => {
                    const paymentRef = doc(db, 'condominios', workingCondoId, 'payments', payment.id);
                    const receiptNumbers: { [ownerId: string]: string } = {};

                    for (const beneficiary of payment.beneficiaries) {
                        const ownerRef = doc(db, 'condominios', workingCondoId, 'owners', beneficiary.ownerId);
                        const ownerDoc = await transaction.get(ownerRef);
                        if (!ownerDoc.exists()) throw new Error(`El propietario ${beneficiary.ownerName} no fue encontrado.`);

                        let ownerBalance = ownerDoc.data().balance || 0;
                        let paymentAmountLeft = beneficiary.amount;
                        
                        receiptNumbers[beneficiary.ownerId] = `REC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;

                        const debtsQuery = query(collection(db, 'condominios', workingCondoId, 'debts'), where('ownerId', '==', beneficiary.ownerId), where('status', 'in', ['pending', 'vencida']), orderBy('year'), orderBy('month'));
                        const debtsSnapshot = await getDocs(debtsQuery);

                        for (const debtDoc of debtsSnapshot.docs) {
                            if (paymentAmountLeft <= 0) break;
                            const debt = debtDoc.data() as Debt;
                            const debtAmountBs = debt.amountUSD * payment.exchangeRate;

                            if (paymentAmountLeft >= debtAmountBs) {
                                transaction.update(debtDoc.ref, { status: 'paid', paymentId: payment.id, paymentDate: payment.paymentDate, paidAmountUSD: debt.amountUSD });
                                paymentAmountLeft -= debtAmountBs;
                            }
                        }

                        if (paymentAmountLeft > 0) {
                            ownerBalance += paymentAmountLeft;
                            transaction.update(ownerRef, { balance: ownerBalance });
                        }
                    }

                    transaction.update(paymentRef, { status: 'aprobado', observations: 'Pago verificado y aplicado por la administración.', receiptNumbers });
                });
                
                toast({ title: 'Pago Aprobado', description: 'El pago ha sido verificado y aplicado correctamente.', className: 'bg-green-100 border-green-400 text-green-800' });
                setSelectedPayment(null);

            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error al Aprobar', description: error.message || 'No se pudo completar la transacción.' });
            } finally {
                setIsVerifying(false);
            }
        });
    };

    const handleReject = (payment: Payment) => {
        if (!rejectionReason) { toast({ variant: 'destructive', title: 'Razón requerida' }); return; }
        requestAuthorization(async () => {
            if (!workingCondoId) return;
            setIsVerifying(true);
            try {
                await updateDoc(doc(db, 'condominios', workingCondoId, 'payments', payment.id), { status: 'rechazado', observations: rejectionReason });
                toast({ title: 'Pago Rechazado' });
                setSelectedPayment(null);
                setRejectionReason('');
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error al Rechazar', description: error.message });
            } finally {
                setIsVerifying(false);
            }
        });
    };
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Bandeja de Pagos</CardTitle>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar por nombre o referencia..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-64" />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
                        <TabsTrigger value="aprobado">Aprobados</TabsTrigger>
                        <TabsTrigger value="rechazado">Rechazados</TabsTrigger>
                    </TabsList>
                    <div className="mt-4">
                        {loading ? <div className="text-center p-10"><Loader2 className="animate-spin h-8 w-8 mx-auto text-primary" /></div> : (
                            <Table>
                                <TableHeader><TableRow><TableHead>Propietario(s)</TableHead><TableHead>Fecha de Pago</TableHead><TableHead>Monto (Bs.)</TableHead><TableHead>Referencia</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {filteredPayments.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay pagos en esta categoría.</TableCell></TableRow>
                                    ) : filteredPayments.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">{p.beneficiaries.map(b => b.ownerName).join(', ')}</TableCell>
                                            <TableCell>{format(p.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>{formatCurrency(p.totalAmount)}</TableCell>
                                            <TableCell className="font-mono">{p.reference}</TableCell>
                                            <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setSelectedPayment(p)}><Eye className="mr-2 h-4 w-4" /> Ver Detalles</Button></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Tabs>
                {selectedPayment && (
                    <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader><DialogTitle>Detalles del Pago - {selectedPayment.reference}</DialogTitle><DialogDescription>Reportado el {format(selectedPayment.reportedAt.toDate(), 'dd/MM/yyyy HH:mm')}</DialogDescription></DialogHeader>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto">
                                <div className="space-y-4">
                                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Beneficiarios</CardTitle></CardHeader><CardContent>{selectedPayment.beneficiaries.map((b, i) => (<div key={i} className="text-sm flex justify-between items-center"><span><User className="inline h-4 w-4 mr-1"/>{b.ownerName}</span><span className="font-bold">{formatCurrency(b.amount)}</span></div>))}</CardContent></Card>
                                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Detalles de la Transacción</CardTitle></CardHeader><CardContent className="text-sm space-y-1"><p><strong>Monto Total:</strong> {formatCurrency(selectedPayment.totalAmount)}</p><p><strong>Fecha:</strong> {format(selectedPayment.paymentDate.toDate(), 'dd/MM/yyyy')}</p><p><strong>Método:</strong> {selectedPayment.paymentMethod}</p><p><strong>Banco:</strong> {selectedPayment.bank}</p></CardContent></Card>
                                    {selectedPayment.status === 'rechazado' && (<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>Motivo del Rechazo:</strong> {selectedPayment.observations}</AlertDescription></Alert>)}
                                </div>
                                <div><Label>Comprobante de Pago</Label>{selectedPayment.receiptUrl ? (<div className="mt-2 border rounded-lg overflow-hidden"><Image src={selectedPayment.receiptUrl} alt="Comprobante" width={400} height={600} className="w-full h-auto" /></div>) : <p className="text-sm text-muted-foreground">No se adjuntó comprobante.</p>}</div>
                            </div>
                            {selectedPayment.status === 'pendiente' && (<DialogFooter className="border-t pt-4 gap-4"><div className="w-full"><Label htmlFor="rejectionReason">Motivo del rechazo (opcional)</Label><Textarea id="rejectionReason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Ej: Referencia no coincide, monto incorrecto..." /></div><div className="w-full flex flex-col sm:flex-row gap-2 justify-end"><Button variant="destructive" onClick={() => handleReject(selectedPayment)} disabled={isVerifying || !rejectionReason}>{isVerifying ? <Loader2 className="animate-spin" /> : <XCircle className="mr-2"/>} Rechazar</Button><Button onClick={() => handleApprove(selectedPayment)} disabled={isVerifying} className="bg-green-500 hover:bg-green-600">{isVerifying ? <Loader2 className="animate-spin" /> : <CheckCircle className="mr-2"/>} Aprobar</Button></div></DialogFooter>)}
                        </DialogContent>
                    </Dialog>
                )}
            </CardContent>
        </Card>
    );
}

// --- REPORT PAYMENT COMPONENT (for Admin) ---
function ReportPaymentComponent() {
    // This is largely copied from owner/payments/page.tsx, but adapted for admin use
    const { toast } = useToast();
    const { user: authUser, activeCondoId } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('movil');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);

    useEffect(() => {
        if (!activeCondoId) return;
        const q = query(collection(db, "condominios", activeCondoId, "owners"), where("role", "==", "propietario"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
        return () => unsubscribe();
    }, [activeCondoId]);

    // ... (rest of hooks and handlers from owner's ReportPaymentComponent, they are mostly reusable) ...
    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balance = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);
    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });
    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => {
        if (beneficiaryRows.length > 1) { setBeneficiaryRows(rows => rows.filter(row => row.id !== id)); } 
        else { toast({ variant: "destructive", title: "Acción no permitida" }); }
    };
    const getFilteredOwners = (searchTerm: string) => {
        if (!searchTerm || searchTerm.length < 2) return [];
        return allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressedBase64 = await compressImage(file, 800, 800);
            setReceiptImage(compressedBase64);
        } catch (error) { toast({ variant: 'destructive', title: 'Error de imagen' }); }
    };
    
    const resetForm = () => { /* ... reset logic ... */ };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Validation logic...
        if (!activeCondoId || !authUser) { /* handle error */ setIsSubmitting(false); return; }
        try {
            const beneficiaries = beneficiaryRows.map(row => ({ ownerId: row.owner!.id, ownerName: row.owner!.name, ...(row.selectedProperty && { street: row.selectedProperty.street, house: row.selectedProperty.house }), amount: Number(row.amount) }));
            const paymentData = { /* ... construct payment data ... */ reportedBy: authUser.uid, /* ... */ };
            await addDoc(collection(db, "condominios", activeCondoId, "payments"), paymentData);
            // ... success logic
            resetForm();
            setIsInfoDialogOpen(true);
        } catch (error) { /* handle error */ } 
        finally { setIsSubmitting(false); }
    };

    return (
        // JSX for ReportPaymentComponent (copied and adapted from owner's page)
        <Card><CardHeader><CardTitle>Reportar Pago Manualmente</CardTitle></CardHeader>
        <form onSubmit={handleSubmit}><CardContent>...</CardContent><CardFooter>...</CardFooter></form>
        </Card>
    );
}


// --- CALCULATOR COMPONENT (for Admin) ---
function AdminPaymentCalculatorComponent() {
    const { activeCondoId, user } = useAuth();
    const { toast } = useToast();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<(Owner & { balance: number }) | null>(null);
    const [ownerDebts, setOwnerDebts] = useState<Debt[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({ paymentMethod: '', bank: '', otherBank: '', reference: '' });

    useEffect(() => {
        if (!activeCondoId) return;
        setLoading(true);
        const q = query(collection(db, "condominios", activeCondoId, "owners"), where("role", "==", "propietario"));
        const unsubOwners = onSnapshot(q, (snapshot) => {
            setAllOwners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)));
            setLoading(false);
        });

        const settingsRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        const unsubSettings = onSnapshot(settingsRef, (snap) => {
             if (snap.exists()) {
                const settings = snap.data();
                setCondoFee(settings.condoFee || 0);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) setActiveRate(activeRateObj.rate);
            }
        });
        return () => { unsubOwners(); unsubSettings(); };
    }, [activeCondoId]);
    
    useEffect(() => {
        if (!selectedOwner || !activeCondoId) { setOwnerDebts([]); return; }
        const debtsQuery = query(collection(db, "condominios", activeCondoId, "debts"), where("ownerId", "==", selectedOwner.id));
        const unsubDebts = onSnapshot(debtsQuery, (snapshot) => {
            setOwnerDebts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt)).sort((a, b) => a.year - b.year || a.month - b.month));
        });
        return () => unsubDebts();
    }, [selectedOwner, activeCondoId]);

    const filteredOwners = useMemo(() => {
        if (!searchTerm) return [];
        return allOwners.filter(o => o.name && o.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm, allOwners]);

    // ... (All other hooks and handlers from owner's calculator component, adapted to use `selectedOwner` state)

    if (!selectedOwner) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Calculadora de Pagos</CardTitle>
                    <CardDescription>Busque un propietario para calcular y registrar un pago en su nombre.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar por nombre..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    {searchTerm && filteredOwners.length > 0 && (
                        <Card className="mt-2 border rounded-lg"><ScrollArea className="h-48">{filteredOwners.map(owner => (
                            <div key={owner.id} onClick={() => setSelectedOwner(owner as any)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                <p className="font-medium">{owner.name}</p>
                            </div>))}
                        </ScrollArea></Card>
                    )}
                </CardContent>
            </Card>
        );
    }
    
    // ... JSX for the calculator once an owner is selected
    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={() => setSelectedOwner(null)}><ArrowLeft className="mr-2 h-4 w-4"/>Cambiar Propietario</Button>
            {/* The rest of the calculator UI */}
        </div>
    );
}

// --- MAIN PAGE COMPONENT ---
function PaymentsPage() {
    const searchParams = useSearchParams();
    const defaultTab = searchParams.get('tab') || 'verify';

    return (
        <div className="space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Gestión de <span className="text-primary">Pagos</span>
                </h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Verificación, registro manual y cálculo de pagos.
                </p>
            </div>
            <Tabs defaultValue={defaultTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="verify">Verificación de Pagos</TabsTrigger>
                    <TabsTrigger value="report">Reportar Pago Manual</TabsTrigger>
                    <TabsTrigger value="calculator">Calculadora</TabsTrigger>
                </TabsList>
                <TabsContent value="verify" className="mt-6">
                    <VerificationComponent />
                </TabsContent>
                <TabsContent value="report" className="mt-6">
                    <ReportPaymentComponent />
                </TabsContent>
                <TabsContent value="calculator" className="mt-6">
                    <AdminPaymentCalculatorComponent />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <PaymentsPage />
        </Suspense>
    );
}


'use client';

import React, { useState, useEffect, useMemo, Suspense, use } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { 
    Search, CheckCircle, XCircle, Eye, MoreHorizontal, 
    Download, Loader2, Calendar as CalendarIcon, Banknote, 
    UserPlus, CheckCircle2, WalletCards, Trash2, 
    Hash, FileText, Save, Share2, FileDown,
    Calculator, Minus, Equal, Check, Receipt, X, DollarSign,
    PlusCircle, FileUp, Info, Building, AlertCircle
} from 'lucide-react';
import { format, startOfMonth, addMonths, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { 
    collection, onSnapshot, query, addDoc, serverTimestamp, 
    doc, getDoc, where, getDocs, Timestamp, runTransaction, 
    updateDoc, increment, orderBy, setDoc 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import Image from 'next/image';
import { useAuthorization } from '@/hooks/use-authorization';
import { 
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
    DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub,
    DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal
} from '@/components/ui/dropdown-menu';
import { generatePaymentReceipt } from '@/lib/pdf-generator';
import Decimal from 'decimal.js';

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type Owner = { id: string; name: string; properties: { street: string, house: string }[]; balance: number; role?: string; email?: string; };
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; amount: string; selectedProperty: { street: string, house: string } | null; };
type PaymentMethod = 'movil' | 'transferencia' | 'efectivo_bs' | '';
type LiquidatedConcept = { ownerId: string; description: string; amountUSD: number; period: string; type: 'deuda' | 'adelanto' | 'abono'; };
type Payment = { 
    id: string; 
    beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[]; 
    beneficiaryIds: string[]; 
    totalAmount: number; 
    exchangeRate: number; 
    paymentDate: Timestamp; 
    reportedAt: Timestamp; 
    paymentMethod: string; 
    bank: string; 
    reference: string; 
    status: 'pendiente' | 'aprobado' | 'rechazado'; 
    receiptUrl?: string; 
    observations?: string; 
    receiptNumbers?: { [ownerId: string]: string };
    liquidatedConcepts?: LiquidatedConcept[];
};

const BDV_ACCOUNT_ID = "Hlc0ky0QdnaXIsuf19Od";
const CAJA_PRINCIPAL_ID = "CAJA_PRINCIPAL_ID";

const getFilteredOwners = (searchTerm: string, allOwners: Owner[]) => {
    if (!searchTerm || searchTerm.length < 2) return [];
    return allOwners.filter(owner => 
        owner.name?.toLowerCase().includes(searchTerm.toLowerCase()) && 
        owner.email?.toLowerCase() !== 'vallecondo@gmail.com'
    );
};

// --- COMPONENTE DE VERIFICACIÓN ---
function VerificationComponent({ condoId }: { condoId: string }) {
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const { toast } = useToast();

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeSubTab, setActiveSubTab] = useState('pendiente');
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
    const [localCompanyInfo, setLocalCompanyInfo] = useState<any>(null);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        return onSnapshot(settingsRef, (snap) => {
            if (snap.exists()) setLocalCompanyInfo(snap.data().companyInfo);
        });
    }, [condoId]);

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, 'payments'), orderBy('reportedAt', 'desc'));
        return onSnapshot(q, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
            setLoading(false);
        });
    }, [condoId]);

    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            if (p.status !== activeSubTab) return false;
            if (!searchTerm) return true;
            const search = searchTerm.toLowerCase();
            return (p.reference?.toLowerCase().includes(search) || p.beneficiaries?.some(b => b.ownerName?.toLowerCase().includes(search)));
        });
    }, [payments, activeSubTab, searchTerm]);

    const handleApprove = (payment: Payment) => {
        requestAuthorization(async () => {
            if (!condoId) return;
            setIsVerifying(true);
            try {
                const method = (payment.paymentMethod || "").toLowerCase().trim();
                const isDigital = method.includes('movil') || method.includes('transferencia') || method.includes('pagomovil');
                const targetAccountId = isDigital ? BDV_ACCOUNT_ID : CAJA_PRINCIPAL_ID;
                const targetAccountName = isDigital ? "BANCO DE VENEZUELA" : "CAJA PRINCIPAL";
                const monthId = format(payment.paymentDate.toDate(), 'yyyy-MM');

                const settingsSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
                const currentFee = settingsSnap.exists() ? (settingsSnap.data().condoFee || 25) : 25;

                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('ownerId', 'in', payment.beneficiaryIds),
                    where('status', 'in', ['pending', 'vencida'])
                ));
                const allPendingDebts = debtsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any));

                await runTransaction(db, async (transaction) => {
                    const ownerSnapsMap = new Map();
                    for (const benId of payment.beneficiaryIds) {
                        const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, benId);
                        const snap = await transaction.get(ownerRef);
                        if (snap.exists()) ownerSnapsMap.set(benId, snap.data());
                    }

                    const receiptNumbers: { [ownerId: string]: string } = {};
                    const liquidatedConcepts: LiquidatedConcept[] = [];

                    for (const beneficiary of payment.beneficiaries) {
                        const ownerData = ownerSnapsMap.get(beneficiary.ownerId);
                        if (!ownerData) continue;

                        let funds = new Decimal(beneficiary.amount).plus(new Decimal(ownerData.balance || 0));
                        const ownerPendingDebts = allPendingDebts.filter((d: any) => d.ownerId === beneficiary.ownerId).sort((a: any, b: any) => a.year - b.year || a.month - b.month);

                        for (const debt of ownerPendingDebts) {
                            const debtAmountBs = new Decimal(debt.amountUSD).times(new Decimal(payment.exchangeRate));
                            if (funds.gte(debtAmountBs)) {
                                funds = funds.minus(debtAmountBs);
                                transaction.update(debt.ref, { status: 'paid', paidAmountUSD: debt.amountUSD, paymentDate: payment.paymentDate, paymentId: payment.id });
                                liquidatedConcepts.push({ ownerId: beneficiary.ownerId, description: debt.description, amountUSD: debt.amountUSD, period: `${monthsLocale[debt.month]} ${debt.year}`, type: 'deuda' });
                            } else break;
                        }

                        const advanceBs = new Decimal(currentFee).times(payment.exchangeRate);
                        if (funds.gte(advanceBs)) {
                            let nextMonth = addMonths(new Date(), 1);
                            while (funds.gte(advanceBs)) {
                                const newDebtRef = doc(collection(db, 'condominios', condoId, 'debts'));
                                transaction.set(newDebtRef, {
                                    ownerId: beneficiary.ownerId, property: { street: beneficiary.street || '', house: beneficiary.house || '' },
                                    year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1, amountUSD: currentFee, description: 'Cuota Adelantada',
                                    status: 'paid', paidAmountUSD: currentFee, paymentDate: payment.paymentDate, paymentId: payment.id, published: true
                                });
                                liquidatedConcepts.push({ ownerId: beneficiary.ownerId, description: 'CUOTA ADELANTADA', amountUSD: currentFee, period: `${monthsLocale[nextMonth.getMonth()+1]} ${nextMonth.getFullYear()}`, type: 'adelanto' });
                                funds = funds.minus(advanceBs);
                                nextMonth = addMonths(nextMonth, 1);
                            }
                        }

                        if (funds.gt(0)) {
                            liquidatedConcepts.push({ ownerId: beneficiary.ownerId, description: 'ABONO A SALDO A FAVOR', amountUSD: funds.div(payment.exchangeRate).toNumber(), period: 'SALDO', type: 'abono' });
                        }

                        receiptNumbers[beneficiary.ownerId] = `REC-${Date.now().toString().substring(6)}-${beneficiary.ownerId.slice(-4)}`.toUpperCase();
                        transaction.update(doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId), { balance: funds.toDecimalPlaces(2).toNumber() });
                    }

                    transaction.update(doc(db, 'condominios', condoId, 'cuentas', targetAccountId), { saldoActual: increment(payment.totalAmount) });
                    transaction.set(doc(db, 'condominios', condoId, 'financial_stats', monthId), { periodo: monthId, totalIngresosMes: increment(payment.totalAmount), updatedAt: serverTimestamp() }, { merge: true });
                    
                    const transRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                    transaction.set(transRef, { monto: payment.totalAmount, tipo: 'ingreso', cuentaId: targetAccountId, nombreCuenta: targetAccountName, descripcion: `INGRESO: PAGO DE ${payment.beneficiaries.map(b => b.ownerName).join(', ')}`.toUpperCase(), referencia: payment.reference, fecha: payment.paymentDate, sourcePaymentId: payment.id, createdAt: serverTimestamp(), createdBy: user?.email });
                    transaction.update(doc(db, 'condominios', condoId, 'payments', payment.id), { status: 'aprobado', receiptNumbers, liquidatedConcepts });
                });

                toast({ title: "Validación Exitosa" });
                setSelectedPayment(null);
            } catch (error: any) { toast({ variant: 'destructive', title: "Error", description: error.message }); }
            finally { setIsVerifying(false); }
        });
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden mt-6">
            <CardHeader className="bg-slate-950 p-8 border-b border-white/5">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <CardTitle className="text-xl font-black uppercase italic text-white flex items-center gap-3">
                        <CheckCircle2 className="text-primary" /> Bandeja de Validación
                    </CardTitle>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                        <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-xl bg-slate-800 border-none text-white font-bold h-10" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
                    <TabsList className="grid grid-cols-3 mx-8 mt-6 bg-slate-800/50 rounded-2xl p-1 h-12">
                        <TabsTrigger value="pendiente" className="rounded-xl font-black uppercase text-[10px] italic">Pendientes</TabsTrigger>
                        <TabsTrigger value="aprobado" className="rounded-xl font-black uppercase text-[10px] italic">Aprobados</TabsTrigger>
                        <TabsTrigger value="rechazado" className="rounded-xl font-black uppercase text-[10px] italic">Rechazados</TabsTrigger>
                    </TabsList>
                    
                    <div className="mt-6">
                        {loading ? (
                            <div className="text-center p-20"><Loader2 className="animate-spin h-10 w-10 mx-auto text-primary" /></div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-slate-950/50">
                                    <TableRow className="border-white/5">
                                        <TableHead className="px-8 py-6 text-[10px] font-black uppercase text-white/40 italic">Beneficiario</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-white/40 italic">Fecha</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-white/40 italic">Monto</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-white/40 italic">Ref.</TableHead>
                                        <TableHead className="text-right pr-8 text-[10px] font-black uppercase text-white/40 italic">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredPayments.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="h-40 text-center text-white/20 font-black uppercase italic text-xs">Sin registros</TableCell></TableRow>
                                    ) : filteredPayments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-white/5 border-white/5 transition-colors">
                                            <TableCell className="px-8 py-6">
                                                <div className="font-black text-white text-xs uppercase italic">{p.beneficiaries.map(b => b.ownerName).join(', ')}</div>
                                                <div className="text-[9px] font-black text-primary uppercase mt-1 italic">{p.paymentMethod} • {p.bank}</div>
                                            </TableCell>
                                            <TableCell className="text-white/40 font-bold text-xs">{format(p.paymentDate.toDate(), 'dd/MM/yy')}</TableCell>
                                            <TableCell className="font-black text-white text-lg italic">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                            <TableCell className="font-mono text-[10px] text-white/20">{p.reference}</TableCell>
                                            <TableCell className="text-right pr-8">
                                                <Button variant="ghost" size="icon" onClick={() => setSelectedPayment(p)} className="text-white/20 hover:text-white"><Eye className="h-5 w-5"/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Tabs>
            </CardContent>
            
            {/* DIÁLOGO DETALLE */}
            <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
                <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic font-montserrat max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Detalle del <span className="text-primary">Ingreso</span></DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                        <div className="space-y-6">
                            <div className="bg-slate-800 p-6 rounded-[2rem] border border-white/5">
                                <p className="text-[10px] font-black uppercase text-white/30 mb-4 tracking-widest">Distribución</p>
                                {selectedPayment?.beneficiaries.map((b, i) => (
                                    <div key={i} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
                                        <div className="flex flex-col"><span className="font-black text-white text-xs uppercase italic">{b.ownerName}</span><span className="text-[9px] font-bold text-white/20 uppercase">{b.street} {b.house}</span></div>
                                        <span className="font-black text-primary">Bs. {formatCurrency(b.amount)}</span>
                                    </div>
                                ))}
                                <div className="mt-6 pt-6 border-t border-white/10 flex justify-between items-center"><span className="text-[10px] font-black uppercase text-white">Total:</span><span className="text-2xl font-black italic">Bs. {formatCurrency(selectedPayment?.totalAmount || 0)}</span></div>
                            </div>
                            {selectedPayment?.status === 'pendiente' && (
                                <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2">Motivo Rechazo</Label><Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="rounded-2xl bg-slate-800 border-none text-white font-bold h-24" /></div>
                            )}
                        </div>
                        <div className="relative aspect-[3/4] bg-slate-800 rounded-[2rem] overflow-hidden border border-white/5">
                            {selectedPayment?.receiptUrl ? <Image src={selectedPayment.receiptUrl} alt="Voucher" fill className="object-contain p-2" /> : <div className="flex h-full items-center justify-center text-white/10 font-black uppercase italic text-xs">Sin imagen</div>}
                        </div>
                    </div>
                    {selectedPayment?.status === 'pendiente' && (
                        <DialogFooter className="gap-3 mt-4">
                            <Button onClick={() => handleApprove(selectedPayment!)} disabled={isVerifying} className="bg-primary text-slate-900 font-black uppercase text-[10px] h-14 rounded-2xl flex-1 italic shadow-xl shadow-primary/20">
                                {isVerifying ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />} Validar y Liquidar
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// --- COMPONENTE DE REPORTE MANUAL ---
function ReportPaymentComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const { user: authUser } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('movil');
    const [bank, setBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        return onSnapshot(q, (snap) => setAllOwners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner))));
    }, [condoId]);

    useEffect(() => {
        if (!condoId) return;
        getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings')).then(snap => {
            if (snap.exists()) {
                const rates = snap.data().exchangeRates || [];
                const active = rates.find((r: any) => r.active === true);
                setExchangeRate(active?.rate || 0);
            }
        });
    }, [condoId]);

    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balanceDiff = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);

    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!totalAmount || beneficiaryRows.some(r => !r.owner || !r.amount) || Math.abs(balanceDiff) > 0.01) return toast({ variant: 'destructive', title: "Faltan datos o el balance es incorrecto" });
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "condominios", condoId, "payments"), {
                paymentDate: Timestamp.fromDate(paymentDate!), exchangeRate, paymentMethod, bank, reference,
                totalAmount: Number(totalAmount), status: 'pendiente', reportedAt: serverTimestamp(), reportedBy: authUser?.uid,
                beneficiaryIds: beneficiaryRows.map(r => r.owner!.id),
                beneficiaries: beneficiaryRows.map(r => ({ ownerId: r.owner!.id, ownerName: r.owner!.name, street: r.selectedProperty?.street, house: r.selectedProperty?.house, amount: Number(r.amount) }))
            });
            toast({ title: "Reporte Registrado" });
            setTotalAmount(''); setReference(''); setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
        } catch (e) { toast({ variant: 'destructive', title: "Error al guardar" }); }
        finally { setIsSubmitting(false); }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden mt-6">
            <CardHeader className="bg-slate-950 p-8 border-b border-white/5">
                <CardTitle className="text-xl font-black uppercase italic text-white flex items-center gap-3">
                    <UserPlus className="text-primary" /> Reporte Manual
                </CardTitle>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 space-y-10">
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Fecha de Pago</Label>
                            <Popover>
                                <PopoverTrigger asChild><Button variant="outline" className="w-full h-14 rounded-2xl bg-slate-800 border-none text-white font-black uppercase italic"><CalendarIcon className="mr-2 h-4 w-4 text-primary" /> {format(paymentDate!, "dd 'de' MMMM, yyyy", { locale: es })}</Button></PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Tasa Bs.</Label>
                            <div className="h-14 rounded-2xl bg-slate-800 flex items-center px-6 font-black text-primary italic text-lg">{exchangeRate.toFixed(2)}</div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase text-primary ml-2 italic tracking-widest">Asignación de Beneficiarios</Label><Button type="button" variant="ghost" onClick={() => setBeneficiaryRows([...beneficiaryRows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }])} className="text-xs font-black uppercase text-white/40 hover:text-white"><PlusCircle className="mr-2 h-4 w-4" /> Añadir Otro</Button></div>
                        <div className="space-y-4">
                            {beneficiaryRows.map((row, idx) => (
                                <div key={row.id} className="p-6 bg-slate-800/50 rounded-[2rem] border border-white/5 space-y-4 relative">
                                    <div className="grid md:grid-cols-2 gap-4">
                                        {!row.owner ? (
                                            <div className="relative">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                                <Input placeholder="BUSCAR RESIDENTE..." className="pl-12 h-12 rounded-xl bg-slate-800 border-none text-white font-bold uppercase italic text-xs" value={row.searchTerm} onChange={e => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} />
                                                {row.searchTerm.length > 1 && (
                                                    <Card className="absolute z-50 w-full mt-2 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                                                        <ScrollArea className="h-48">{getFilteredOwners(row.searchTerm, allOwners).map(o => (<div key={o.id} onClick={() => handleOwnerSelect(row.id, o)} className="p-4 hover:bg-white/5 cursor-pointer font-black text-[10px] uppercase text-white border-b border-white/5">{o.name}</div>))}</ScrollArea>
                                                    </Card>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="h-12 bg-slate-900 px-4 rounded-xl flex items-center justify-between"><span className="font-black text-primary text-[10px] uppercase italic">{row.owner.name}</span><Button variant="ghost" size="icon" onClick={() => updateBeneficiaryRow(row.id, { owner: null })} className="h-8 w-8 text-white/20"><X className="h-4 w-4"/></Button></div>
                                        )}
                                        <Input type="number" placeholder="MONTO BS." className="h-12 rounded-xl bg-slate-800 border-none text-white font-black italic text-lg" value={row.amount} onChange={e => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={!row.owner} />
                                    </div>
                                    {row.owner && (
                                        <Select onValueChange={v => updateBeneficiaryRow(row.id, { selectedProperty: row.owner?.properties.find(p => `${p.street}-${p.house}` === v) || null })} value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}>
                                            <SelectTrigger className="h-10 bg-slate-900 rounded-xl border-none text-white font-bold text-[10px] uppercase italic"><SelectValue placeholder="SELECCIONAR UNIDAD..." /></SelectTrigger>
                                            <SelectContent className="bg-slate-900 text-white border-white/10">{row.owner.properties.map((p, i) => (<SelectItem key={i} value={`${p.street}-${p.house}`} className="text-[10px] font-black uppercase italic">{p.street} - {p.house}</SelectItem>))}</SelectContent>
                                        </Select>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-10 border-t border-white/5">
                        <div className="grid md:grid-cols-2 gap-8 items-end">
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Resumen Final</Label>
                                <div className="p-6 bg-slate-950 rounded-[2rem] space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase text-white/30"><span>Asignado:</span><span className="text-white">Bs. {formatCurrency(assignedTotal)}</span></div>
                                    <div className="flex justify-between items-center text-lg font-black italic"><span>TOTAL REPORTE:</span><Input type="number" placeholder="0.00" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} className="w-32 bg-transparent border-none text-right font-black text-primary p-0 h-auto text-2xl focus-visible:ring-0" /></div>
                                    <div className={cn("flex justify-between text-[9px] font-black uppercase", Math.abs(balanceDiff) > 0.01 ? "text-red-500" : "text-emerald-500")}><span>Balance:</span><span>Bs. {formatCurrency(balanceDiff)}</span></div>
                                </div>
                            </div>
                            <Button type="submit" disabled={isSubmitting} className="w-full h-16 rounded-2xl bg-white text-slate-900 hover:bg-slate-200 font-black uppercase italic tracking-widest text-base shadow-2xl">
                                {isSubmitting ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-5 w-5" />} Procesar Pago Manual
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </form>
        </Card>
    );
}

// --- COMPONENTE CALCULADORA ---
function CalculatorComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [ownerDebts, setOwnerDebts] = useState<any[]>([]);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        return onSnapshot(q, (snap) => setAllOwners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner))));
    }, [condoId]);

    useEffect(() => {
        if (!condoId || !selectedOwner) return;
        const unsubSettings = onSnapshot(doc(db, 'condominios', condoId, 'config', 'mainSettings'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setCondoFee(data.condoFee || 0);
                const active = (data.exchangeRates || []).find((r: any) => r.active);
                setActiveRate(active?.rate || 0);
            }
        });
        const qDebts = query(collection(db, 'condominios', condoId, 'debts'), where("ownerId", "==", selectedOwner.id));
        const unsubDebts = onSnapshot(qDebts, (snap) => setOwnerDebts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { unsubSettings(); unsubDebts(); };
    }, [condoId, selectedOwner]);

    const pendingDebts = useMemo(() => ownerDebts.filter(d => d.status === 'pending' || d.status === 'vencida').sort((a,b) => a.year - b.year || a.month - b.month), [ownerDebts]);
    const totalToPay = useMemo(() => {
        const subtotal = pendingDebts.filter(d => selectedDebts.includes(d.id)).reduce((acc, d) => acc + d.amountUSD, 0) * activeRate;
        return Math.max(0, subtotal - (selectedOwner?.balance || 0));
    }, [pendingDebts, selectedDebts, activeRate, selectedOwner]);

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden mt-6">
            <CardHeader className="bg-slate-950 p-8 border-b border-white/5">
                <CardTitle className="text-xl font-black uppercase italic text-white flex items-center gap-3">
                    <Calculator className="text-primary" /> Herramienta de Cálculo
                </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                <div className="relative">
                    {!selectedOwner ? (
                        <>
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
                            <Input placeholder="SELECCIONAR PROPIETARIO..." className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black uppercase italic text-xs" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            {searchTerm.length > 1 && (
                                <Card className="absolute z-50 w-full mt-2 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                                    <ScrollArea className="h-48">{getFilteredOwners(searchTerm, allOwners).map(o => (<div key={o.id} onClick={() => { setSelectedOwner(o); setSearchTerm(''); }} className="p-4 hover:bg-white/5 cursor-pointer font-black text-[10px] uppercase text-white border-b border-white/5">{o.name}</div>))}</ScrollArea>
                                </Card>
                            )}
                        </>
                    ) : (
                        <div className="h-14 bg-slate-800 px-6 rounded-2xl flex items-center justify-between border-2 border-primary/20"><span className="font-black text-primary uppercase italic">{selectedOwner.name}</span><Button variant="ghost" onClick={() => { setSelectedOwner(null); setSelectedDebts([]); }} className="text-white/20 hover:text-white uppercase font-black text-[10px]">Cambiar</Button></div>
                    )}
                </div>

                {selectedOwner && (
                    <div className="grid lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="lg:col-span-2 space-y-4">
                            <Table><TableHeader><TableRow className="border-white/5"><TableHead className="w-12"></TableHead><TableHead className="text-[10px] font-black uppercase text-white/40 italic">Período</TableHead><TableHead className="text-right text-[10px] font-black uppercase text-white/40 italic">Monto Bs.</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {pendingDebts.map(d => (
                                    <TableRow key={d.id} className="border-white/5">
                                        <TableCell><Checkbox checked={selectedDebts.includes(d.id)} onCheckedChange={() => setSelectedDebts(prev => prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id])} /></TableCell>
                                        <TableCell className="font-black text-white uppercase italic text-xs">{monthsLocale[d.month]} {d.year}</TableCell>
                                        <TableCell className="text-right font-black text-white italic">Bs. {formatCurrency(d.amountUSD * activeRate)}</TableCell>
                                    </TableRow>
                                ))}
                                {pendingDebts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-10 text-white/20 italic font-black uppercase text-[10px]">Sin deudas pendientes</TableCell></TableRow>}
                            </TableBody></Table>
                        </div>
                        <div className="bg-slate-950 p-8 rounded-[2rem] border border-white/5 h-fit space-y-6">
                            <div className="space-y-2"><p className="text-[10px] font-black uppercase text-white/30">Saldo a Favor:</p><p className="text-xl font-black text-emerald-500 italic">Bs. {formatCurrency(selectedOwner.balance)}</p></div>
                            <Separator className="bg-white/5" />
                            <div className="space-y-2"><p className="text-[10px] font-black uppercase text-primary">Total Sugerido:</p><p className="text-4xl font-black text-white italic tracking-tighter">Bs. {formatCurrency(totalToPay)}</p></div>
                            <p className="text-[9px] font-bold text-white/20 uppercase leading-relaxed">Cálculo basado en tasa BCV: Bs. {activeRate.toFixed(2)}</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function PaymentsPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const condoId = (params?.condoId as string) || "";
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'report');

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat bg-[#1A1D23] min-h-screen p-4 md:p-8 italic text-white">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-primary">Pagos</span></h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full shadow-[0_0_10px_rgba(242,135,5,0.3)]"></div>
                <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">Control de ingresos y liquidación cronológica.</p>
            </div>

            <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); router.push(`?tab=${val}`); }} className="w-full">
                <TabsList className="flex flex-wrap h-auto gap-2 bg-slate-800/50 p-2 rounded-3xl border border-white/5 max-w-2xl">
                    <TabsTrigger value="verify" className="rounded-2xl font-black uppercase text-[10px] px-8 py-4 italic data-[state=active]:bg-white data-[state=active]:text-slate-900 transition-all">Verificación</TabsTrigger>
                    <TabsTrigger value="report" className="rounded-2xl font-black uppercase text-[10px] px-8 py-4 italic data-[state=active]:bg-white data-[state=active]:text-slate-900 transition-all">Reporte Manual</TabsTrigger>
                    <TabsTrigger value="calculator" className="rounded-2xl font-black uppercase text-[10px] px-8 py-4 italic data-[state=active]:bg-white data-[state=active]:text-slate-900 transition-all">Calculadora</TabsTrigger>
                </TabsList>

                <TabsContent value="verify" className="mt-0">
                    <VerificationComponent condoId={condoId} />
                </TabsContent>

                <TabsContent value="report" className="mt-0">
                    <ReportPaymentComponent condoId={condoId} />
                </TabsContent>

                <TabsContent value="calculator" className="mt-0">
                    <CalculatorComponent condoId={condoId} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#1A1D23]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
            <PaymentsPage />
        </Suspense>
    );
}

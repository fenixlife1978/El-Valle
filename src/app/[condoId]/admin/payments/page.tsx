
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
    PlusCircle, Info, ChevronRight
} from 'lucide-react';
import { format, startOfMonth, addMonths } from 'date-fns';
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
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import { useAuthorization } from '@/hooks/use-authorization';
import { 
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
    DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub,
    DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal
} from '@/components/ui/dropdown-menu';
import { generatePaymentReceipt } from '@/lib/pdf-generator';
import Decimal from 'decimal.js';

// --- CONSTANTES Y TIPOS ---
const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type Owner = { id: string; name: string; properties: { street: string, house: string }[]; balance?: number; role?: string; email?: string; };
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
const CAJA_PRINCIPAL_ID = "fS0hdoWOyZBuTVuUJSic";

// --- COMPONENTE: VERIFICACIÓN ---
function VerificationComponent({ condoId }: { condoId: string }) {
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const { toast } = useToast();

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pendiente');
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
    const [localCompanyInfo, setLocalCompanyInfo] = useState<any>(null);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        onSnapshot(settingsRef, (snap) => {
            if (snap.exists()) setLocalCompanyInfo(snap.data().companyInfo);
        });
        const q = query(collection(db, 'condominios', condoId, 'payments'), orderBy('reportedAt', 'desc'));
        return onSnapshot(q, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
            setLoading(false);
        });
    }, [condoId]);

    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            if (p.status !== activeTab) return false;
            if (!searchTerm) return true;
            const search = searchTerm.toLowerCase();
            return p.reference?.toLowerCase().includes(search) || p.beneficiaries?.some(b => b.ownerName?.toLowerCase().includes(search));
        });
    }, [payments, activeTab, searchTerm]);

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

                await runTransaction(db, async (transaction) => {
                    const receiptNumbers: { [ownerId: string]: string } = {};
                    const liquidatedConcepts: LiquidatedConcept[] = [];

                    for (const beneficiary of payment.beneficiaries) {
                        const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId);
                        const ownerSnap = await transaction.get(ownerRef);
                        if (!ownerSnap.exists()) continue;

                        let funds = new Decimal(beneficiary.amount).plus(new Decimal(ownerSnap.data().balance || 0));
                        const debtsSnap = await getDocs(query(collection(db, 'condominios', condoId, 'debts'), where('ownerId', '==', beneficiary.ownerId), where('status', 'in', ['pending', 'vencida'])));
                        const pendingDebts = debtsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any)).sort((a, b) => a.year - b.year || a.month - b.month);

                        for (const debt of pendingDebts) {
                            const debtAmountBs = new Decimal(debt.amountUSD).times(new Decimal(payment.exchangeRate));
                            if (funds.gte(debtAmountBs)) {
                                funds = funds.minus(debtAmountBs);
                                transaction.update(debt.ref, { status: 'paid', paidAmountUSD: debt.amountUSD, paymentDate: payment.paymentDate, paymentId: payment.id });
                                liquidatedConcepts.push({ ownerId: beneficiary.ownerId, description: `${debt.description} (${beneficiary.street || 'S/D'} ${beneficiary.house || ''})`.toUpperCase(), amountUSD: debt.amountUSD, period: `${monthsLocale[debt.month]} ${debt.year}`, type: 'deuda' });
                            } else break;
                        }

                        const advanceAmountBs = new Decimal(currentFee).times(payment.exchangeRate);
                        while (funds.gte(advanceAmountBs)) {
                            const year = new Date().getFullYear();
                            const month = new Date().getMonth() + 1;
                            const newDebtRef = doc(collection(db, 'condominios', condoId, 'debts'));
                            transaction.set(newDebtRef, { ownerId: beneficiary.ownerId, property: { street: beneficiary.street || '', house: beneficiary.house || '' }, year, month, amountUSD: currentFee, description: 'CUOTA ADELANTADA', status: 'paid', paidAmountUSD: currentFee, paymentDate: payment.paymentDate, paymentId: payment.id, published: true });
                            liquidatedConcepts.push({ ownerId: beneficiary.ownerId, description: `CUOTA ADELANTADA (${beneficiary.street || 'S/D'} ${beneficiary.house || ''})`.toUpperCase(), amountUSD: currentFee, period: 'ADELANTO', type: 'adelanto' });
                            funds = funds.minus(advanceAmountBs);
                        }

                        if (funds.gt(0)) {
                            liquidatedConcepts.push({ ownerId: beneficiary.ownerId, description: `ABONO A SALDO A FAVOR (${beneficiary.street || 'S/D'} ${beneficiary.house || ''})`.toUpperCase(), amountUSD: funds.div(payment.exchangeRate).toNumber(), period: 'SALDO', type: 'abono' });
                        }

                        receiptNumbers[beneficiary.ownerId] = `REC-${Date.now().toString().substring(6)}-${beneficiary.ownerId.slice(-4)}`.toUpperCase();
                        transaction.update(ownerRef, { balance: funds.toDecimalPlaces(2).toNumber() });
                    }

                    transaction.update(doc(db, 'condominios', condoId, 'cuentas', targetAccountId), { saldoActual: increment(payment.totalAmount) });
                    transaction.set(doc(collection(db, 'condominios', condoId, 'transacciones')), { monto: payment.totalAmount, tipo: 'ingreso', cuentaId: targetAccountId, nombreCuenta: targetAccountName, descripcion: `INGRESO: PAGO DE ${payment.beneficiaries.map(b => b.ownerName).join(', ')}`.toUpperCase(), referencia: payment.reference, fecha: payment.paymentDate, sourcePaymentId: payment.id, createdAt: serverTimestamp(), createdBy: user?.email });
                    transaction.update(doc(db, 'condominios', condoId, 'payments', payment.id), { status: 'aprobado', receiptNumbers, liquidatedConcepts, observations: 'PAGO AUDITADO Y LIQUIDADO CRONOLÓGICAMENTE.' });
                });

                toast({ title: "Pago Validado", description: "Sincronización exitosa con Tesorería." });
                setSelectedPayment(null);
            } catch (error: any) { toast({ variant: 'destructive', title: "Error", description: error.message }); }
            finally { setIsVerifying(false); }
        });
    };

    const handleExportPDF = async (payment: Payment, ownerId: string) => {
        const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
        if (!beneficiary || !localCompanyInfo) return;
        const ownerConcepts = (payment.liquidatedConcepts || []).filter(c => c.ownerId === ownerId);
        const concepts = ownerConcepts.map(c => [c.period, c.description, c.type === 'abono' ? '-' : `$${c.amountUSD.toFixed(2)}`, formatCurrency(c.amountUSD * payment.exchangeRate)]);
        
        const data = {
            condoName: localCompanyInfo.name, rif: localCompanyInfo.rif, receiptNumber: payment.receiptNumbers?.[ownerId] || 'S/N',
            ownerName: beneficiary.ownerName, property: `${beneficiary.street || 'S/D'} - ${beneficiary.house || 'S/D'}`,
            method: payment.paymentMethod, bank: payment.bank, reference: payment.reference,
            date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'), rate: formatCurrency(payment.exchangeRate),
            receivedAmount: formatCurrency(beneficiary.amount), totalDebtPaid: formatCurrency(ownerConcepts.reduce((s, c) => s + (c.amountUSD * payment.exchangeRate), 0)),
            currentBalance: formatCurrency(beneficiary.amount), observations: payment.observations, concepts
        };
        await generatePaymentReceipt(data, localCompanyInfo.logo, 'download');
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat italic">
            <CardHeader className="p-8 border-b border-white/5">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <CardTitle className="text-white font-black uppercase italic text-2xl tracking-tighter">Bandeja de <span className="text-primary">Validación</span></CardTitle>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="BUSCAR..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-xl bg-slate-800 border-none text-white font-bold" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid grid-cols-3 mx-8 mt-6 mb-6 h-12 bg-slate-800/50 rounded-xl p-1">
                        <TabsTrigger value="pendiente" className="rounded-lg font-black uppercase text-[10px]">Pendientes</TabsTrigger>
                        <TabsTrigger value="aprobado" className="rounded-lg font-black uppercase text-[10px]">Aprobados</TabsTrigger>
                        <TabsTrigger value="rechazado" className="rounded-lg font-black uppercase text-[10px]">Rechazados</TabsTrigger>
                    </TabsList>
                    
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-800/20"><TableRow className="border-white/5"><TableHead className="px-8 py-6 text-[10px] font-black uppercase text-slate-400">Beneficiarios</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400">Fecha</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400">Monto</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400">Ref.</TableHead><TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-400">Acción</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {filteredPayments.length === 0 ? (<TableRow><TableCell colSpan={5} className="h-40 text-center text-slate-500 font-bold italic uppercase text-[10px]">Sin reportes registrados</TableCell></TableRow>) : 
                                filteredPayments.map(p => (
                                    <TableRow key={p.id} className="hover:bg-white/5 border-white/5 transition-colors">
                                        <TableCell className="px-8 py-6"><div className="font-black text-white text-xs uppercase italic">{p.beneficiaries.map(b => b.ownerName).join(', ')}</div><div className="text-[9px] font-black text-primary uppercase mt-1">{p.paymentMethod} • {p.bank}</div></TableCell>
                                        <TableCell className="text-slate-400 font-bold text-xs">{format(p.paymentDate.toDate(), 'dd/MM/yy')}</TableCell>
                                        <TableCell className="font-black text-white text-lg italic">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                        <TableCell className="font-mono text-[10px] text-slate-500">{p.reference}</TableCell>
                                        <TableCell className="text-right pr-8">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-slate-500 hover:text-white"><MoreHorizontal className="h-5 w-5"/></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="rounded-xl border-white/10 shadow-2xl bg-slate-900 text-white italic">
                                                    <DropdownMenuItem onClick={() => setSelectedPayment(p)} className="font-black uppercase text-[10px] p-3 gap-2"><Eye className="h-4 w-4 text-primary" /> Ver Detalles</DropdownMenuItem>
                                                    {p.status === 'aprobado' && (<DropdownMenuItem onClick={() => handleExportPDF(p, p.beneficiaries[0].ownerId)} className="font-black uppercase text-[10px] p-3 gap-2"><FileDown className="h-4 w-4 text-sky-400" /> Descargar PDF</DropdownMenuItem>)}
                                                    {p.status === 'pendiente' && (<DropdownMenuItem onClick={() => handleApprove(p)} className="text-emerald-500 font-black uppercase text-[10px] p-3 gap-2"><CheckCircle className="h-4 w-4" /> Aprobar y Liquidar</DropdownMenuItem>)}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </Tabs>
            </CardContent>

            <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
                <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic overflow-y-auto max-h-[90vh]">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Detalle del <span className="text-primary">Reporte</span></DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                        <div className="space-y-6">
                            <div className="bg-slate-800 p-6 rounded-3xl border border-white/5">
                                <p className="text-[10px] font-black uppercase text-slate-500 mb-4 tracking-widest">Distribución</p>
                                {selectedPayment?.beneficiaries.map((b, i) => (
                                    <div key={i} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
                                        <div className="flex flex-col"><span className="font-black text-white text-xs uppercase">{b.ownerName}</span><span className="text-[9px] font-bold text-slate-500 uppercase">{b.street} {b.house}</span></div>
                                        <span className="font-black text-primary">Bs. {formatCurrency(b.amount)}</span>
                                    </div>
                                ))}
                            </div>
                            {selectedPayment?.receiptUrl && (
                                <div className="relative aspect-[3/4] bg-slate-800 rounded-3xl overflow-hidden border border-white/5">
                                    <Image src={selectedPayment.receiptUrl} alt="Comprobante" fill className="object-contain p-2" />
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20"><p className="text-[10px] font-black text-primary uppercase">Monto Total</p><p className="text-3xl font-black italic text-white">Bs. {formatCurrency(selectedPayment?.totalAmount || 0)}</p></div>
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5"><p className="text-[10px] font-black text-slate-500 uppercase">Referencia</p><p className="text-xl font-black text-white">{selectedPayment?.reference}</p></div>
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5"><p className="text-[10px] font-black text-slate-500 uppercase">Banco</p><p className="text-lg font-black text-white uppercase">{selectedPayment?.bank}</p></div>
                        </div>
                    </div>
                    {selectedPayment?.status === 'pendiente' && (
                        <DialogFooter><Button onClick={() => handleApprove(selectedPayment!)} disabled={isVerifying} className="w-full h-14 bg-primary text-slate-900 font-black uppercase rounded-2xl shadow-xl italic tracking-widest">{isVerifying ? <Loader2 className="animate-spin" /> : "Validar Ahora"}</Button></DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// --- COMPONENTE: REPORTE MANUAL ---
function ReportPaymentComponent() {
    const { toast } = useToast();
    const { user: authUser } = useAuth();
    const params = useParams();
    const condoId = params?.condoId as string;
    
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('movil');
    const [bank, setBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        onSnapshot(q, (snap) => setAllOwners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)).filter(o => o.email !== 'vallecondo@gmail.com').sort((a,b) => a.name.localeCompare(b.name))));
        getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings')).then(snap => {
            if (snap.exists()) {
                const active = (snap.data().exchangeRates || []).find((r:any) => r.active);
                setExchangeRate(active?.rate || 0);
            }
        });
    }, [condoId]);

    const getFilteredOwners = (searchTerm: string) => allOwners.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const removeBeneficiaryRow = (id: string) => setBeneficiaryRows(rows => rows.filter(row => row.id !== id));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!totalAmount || beneficiaryRows.length === 0) return;
        setIsSubmitting(true);
        try {
            const beneficiaries = beneficiaryRows.map(row => ({ ownerId: row.owner!.id, ownerName: row.owner!.name, street: row.selectedProperty?.street, house: row.selectedProperty?.house, amount: Number(row.amount) }));
            await addDoc(collection(db, "condominios", condoId, "payments"), { 
                reportedBy: authUser?.uid, beneficiaries, beneficiaryIds: beneficiaries.map(b=>b.ownerId), 
                totalAmount: Number(totalAmount), exchangeRate, paymentDate: Timestamp.fromDate(paymentDate!), 
                paymentMethod, bank: paymentMethod === 'efectivo_bs' ? 'Efectivo' : bank, 
                reference: paymentMethod === 'efectivo_bs' ? 'EFECTIVO' : reference, receiptUrl: receiptImage || "", 
                status: 'pendiente', reportedAt: serverTimestamp() 
            });
            setShowSuccessDialog(true);
            setTotalAmount(''); setReference(''); setReceiptImage(null); setBeneficiaryRows([]);
        } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
        finally { setIsSubmitting(false); }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat italic">
            <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-white font-black uppercase italic text-2xl tracking-tighter">Reporte <span className="text-primary">Manual</span></CardTitle></CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 space-y-10">
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Fecha Pago</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left"><CalendarIcon className="mr-3 h-5 w-5 text-primary" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : "Seleccione"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 bg-slate-900 border-white/10"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} /></PopoverContent></Popover></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Tasa Bs.</Label><Input type="number" value={exchangeRate || ''} readOnly className="h-14 rounded-2xl bg-slate-800 border-none text-primary font-black italic" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Monto Bs.</Label><Input type="number" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black text-2xl italic text-right pr-6" placeholder="0,00" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Referencia</Label><Input value={reference} onChange={e => setReference(e.target.value.replace(/\D/g, ''))} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic" placeholder="6 DÍGITOS" /></div>
                    </div>
                    
                    <div className="space-y-6">
                        <Label className="text-[10px] font-black uppercase text-primary tracking-widest ml-2">Asignación de Beneficiarios</Label>
                        {beneficiaryRows.map((row) => (
                            <div key={row.id} className="p-8 bg-white/5 border border-white/5 rounded-[2rem] space-y-6">
                                <div className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        {!row.owner ? (
                                            <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" /><Input placeholder="Buscar Residente..." className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-bold uppercase text-xs" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} />{row.searchTerm.length >= 2 && getFilteredOwners(row.searchTerm).length > 0 && <Card className="absolute z-50 w-full mt-2 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden"><ScrollArea className="h-48">{getFilteredOwners(row.searchTerm).map(o => (<div key={o.id} onClick={() => handleOwnerSelect(row.id, o)} className="p-4 hover:bg-white/5 cursor-pointer font-black text-[10px] uppercase text-white border-b border-white/5">{o.name}</div>))}</ScrollArea></Card>}</div>
                                        ) : (<div className="p-5 bg-slate-800 rounded-2xl border border-white/5 flex justify-between items-center"><p className="font-black text-primary uppercase text-xs italic">{row.owner.name}</p><Button variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} className="text-red-500"><XCircle className="h-5 w-5"/></Button></div>)}
                                        {row.owner && (<Select onValueChange={(v) => updateBeneficiaryRow(row.id, { selectedProperty: row.owner?.properties.find(p => `${p.street}-${p.house}` === v) || null })} value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}><SelectTrigger className="h-12 bg-slate-800 rounded-xl border-none text-white font-bold uppercase text-[10px]"><SelectValue placeholder="Unidad..."/></SelectTrigger><SelectContent className="bg-slate-900 text-white border-white/10 italic">{row.owner.properties.map((p, i) => (<SelectItem key={i} value={`${p.street}-${p.house}`} className="text-[10px] font-black uppercase italic">{p.street} - {p.house}</SelectItem>))}</SelectContent></Select>)}
                                    </div>
                                    <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase text-slate-500 ml-2">Monto Individual (Bs.)</Label><Input type="number" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black text-xl italic text-right pr-6" placeholder="0,00" /></div>
                                </div>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }])} className="rounded-xl font-black uppercase text-[10px] border-white/10 text-slate-400 hover:bg-white/5"><UserPlus className="mr-2 h-4 w-4 text-primary"/>Añadir Beneficiario</Button>
                    </div>
                </CardContent>
                <CardFooter className="bg-white/5 p-8 border-t border-white/5 flex justify-end"><Button type="submit" disabled={isSubmitting || !totalAmount} className="h-16 px-12 rounded-2xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95">{isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-5 w-5" />} REGISTRAR PAGO</Button></CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(v) => { setBank(v); setIsBankModalOpen(false); }} />
            <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
                <DialogContent className="rounded-3xl bg-slate-900 text-white italic"><DialogHeader><DialogTitle className="flex items-center gap-2"><Info className="h-6 w-6 text-primary" /> Reporte Exitoso</DialogTitle><p className="text-slate-400 font-bold text-sm uppercase pt-4">El pago ha sido registrado y está en bandeja de validación.</p></DialogHeader><DialogFooter><Button onClick={() => setShowSuccessDialog(false)} className="bg-primary text-slate-900 font-black">ENTENDIDO</Button></DialogFooter></DialogContent>
            </Dialog>
        </Card>
    );
}

// --- COMPONENTE: CALCULADORA ---
function CalculatorComponent({ condoId, onReport }: { condoId: string, onReport: (data: any) => void }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [debts, setDebts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
    const [advanceMonths, setAdvanceMonths] = useState(0);

    const ownersCol = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, ownersCol), where('role', '==', 'propietario'));
        onSnapshot(q, snap => setAllOwners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Owner)).filter(o => o.email !== 'vallecondo@gmail.com').sort((a,b) => a.name.localeCompare(b.name))));
        getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings')).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                setCondoFee(data.condoFee || 0);
                const active = (data.exchangeRates || []).find((r:any) => r.active);
                setActiveRate(active?.rate || 0);
            }
        });
    }, [condoId, ownersCol]);

    useEffect(() => {
        if (!selectedOwner || !condoId) return;
        setLoading(true);
        const q = query(collection(db, 'condominios', condoId, 'debts'), where('ownerId', '==', selectedOwner.id), where('status', 'in', ['pending', 'vencida']));
        onSnapshot(q, snap => {
            setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
    }, [selectedOwner, condoId]);

    const totals = useMemo(() => {
        const selectedAmountUSD = debts.filter(d => selectedDebts.includes(d.id)).reduce((sum, d) => sum + d.amountUSD, 0);
        const advanceAmountUSD = advanceMonths * condoFee;
        const totalUSD = selectedAmountUSD + advanceAmountUSD;
        const totalBs = totalUSD * activeRate;
        const balanceInFavor = selectedOwner?.balance || 0;
        return { totalUSD, totalBs, toPayBs: Math.max(0, totalBs - balanceInFavor) };
    }, [debts, selectedDebts, advanceMonths, condoFee, activeRate, selectedOwner]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 font-montserrat italic text-white">
            <div className="lg:col-span-2 space-y-6">
                <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[2rem]">
                    <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-xl font-black uppercase italic">1. Residente</CardTitle></CardHeader>
                    <CardContent className="p-8">
                        {!selectedOwner ? (
                            <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5"/><Input placeholder="BUSCAR PROPIETARIO..." className="pl-12 h-14 rounded-2xl bg-slate-800 border-none font-black text-xs uppercase" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                            {searchTerm.length >= 2 && (
                                <Card className="absolute z-50 w-full mt-2 bg-slate-950 border-white/10 shadow-2xl rounded-2xl overflow-hidden"><ScrollArea className="h-48">{allOwners.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase())).map(o => (<div key={o.id} onClick={() => setSelectedOwner(o)} className="p-4 hover:bg-white/5 cursor-pointer font-black text-[10px] uppercase border-b border-white/5">{o.name}</div>))}</ScrollArea></Card>
                            )}</div>
                        ) : (
                            <div className="flex justify-between items-center p-6 bg-slate-800 rounded-3xl border border-primary/20"><div className="flex items-center gap-4"><div className="bg-primary/10 p-3 rounded-2xl text-primary"><UserPlus /></div><div><p className="font-black text-lg uppercase">{selectedOwner.name}</p><p className="text-[10px] font-bold text-slate-500 uppercase">{selectedOwner.properties.map(p => `${p.street} ${p.house}`).join(' | ')}</p></div></div><Button variant="ghost" size="icon" onClick={() => setSelectedOwner(null)} className="text-red-500 hover:bg-red-500/10"><XCircle /></Button></div>
                        )}
                    </CardContent>
                </Card>

                {selectedOwner && (
                    <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[2rem]">
                        <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-xl font-black uppercase italic">2. Deudas y Adelantos</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            {loading ? <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-primary h-10 w-10"/></div> : (
                                <Table><TableHeader className="bg-slate-800/30"><TableRow className="border-white/5"><TableHead className="w-16 px-8 py-6 text-center">PAGAR</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400">PERÍODO</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400">CONCEPTO</TableHead><TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-400">MONTO BS.</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {debts.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-slate-500 font-bold uppercase text-[10px]">Sin deudas pendientes</TableCell></TableRow> : 
                                    debts.sort((a,b) => a.year - b.year || a.month - b.month).map(d => (
                                        <TableRow key={d.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                            <TableCell className="px-8 py-6 text-center"><Checkbox checked={selectedDebts.includes(d.id)} onCheckedChange={c => setSelectedDebts(p => c ? [...p, d.id] : p.filter(id => id !== d.id))}/></TableCell>
                                            <TableCell className="font-black text-white text-xs uppercase">{monthsLocale[d.month]} {d.year}</TableCell>
                                            <TableCell className="text-[10px] font-bold text-slate-500 uppercase">{d.description}</TableCell>
                                            <TableCell className="text-right pr-8 font-black text-white italic">Bs. {formatCurrency(d.amountUSD * activeRate)}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-primary/5 border-none"><TableCell className="px-8 py-8 font-black text-xs text-primary uppercase italic" colSpan={2}>MESES POR ADELANTADO</TableCell><TableCell className="text-center"><div className="flex items-center justify-center gap-4"><Button variant="outline" size="icon" className="h-10 w-10 border-primary text-primary rounded-xl" onClick={() => setAdvanceMonths(Math.max(0, advanceMonths - 1))}><Minus/></Button><span className="text-xl font-black w-8">{advanceMonths}</span><Button variant="outline" size="icon" className="h-10 w-10 border-primary text-primary rounded-xl" onClick={() => setAdvanceMonths(advanceMonths + 1)}><PlusCircle/></Button></div></TableCell><TableCell className="text-right pr-8 font-black text-primary italic">Bs. {formatCurrency(advanceMonths * condoFee * activeRate)}</TableCell></TableRow>
                                </TableBody></Table>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="lg:sticky lg:top-24">
                <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[3rem] border border-white/5">
                    <CardHeader className="bg-primary text-slate-900 p-8 text-center"><CardTitle className="text-2xl font-black uppercase italic tracking-tighter flex items-center justify-center gap-3"><Calculator /> Liquidación</CardTitle></CardHeader>
                    <CardContent className="p-8 space-y-6">
                        <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-slate-500">TASA BCV</span><Badge variant="outline" className="font-black text-primary border-primary/20">Bs. {formatCurrency(activeRate)}</Badge></div>
                        <Separator className="bg-white/5"/>
                        <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase text-slate-500 mb-1">TOTAL BS.</span><span className="text-3xl font-black text-white italic">Bs. {formatCurrency(totals.totalBs)}</span></div>
                        <div className="flex justify-between items-center text-xs font-bold text-emerald-500 italic"><span>(-) SALDO A FAVOR</span><span>Bs. {formatCurrency(selectedOwner?.balance || 0)}</span></div>
                        <div className="flex flex-col gap-1 text-center bg-white/5 p-6 rounded-[2rem] border border-white/5"><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">NETO A PAGAR</span><span className="text-4xl font-black text-primary italic drop-shadow-2xl">Bs. {formatCurrency(totals.toPayBs)}</span></div>
                    </CardContent>
                    <CardFooter className="px-8 pb-8"><Button onClick={() => onReport({ owner: selectedOwner, totalBs: totals.toPayBs })} disabled={!selectedOwner || totals.toPayBs <= 0} className="w-full h-16 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl">REPORTE DE PAGO <Receipt className="ml-2"/></Button></CardFooter>
                </Card>
            </div>
        </div>
    );
}

// --- COMPONENTE: MAIN ---
function PaymentsPage() {
    const searchParams = useSearchParams();
    const condoId = useParams()?.condoId as string;
    const router = useRouter();
    const activeTab = searchParams?.get('tab') ?? 'verify';

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-primary">Pagos</span></h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">Control de Ingresos y Liquidación Atómica.</p>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => router.push(`/${condoId}/admin/payments?tab=${v}`)}>
                <TabsList className="grid w-full grid-cols-3 bg-slate-800/50 h-16 rounded-2xl p-1 border border-white/5">
                    <TabsTrigger value="verify" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Verificación</TabsTrigger>
                    <TabsTrigger value="report" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Reporte Manual</TabsTrigger>
                    <TabsTrigger value="calculator" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Calculadora</TabsTrigger>
                </TabsList>
                <div className="mt-8">
                    <TabsContent value="verify"><VerificationComponent condoId={condoId} /></TabsContent>
                    <TabsContent value="report"><ReportPaymentComponent /></TabsContent>
                    <TabsContent value="calculator"><CalculatorComponent condoId={condoId} onReport={(d) => router.push(`/${condoId}/admin/payments?tab=report`)} /></TabsContent>
                </div>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (<Suspense fallback={<div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}><PaymentsPage /></Suspense>);
}

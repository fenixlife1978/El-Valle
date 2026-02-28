
'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
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
import { Search, CheckCircle, XCircle, Eye, MoreHorizontal, Download, Loader2, Calendar as CalendarIcon, Banknote, UserPlus, CheckCircle2, WalletCards, ArrowLeft } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, runTransaction, updateDoc, deleteDoc, deleteField, orderBy, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useAuthorization } from '@/hooks/use-authorization';
import { generatePaymentReceipt } from '@/lib/pdf-generator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { processPaymentLiquidation } from '@/lib/payment-processor';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type Owner = { id: string; name: string; properties: { street: string, house: string }[]; balance?: number; role?: string; };
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; amount: string; selectedProperty: { street: string, house: string } | null; };
type PaymentMethod = 'movil' | 'transferencia' | 'efectivo_bs' | '';
type Debt = { id: string; ownerId: string; year: number; month: number; amountUSD: number; description: string; status: 'pending' | 'paid' | 'vencida'; property: { street: string; house: string }; paidAmountUSD?: number;};
type Payment = { id: string; beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[]; beneficiaryIds: string[]; totalAmount: number; exchangeRate: number; paymentDate: Timestamp; reportedAt: Timestamp; paymentMethod: 'transferencia' | 'movil' | 'efectivo_bs' | 'efectivo'; bank: string; reference: string; status: 'pendiente' | 'aprobado' | 'rechazado'; receiptUrl?: string; observations?: string; receiptNumbers?: { [ownerId: string]: string }; };

function VerificationComponent({ condoId }: { condoId: string }) {
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const { toast } = useToast();

    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pendiente');
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        onSnapshot(settingsRef, (snap) => { if (snap.exists()) setCompanyInfo(snap.data().companyInfo); });
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
            return p.reference?.toLowerCase().includes(search) || p.beneficiaries?.some(b => b.ownerName.toLowerCase().includes(search));
        });
    }, [payments, activeTab, searchTerm]);

    const handleApprove = (payment: Payment) => {
        requestAuthorization(async () => {
            if (!condoId) return;
            setIsVerifying(true);
            try {
                const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const settingsDoc = await getDoc(settingsRef);
                const condoFeeUSD = settingsDoc.data()?.condoFee || 0;
                const costBs = condoFeeUSD * payment.exchangeRate;

                let targetAccountName = "";
                if (['movil', 'transferencia'].includes(payment.paymentMethod)) targetAccountName = "BANCO DE VENEZUELA";
                else if (['efectivo_bs', 'efectivo'].includes(payment.paymentMethod)) targetAccountName = "CAJA PRINCIPAL";

                // Búsqueda previa de la cuenta fuera de la transacción para obtener el ID real
                const accountsSnap = await getDocs(collection(db, 'condominios', condoId, 'cuentas'));
                let targetAccDoc = accountsSnap.docs.find(d => d.data().nombre?.toUpperCase().trim() === targetAccountName);
                
                let accountId = "";
                let accountExists = false;

                if (targetAccDoc) {
                    accountId = targetAccDoc.id;
                    accountExists = true;
                } else {
                    const newAccRef = doc(collection(db, 'condominios', condoId, 'cuentas'));
                    accountId = newAccRef.id;
                }

                await runTransaction(db, async (transaction) => {
                    const beneficiaryIds = payment.beneficiaries.map(b => b.ownerId);
                    
                    // Obtener deudas
                    const allDebtsSnap = await getDocs(query(collection(db, 'condominios', condoId, 'debts'), where('ownerId', 'in', beneficiaryIds)));
                    const allDebts = allDebtsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
                    
                    const receiptNumbers: { [ownerId: string]: string } = {};

                    for (const beneficiary of payment.beneficiaries) {
                        const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId);
                        const ownerDoc = await transaction.get(ownerRef);
                        if (!ownerDoc.exists()) continue;

                        const pending = allDebts.filter(d => d.ownerId === beneficiary.ownerId && (d.status === 'pending' || d.status === 'vencida'))
                            .sort((a,b) => a.year - b.year || a.month - b.month)
                            .map(d => ({ id: d.id, amountUSD: d.amountUSD, monto: d.amountUSD * payment.exchangeRate }));

                        const liq = processPaymentLiquidation(beneficiary.amount, ownerDoc.data().balance || 0, pending, costBs);

                        liq.cuotasLiquidadas.forEach(debtLiq => {
                            transaction.update(doc(db, 'condominios', condoId, 'debts', debtLiq.id), { 
                                status: 'paid', 
                                paymentId: payment.id, 
                                paymentDate: payment.paymentDate, 
                                paidAmountUSD: debtLiq.amountUSD 
                            });
                        });

                        if (liq.cuotasAdelantadas > 0 && condoFeeUSD > 0) {
                            const lastPaid = allDebts.filter(d => d.ownerId === beneficiary.ownerId).sort((a,b) => b.year - a.year || b.month - a.month)[0];
                            let nextDate = lastPaid ? addMonths(new Date(lastPaid.year, lastPaid.month - 1), 1) : new Date();
                            for (let i = 0; i < liq.cuotasAdelantadas; i++) {
                                transaction.set(doc(collection(db, 'condominios', condoId, 'debts')), { 
                                    ownerId: beneficiary.ownerId, 
                                    year: nextDate.getFullYear(), 
                                    month: nextDate.getMonth() + 1, 
                                    amountUSD: condoFeeUSD, 
                                    description: "Cuota Adelantada", 
                                    status: 'paid', 
                                    paymentId: payment.id, 
                                    paymentDate: payment.paymentDate, 
                                    paidAmountUSD: condoFeeUSD, 
                                    property: beneficiary,
                                    published: true
                                });
                                nextDate = addMonths(nextDate, 1);
                            }
                        }
                        transaction.update(ownerRef, { balance: liq.nuevoSaldoAFavor });
                        receiptNumbers[beneficiary.ownerId] = `REC-${Date.now()}-${beneficiary.ownerId.slice(-4)}`;
                    }

                    // ACTUALIZACIÓN DE SALDO EN TESORERÍA (HITO CONTABLE)
                    const accountRef = doc(db, 'condominios', condoId, 'cuentas', accountId);
                    if (!accountExists) {
                        transaction.set(accountRef, { 
                            nombre: targetAccountName, 
                            tipo: targetAccountName === "CAJA PRINCIPAL" ? "efectivo" : "banco", 
                            saldoActual: payment.totalAmount, 
                            createdAt: serverTimestamp() 
                        });
                    } else {
                        transaction.update(accountRef, { saldoActual: increment(payment.totalAmount) });
                    }
                    
                    // ASIENTO EN LIBRO DIARIO
                    transaction.set(doc(collection(db, 'condominios', condoId, 'transacciones')), {
                        monto: payment.totalAmount, 
                        tipo: 'ingreso', 
                        cuentaId: accountId, 
                        nombreCuenta: targetAccountName,
                        descripcion: `PAGO APROBADO: ${payment.beneficiaries.map(b => b.ownerName).join(', ')}`,
                        referencia: payment.reference, 
                        fecha: payment.paymentDate, 
                        sourcePaymentId: payment.id,
                        createdAt: serverTimestamp(), 
                        createdBy: user?.email
                    });

                    transaction.update(doc(db, 'condominios', condoId, 'payments', payment.id), { 
                        status: 'aprobado', 
                        receiptNumbers, 
                        observations: 'Validado y asentado en Tesorería.' 
                    });
                });
                toast({ title: "Hito Contable Completado", description: "El saldo ha sido sumado a Tesorería y los libros están al día." });
                setSelectedPayment(null);
            } catch (error: any) { toast({ variant: 'destructive', title: "Error", description: error.message }); }
            finally { setIsVerifying(false); }
        });
    };

    const handleReject = (payment: Payment) => {
        if (!rejectionReason) return toast({ variant: 'destructive', title: "Razón requerida" });
        requestAuthorization(async () => {
            setIsVerifying(true);
            try {
                await updateDoc(doc(db, 'condominios', condoId, 'payments', payment.id), { status: 'rechazado', observations: rejectionReason });
                toast({ title: "Pago Rechazado" });
                setSelectedPayment(null);
            } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
            finally { setIsVerifying(false); }
        });
    };

    const handleDeletePayment = async () => {
        if (!paymentToDelete || !condoId) return;
        requestAuthorization(async () => {
            setIsVerifying(true);
            try {
                const paymentRef = doc(db, 'condominios', condoId, 'payments', paymentToDelete.id);
                const txSnap = await getDocs(query(collection(db, 'condominios', condoId, 'transacciones'), where('sourcePaymentId', '==', paymentToDelete.id)));
                await runTransaction(db, async (transaction) => {
                    const payDoc = await transaction.get(paymentRef);
                    if (payDoc.data()?.status === 'aprobado') {
                        if (txSnap.docs.length > 0) {
                            const tx = txSnap.docs[0].data();
                            transaction.update(doc(db, 'condominios', condoId, 'cuentas', tx.cuentaId), { saldoActual: increment(-paymentToDelete.totalAmount) });
                            txSnap.forEach(d => transaction.delete(d.ref));
                        }
                        const debtsSnap = await getDocs(query(collection(db, 'condominios', condoId, 'debts'), where('paymentId', '==', paymentToDelete.id)));
                        debtsSnap.forEach(d => transaction.update(d.ref, { status: 'pending', paymentId: deleteField(), paymentDate: deleteField(), paidAmountUSD: deleteField() }));
                    }
                    transaction.delete(paymentRef);
                });
                toast({ title: "Pago Revertido", description: "El saldo fue descontado de Tesorería." });
                setPaymentToDelete(null);
            } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
            finally { setIsVerifying(false); }
        });
    };

    const prepareReceipt = async (payment: Payment, ben: any) => {
        if (!companyInfo) return toast({ variant: 'destructive', title: "Configuración de empresa faltante" });
        try {
            const data = {
                condoName: companyInfo.name, rif: companyInfo.rif, ownerName: ben.ownerName,
                method: payment.paymentMethod, bank: payment.bank, reference: payment.reference,
                date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'), rate: formatCurrency(payment.exchangeRate),
                receiptNumber: payment.receiptNumbers?.[ben.ownerId] || 'N/A', receivedAmount: formatCurrency(ben.amount),
                currentBalance: '0,00', totalDebtPaid: formatCurrency(ben.amount), prevBalance: '0,00', observations: 'Hito contable automatizado.',
                concepts: [['Liquidación Progresiva', `Casa: ${ben.house || 'S/D'}`, '', formatCurrency(ben.amount)]]
            };
            await generatePaymentReceipt(data, companyInfo.logo, 'download');
        } catch (e) { toast({ variant: 'destructive', title: "Error PDF" }); }
    };

    return (
        <Card className="rounded-[2rem] border-none shadow-sm bg-white">
            <CardHeader className="p-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <CardTitle className="text-slate-900 font-black uppercase italic">Validación de Ingresos</CardTitle>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Referencia o Nombre..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-xl bg-slate-50 border-slate-200 text-slate-900 font-bold" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid grid-cols-3 mx-8 mb-6 h-12 bg-slate-100 rounded-xl p-1">
                        <TabsTrigger value="pendiente" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-sm transition-all text-slate-600">Pendientes</TabsTrigger>
                        <TabsTrigger value="aprobado" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-sm transition-all text-slate-600">Aprobados</TabsTrigger>
                        <TabsTrigger value="rechazado" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-sm transition-all text-slate-600">Rechazados</TabsTrigger>
                    </TabsList>
                    
                    {loading ? <div className="text-center p-20"><Loader2 className="animate-spin h-10 w-10 mx-auto text-primary" /></div> : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50"><TableRow className="border-slate-100"><TableHead className="px-8 py-6 text-[10px] font-black uppercase text-slate-500">Beneficiarios</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-500">Fecha</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-500">Monto</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-500">Ref.</TableHead><TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-500">Acción</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {filteredPayments.length === 0 ? (<TableRow><TableCell colSpan={5} className="h-32 text-center text-slate-400 font-bold italic">Sin registros en esta bandeja.</TableCell></TableRow>) : 
                                    filteredPayments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 border-slate-50">
                                            <TableCell className="px-8 py-5"><div className="font-black text-slate-900 text-xs uppercase">{p.beneficiaries.map(b => b.ownerName).join(', ')}</div><div className="text-[9px] font-black text-primary uppercase mt-0.5">{p.paymentMethod}</div></TableCell>
                                            <TableCell className="text-slate-500 font-bold text-xs">{format(p.paymentDate.toDate(), 'dd/MM/yy')}</TableCell>
                                            <TableCell className="font-black text-slate-900 text-sm">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                            <TableCell className="font-mono text-[10px] text-slate-400 font-bold">{p.reference}</TableCell>
                                            <TableCell className="text-right pr-8">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="rounded-xl border-slate-200 shadow-xl bg-white">
                                                        <DropdownMenuItem onClick={() => setSelectedPayment(p)} className="font-bold text-xs text-slate-700 p-3"><Eye className="mr-2 h-4 w-4" /> Detalles</DropdownMenuItem>
                                                        {p.status === 'pendiente' ? (<><DropdownMenuSeparator /><DropdownMenuItem onClick={() => handleApprove(p)} className="text-emerald-600 font-black uppercase text-[10px] p-3"><CheckCircle className="mr-2 h-4 w-4" /> Validar y Asentar</DropdownMenuItem><DropdownMenuItem onClick={() => { setSelectedPayment(p); setRejectionReason(''); }} className="text-red-600 font-black uppercase text-[10px] p-3"><XCircle className="mr-2 h-4 w-4" /> Rechazar</DropdownMenuItem></>) : 
                                                        p.status === 'aprobado' && (<><DropdownMenuSeparator /><DropdownMenuSub><DropdownMenuSubTrigger className="font-bold text-xs text-slate-700 p-3"><Download className="mr-2 h-4 w-4" /> Recibos PDF</DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent className="rounded-xl bg-white">{p.beneficiaries.map(b => <DropdownMenuItem key={b.ownerId} onClick={() => prepareReceipt(p, b)} className="text-[10px] font-black uppercase p-3">{b.ownerName}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub><DropdownMenuItem onClick={() => setPaymentToDelete(p)} className="text-red-600 font-bold text-xs p-3"><Trash2 className="mr-2 h-4 w-4"/> Revertir Pago</DropdownMenuItem></>)}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </Tabs>
            </CardContent>

            <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
                <DialogContent className="max-w-2xl rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Detalles del Reporte</DialogTitle><DialogDescription className="font-bold text-slate-400">Ref: {selectedPayment?.reference}</DialogDescription></DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <p className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Asignación de Montos</p>
                                {selectedPayment?.beneficiaries.map((b, i) => (<div key={i} className="flex justify-between items-center py-2 border-b border-white last:border-0"><span className="font-black text-slate-700 text-xs uppercase">{b.ownerName}</span><span className="font-black text-slate-900">Bs. {formatCurrency(b.amount)}</span></div>))}
                                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center"><span className="text-[10px] font-black uppercase text-slate-900">Total Transacción:</span><span className="text-lg font-black text-[#0081c9]">Bs. {formatCurrency(selectedPayment?.totalAmount || 0)}</span></div>
                            </div>
                            {selectedPayment?.status === 'pendiente' && (<div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Motivo de Rechazo (si aplica)</Label><Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="rounded-2xl bg-slate-50 border-slate-200 font-bold text-slate-900" placeholder="Escriba aquí..." /></div>)}
                        </div>
                        <div className="relative aspect-[3/4] bg-slate-100 rounded-3xl overflow-hidden border border-slate-200 flex items-center justify-center">
                            {selectedPayment?.receiptUrl ? (<Image src={selectedPayment.receiptUrl} alt="Comprobante" fill className="object-contain" />) : (<div className="text-center text-slate-300 font-black uppercase italic text-xs">Sin imagen adjunta</div>)}
                        </div>
                    </div>
                    {selectedPayment?.status === 'pendiente' && (
                        <DialogFooter className="gap-3 mt-4"><Button variant="ghost" onClick={() => handleReject(selectedPayment!)} disabled={isVerifying} className="text-red-600 font-black uppercase text-[10px]">Rechazar Reporte</Button><Button onClick={() => handleApprove(selectedPayment!)} disabled={isVerifying} className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-[10px] h-12 rounded-xl flex-1 shadow-lg">{isVerifying ? <Loader2 className="animate-spin" /> : "Validar y Asentar en Tesorería"}</Button></DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase italic text-red-600">¿Revertir Transacción?</DialogTitle></DialogHeader>
                    <p className="text-slate-500 font-bold text-sm leading-relaxed uppercase">Esta acción restará el monto de los saldos de Tesorería y devolverá las deudas a estatus "Pendiente".</p>
                    <DialogFooter className="gap-2 mt-6"><Button variant="outline" onClick={() => setPaymentToDelete(null)} className="rounded-xl font-bold h-12 text-slate-900">Cancelar</Button><Button onClick={handleDeletePayment} disabled={isVerifying} variant="destructive" className="rounded-xl font-black uppercase h-12 shadow-lg">Confirmar Reversión</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

function ReportPaymentComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const { user: authUser, ownerData: authOwnerData } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('movil');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';
    const isCashPayment = paymentMethod === 'efectivo_bs';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        return onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
    }, [condoId, ownersCollectionName]);

    useEffect(() => {
        if (authOwnerData && authUser) {
           setBeneficiaryRows([{
               id: Date.now().toString(),
               owner: { id: authUser.uid, name: authOwnerData.name, properties: authOwnerData.properties },
               searchTerm: '',
               amount: '',
               selectedProperty: authOwnerData.properties?.[0] || null
           }]);
       }
   }, [authOwnerData, authUser]);

    useEffect(() => {
        if (!condoId) return;
        const fetchRate = async () => {
            const docSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            if (docSnap.exists() && paymentDate) {
                const allRates = (docSnap.data().exchangeRates || []);
                const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                const applicable = allRates.filter((r:any) => r.date <= paymentDateString).sort((a:any, b:any) => b.date.localeCompare(a.date));
                setExchangeRate(applicable.length > 0 ? applicable[0].rate : null);
            }
        };
        fetchRate();
    }, [paymentDate, condoId]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const compressedBase64 = await compressImage(file, 800, 800);
            setReceiptImage(compressedBase64);
            toast({ title: 'Comprobante cargado' });
        } catch (error) { toast({ variant: 'destructive', title: 'Error' }); } 
        finally { setLoading(false); }
    };

    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balance = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);
    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });
    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => { if (beneficiaryRows.length > 1) setBeneficiaryRows(rows => rows.filter(row => row.id !== id)); };
    const getFilteredOwners = (searchTerm: string) => searchTerm.length < 2 ? [] : allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser || !condoId || !exchangeRate || !totalAmount) return;
        setIsSubmitting(true);
        try {
            const beneficiaries = beneficiaryRows.map(row => ({ 
                ownerId: row.owner!.id, 
                ownerName: row.owner!.name, 
                ...(row.selectedProperty && { street: row.selectedProperty.street, house: row.selectedProperty.house }), 
                amount: Number(row.amount) 
            }));
            await addDoc(collection(db, "condominios", condoId, "payments"), { 
                reportedBy: authUser.uid, beneficiaries, beneficiaryIds: beneficiaries.map(b=>b.ownerId), 
                totalAmount: Number(totalAmount), exchangeRate, paymentDate: Timestamp.fromDate(paymentDate!), 
                paymentMethod, bank: isCashPayment ? 'Efectivo' : (bank === 'Otro' ? otherBank : bank), 
                reference: isCashPayment ? 'EFECTIVO' : reference, receiptUrl: receiptImage, 
                status: 'pendiente', reportedAt: serverTimestamp() 
            });
            toast({ title: 'Pago Reportado' });
            setTotalAmount(''); setReference(''); setReceiptImage(null);
        } catch (error) { toast({ variant: "destructive", title: "Error" }); } 
        finally { setIsSubmitting(false); }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-slate-50 border-b p-8"><CardTitle className="text-slate-900 font-black uppercase italic">Reportar Pago Manual</CardTitle></CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 space-y-8">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Fecha</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-12 rounded-xl font-bold bg-slate-50 border-slate-200 text-slate-900"><CalendarIcon className="mr-2 h-4 w-4" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : "Seleccione"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} /></PopoverContent></Popover></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Tasa BCV</Label><Input type="number" value={exchangeRate || ''} readOnly className="h-12 rounded-xl bg-slate-100 font-black text-slate-900" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Método</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}><SelectTrigger className="h-12 rounded-xl font-bold bg-slate-50 border-slate-200 text-slate-900"><SelectValue/></SelectTrigger><SelectContent className="bg-white"><SelectItem value="transferencia" className="text-slate-900">Transferencia</SelectItem><SelectItem value="movil" className="text-slate-900">Pago Móvil</SelectItem><SelectItem value="efectivo_bs" className="text-slate-900">Efectivo Bs.</SelectItem></SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Banco</Label><Button type="button" variant="outline" className="w-full h-12 rounded-xl font-bold bg-slate-50 border-slate-200 text-left justify-start text-slate-900" onClick={() => setIsBankModalOpen(true)} disabled={isCashPayment}>{isCashPayment ? 'EFECTIVO' : (bank || "Seleccionar...")}</Button></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))} disabled={isCashPayment} className="h-12 rounded-xl font-black bg-slate-50 border-slate-200 text-slate-900" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Total Bs.</Label><Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="h-12 rounded-xl font-black text-lg bg-slate-50 border-slate-200 text-slate-900" /></div>
                    </div>
                    <div className="space-y-4">
                        {beneficiaryRows.map((row) => (
                            <Card key={row.id} className="p-6 bg-slate-50 border-slate-100 rounded-3xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        {!row.owner ? (<div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Buscar residente..." className="pl-9 h-12 rounded-xl bg-white border-slate-200 text-slate-900" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} />{row.searchTerm.length >= 2 && <Card className="absolute z-10 w-full mt-1 border shadow-lg rounded-xl overflow-hidden bg-white"><ScrollArea className="h-32">{getFilteredOwners(row.searchTerm).map(o => (<div key={o.id} onClick={() => handleOwnerSelect(row.id, o)} className="p-3 hover:bg-slate-50 cursor-pointer font-bold text-xs uppercase text-slate-900">{o.name}</div>))}</ScrollArea></Card>}</div>) : 
                                        (<div className="p-4 bg-white rounded-2xl border border-slate-100 flex justify-between items-center"><p className="font-black text-slate-900 uppercase text-xs">{row.owner.name}</p><Button variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} className="text-red-400"><XCircle className="h-5 w-5" /></Button></div>)}
                                        {row.owner && (
                                            <div className="space-y-1 mt-2">
                                                <Label className="text-[10px] uppercase font-bold text-slate-500">Asignar a Propiedad</Label>
                                                <Select 
                                                    onValueChange={(v) => {
                                                        const found = row.owner?.properties.find(p => `${p.street}-${p.house}` === v);
                                                        updateBeneficiaryRow(row.id, { selectedProperty: found || null });
                                                    }} 
                                                    value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}
                                                >
                                                    <SelectTrigger className="rounded-xl h-10 bg-white border-slate-200 text-slate-900">
                                                        <SelectValue placeholder="Seleccione propiedad..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-white">
                                                        {row.owner.properties.map((p, pIdx) => (
                                                            <SelectItem key={`${p.street}-${p.house}-${pIdx}`} value={`${p.street}-${p.house}`} className="text-slate-900">
                                                                {p.street} - {p.house}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>
                                    <Input type="number" placeholder="Monto Bs." value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={!row.owner} className="h-12 rounded-xl font-black bg-white border-slate-200 text-slate-900" />
                                </div>
                            </Card>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} className="rounded-xl font-black uppercase text-[10px] text-slate-900 border-slate-300">
                            <UserPlus className="mr-2 h-4 w-4"/>Añadir Beneficiario
                        </Button>
                    </div>
                </CardContent>
                <CardFooter className="bg-slate-50 p-8 border-t flex justify-end gap-4"><div className={cn("font-black text-lg", balance !== 0 ? 'text-red-600' : 'text-emerald-600')}>Dif: Bs. {formatCurrency(balance)}</div><Button type="submit" disabled={isSubmitting || Math.abs(balance) > 0.01} className="h-14 px-10 rounded-2xl bg-slate-900 text-white font-black uppercase italic shadow-xl">{isSubmitting ? <Loader2 className="animate-spin"/> : 'Reportar Pago'}</Button></CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(v) => { setBank(v); setIsBankModalOpen(false); }} />
        </Card>
    );
}

function PaymentsPage() {
    const searchParams = useSearchParams();
    const condoId = useParams()?.condoId as string;
    const router = useRouter();
    const activeTab = searchParams?.get('tab') ?? 'verify';
    return (
        <div className="space-y-10 animate-in fade-in duration-500 font-montserrat">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-[#0081c9]">Pagos</span></h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">Hitos contables y conciliación de saldos en tiempo real.</p>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => router.push(`/${condoId}/admin/payments?tab=${v}`)}>
                <TabsList className="grid w-full grid-cols-2 bg-slate-200 h-14 rounded-2xl p-1"><TabsTrigger value="verify" className="rounded-xl font-black uppercase text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-600 transition-all">Verificación</TabsTrigger><TabsTrigger value="report" className="rounded-xl font-black uppercase text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-600 transition-all">Reporte Manual</TabsTrigger></TabsList>
                <TabsContent value="verify" className="mt-8"><VerificationComponent condoId={condoId} /></TabsContent>
                <TabsContent value="report" className="mt-8"><ReportPaymentComponent condoId={condoId} /></TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (<Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}><PaymentsPage /></Suspense>);
}

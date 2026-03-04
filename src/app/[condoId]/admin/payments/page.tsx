
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
    PlusCircle
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
const CAJA_PRINCIPAL_ID = "CAJA_PRINCIPAL_ID";

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
        return onSnapshot(settingsRef, (snap) => {
            if (snap.exists()) {
                setLocalCompanyInfo(snap.data().companyInfo);
            }
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
            if (p.status !== activeTab) return false;
            if (!searchTerm) return true;
            const search = searchTerm.toLowerCase();
            return (
                p.reference?.toLowerCase().includes(search) || 
                p.beneficiaries?.some(b => b.ownerName?.toLowerCase().includes(search))
            );
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

                const beneficiaryIds = payment.beneficiaries.map(b => b.ownerId);
                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('ownerId', 'in', beneficiaryIds),
                    where('status', 'in', ['pending', 'vencida'])
                ));
                
                const allPendingDebts = debtsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any));

                await runTransaction(db, async (transaction) => {
                    const ownerSnapsMap = new Map();
                    for (const beneficiary of payment.beneficiaries) {
                        const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId);
                        const snap = await transaction.get(ownerRef);
                        if (snap.exists()) {
                            ownerSnapsMap.set(beneficiary.ownerId, snap.data());
                        }
                    }

                    const receiptNumbers: { [ownerId: string]: string } = {};
                    const liquidatedConcepts: LiquidatedConcept[] = [];

                    for (const beneficiary of payment.beneficiaries) {
                        const ownerData = ownerSnapsMap.get(beneficiary.ownerId);
                        if (!ownerData) continue;

                        let funds = new Decimal(beneficiary.amount).plus(new Decimal(ownerData.balance || 0));
                        
                        const ownerPendingDebts = allPendingDebts
                            .filter((d: any) => d.ownerId === beneficiary.ownerId)
                            .sort((a: any, b: any) => a.year - b.year || a.month - b.month);

                        for (const debt of ownerPendingDebts) {
                            const debtAmountBs = new Decimal(debt.amountUSD).times(new Decimal(payment.exchangeRate));
                            if (funds.gte(debtAmountBs)) {
                                funds = funds.minus(debtAmountBs);
                                transaction.update(debt.ref, {
                                    status: 'paid',
                                    paidAmountUSD: debt.amountUSD,
                                    paymentDate: payment.paymentDate,
                                    paymentId: payment.id
                                });
                                liquidatedConcepts.push({
                                    ownerId: beneficiary.ownerId,
                                    description: debt.description,
                                    amountUSD: debt.amountUSD,
                                    period: `${monthsLocale[debt.month]} ${debt.year}`,
                                    type: 'deuda'
                                });
                            } else break;
                        }

                        const advanceAmountBs = new Decimal(currentFee).times(payment.exchangeRate);
                        if (funds.gte(advanceAmountBs)) {
                            let nextMonthDate = addMonths(new Date(), 1);
                            
                            while (funds.gte(advanceAmountBs)) {
                                const year = nextMonthDate.getFullYear();
                                const month = nextMonthDate.getMonth() + 1;
                                
                                const newDebtRef = doc(collection(db, 'condominios', condoId, 'debts'));
                                transaction.set(newDebtRef, {
                                    ownerId: beneficiary.ownerId,
                                    property: { street: beneficiary.street || '', house: beneficiary.house || '' },
                                    year,
                                    month,
                                    amountUSD: currentFee,
                                    description: 'Cuota de Condominio (Adelantado)',
                                    status: 'paid',
                                    paidAmountUSD: currentFee,
                                    paymentDate: payment.paymentDate,
                                    paymentId: payment.id,
                                    published: true
                                });

                                liquidatedConcepts.push({
                                    ownerId: beneficiary.ownerId,
                                    description: 'CUOTA ADELANTADA',
                                    amountUSD: currentFee,
                                    period: `${monthsLocale[month]} ${year}`,
                                    type: 'adelanto'
                                });

                                funds = funds.minus(advanceAmountBs);
                                nextMonthDate = addMonths(nextMonthDate, 1);
                            }
                        }

                        if (funds.gt(0)) {
                            liquidatedConcepts.push({
                                ownerId: beneficiary.ownerId,
                                description: 'ABONO A SALDO A FAVOR',
                                amountUSD: funds.div(payment.exchangeRate).toNumber(),
                                period: 'SALDO',
                                type: 'abono'
                            });
                        }

                        receiptNumbers[beneficiary.ownerId] = `REC-${Date.now().toString().substring(6)}-${beneficiary.ownerId.slice(-4)}`.toUpperCase();
                        const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId);
                        transaction.update(ownerRef, { balance: funds.toDecimalPlaces(2).toNumber() });
                    }

                    const accountRef = doc(db, 'condominios', condoId, 'cuentas', targetAccountId);
                    transaction.update(accountRef, { saldoActual: increment(payment.totalAmount) });

                    const statsRef = doc(db, 'condominios', condoId, 'financial_stats', monthId);
                    transaction.set(statsRef, {
                        periodo: monthId,
                        saldoBancarioReal: increment(isDigital ? payment.totalAmount : 0),
                        saldoCajaReal: increment(!isDigital ? payment.totalAmount : 0),
                        totalIngresosMes: increment(payment.totalAmount),
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    const transRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                    transaction.set(transRef, {
                        monto: payment.totalAmount, 
                        tipo: 'ingreso', 
                        cuentaId: targetAccountId, 
                        nombreCuenta: targetAccountName,
                        descripcion: `INGRESO: PAGO DE ${payment.beneficiaries.map(b => b.ownerName).join(', ')}`.toUpperCase(),
                        referencia: payment.reference, 
                        fecha: payment.paymentDate, 
                        sourcePaymentId: payment.id,
                        createdAt: serverTimestamp(), 
                        createdBy: user?.email
                    });

                    transaction.update(doc(db, 'condominios', condoId, 'payments', payment.id), { 
                        status: 'aprobado', 
                        receiptNumbers, 
                        liquidatedConcepts,
                        observations: 'PAGO AUDITADO Y LIQUIDADO CRONOLÓGICAMENTE.' 
                    });
                });

                toast({ title: "Pago Validado", description: "Deudas liquidadas y sincronizadas con Tesorería." });
                setSelectedPayment(null);
            } catch (error: any) { 
                console.error(error);
                toast({ variant: 'destructive', title: "Error en proceso", description: error.message }); 
            } finally { setIsVerifying(false); }
        });
    };

    const handleReject = (payment: Payment) => {
        if (!rejectionReason) return toast({ variant: 'destructive', title: "Motivo requerido" });
        requestAuthorization(async () => {
            if (!condoId) return;
            try {
                await updateDoc(doc(db, 'condominios', condoId, 'payments', payment.id), {
                    status: 'rechazado',
                    observations: rejectionReason.toUpperCase(),
                    rejectedBy: user?.email,
                    rejectedAt: serverTimestamp()
                });
                toast({ title: "Pago Rechazado" });
                setSelectedPayment(null);
            } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
        });
    };

    const handleExportPDF = async (payment: Payment, ownerId: string) => {
        try {
            if (!localCompanyInfo) {
                toast({ variant: 'destructive', title: 'Error', description: 'Información de la empresa no disponible.' });
                return;
            }
            const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
            if (!beneficiary) return;

            let ownerConcepts = (payment.liquidatedConcepts || []).filter(c => c.ownerId === ownerId);
            
            if (ownerConcepts.length === 0) {
                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('paymentId', '==', payment.id),
                    where('ownerId', '==', ownerId)
                ));
                
                const debts = debtsSnap.docs.map(d => d.data());
                if (debts.length > 0) {
                    ownerConcepts = debts.map((d: any) => ({
                        ownerId: ownerId,
                        description: d.description,
                        amountUSD: d.paidAmountUSD || d.amountUSD,
                        period: `${monthsLocale[d.month] || 'Mes'} ${d.year}`,
                        type: 'deuda'
                    }));
                }
                
                const totalPaidInDebtsUSD = ownerConcepts.reduce((sum, c) => sum + c.amountUSD, 0);
                const totalPaidInDebtsBs = totalPaidInDebtsUSD * payment.exchangeRate;
                const remainderBs = beneficiary.amount - totalPaidInDebtsBs;
                
                if (remainderBs > 0.05) {
                    ownerConcepts.push({
                        ownerId: ownerId,
                        description: 'ABONO A SALDO A FAVOR',
                        amountUSD: remainderBs / payment.exchangeRate,
                        period: 'SALDO',
                        type: 'abono'
                    });
                }
            }

            const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate as any) : new Date());
            const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCollectionName, ownerId));
            const currentBalance = ownerSnap.exists() ? (ownerSnap.data().balance || 0) : 0;
            const totalAbonadoBs = ownerConcepts.reduce((sum, c) => sum + (c.amountUSD * payment.exchangeRate), 0);
            const prevBalance = Math.max(0, currentBalance - (beneficiary.amount - totalAbonadoBs));

            const data = {
                condoName: localCompanyInfo.name || 'CONDOMINIO',
                rif: localCompanyInfo.rif || 'J-40587208-0',
                receiptNumber: payment.receiptNumbers?.[ownerId] || 'S/N',
                ownerName: beneficiary.ownerName,
                method: payment.paymentMethod?.toLowerCase() || 'N/A',
                bank: payment.bank || 'N/A',
                reference: payment.reference || 'N/A',
                date: format(pDate, 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                receivedAmount: formatCurrency(beneficiary.amount),
                totalDebtPaid: formatCurrency(totalAbonadoBs),
                prevBalance: formatCurrency(prevBalance),
                currentBalance: formatCurrency(currentBalance),
                observations: payment.observations || 'Pago verificado y aplicado por la administración.',
                concepts: ownerConcepts.map(c => [
                    c.period, 
                    `${c.description} (${beneficiary.street || ''} - ${beneficiary.house || ''})`, 
                    c.type === 'abono' ? '' : `$${c.amountUSD.toFixed(2)}`, 
                    formatCurrency(c.amountUSD * payment.exchangeRate)
                ])
            };

            await generatePaymentReceipt(data, localCompanyInfo.logo, 'download');
            toast({ title: "Recibo descargado" });
        } catch (error) {
            console.error("PDF Export Error:", error);
            toast({ variant: 'destructive', title: 'Error al generar PDF' });
        }
    };

    const handleSharePDF = async (payment: Payment, ownerId: string) => {
        try {
            if (!localCompanyInfo) {
                toast({ variant: 'destructive', title: 'Error', description: 'Información de la empresa no disponible.' });
                return;
            }
            const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
            if (!beneficiary) return;

            let ownerConcepts = (payment.liquidatedConcepts || []).filter(c => c.ownerId === ownerId);
            
            if (ownerConcepts.length === 0) {
                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('paymentId', '==', payment.id),
                    where('ownerId', '==', ownerId)
                ));
                
                const debts = debtsSnap.docs.map(d => d.data());
                if (debts.length > 0) {
                    ownerConcepts = debts.map((d: any) => ({
                        ownerId: ownerId,
                        description: d.description,
                        amountUSD: d.paidAmountUSD || d.amountUSD,
                        period: `${monthsLocale[d.month] || 'Mes'} ${d.year}`,
                        type: 'deuda'
                    }));
                }
                
                const totalPaidInDebtsUSD = ownerConcepts.reduce((sum, c) => sum + c.amountUSD, 0);
                const totalPaidInDebtsBs = totalPaidInDebtsUSD * payment.exchangeRate;
                const remainderBs = beneficiary.amount - totalPaidInDebtsBs;
                
                if (remainderBs > 0.05) {
                    ownerConcepts.push({
                        ownerId: ownerId,
                        description: 'ABONO A SALDO A FAVOR',
                        amountUSD: remainderBs / payment.exchangeRate,
                        period: 'SALDO',
                        type: 'abono'
                    });
                }
            }

            const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate as any) : new Date());
            const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCollectionName, ownerId));
            const currentBalance = ownerSnap.exists() ? (ownerSnap.data().balance || 0) : 0;
            const totalAbonadoBs = ownerConcepts.reduce((sum, c) => sum + (c.amountUSD * payment.exchangeRate), 0);
            const prevBalance = Math.max(0, currentBalance - (beneficiary.amount - totalAbonadoBs));

            const data = {
                condoName: localCompanyInfo.name || 'CONDOMINIO',
                rif: localCompanyInfo.rif || 'J-40587208-0',
                receiptNumber: payment.receiptNumbers?.[ownerId] || 'S/N',
                ownerName: beneficiary.ownerName,
                method: payment.paymentMethod?.toLowerCase() || 'N/A',
                bank: payment.bank || 'N/A',
                reference: payment.reference || 'N/A',
                date: format(pDate, 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                receivedAmount: formatCurrency(beneficiary.amount),
                totalDebtPaid: formatCurrency(totalAbonadoBs),
                prevBalance: formatCurrency(prevBalance),
                currentBalance: formatCurrency(currentBalance),
                observations: payment.observations || 'Pago verificado y aplicado por la administración.',
                concepts: ownerConcepts.map(c => [
                    c.period, 
                    `${c.description} (${beneficiary.street || ''} - ${beneficiary.house || ''})`, 
                    c.type === 'abono' ? '' : `$${c.amountUSD.toFixed(2)}`, 
                    formatCurrency(c.amountUSD * payment.exchangeRate)
                ])
            };

            const blob = await generatePaymentReceipt(data, localCompanyInfo.logo, 'blob');
            if (blob && navigator.share) {
                const safeName = beneficiary.ownerName.replace(/[^a-z0-9]/gi, '_').toUpperCase();
                const file = new File([blob as Blob], `Recibo_Pago_${safeName}.pdf`, { type: 'application/pdf' });
                await navigator.share({ files: [file], title: 'Recibo de Pago', text: `Comprobante para ${beneficiary.ownerName}` });
            } else {
                toast({ title: "No disponible", description: "Su dispositivo no soporta compartir archivos." });
            }
        } catch (error) {
            console.error("PDF Share Error:", error);
            toast({ variant: 'destructive', title: 'Error al compartir' });
        }
    };

    const handleDeletePayment = async () => {
        if (!paymentToDelete || !condoId) return;
        requestAuthorization(async () => {
            setIsVerifying(true);
            try {
                const monthId = format(paymentToDelete.paymentDate.toDate(), 'yyyy-MM');
                const transSnap = await getDocs(query(collection(db, 'condominios', condoId, 'transacciones'), where('sourcePaymentId', '==', paymentToDelete.id)));
                
                await runTransaction(db, async (transaction) => {
                    if (paymentToDelete.status === 'aprobado') {
                        for (const ben of paymentToDelete.beneficiaries) {
                            const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, ben.ownerId);
                            transaction.update(ownerRef, { balance: increment(-ben.amount) });
                        }
                        
                        if (!transSnap.empty) {
                            const txData = transSnap.docs[0].data();
                            transaction.update(doc(db, 'condominios', condoId, 'cuentas', txData.cuentaId), { saldoActual: increment(-paymentToDelete.totalAmount) });
                            const statsRef = doc(db, 'condominios', condoId, 'financial_stats', monthId);
                            transaction.update(statsRef, {
                                saldoBancarioReal: increment(txData.nombreCuenta === "BANCO DE VENEZUELA" ? -paymentToDelete.totalAmount : 0),
                                saldoCajaReal: increment(txData.nombreCuenta === "CAJA PRINCIPAL" ? -paymentToDelete.totalAmount : 0),
                                totalIngresosMes: increment(-paymentToDelete.totalAmount)
                            });
                            transSnap.forEach(d => transaction.delete(d.ref));
                        }
                    }
                    transaction.delete(doc(db, 'condominios', condoId, 'payments', paymentToDelete.id));
                });
                toast({ title: "Registro Eliminado" });
                setPaymentToDelete(null);
            } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
            finally { setIsVerifying(false); }
        });
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat italic">
            <CardHeader className="p-8 border-b border-white/5">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <CardTitle className="text-white font-black uppercase italic text-2xl tracking-tighter">Bandeja de <span className="text-primary">Validación</span></CardTitle>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-xl bg-slate-800 border-none text-white font-bold" />
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
                    
                    {loading ? <div className="text-center p-20"><Loader2 className="animate-spin h-10 w-10 mx-auto text-primary" /></div> : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-800/20"><TableRow className="border-white/5"><TableHead className="px-8 py-6 text-[10px] font-black uppercase text-slate-400">Beneficiarios</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400">Fecha</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400">Monto</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400">Ref.</TableHead><TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-400">Acción</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {filteredPayments.length === 0 ? (<TableRow><TableCell colSpan={5} className="h-40 text-center text-slate-500 font-bold italic uppercase text-[10px]">Sin reportes</TableCell></TableRow>) : 
                                    filteredPayments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-white/5 border-white/5 transition-colors">
                                            <TableCell className="px-8 py-6"><div className="font-black text-white text-xs uppercase italic">{p.beneficiaries.map(b => b.ownerName).join(', ')}</div><div className="text-[9px] font-black text-primary uppercase mt-1">{p.paymentMethod} • {p.bank}</div></TableCell>
                                            <TableCell className="text-slate-400 font-bold text-xs">{format(p.paymentDate.toDate(), 'dd/MM/yy')}</TableCell>
                                            <TableCell className="font-black text-white text-lg italic">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                            <TableCell className="font-mono text-[10px] text-slate-500">{p.reference}</TableCell>
                                            <TableCell className="text-right pr-8">
                                                <div className="flex justify-end items-center gap-2">
                                                    {p.status === 'aprobado' && p.beneficiaries.length === 1 && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleExportPDF(p, p.beneficiaries[0].ownerId);
                                                            }} 
                                                            className="text-emerald-500 hover:bg-emerald-500/10 rounded-full h-10 w-10"
                                                            title="Descargar Recibo Instantáneo"
                                                        >
                                                            <Download className="h-5 w-5" />
                                                        </Button>
                                                    )}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-slate-500 hover:text-white"><MoreHorizontal className="h-5 w-5"/></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="rounded-xl border-white/10 shadow-2xl bg-slate-900 text-white italic">
                                                            <DropdownMenuItem onClick={() => setSelectedPayment(p)} className="font-black uppercase text-[10px] p-3 gap-2"><Eye className="h-4 w-4 text-primary" /> Ver Detalles</DropdownMenuItem>
                                                            
                                                            {p.status === 'aprobado' && (
                                                                <>
                                                                    <DropdownMenuSeparator className="bg-white/5"/>
                                                                    <DropdownMenuSub>
                                                                        <DropdownMenuSubTrigger className="font-black uppercase text-[10px] p-3 gap-2"><FileDown className="h-4 w-4 text-sky-400" /> Descargar PDF</DropdownMenuSubTrigger>
                                                                        <DropdownMenuPortal><DropdownMenuSubContent className="bg-slate-900 text-white border-white/10 italic">
                                                                            {p.beneficiaries.map(ben => (<DropdownMenuItem key={ben.ownerId} onClick={() => handleExportPDF(p, ben.ownerId)} className="font-black uppercase text-[9px] p-2">{ben.ownerName}</DropdownMenuItem>))}
                                                                        </DropdownMenuSubContent></DropdownMenuPortal>
                                                                    </DropdownMenuSub>
                                                                    <DropdownMenuSub>
                                                                        <DropdownMenuSubTrigger className="font-black uppercase text-[10px] p-3 gap-2"><Share2 className="h-4 w-4 text-emerald-400" /> Compartir</DropdownMenuSubTrigger>
                                                                        <DropdownMenuPortal><DropdownMenuSubContent className="bg-slate-900 text-white border-white/10 italic">
                                                                            {p.beneficiaries.map(ben => (<DropdownMenuItem key={ben.ownerId} onClick={() => handleSharePDF(p, ben.ownerId)} className="font-black uppercase text-[9px] p-2">{ben.ownerName}</DropdownMenuItem>))}
                                                                        </DropdownMenuSubContent></DropdownMenuPortal>
                                                                    </DropdownMenuSub>
                                                                    <DropdownMenuSeparator className="bg-white/5"/>
                                                                    <DropdownMenuItem onClick={() => setPaymentToDelete(p)} className="text-red-500 font-black uppercase text-[10px] p-3 gap-2"><Trash2 className="h-4 w-4"/> Revertir y Eliminar</DropdownMenuItem>
                                                                </>
                                                            )}

                                                            {p.status === 'pendiente' && (
                                                                <>
                                                                    <DropdownMenuSeparator className="bg-white/5"/>
                                                                    <DropdownMenuItem onClick={() => handleApprove(p)} className="text-emerald-500 font-black uppercase text-[10px] p-3 gap-2"><CheckCircle className="h-4 w-4" /> Aprobar y Liquidar</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => { setSelectedPayment(p); setRejectionReason(''); }} className="text-red-500 font-black uppercase text-[10px] p-3 gap-2"><XCircle className="h-4 w-4" /> Rechazar Pago</DropdownMenuItem>
                                                                </>
                                                            )}

                                                            {p.status === 'rechazado' && (
                                                                <>
                                                                    <DropdownMenuSeparator className="bg-white/5"/>
                                                                    <DropdownMenuItem onClick={() => setPaymentToDelete(p)} className="text-red-500 font-black uppercase text-[10px] p-3 gap-2"><Trash2 className="h-4 w-4"/> Eliminar Definitivamente</DropdownMenuItem>
                                                                </>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
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
                <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat max-h-[90vh] overflow-y-auto italic">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Detalle del <span className="text-primary">Reporte</span></DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                        <div className="space-y-6">
                            <div className="bg-slate-800 p-6 rounded-3xl border border-white/5">
                                <p className="text-[10px] font-black uppercase text-slate-500 mb-4 tracking-widest">Distribución de Ingreso</p>
                                {selectedPayment?.beneficiaries.map((b, i) => (
                                    <div key={i} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
                                        <div className="flex flex-col"><span className="font-black text-white text-xs uppercase italic">{b.ownerName}</span><span className="text-[9px] font-bold text-slate-500 uppercase">{b.street} {b.house}</span></div>
                                        <span className="font-black text-primary">Bs. {formatCurrency(b.amount)}</span>
                                    </div>
                                ))}
                                <div className="mt-6 pt-6 border-t border-white/10 flex justify-between items-center"><span className="text-[10px] font-black uppercase text-white">Total Reportado:</span><span className="text-2xl font-black italic">Bs. {formatCurrency(selectedPayment?.totalAmount || 0)}</span></div>
                            </div>

                            {selectedPayment?.status === 'aprobado' && selectedPayment?.liquidatedConcepts && (
                                <div className="bg-slate-800 p-6 rounded-3xl border border-white/5 animate-in slide-in-from-top-4 duration-500">
                                    <div className="flex justify-between items-center mb-4">
                                        <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Conceptos Computados</p>
                                        {selectedPayment.beneficiaries.length === 1 && (
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => handleExportPDF(selectedPayment, selectedPayment.beneficiaries[0].ownerId)}
                                                className="h-8 rounded-xl font-black uppercase text-[9px] border-emerald-500/20 text-emerald-500"
                                            >
                                                <Download className="h-3 w-3 mr-1" /> Recibo PDF
                                            </Button>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        {selectedPayment.liquidatedConcepts.map((concept, idx) => (
                                            <div key={idx} className="flex justify-between items-start gap-4 text-[10px]">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-white uppercase italic">{concept.period}</span>
                                                    <span className="font-bold text-slate-500 uppercase">{concept.description}</span>
                                                </div>
                                                <span className="font-black text-emerald-400 italic">${concept.amountUSD.toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedPayment?.status === 'pendiente' && (
                                <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Motivo Rechazo</Label><Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="rounded-2xl bg-slate-800 border-none text-white font-bold" /></div>
                            )}
                        </div>
                        <div className="relative aspect-[3/4] bg-slate-800 rounded-3xl overflow-hidden border border-white/5">
                            {selectedPayment?.receiptUrl ? (<Image src={selectedPayment.receiptUrl} alt="Comprobante" fill className="object-contain p-2" />) : (<div className="flex h-full items-center justify-center text-slate-600 font-black uppercase italic text-xs">Sin imagen adjunta</div>)}
                        </div>
                    </div>
                    {selectedPayment?.status === 'pendiente' && (
                        <DialogFooter className="gap-3 mt-4"><Button variant="ghost" onClick={() => handleReject(selectedPayment!)} className="text-red-500 font-black uppercase text-[10px]">Rechazar</Button><Button onClick={() => handleApprove(selectedPayment!)} disabled={isVerifying} className="bg-primary text-slate-900 font-black uppercase text-[10px] h-12 rounded-xl flex-1 italic">Validar y Liquidar</Button></DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase italic text-red-500">¿Confirmar Eliminación?</DialogTitle></DialogHeader>
                    <p className="text-slate-400 font-bold text-sm uppercase">Se borrará permanentemente el registro. Si estaba aprobado, los saldos serán revertidos automáticamente.</p>
                    <DialogFooter className="gap-2 mt-8"><Button variant="ghost" onClick={() => setPaymentToDelete(null)} className="rounded-xl font-black uppercase text-[10px] h-12">Cancelar</Button><Button onClick={handleDeletePayment} className="bg-red-600 rounded-xl font-black uppercase text-[10px] h-12 italic">Confirmar Borrado</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

const getFilteredOwners = (searchTerm: string, allOwners: Owner[]) => {
    if (!searchTerm || searchTerm.length < 2) return [];
    return allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase()));
};

function ReportPaymentComponent() {
    const { toast } = useToast();
    const params = useParams();
    const condoId = (params?.condoId as string) || "";
    const { user: authUser, ownerData: authOwnerData } = useAuth();
    
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('movil');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [amountUSD, setAmountUSD] = useState<string>('');
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);

    const isCashPayment = paymentMethod === 'efectivo_bs';

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
        return () => unsubscribe();
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
             try {
                const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    if (paymentDate) {
                        setExchangeRate(null);
                        setExchangeRateMessage('Buscando tasa...');
                        const allRates = (settings.exchangeRates || []) as any[];
                        const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                        const applicableRates = allRates.filter(r => r.date <= paymentDateString).sort((a, b) => b.date.localeCompare(a.date));
                        if (applicableRates.length > 0) {
                             setExchangeRate(applicableRates[0].rate);
                             setExchangeRateMessage('');
                        } else {
                            setExchangeRateMessage('No hay tasa para esta fecha.');
                        }
                    } else {
                        setExchangeRate(null);
                        setExchangeRateMessage('');
                    }
                } else {
                     setExchangeRateMessage('No hay configuraciones.');
                }
            } catch (e) {
                 setExchangeRateMessage('Error al buscar tasa.');
                 console.error(e);
            }
        }
        fetchRate();
    }, [paymentDate, condoId]);
    
    useEffect(() => {
        if (isCashPayment) {
            setBank('Efectivo');
            setReference('EFECTIVO');
        } else {
            if (bank === 'Efectivo') setBank('');
            if (reference === 'EFECTIVO') setReference('');
        }
    }, [isCashPayment]);


    useEffect(() => {
        const bs = parseFloat(totalAmount);
        if (!isNaN(bs) && exchangeRate && exchangeRate > 0) {
            setAmountUSD((bs / exchangeRate).toFixed(2));
        } else {
            setAmountUSD('');
        }
    }, [totalAmount, exchangeRate]);

    const resetForm = () => {
        setPaymentDate(new Date());
        setPaymentMethod('movil');
        setBank('');
        setOtherBank('');
        setReference('');
        setTotalAmount('');
        setReceiptImage(null);
        setAmountUSD('');
        if (authOwnerData && authUser) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: { id: authUser.uid, name: authOwnerData.name, properties: authOwnerData.properties },
                searchTerm: '',
                amount: '',
                selectedProperty: authOwnerData.properties?.[0] || null
            }]);
        }
    }

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const compressedBase64 = await compressImage(file, 800, 800);
            setReceiptImage(compressedBase64);
            toast({ title: 'Comprobante cargado', description: 'La imagen se ha optimizado y está lista para ser enviada.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error de imagen', description: 'No se pudo procesar la imagen.' });
        } finally {
            setLoading(false);
        }
    };
    
    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balance = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);

    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });
    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => {
        if (beneficiaryRows.length > 1) {
            setBeneficiaryRows(rows => rows.filter(row => row.id !== id));
        } else {
             toast({ variant: "destructive", title: "Acción no permitida", description: "Debe haber al menos un beneficiario." });
        }
    };

    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        if (!paymentDate || !exchangeRate || !paymentMethod || !totalAmount || Number(totalAmount) <= 0) {
            return { isValid: false, error: 'Por favor, complete los campos de fecha, tasa, método y monto.' };
        }
        if (!isCashPayment && (!bank || reference.length < 4)) {
            return { isValid: false, error: 'Complete el banco y la referencia (mín. 4 dígitos) para pagos bancarios.' };
        }
        if (!receiptImage) {
            return { isValid: false, error: 'Debe adjuntar una imagen del comprobante de pago.' };
        }
        if (beneficiaryRows.some(row => !row.owner || !row.amount || Number(row.amount) <= 0 || !row.selectedProperty)) {
            return { isValid: false, error: 'Complete la información para cada beneficiario (propietario, propiedad y monto).' };
        }
        if (Math.abs(balance) > 0.01) {
            return { isValid: false, error: 'El monto total no coincide con la suma de los montos asignados a los beneficiarios.' };
        }
        if (!condoId) return { isValid: false, error: "No se encontró un condominio activo." };
        
        if (!isCashPayment) {
            try {
                const q = query(collection(db, "condominios", condoId, "payments"), where("reference", "==", reference), where("totalAmount", "==", Number(totalAmount)), where("paymentDate", "==", Timestamp.fromDate(paymentDate)));
                if (!(await getDocs(q)).empty) {
                    return { isValid: false, error: 'Ya existe un reporte de pago con esta misma referencia, monto y fecha.' };
                }
            } catch (dbError) {
                 return { isValid: false, error: "No se pudo verificar si el pago ya existe. Intente de nuevo." };
            }
        }
        return { isValid: true };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const validation = await validateForm();
        if (!validation.isValid) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: validation.error, duration: 6000 });
            setIsSubmitting(false);
            return;
        }

        if (!authUser || !authOwnerData || !condoId) {
            toast({ variant: 'destructive', title: 'Error de Autenticación'});
            setIsSubmitting(false);
            return;
        }

        try {
            const beneficiaries = beneficiaryRows.map(row => ({
                ownerId: row.owner!.id,
                ownerName: row.owner!.name,
                ...(row.selectedProperty && { street: row.selectedProperty.street, house: row.selectedProperty.house }),
                amount: Number(row.amount)
            }));

            const paymentData: any = {
                paymentDate: Timestamp.fromDate(paymentDate!),
                exchangeRate: exchangeRate,
                paymentMethod: paymentMethod,
                bank: isCashPayment ? 'Efectivo' : (bank === 'Otro' ? otherBank : bank),
                reference: isCashPayment ? 'EFECTIVO' : reference,
                totalAmount: Number(totalAmount),
                beneficiaries: beneficiaries,
                beneficiaryIds: Array.from(new Set(beneficiaries.map(b => b.ownerId))),
                status: 'pendiente',
                reportedAt: serverTimestamp(),
                reportedBy: authUser.uid,
                receiptUrl: receiptImage,
            };
            
            const paymentRef = await addDoc(collection(db, "condominios", condoId, "payments"), paymentData);
            
            const q = query(collection(db, 'condominios', condoId, ownersCollectionName), where('role', '==', 'administrador'));
            const adminSnapshot = await getDocs(q);

            const batch = writeBatch(db);
            adminSnapshot.forEach(adminDoc => {
                const notificationsRef = doc(collection(db, `condominios/${condoId}/${ownersCollectionName}/${adminDoc.id}/notifications`));
                batch.set(notificationsRef, {
                    title: "Nuevo Pago Reportado",
                    body: `${authOwnerData?.name || 'Un propietario'} ha reportado un nuevo pago por Bs. ${totalAmount}.`,
                    createdAt: serverTimestamp(),
                    read: false,
                    href: `/${condoId}/admin/payments?tab=verify`,
                    paymentId: paymentRef.id
                });
            });
            await batch.commit();

            resetForm();
            setIsInfoDialogOpen(true);

        } catch (error) {
            console.error("Error submitting payment: ", error);
            toast({ variant: "destructive", title: "Error Inesperado", description: "No se pudo enviar el reporte. Por favor, intente de nuevo." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Card className="w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl mx-auto">
            <CardHeader className="bg-primary text-primary-foreground p-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                    <Banknote className="w-7 h-7" />
                    <CardTitle className="text-2xl font-bold tracking-wider">REPORTAR PAGO</CardTitle>
                </div>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 grid grid-cols-1 gap-y-10">
                    
                    <div className="space-y-6">
                        <CardTitle className="text-xl">1. Detalles de la Transacción</CardTitle>
                        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6 pt-4">
                            <div className="space-y-2">
                                <Label className="text-primary uppercase text-xs font-bold tracking-wider">Método de Pago</Label>
                                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} disabled={isSubmitting}>
                                    <SelectTrigger className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base focus:ring-primary">
                                        <FileText className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                        <SelectValue placeholder="Seleccione un método..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="transferencia">Transferencia</SelectItem>
                                        <SelectItem value="movil">Pago Móvil</SelectItem>
                                        <SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-primary uppercase text-xs font-bold tracking-wider">Banco Emisor</Label>
                                <Button type="button" variant="outline" className="w-full justify-start text-left font-normal pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base hover:bg-input" onClick={() => setIsBankModalOpen(true)} disabled={isSubmitting || isCashPayment}>
                                    <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    {isCashPayment ? 'No Aplica' : bank || "Seleccione un banco..."}
                                </Button>
                            </div>
                            {bank === 'Otro' && !isCashPayment && (
                                <div className="space-y-2">
                                    <Label className="text-primary uppercase text-xs font-bold tracking-wider">Nombre del Otro Banco</Label>
                                    <div className="relative flex items-center">
                                    <Banknote className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                    <Input value={otherBank} onChange={(e) => setOtherBank(e.target.value)} className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base" placeholder="Especifique el banco" disabled={isSubmitting}/>
                                    </div>
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label className="text-primary uppercase text-xs font-bold tracking-wider">Referencia</Label>
                                <div className="relative flex items-center">
                                    <Hash className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                    <Input value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base" placeholder="Últimos 6 dígitos" disabled={isSubmitting || isCashPayment} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-primary uppercase text-xs font-bold tracking-wider">Fecha del Pago</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base hover:bg-input", !paymentDate && "text-muted-foreground")} disabled={isSubmitting}>
                                            <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                            {paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} /></PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label className="text-primary uppercase text-xs font-bold tracking-wider">Adjuntar Comprobante</Label>
                                <div className="relative flex items-center">
                                    <FileUp className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                    <Input id="receipt" type="file" onChange={handleImageUpload} className="pl-12 pr-4 py-4 bg-input border-border rounded-2xl text-base file:text-muted-foreground file:text-sm" disabled={isSubmitting} />
                                </div>
                                {receiptImage && <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/>Comprobante cargado.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                         <CardTitle className="text-xl">2. Monto y Beneficiarios</CardTitle>
                        <div className="space-y-6 pt-4">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-primary uppercase text-xs font-bold tracking-wider">Monto Total del Pago (Bs.)</Label>
                                    <Input id="totalAmount" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" disabled={loading} className="py-6 bg-input/80 rounded-2xl"/>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-primary uppercase text-xs font-bold tracking-wider">Monto Equivalente (USD)</Label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input type="text" value={amountUSD} readOnly className="pl-9 bg-muted/50 py-6 rounded-2xl" placeholder="0.00" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4"><Label className="font-semibold">Asignación de Montos</Label>
                                {beneficiaryRows.map((row, index) => (
                                    <Card key={row.id} className="p-4 bg-muted/50 relative">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2"><Label htmlFor={`search-${row.id}`}>Beneficiario {index + 1}</Label>
                                                {!row.owner ? (<><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id={`search-${row.id}`} placeholder="Buscar por nombre..." className="pl-9" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} disabled={loading} /></div>{row.searchTerm.length >= 2 && getFilteredOwners(row.searchTerm, allOwners).length > 0 && <Card className="border rounded-md"><ScrollArea className="h-32">{getFilteredOwners(row.searchTerm, allOwners).map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(row.id, owner)} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium text-sm">{owner.name}</p></div>))}</ScrollArea></Card>}</>)
                                                : (
                                                    <div className="p-3 bg-background rounded-md space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <p className="font-semibold text-primary">{row.owner.name}</p>
                                                            <Button variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading || beneficiaryRows.length === 1}><XCircle className="h-5 w-5 text-destructive" /></Button>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-500">Asignar a Propiedad</Label>
                                                            <Select 
                                                                onValueChange={(v) => {
                                                                    const found = row.owner?.properties.find(p => `${p.street}-${p.house}` === v);
                                                                    updateBeneficiaryRow(row.id, { selectedProperty: found || null });
                                                                }} 
                                                                value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}
                                                            >
                                                                <SelectTrigger className="rounded-xl h-10 bg-slate-50 border-slate-200 text-slate-900">
                                                                    <SelectValue placeholder="Seleccione propiedad..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {row.owner.properties.map((p, pIdx) => (
                                                                        <SelectItem key={`${p.street}-${p.house}-${pIdx}`} value={`${p.street}-${p.house}`}>
                                                                            {p.street} - {p.house}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-2"><Label htmlFor={`amount-${row.id}`}>Monto Asignado (Bs.)</Label><Input id={`amount-${row.id}`} type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={loading || !row.owner} /></div>
                                        </div>
                                        {beneficiaryRows.length > 1 && <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading}><Trash2 className="h-4 w-4"/></Button>}
                                    </Card>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} disabled={loading}><UserPlus className="mr-2 h-4 w-4"/>Añadir Otro Beneficiario</Button>
                                <CardFooter className="p-4 bg-background/50 rounded-lg space-y-2 mt-4 flex-col items-stretch">
                                    <div className="flex justify-between text-sm font-medium"><span>Monto Total del Pago:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                    <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div><hr className="my-1 border-border"/><div className={cn("flex justify-between text-base font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                                </CardFooter>
                            </div>
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="bg-background/10 p-6 flex justify-end gap-4">
                    <Button type="button" variant="ghost" className="text-muted-foreground hover:text-white" onClick={resetForm} disabled={isSubmitting}>
                        CANCELAR
                    </Button>
                    <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-6 text-base font-bold rounded-xl" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                        Enviar Reporte
                    </Button>
                </CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(value) => { setBank(value); if (value !== 'Otro') setOtherBank(''); setIsBankModalOpen(false); }} />
            <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-6 w-6 text-primary" />
                            Reporte Enviado para Revisión
                        </DialogTitle>
                         <div className="pt-4 text-sm text-muted-foreground space-y-4">
                            <p>¡Gracias! Hemos recibido tu reporte de pago. El tiempo máximo para la aprobación es de <strong>24 horas</strong>.</p>
                            <p>Te invitamos a ingresar nuevamente después de este lapso para:</p>
                            <ul className="list-disc list-inside space-y-1">
                               <li>Verificar si el monto enviado cubrió completamente tu deuda.</li>
                               <li>Descargar tu recibo de pago una vez que sea aprobado.</li>
                            </ul>
                        </div>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setIsInfoDialogOpen(false)}>Entendido</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}


function PaymentsPage() {
    const params = useParams();
    const condoId = (params?.condoId as string) || "";
    return (
        <div className="space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Reportar <span className="text-primary">Pago</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Completa el formulario para notificar tu pago a la administración de {condoId}.
                </p>
            </div>
            <ReportPaymentComponent />
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

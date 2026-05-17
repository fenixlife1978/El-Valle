
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
import { 
    Search, CheckCircle, XCircle, Eye, MoreHorizontal, 
    Download, Loader2, Calendar as CalendarIcon,
    UserPlus, WalletCards, Trash2, FileText, Save, Share2, FileDown,
    Calculator, Receipt, Check, DollarSign, Plus
} from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
    collection, onSnapshot, query, addDoc, serverTimestamp, 
    doc, getDoc, where, getDocs, Timestamp, runTransaction, 
    updateDoc, increment, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useAuthorization } from '@/hooks/use-authorization';
import { 
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
    DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub,
    DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal
} from '@/components/ui/dropdown-menu';
import { generatePaymentReceipt, generateCashReceipt } from '@/lib/pdf-generator';
import { downloadPDF } from '@/lib/print-pdf';
import Decimal from 'decimal.js';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { uploadToImgbb } from '@/lib/imgbb';

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const BDV_ACCOUNT_ID = "Hlc0ky0QdnaXIsuf19Od";

type Owner = { id: string; name: string; properties: { street: string, house: string }[]; balance?: number; role?: string; email?: string; };
type DistributionLine = { id: string; category: 'ordinaria' | 'extraordinaria'; amount: number; extraordinaryDebtId?: string; isOwn?: boolean; };
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; selectedProperty: { street: string, house: string } | null; distributionLines: DistributionLine[]; };
type PaymentMethod = 'movil' | 'transferencia' | 'efectivo_bs' | 'efectivo_usd' | '';
type LiquidatedConcept = { ownerId: string; description: string; amountUSD: number; period: string; type: 'deuda' | 'adelanto' | 'abono' | 'extraordinaria' | 'abono_extraordinaria'; };
type Payment = { 
    id: string; 
    beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; category?: string; extraordinaryDebtId?: string; isOwn?: boolean; }[]; 
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
    previousBalances?: { [ownerId: string]: number };
};

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
    const [cuentasDolares, setCuentasDolares] = useState<any[]>([]);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;
        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        return onSnapshot(settingsRef, (snap) => {
            if (snap.exists()) {
                setLocalCompanyInfo(snap.data().companyInfo);
            }
        });
    }, [condoId]);

    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;
        const q = query(collection(db, 'condominios', condoId, 'payments'), orderBy('reportedAt', 'desc'));
        return onSnapshot(q, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
            setLoading(false);
        });
    }, [condoId]);

    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;
        const q = query(collection(db, 'condominios', condoId, 'cuentas'), where('tipo', '==', 'dolares'));
        return onSnapshot(q, (snap) => setCuentasDolares(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
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
                const isDolares = method.includes('usd') || method.includes('dolares');
                const isDigital = method.includes('movil') || method.includes('transferencia') || method.includes('pagomovil');
                
                // Determinar cuenta de destino
                let targetAccountId = "";
                let targetAccountName = "";
                
                if (isDolares && cuentasDolares.length > 0) {
                    targetAccountId = cuentasDolares[0].id;
                    targetAccountName = cuentasDolares[0].nombre;
                } else if (isDigital) {
                    targetAccountId = BDV_ACCOUNT_ID;
                    targetAccountName = "BANCO DE VENEZUELA";
                } else {
                    const cuentasBS = await getDocs(query(collection(db, 'condominios', condoId, 'cuentas'), where('tipo', '==', 'efectivo')));
                    const cajaPrincipal = cuentasBS.docs.find(d => d.data().nombre?.toUpperCase().includes('CAJA PRINCIPAL'));
                    targetAccountId = cajaPrincipal?.id || "";
                    targetAccountName = cajaPrincipal?.data().nombre || "CAJA PRINCIPAL";
                }

                if (!targetAccountId) throw new Error("No se identificó una cuenta de tesorería válida.");

                const monthId = format(payment.paymentDate.toDate(), 'yyyy-MM');
                const settingsSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
                const currentFee = settingsSnap.exists() ? (settingsSnap.data().condoFee || 25) : 25;

                // PRE-CARGA DE DATOS (READS)
                const extraordinaryPreparedData: any[] = [];
                const ordinaryPreparedData: any[] = [];
                
                for (const beneficiary of payment.beneficiaries) {
                    if (beneficiary.category === 'extraordinaria' && beneficiary.extraordinaryDebtId) {
                        const debtRef = doc(db, 'condominios', condoId, 'owner_extraordinary_debts', beneficiary.extraordinaryDebtId);
                        const debtSnap = await getDoc(debtRef);
                        if (debtSnap.exists()) {
                            extraordinaryPreparedData.push({ beneficiary, debtRef, debtData: debtSnap.data() });
                        }
                    } else {
                        const debtsSnap = await getDocs(query(
                            collection(db, 'condominios', condoId, 'debts'),
                            where('ownerId', '==', beneficiary.ownerId),
                            where('status', 'in', ['pending', 'vencida'])
                        ));
                        const allDebtsSnap = await getDocs(query(
                            collection(db, 'condominios', condoId, 'debts'),
                            where('ownerId', '==', beneficiary.ownerId)
                        ));
                        ordinaryPreparedData.push({
                            beneficiary,
                            pendingDebts: debtsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any)).sort((a, b) => a.year - b.year || a.month - b.month),
                            allDebtsSorted: allDebtsSnap.docs.map(d => d.data()).sort((a, b) => a.year - b.year || a.month - b.month)
                        });
                    }
                }

                // TRANSACCIÓN (WRITES)
                await runTransaction(db, async (transaction) => {
                    const ownerRefs = payment.beneficiaryIds.map(id => doc(db, 'condominios', condoId, ownersCollectionName, id));
                    const ownerSnaps = await Promise.all(ownerRefs.map(ref => transaction.get(ref)));
                    
                    const receiptNumbers: { [ownerId: string]: string } = {};
                    const liquidatedConcepts: LiquidatedConcept[] = [];
                    const previousBalances: { [ownerId: string]: number } = {};

                    for (const beneficiary of payment.beneficiaries) {
                        const ownerIdx = payment.beneficiaryIds.indexOf(beneficiary.ownerId);
                        const ownerSnap = ownerSnaps[ownerIdx];
                        const ownerRef = ownerRefs[ownerIdx];

                        if (!ownerSnap.exists()) continue;

                        // GUARDAR SALDO ANTERIOR CRUCIAL PARA EL RECIBO
                        const saldoAnterior = ownerSnap.data().balance || 0;
                        previousBalances[beneficiary.ownerId] = saldoAnterior;

                        // Lógica Cuota Extraordinaria
                        const extraData = extraordinaryPreparedData.find(d => d.beneficiary.ownerId === beneficiary.ownerId && d.beneficiary.extraordinaryDebtId === beneficiary.extraordinaryDebtId);
                        if (extraData) {
                            const { debtRef, debtData } = extraData;
                            const paidUSD = isDolares ? beneficiary.amount : beneficiary.amount / payment.exchangeRate;
                            const totalAmountUSD = debtData.amountUSD;
                            const previouslyPaidUSD = debtData.amountPaidUSD || 0;
                            const totalPaidAfterThis = previouslyPaidUSD + paidUSD;
                            const newPendingUSD = Math.max(0, totalAmountUSD - totalPaidAfterThis);
                            const isLiquidation = newPendingUSD <= 0.01;
                            const newStatus = isLiquidation ? 'paid' : 'partial';

                            transaction.update(debtRef, {
                                status: newStatus,
                                pendingUSD: newPendingUSD,
                                paidAt: isLiquidation ? payment.paymentDate : null,
                                amountPaidBs: (debtData.amountPaidBs || 0) + beneficiary.amount,
                                amountPaidUSD: totalPaidAfterThis,
                                updatedAt: serverTimestamp()
                            });

                            const extraFundRef = doc(collection(db, 'condominios', condoId, 'extraordinary_funds'));
                            transaction.set(extraFundRef, {
                                tipo: 'ingreso',
                                monto: isDolares ? 0 : beneficiary.amount,
                                montoUSD: paidUSD,
                                exchangeRate: payment.exchangeRate,
                                descripcion: isLiquidation ? `PAGO CUOTA EXTRA: ${debtData.description} [TOTAL]` : `ABONO EXTRAORDINARIO: ${debtData.description}`,
                                fecha: payment.paymentDate,
                                categoria: 'extraordinaria',
                                ownerId: beneficiary.ownerId,
                                campaignId: debtData.debtId,
                                campaignName: debtData.description,
                                createdAt: serverTimestamp()
                            });

                            liquidatedConcepts.push({
                                ownerId: beneficiary.ownerId,
                                description: `CUOTA EXTRAORDINARIA: ${debtData.description}`,
                                amountUSD: paidUSD,
                                period: format(payment.paymentDate.toDate(), 'MMMM yyyy', { locale: es }).toUpperCase(),
                                type: isLiquidation ? 'extraordinaria' : 'abono_extraordinaria'
                            });
                            receiptNumbers[beneficiary.ownerId] = `REC-EXT-${Date.now().toString().slice(-6)}`;
                        } else {
                            // Lógica Cuota Ordinaria (Fondo Total = Pago + Saldo Anterior)
                            const ordData = ordinaryPreparedData.find(d => d.beneficiary.ownerId === beneficiary.ownerId);
                            if (ordData) {
                                let funds = new Decimal(beneficiary.amount).plus(new Decimal(saldoAnterior));
                                
                                for (const debt of ordData.pendingDebts) {
                                    const debtAmountBs = new Decimal(debt.amountUSD).times(new Decimal(payment.exchangeRate));
                                    if (funds.gte(debtAmountBs)) {
                                        funds = funds.minus(debtAmountBs);
                                        transaction.update(debt.ref, { status: 'paid', paidAmountUSD: debt.amountUSD, paymentDate: payment.paymentDate, paymentId: payment.id });
                                        liquidatedConcepts.push({
                                            ownerId: beneficiary.ownerId,
                                            description: debt.description,
                                            amountUSD: debt.amountUSD,
                                            period: `${monthsLocale[debt.month]} ${debt.year}`,
                                            type: 'deuda'
                                        });
                                    } else break;
                                }

                                const advanceBs = new Decimal(currentFee).times(payment.exchangeRate);
                                while (funds.gte(advanceBs)) {
                                    const nextDate = addMonths(new Date(), 1); // Simplificado para el ejemplo
                                    const newDebtRef = doc(collection(db, 'condominios', condoId, 'debts'));
                                    transaction.set(newDebtRef, {
                                        ownerId: beneficiary.ownerId,
                                        property: { street: beneficiary.street || '', house: beneficiary.house || '' },
                                        year: nextDate.getFullYear(), month: nextDate.getMonth() + 1,
                                        amountUSD: currentFee, description: 'Cuota Adelantada',
                                        status: 'paid', paidAmountUSD: currentFee, paymentDate: payment.paymentDate, published: true
                                    });
                                    liquidatedConcepts.push({
                                        ownerId: beneficiary.ownerId,
                                        description: 'CUOTA ADELANTADA',
                                        amountUSD: currentFee,
                                        period: `${monthsLocale[nextDate.getMonth() + 1]} ${nextDate.getFullYear()}`,
                                        type: 'adelanto'
                                    });
                                    funds = funds.minus(advanceBs);
                                }
                                
                                transaction.update(ownerRef, { balance: funds.toDecimalPlaces(2).toNumber() });
                                receiptNumbers[beneficiary.ownerId] = `REC-${Date.now().toString().slice(-6)}`;
                            }
                        }
                    }

                    transaction.update(doc(db, 'condominios', condoId, 'cuentas', targetAccountId), { saldoActual: increment(payment.totalAmount) });
                    transaction.set(doc(db, 'condominios', condoId, 'financial_stats', monthId), { totalIngresosMes: increment(payment.totalAmount), updatedAt: serverTimestamp() }, { merge: true });
                    transaction.update(doc(db, 'condominios', condoId, 'payments', payment.id), { 
                        status: 'aprobado', 
                        receiptNumbers, 
                        liquidatedConcepts, 
                        previousBalances,
                        observations: 'LIQUIDACIÓN CRONOLÓGICA COMPLETADA.' 
                    });
                });

                toast({ title: "Pago Aprobado" });
                setSelectedPayment(null);
            } catch (error: any) { 
                console.error(error);
                toast({ variant: 'destructive', title: "Error", description: error.message }); 
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
                    rejectedAt: serverTimestamp()
                });
                toast({ title: "Pago Rechazado" });
                setSelectedPayment(null);
            } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
        });
    };

    const handleExportPDF = async (payment: Payment, ownerId: string) => {
        try {
            if (!localCompanyInfo) return;
            const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
            if (!beneficiary) return;

            const saldoAnterior = payment.previousBalances?.[ownerId] || 0;
            const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCollectionName, ownerId));
            const balanceActual = ownerSnap.exists() ? ownerSnap.data().balance : 0;

            const liquidated = (payment.liquidatedConcepts || []).filter(c => c.ownerId === ownerId);
            const totalAbonadoUSD = liquidated.reduce((s, c) => s + c.amountUSD, 0);
            const totalAbonadoBs = totalAbonadoUSD * payment.exchangeRate;

            const receiptData = {
                condoName: localCompanyInfo.name,
                rif: localCompanyInfo.rif,
                receiptNumber: payment.receiptNumbers?.[ownerId] || 'S/N',
                ownerName: beneficiary.ownerName,
                property: `${beneficiary.street || ''} ${beneficiary.house || ''}`,
                method: payment.paymentMethod,
                bank: payment.bank,
                reference: payment.reference,
                date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                receivedAmount: formatCurrency(beneficiary.amount),
                totalDebtPaid: formatCurrency(totalAbonadoBs),
                prevBalance: formatCurrency(saldoAnterior),
                currentBalance: formatCurrency(balanceActual),
                observations: payment.observations,
                concepts: liquidated.map(c => [c.period, c.description.toUpperCase(), `$${c.amountUSD.toFixed(2)}`, formatCurrency(c.amountUSD * payment.exchangeRate)])
            };

            await generatePaymentReceipt(receiptData, localCompanyInfo.logo, 'download');
        } catch (error) { toast({ variant: 'destructive', title: 'Error PDF' }); }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat italic">
            <CardHeader className="p-8 border-b border-white/5">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-white font-black uppercase text-2xl">Validación de <span className="text-primary">Ingresos</span></CardTitle>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-slate-800 border-none text-white font-bold" />
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
                            <TableHeader className="bg-slate-800/20"><TableRow className="border-white/5">
                                <TableHead className="px-8 py-6 text-[10px] font-black uppercase text-slate-400">Beneficiarios</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-slate-400">Fecha</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-slate-400">Monto</TableHead>
                                <TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-400">Acción</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {filteredPayments.length === 0 ? (<TableRow><TableCell colSpan={4} className="h-40 text-center text-slate-500 font-bold italic uppercase text-[10px]">Sin reportes</TableCell></TableRow>) : 
                                filteredPayments.map(p => (
                                    <TableRow key={p.id} className="hover:bg-white/5 border-white/5 transition-colors">
                                        <TableCell className="px-8 py-6">
                                            <div className="font-black text-white text-xs uppercase">{p.beneficiaries.map(b => b.ownerName).join(", ")}</div>
                                            <div className="text-[9px] font-black text-primary uppercase">{p.paymentMethod} • {p.bank}</div>
                                        </TableCell>
                                        <TableCell className="text-slate-400 font-bold text-xs">{format(p.paymentDate.toDate(), 'dd/MM/yy')}</TableCell>
                                        <TableCell className="font-black text-white text-lg">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                        <TableCell className="text-right pr-8">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-5 w-5 text-slate-500"/></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="bg-slate-950 border-white/10 italic">
                                                    <DropdownMenuItem onClick={() => setSelectedPayment(p)} className="font-black uppercase text-[10px] gap-2"><Eye className="h-4 w-4 text-primary" /> Ver Detalles</DropdownMenuItem>
                                                    {p.status === 'aprobado' && (
                                                        <>
                                                            <DropdownMenuSeparator className="bg-white/5" />
                                                            {p.beneficiaryIds.map(id => (
                                                                <DropdownMenuItem key={id} onClick={() => handleExportPDF(p, id)} className="font-black uppercase text-[9px] gap-2"><FileDown className="h-3 w-3 text-emerald-500" /> Recibo {p.beneficiaries.find(b=>b.ownerId===id)?.ownerName.split(' ')[0]}</DropdownMenuItem>
                                                            ))}
                                                        </>
                                                    )}
                                                    {p.status === 'pendiente' && (
                                                        <>
                                                            <DropdownMenuSeparator className="bg-white/5" />
                                                            <DropdownMenuItem onClick={() => handleApprove(p)} className="text-emerald-500 font-black uppercase text-[10px] gap-2"><CheckCircle className="h-4 w-4" /> Aprobar Pago</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => { setSelectedPayment(p); setRejectionReason(''); }} className="text-red-500 font-black uppercase text-[10px] gap-2"><XCircle className="h-4 w-4" /> Rechazar Pago</DropdownMenuItem>
                                                        </>
                                                    )}
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
                <DialogContent className="max-w-2xl bg-slate-900 text-white font-montserrat italic rounded-[2rem]">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic">Detalle del <span className="text-primary">Reporte</span></DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                        <div className="space-y-6">
                            <div className="bg-slate-800 p-6 rounded-3xl border border-white/5">
                                <p className="text-[10px] font-black uppercase text-slate-500 mb-4">Distribución de Ingreso</p>
                                {selectedPayment?.beneficiaries.map((b, i) => (
                                    <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                                        <div className="flex flex-col"><span className="font-black text-white text-xs uppercase">{b.ownerName}</span><span className="text-[9px] font-bold text-slate-500">{b.street} {b.house}</span></div>
                                        <span className="font-black text-primary">Bs. {formatCurrency(b.amount)}</span>
                                    </div>
                                ))}
                                <div className="mt-4 pt-4 border-t border-white/10 flex justify-between font-black text-lg"><span>Total:</span><span>Bs. {formatCurrency(selectedPayment?.totalAmount || 0)}</span></div>
                            </div>
                            {selectedPayment?.status === 'pendiente' && (
                                <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Motivo de Rechazo</Label><Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="bg-slate-800 border-none rounded-xl text-white font-bold" /></div>
                            )}
                        </div>
                        <div className="relative aspect-[3/4] bg-slate-800 rounded-3xl overflow-hidden border border-white/5">
                            {selectedPayment?.receiptUrl ? <Image src={selectedPayment.receiptUrl} alt="Comprobante" fill className="object-contain p-2" /> : <div className="h-full flex items-center justify-center text-slate-600 font-black uppercase italic text-xs">Sin imagen adjunta</div>}
                        </div>
                    </div>
                    {selectedPayment?.status === 'pendiente' && (
                        <DialogFooter className="gap-3 mt-4"><Button variant="ghost" onClick={() => handleReject(selectedPayment!)} className="text-red-500 font-black uppercase text-[10px]">Rechazar</Button><Button onClick={() => handleApprove(selectedPayment!)} disabled={isVerifying} className="bg-primary text-slate-900 font-black uppercase text-[10px] h-12 rounded-xl flex-1 italic">Validar y Liquidar</Button></DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}

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
    const isDolares = paymentMethod === 'efectivo_usd';
    
    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        return onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.filter(o => o.email !== 'vallecondo@gmail.com').sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
    }, [condoId, ownersCollectionName]);

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

    const assignedTotal = beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
    const balance = (Number(totalAmount) || 0) - assignedTotal;

    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    
    const handleOwnerSelect = (rowId: string, owner: Owner) => {
        updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties && owner.properties.length > 0 ? owner.properties[0] : null });
    };

    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => setBeneficiaryRows(rows => rows.filter(row => row.id !== id));

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const imageUrl = await uploadToImgbb(file);
            if (imageUrl) setReceiptImage(imageUrl);
        } catch (error) { console.error(error); }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser || !condoId || !exchangeRate || !totalAmount) return;
        
        const beneficiaries = beneficiaryRows.map(row => ({ 
            ownerId: row.owner!.id, 
            ownerName: row.owner!.name, 
            amount: Number(row.amount),
            street: row.selectedProperty?.street,
            house: row.selectedProperty?.house
        }));

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "condominios", condoId, "payments"), { 
                reportedBy: authUser.uid, beneficiaries, beneficiaryIds: beneficiaries.map(b => b.ownerId),
                totalAmount: Number(totalAmount), exchangeRate, paymentDate: Timestamp.fromDate(paymentDate!),
                paymentMethod, bank: isDolares ? 'Efectivo USD' : bank, reference, 
                receiptUrl: receiptImage || "", status: 'pendiente', reportedAt: serverTimestamp() 
            });
            toast({ title: 'Reporte Enviado' });
            setTotalAmount(''); setReference(''); setReceiptImage(null); setBeneficiaryRows([]);
        } catch (error) { toast({ variant: "destructive", title: "Error" }); }
        finally { setIsSubmitting(false); }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat italic">
            <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-white font-black uppercase text-2xl tracking-tighter">Reporte <span className="text-primary">Manual</span></CardTitle></CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 space-y-10">
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Fecha Pago</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left"><CalendarIcon className="mr-3 h-5 w-5 text-primary" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : "Seleccione"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 bg-slate-900 border-white/10"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} /></PopoverContent></Popover></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Tasa Bs.</Label><Input type="number" value={isDolares ? '1.00' : (exchangeRate || '')} readOnly className="h-14 rounded-2xl bg-slate-800 border-none text-primary font-black italic" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Método</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}><SelectTrigger className="h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs"><SelectValue/></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white"><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem><SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem><SelectItem value="efectivo_usd">💲 Efectivo USD</SelectItem></SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Banco Emisor</Label><Button type="button" variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left" onClick={() => setIsBankModalOpen(true)} disabled={paymentMethod === 'efectivo_bs' || isDolares}>{isDolares ? 'EFECTIVO USD' : (bank || "Seleccionar...")}</Button></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={paymentMethod === 'efectivo_bs' || isDolares} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic" placeholder="N° REF" /></div>
                        <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Monto {isDolares ? 'USD' : 'Bs.'}</Label><Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="h-14 rounded-2xl bg-slate-800 border-none font-black text-2xl italic text-right pr-6" placeholder="0,00" /></div><div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Equiv. {isDolares ? 'Bs.' : 'USD'}</Label><Input value={isDolares ? formatCurrency((parseFloat(totalAmount) || 0) * (exchangeRate || 0)) : ((parseFloat(totalAmount) || 0) / (exchangeRate || 1)).toFixed(2)} readOnly className="h-14 rounded-2xl bg-slate-800 border-none text-emerald-500 font-black text-2xl italic text-right pr-6" /></div></div>
                    </div>
                    <div className="space-y-6"><Label className="text-[10px] font-black uppercase text-primary tracking-widest ml-2">Asignación de Beneficiarios</Label>
                        {beneficiaryRows.map((row) => (
                            <div key={row.id} className="p-6 bg-white/5 border border-white/5 rounded-[2rem] space-y-4">
                                {!row.owner ? (
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                                        <Input placeholder="Buscar Residente..." className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black uppercase text-xs" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} />
                                        {row.searchTerm.length >= 2 && (
                                            <Card className="absolute z-50 w-full mt-2 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                                                <ScrollArea className="h-48">
                                                    {getFilteredOwnersFn(row.searchTerm).map(o => (
                                                        <div key={o.id} onClick={() => handleOwnerSelect(row.id, o)} className="p-4 hover:bg-white/5 cursor-pointer font-black text-sm uppercase text-white border-b border-white/5">{o.name}</div>
                                                    ))}
                                                </ScrollArea>
                                            </Card>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col"><span className="font-black text-primary text-xs uppercase">{row.owner.name}</span>{row.selectedProperty && <span className="text-[9px] font-bold text-slate-500 uppercase">{row.selectedProperty.street} - {row.selectedProperty.house}</span>}</div>
                                        <Input type="number" value={row.amount} onChange={e => updateBeneficiaryRow(row.id, { amount: e.target.value })} className="w-32 h-10 bg-slate-800 border-none text-white font-black text-right" />
                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} className="text-red-500 h-10 w-10"><Trash2/></Button>
                                    </div>
                                )}
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} className="rounded-xl font-black uppercase text-[10px] border-white/10 text-slate-400 hover:bg-white/5"><UserPlus className="mr-2 h-4 w-4 text-primary"/> Añadir Beneficiario</Button>
                    </div>
                </CardContent>
                <CardFooter className="bg-white/5 p-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className={cn("font-black text-2xl italic tracking-tighter uppercase", balance !== 0 ? 'text-red-500' : 'text-emerald-500')}>Diferencia: {formatCurrency(Math.abs(balance))}</div>
                    <Button type="submit" disabled={isSubmitting || Math.abs(balance) > 0.01 || beneficiaryRows.length === 0} className="h-16 px-12 rounded-2xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95">{isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-5 w-5" />} REGISTRAR PAGO Y ASENTAR</Button>
                </CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(v) => { setBank(v); setIsBankModalOpen(false); }} />
        </Card>
    );
}

function CalculatorComponent({ condoId, onReport }: { condoId: string, onReport: (data: any) => void }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [debts, setDebts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);

    const ownersCol = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, ownersCol), where('role', '==', 'propietario'));
        return onSnapshot(q, snap => {
            setAllOwners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Owner)).filter(o => o.email !== 'vallecondo@gmail.com').sort((a,b) => (a.name || '').localeCompare(b.name || '')));
        });
    }, [condoId, ownersCol]);

    useEffect(() => {
        if (!condoId) return;
        getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings')).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                setCondoFee(data.condoFee || 0);
                const active = (data.exchangeRates || []).find((r:any) => r.active);
                setActiveRate(active?.rate || 0);
            }
        });
    }, [condoId]);

    useEffect(() => {
        if (!selectedOwner || !condoId) return;
        setLoading(true);
        const q = query(collection(db, 'condominios', condoId, 'debts'), where('ownerId', '==', selectedOwner.id), where('status', 'in', ['pending', 'vencida']));
        return onSnapshot(q, snap => {
            setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
    }, [selectedOwner, condoId]);

    const futureMonths = useMemo(() => {
        const now = new Date();
        return Array.from({ length: 12 }, (_, i) => {
            const date = addMonths(now, i);
            return {
                value: format(date, 'yyyy-MM'),
                label: format(date, 'MMMM yyyy', { locale: es }).toUpperCase()
            };
        });
    }, []);

    const totals = useMemo(() => {
        const selectedAmountUSD = debts.filter(d => selectedDebts.includes(d.id)).reduce((sum, d) => sum + (d.amountUSD || 0), 0);
        const advanceAmountUSD = selectedAdvanceMonths.length * condoFee;
        const subTotalUSD = selectedAmountUSD + advanceAmountUSD;
        const subTotalBs = subTotalUSD * activeRate;
        const balanceBs = selectedOwner?.balance || 0;
        const totalToPayBs = Math.max(0, subTotalBs - balanceBs);
        return { subTotalBs, balanceBs, totalToPayBs, subTotalUSD };
    }, [debts, selectedDebts, selectedAdvanceMonths, condoFee, activeRate, selectedOwner]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 font-montserrat italic text-white">
            <div className="lg:col-span-2 space-y-6">
                <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[2rem]">
                    <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-xl font-black uppercase italic tracking-tighter">1. Seleccionar Residente</CardTitle></CardHeader>
                    <CardContent className="p-8">
                        {!selectedOwner ? (
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5"/>
                                <Input placeholder="BUSCAR PROPIETARIO..." className="pl-12 h-14 rounded-2xl bg-slate-800 border-none font-black text-xs uppercase" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                                {searchTerm.length >= 2 && (
                                    <Card className="absolute z-50 w-full mt-2 bg-slate-950 border border-white/10 shadow-2xl rounded-2xl overflow-hidden ring-1 ring-primary/20">
                                        <ScrollArea className="h-64">
                                            {allOwners.filter(o => o.name?.toLowerCase().includes(searchTerm.toLowerCase())).map(o => (
                                                <div key={o.id} onClick={() => setSelectedOwner(o)} className="p-5 hover:bg-white/10 cursor-pointer font-black text-sm uppercase border-b border-white/5 transition-colors text-white">
                                                    {o.name}
                                                </div>
                                            ))}
                                        </ScrollArea>
                                    </Card>
                                )}
                            </div>
                        ) : (
                            <div className="flex justify-between items-center p-6 bg-slate-800 rounded-3xl border border-primary/20">
                                <div className="flex items-center gap-4">
                                    <div className="bg-primary/10 p-3 rounded-2xl text-primary"><UserPlus /></div>
                                    <div>
                                        <p className="font-black text-xl uppercase tracking-tighter">{selectedOwner.name}</p>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedOwner.properties?.map(p => `${p.street} ${p.house}`).join(' | ')}</p>
                                    </div>
                                </div>
                                <button onClick={() => { setSelectedOwner(null); setSelectedDebts([]); setSelectedAdvanceMonths([]); }} className="text-red-500 hover:bg-red-500/10 rounded-full h-12 w-12 flex items-center justify-center transition-colors"><XCircle /></button>
                            </div>
                        )}
                    </CardContent>
                </Card>
                {selectedOwner && (
                    <>
                        <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[2rem]">
                            <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-xl font-black uppercase italic tracking-tighter">2. Deudas Pendientes</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                {loading ? <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-primary h-10 w-10"/></div> : (
                                    <Table>
                                        <TableHeader className="bg-slate-800/30">
                                            <TableRow className="border-white/5">
                                                <TableHead className="w-16 px-8 py-6 text-center">PAGAR</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase text-slate-400">PERÍODO</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase text-slate-400">CONCEPTO</TableHead>
                                                <TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-400">MONTO BS.</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {debts.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-slate-500 font-bold uppercase text-[10px]">Sin deudas pendientes</TableCell></TableRow> : 
                                            debts.sort((a,b) => a.year - b.year || a.month - b.month).map(d => (
                                                <TableRow key={d.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                                    <TableCell className="px-8 py-6 text-center">
                                                        <Checkbox className="border-primary data-[state=checked]:bg-primary" checked={selectedDebts.includes(d.id)} onCheckedChange={c => setSelectedDebts(p => c ? [...p, d.id] : p.filter(id => id !== d.id))} />
                                                    </TableCell>
                                                    <TableCell className="font-black text-white text-xs uppercase">{monthsLocale[d.month]} {d.year}</TableCell>
                                                    <TableCell className="text-[10px] font-bold text-slate-500 uppercase">{d.description}</TableCell>
                                                    <TableCell className="text-right pr-8 font-black text-white italic">Bs. {formatCurrency(d.amountUSD * activeRate)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[2rem]">
                            <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-xl font-black uppercase italic tracking-tighter">3. Meses por Adelantado</CardTitle></CardHeader>
                            <CardContent className="p-8">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {futureMonths.map(month => (
                                        <Button key={month.value} variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'} className={cn("h-14 rounded-2xl font-black uppercase text-[10px] tracking-tighter transition-all", selectedAdvanceMonths.includes(month.value) ? "bg-primary text-slate-900" : "border-white/10 text-white hover:bg-white/5")} onClick={() => setSelectedAdvanceMonths(p => p.includes(month.value) ? p.filter(m => m !== month.value) : [...p, month.value])}>{month.label}</Button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
            <div className="lg:sticky lg:top-24">
                <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[3rem] border border-white/5">
                    <CardHeader className="bg-primary text-slate-900 p-8 text-center"><CardTitle className="text-2xl font-black uppercase italic tracking-tighter flex items-center justify-center gap-3"><Calculator /> Liquidación</CardTitle></CardHeader>
                    <CardContent className="p-8 space-y-6">
                        <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-slate-500">TASA BCV</span><Badge variant="outline" className="font-black text-primary border-primary/20">Bs. {formatCurrency(activeRate)}</Badge></div>
                        <Separator className="bg-white/5"/>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-slate-400">Sub-Total Deuda</span><span className="font-black text-white italic">Bs. {formatCurrency(totals.subTotalBs)}</span></div>
                            <div className="flex justify-between items-center text-emerald-500"><span className="text-[10px] font-black uppercase">(-) Saldo a Favor</span><span className="font-black italic">Bs. {formatCurrency(totals.balanceBs)}</span></div>
                        </div>
                        <div className="flex flex-col gap-1 text-center bg-white/5 p-6 rounded-[2rem] border border-white/5 shadow-inner">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">TOTAL A PAGAR</span>
                            <span className="text-4xl font-black text-white italic drop-shadow-2xl">Bs. {formatCurrency(totals.totalToPayBs)}</span>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase mt-1">EQUIV: ${formatToTwoDecimals(totals.totalToPayBs / (activeRate || 1))}</span>
                        </div>
                    </CardContent>
                    <CardFooter className="px-8 pb-8"><Button onClick={() => onReport({ owner: selectedOwner, totalBs: totals.totalToPayBs })} disabled={!selectedOwner || totals.totalToPayBs <= 0} className="w-full h-16 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95">PROCEDER AL REPORTE <Receipt className="ml-2"/></Button></CardFooter>
                </Card>
            </div>
        </div>
    );
}

export default function PaymentsPage() {
    const searchParams = useSearchParams();
    const condoId = useParams()?.condoId as string;
    const router = useRouter();
    const activeTab = searchParams?.get('tab') ?? 'verify';
    
    const handleCalcReport = (data: any) => {
        router.push(`/${condoId}/admin/payments?tab=report`);
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-primary">Pagos</span></h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">Control de Ingresos y Liquidación Cronológica.</p>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => router.push(`/${condoId}/admin/payments?tab=${v}`)}>
                <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 h-16 rounded-2xl p-1 border border-white/5">
                    <TabsTrigger value="verify" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Verificación</TabsTrigger>
                    <TabsTrigger value="report" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Reporte Manual</TabsTrigger>
                    <TabsTrigger value="calculator" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Calculadora</TabsTrigger>
                </TabsList>
                <TabsContent value="verify" className="mt-8"><VerificationComponent condoId={condoId} /></TabsContent>
                <TabsContent value="report" className="mt-8"><ReportPaymentComponent /></TabsContent>
                <TabsContent value="calculator" className="mt-8"><CalculatorComponent condoId={condoId} onReport={handleCalcReport} /></TabsContent>
            </Tabs>
        </div>
    );
}

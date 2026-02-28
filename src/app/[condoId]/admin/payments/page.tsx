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
import { ArrowLeft, Calculator, CalendarIcon, Check, CheckCircle, Clock, DollarSign, Eye, FileText, Hash, Loader2, Upload, Banknote, Info, X, Save, FileUp, UserPlus, Trash2, XCircle, Search, ChevronDown, Minus, Equal, Receipt, AlertTriangle, User, MoreHorizontal, Download, Share2, CheckCircle2 } from 'lucide-react';
import { format, isBefore, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, writeBatch, orderBy, runTransaction, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthorization } from '@/hooks/use-authorization';
import { generatePaymentReceipt } from '@/lib/pdf-generator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { processPaymentLiquidation } from '@/lib/payment-processor';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const MONTHS_LOCALE: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
    balance?: number;
    role?: string;
};
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; amount: string; selectedProperty: { street: string, house: string } | null; };
type PaymentMethod = 'movil' | 'transferencia' | 'efectivo_bs' | '';
type Debt = { id: string; ownerId: string; year: number; month: number; amountUSD: number; description: string; status: 'pending' | 'paid' | 'vencida'; property: { street: string; house: string }; paidAmountUSD?: number;};
type Payment = { id: string; beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[]; beneficiaryIds: string[]; totalAmount: number; exchangeRate: number; paymentDate: Timestamp; reportedAt: Timestamp; paymentMethod: 'transferencia' | 'movil' | 'efectivo_bs' | 'efectivo'; bank: string; reference: string; status: 'pendiente' | 'aprobado' | 'rechazado'; receiptUrl?: string; observations?: string; receiptNumbers?: { [ownerId: string]: string }; type?: string; };

function VerificationComponent({ condoId }: { condoId: string }) {
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const { toast } = useToast();

    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [companyInfoLoading, setCompanyInfoLoading] = useState(true);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pendiente');
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [liquidatedDetails, setLiquidatedDetails] = useState<{ debts: Debt[], balanceCredit: number } | null>(null);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) {
            setCompanyInfoLoading(false);
            return;
        }
        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        const unsub = onSnapshot(settingsRef, (snap) => {
            if (snap.exists() && snap.data().companyInfo) {
                setCompanyInfo(snap.data().companyInfo);
            } else {
                setCompanyInfo(null);
            }
            setCompanyInfoLoading(false);
        });
        return () => unsub();
    }, [condoId]);

    useEffect(() => {
        if (!condoId) { setLoading(false); return; }
        const q = query(collection(db, 'condominios', condoId, 'payments'), orderBy('reportedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
            setLoading(false);
        }, (error) => {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos.' });
            setLoading(false);
        });
        return () => unsubscribe();
    }, [condoId, toast]);

    useEffect(() => {
        if (!selectedPayment || !condoId || selectedPayment.status !== 'aprobado') {
            setLiquidatedDetails(null);
            return;
        }
    
        const fetchLiquidationDetails = async () => {
            setLoadingDetails(true);
            try {
                const debtsQuery = query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('paymentId', '==', selectedPayment.id)
                );
                const debtsSnapshot = await getDocs(debtsQuery);
                const debtsPaid = debtsSnapshot.docs.map(doc => doc.data() as Debt);
                
                const totalAllocatedToDebts = debtsPaid.reduce((sum, debt) => {
                    const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * selectedPayment.exchangeRate;
                    return sum + debtAmountBs;
                }, 0);
    
                const balanceCredit = selectedPayment.totalAmount - totalAllocatedToDebts;
    
                setLiquidatedDetails({
                    debts: debtsPaid.sort((a,b) => a.year - b.year || a.month - b.month),
                    balanceCredit: balanceCredit > 0.01 ? balanceCredit : 0
                });
    
            } catch (error) {
                console.error("Error fetching liquidation details:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los detalles de la liquidación.' });
            } finally {
                setLoadingDetails(false);
            }
        };
    
        fetchLiquidationDetails();
    
    }, [selectedPayment, condoId, toast]);

    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            if (!p) return false;
            const statusMatch = p.status === activeTab;
            if (!statusMatch) return false;
            if (searchTerm === '') return true;
    
            const lowerCaseSearchTerm = searchTerm.toLowerCase();
            const referenceMatch = p.reference?.toLowerCase().includes(lowerCaseSearchTerm);
            const ownerMatch = p.beneficiaries?.some(b => b && b.ownerName && b.ownerName.toLowerCase().includes(lowerCaseSearchTerm));
            
            return referenceMatch || ownerMatch;
        });
    }, [payments, activeTab, searchTerm]);

    const handleApprove = (payment: Payment) => {
        requestAuthorization(async () => {
            if (!condoId) return;
            setIsVerifying(true);
            try {
                const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const settingsDoc = await getDoc(settingsRef);
                if (!settingsDoc.exists() || !settingsDoc.data().condoFee) {
                    throw new Error("No se encontró la cuota de condominio en la configuración.");
                }
                const condoFeeUSD = settingsDoc.data().condoFee;
                const costoCuotaActualBs = condoFeeUSD * payment.exchangeRate;
    
                const beneficiaryIds = payment.beneficiaries.map(b => b.ownerId);
                
                let targetAccountName = "";
                if (['movil', 'transferencia'].includes(payment.paymentMethod)) {
                    targetAccountName = "BANCO DE VENEZUELA";
                } else if (['efectivo_bs', 'efectivo'].includes(payment.paymentMethod)) {
                    targetAccountName = "CAJA PRINCIPAL";
                }

                await runTransaction(db, async (transaction) => {
                    const paymentRef = doc(db, 'condominios', condoId, 'payments', payment.id);
                    const receiptNumbers: { [ownerId: string]: string } = {};
    
                    const ownerRefs = beneficiaryIds.map(id => doc(db, 'condominios', condoId, ownersCollectionName, id));
                    const ownerDocs = await Promise.all(ownerRefs.map(ref => transaction.get(ref)));

                    // Buscar/Validar cuenta
                    const accountsRef = collection(db, 'condominios', condoId, 'cuentas');
                    const accountsSnap = await getDocs(accountsRef);
                    let targetAccount = accountsSnap.docs.find(d => d.data().nombre?.toUpperCase().trim() === targetAccountName);
                    
                    let accountId = "";
                    let currentAccountBalance = 0;

                    if (!targetAccount) {
                        const newAccRef = doc(accountsRef);
                        const newAccData = {
                            nombre: targetAccountName,
                            tipo: targetAccountName === "CAJA PRINCIPAL" ? "efectivo" : "banco",
                            saldoActual: 0,
                            createdAt: serverTimestamp()
                        };
                        transaction.set(newAccRef, newAccData);
                        accountId = newAccRef.id;
                    } else {
                        accountId = targetAccount.id;
                        currentAccountBalance = targetAccount.data().saldoActual || 0;
                    }

                    const allDebtsQuery = query(collection(db, 'condominios', condoId, 'debts'), where('ownerId', 'in', beneficiaryIds));
                    const allDebtsSnapshot = await getDocs(allDebtsQuery);
                    const allDebtsForTx = allDebtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
    
                    for (const beneficiary of payment.beneficiaries) {
                        const ownerDoc = ownerDocs.find(d => d.id === beneficiary.ownerId);
                        if (!ownerDoc || !ownerDoc.exists()) continue;
                        
                        const saldoAFavorPrevio = ownerDoc.data().balance || 0;
                        const montoRecibido = beneficiary.amount;
                        const allOwnerDebts = allDebtsForTx.filter(d => d.ownerId === beneficiary.ownerId);
                        
                        const cuotasPendientes = allOwnerDebts
                            .filter(d => d.status === 'pending' || d.status === 'vencida')
                            .sort((a, b) => a.year - b.year || a.month - b.month)
                            .map(debt => ({
                                id: debt.id,
                                amountUSD: debt.amountUSD,
                                monto: debt.amountUSD * payment.exchangeRate,
                                year: debt.year,
                                month: debt.month,
                                description: debt.description,
                            }));
                        
                        const liquidationResult = processPaymentLiquidation(montoRecibido, saldoAFavorPrevio, cuotasPendientes, costoCuotaActualBs);
    
                        for (const liquidada of liquidationResult.cuotasLiquidadas) {
                            const debtRef = doc(db, 'condominios', condoId, 'debts', liquidada.id);
                            transaction.update(debtRef, {
                                status: 'paid',
                                paymentId: payment.id,
                                paymentDate: payment.paymentDate,
                                paidAmountUSD: liquidada.amountUSD
                            });
                        }
    
                        if (liquidationResult.cuotasAdelantadas > 0 && condoFeeUSD > 0) {
                            let lastPaidPeriod = { year: 1970, month: 0 };
                            allOwnerDebts.forEach(d => {
                                if (d.status === 'paid') {
                                    if (d.year > lastPaidPeriod.year || (d.year === lastPaidPeriod.year && d.month > lastPaidPeriod.month)) {
                                        lastPaidPeriod = { year: d.year, month: d.month };
                                    }
                                }
                            });
                            let nextPeriodDate = addMonths(new Date(lastPaidPeriod.year, lastPaidPeriod.month, 0), 1);
                            for (let i = 0; i < liquidationResult.cuotasAdelantadas; i++) {
                                const futureYear = nextPeriodDate.getFullYear();
                                const futureMonth = nextPeriodDate.getMonth() + 1;
                                const debtRef = doc(collection(db, "condominios", condoId, "debts"));
                                transaction.set(debtRef, {
                                    ownerId: beneficiary.ownerId,
                                    property: ownerDoc.data().properties?.[0] || {},
                                    year: futureYear,
                                    month: futureMonth,
                                    amountUSD: condoFeeUSD,
                                    description: "Cuota de Condominio (Adelantado)",
                                    status: 'paid',
                                    paymentId: payment.id,
                                    paymentDate: payment.paymentDate,
                                    paidAmountUSD: condoFeeUSD,
                                    published: true
                                });
                                nextPeriodDate = addMonths(nextPeriodDate, 1);
                            }
                        }
                        transaction.update(ownerDoc.ref, { balance: liquidationResult.nuevoSaldoAFavor });
                        receiptNumbers[beneficiary.ownerId] = `REC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
                    }

                    // Actualizar Tesorería
                    const accRef = doc(db, 'condominios', condoId, 'cuentas', accountId);
                    transaction.update(accRef, { saldoActual: currentAccountBalance + payment.totalAmount });
                    
                    const newTransRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                    transaction.set(newTransRef, {
                        monto: payment.totalAmount,
                        tipo: 'ingreso',
                        cuentaId: accountId,
                        nombreCuenta: targetAccountName,
                        descripcion: `PAGO RECIBIDO: ${payment.beneficiaries.map(b => b.ownerName).join(', ')}`,
                        referencia: payment.reference,
                        fecha: payment.paymentDate,
                        createdBy: user?.email,
                        createdAt: serverTimestamp(),
                        sourcePaymentId: payment.id
                    });
                    
                    transaction.update(paymentRef, { status: 'aprobado', observations: 'Pago verificado y aplicado automáticamente.', receiptNumbers });
                });
                
                toast({ title: 'Pago Aprobado', description: 'El monto se ha sumado al saldo de Tesorería.' });
                setSelectedPayment(null);
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error al Aprobar', description: error.message });
            } finally {
                setIsVerifying(false);
            }
        });
    };

    const handleReject = (payment: Payment) => {
        if (!rejectionReason) { toast({ variant: 'destructive', title: 'Razón requerida' }); return; }
        requestAuthorization(async () => {
            if (!condoId) return;
            setIsVerifying(true);
            try {
                await updateDoc(doc(db, 'condominios', condoId, 'payments', payment.id), { status: 'rechazado', observations: rejectionReason });
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

    const handleDeletePayment = async () => {
        if (!paymentToDelete || !condoId) return;
        requestAuthorization(async () => {
            setIsVerifying(true);
            try {
                const paymentRef = doc(db, 'condominios', condoId, 'payments', paymentToDelete.id);
                const paidDebtsQuery = query(collection(db, 'condominios', condoId, 'debts'), where('paymentId', '==', paymentToDelete.id));
                const transactionsQuery = query(collection(db, 'condominios', condoId, 'transacciones'), where('sourcePaymentId', '==', paymentToDelete.id));
                
                await runTransaction(db, async (transaction) => {
                    const paymentDoc = await transaction.get(paymentRef);
                    if (!paymentDoc.exists()) return;
                    const paymentData = paymentDoc.data() as Payment;
                    
                    const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
                    const txSnapshot = await getDocs(transactionsQuery);
                    
                    const ownerRefs = paymentData.beneficiaries.map(b => doc(db, 'condominios', condoId, ownersCollectionName, b.ownerId));
                    const ownerDocs = await Promise.all(ownerRefs.map(ref => transaction.get(ref)));
                    
                    if (txSnapshot.docs.length > 0) {
                        const txData = txSnapshot.docs[0].data();
                        const targetAccountRef = doc(db, 'condominios', condoId, 'cuentas', txData.cuentaId);
                        const targetAccDoc = await transaction.get(targetAccountRef);
                        
                        if (targetAccDoc.exists()) {
                            const currentAccBalance = targetAccDoc.data().saldoActual || 0;
                            transaction.update(targetAccountRef, { saldoActual: Math.max(0, currentAccBalance - paymentData.totalAmount) });
                        }
                        txSnapshot.forEach(txDoc => transaction.delete(txDoc.ref));
                    }

                    let totalAmountAppliedToDebts = 0;
                    paidDebtsSnapshot.forEach(debtDoc => {
                        const debtData = debtDoc.data() as Debt;
                        totalAmountAppliedToDebts += (debtData.paidAmountUSD || debtData.amountUSD) * paymentData.exchangeRate;
                        transaction.update(debtDoc.ref, {
                            status: 'pending',
                            paymentId: deleteField(),
                            paymentDate: deleteField(),
                            paidAmountUSD: deleteField()
                        });
                    });

                    const totalSurplus = paymentData.totalAmount - totalAmountAppliedToDebts;
                    if (totalSurplus > 0.01) {
                         ownerDocs.forEach(ownerDoc => {
                            if (ownerDoc.exists()) {
                                const currentBalance = ownerDoc.data().balance || 0;
                                transaction.update(ownerDoc.ref, { balance: Math.max(0, currentBalance - totalSurplus) });
                            }
                        });
                    }
                    transaction.delete(paymentRef);
                });
                toast({ title: 'Pago Eliminado', description: 'Los efectos financieros han sido revertidos.' });
                setPaymentToDelete(null);
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
            } finally {
                setIsVerifying(false);
            }
        });
    };

    const prepareAndGenerateReceipt = async (action: 'download' | 'share', payment: Payment, beneficiary: any) => {
        if (!beneficiary || !beneficiary.ownerId || !condoId) return;
        if (companyInfoLoading) return;
        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Error', description: 'Configure el condominio en Ajustes.' });
            return;
        }
        setIsGenerating(true);
        try {
            const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId);
            const ownerSnap = await getDoc(ownerRef);
            if (!ownerSnap.exists()) throw new Error('Perfil no encontrado.');
            const ownerData = ownerSnap.data();
            const paidDebtsSnapshot = await getDocs(query(collection(db, 'condominios', condoId, 'debts'), where('paymentId', '==', payment.id), where('ownerId', '==', beneficiary.ownerId)));
            const paidDebts = paidDebtsSnapshot.docs.map(d => d.data() as Debt);
            const totalDebtPaidWithPayment = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
            const previousBalance = (ownerData.balance || 0) - (beneficiary.amount - totalDebtPaidWithPayment);
            const receiptNumber = payment.receiptNumbers?.[beneficiary.ownerId] || `N/A-${payment.id.slice(-5)}`;
            const conceptsForPdf = paidDebts.map(debt => [
                `${MONTHS_LOCALE[debt.month]} ${debt.year}`,
                `${debt.description} (${debt.property?.street}-${debt.property?.house})`,
                `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`,
                formatCurrency((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate)
            ]);
            if (paidDebts.length === 0 && beneficiary.amount > 0) {
                conceptsForPdf.push(['', 'Abono a Saldo a Favor', '', formatCurrency(beneficiary.amount)]);
            }
            const totalDebtPaidInBs = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
            const dataForPdf = {
                condoName: companyInfo.name,
                rif: companyInfo.rif,
                receiptNumber: receiptNumber,
                ownerName: ownerData.name,
                method: payment.paymentMethod,
                bank: payment.bank,
                reference: payment.reference,
                date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                concepts: conceptsForPdf,
                prevBalance: formatCurrency(previousBalance),
                receivedAmount: formatCurrency(beneficiary.amount),
                totalDebtPaid: formatCurrency(totalDebtPaidInBs),
                currentBalance: formatCurrency(ownerData.balance || 0),
                observations: payment.observations || 'Sin observaciones.'
            };
            if (action === 'download') { await generatePaymentReceipt(dataForPdf, companyInfo.logo, 'download'); } 
            else if (navigator.share) {
                const pdfBlob = await generatePaymentReceipt(dataForPdf, companyInfo.logo, 'blob');
                if (pdfBlob) {
                    const pdfFile = new File([pdfBlob!], `Recibo_${ownerData.name.replace(/\s/g, '_')}.pdf`, { type: 'application/pdf' });
                    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                        await navigator.share({ title: 'Recibo de Pago', files: [pdfFile] });
                    }
                }
            }
        } catch (error: any) { toast({ variant: 'destructive', title: 'Error', description: error.message }); } 
        finally { setIsGenerating(false); }
    };
    
    return (
        <Card className="rounded-[2rem] border-none shadow-sm bg-white">
            <CardHeader className="p-8">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-slate-900 font-black uppercase italic">Bandeja de Pagos</CardTitle>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-64 rounded-xl bg-slate-50 border-slate-200 text-slate-900 font-bold" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-3 mx-8 mb-4 h-12 bg-slate-100 rounded-xl p-1">
                        <TabsTrigger value="pendiente" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900">Pendientes</TabsTrigger>
                        <TabsTrigger value="aprobado" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900">Aprobados</TabsTrigger>
                        <TabsTrigger value="rechazado" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900">Rechazados</TabsTrigger>
                    </TabsList>
                    <div className="mt-4">
                        {loading ? <div className="text-center p-10"><Loader2 className="animate-spin h-8 w-8 mx-auto text-primary" /></div> : (
                            <Table>
                                <TableHeader className="bg-slate-50"><TableRow className="border-slate-100"><TableHead className="px-8 text-[10px] font-black uppercase text-slate-500">Propietario(s)</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-500">Fecha</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-500">Monto (Bs.)</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-500">Referencia</TableHead><TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-500">Acciones</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {filteredPayments.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="h-32 text-center text-slate-400 italic font-bold">No hay pagos en esta categoría.</TableCell></TableRow>
                                    ) : filteredPayments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 border-slate-50">
                                            <TableCell className="px-8 font-bold text-slate-900 text-xs uppercase">{p.beneficiaries.map(b => b.ownerName).join(', ')}</TableCell>
                                            <TableCell className="text-slate-500 font-medium text-xs">{p.paymentDate ? format(p.paymentDate.toDate(), 'dd/MM/yy') : 'N/A'}</TableCell>
                                            <TableCell className="font-black text-slate-900 text-sm">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                            <TableCell className="font-mono text-xs text-slate-400 font-bold">{p.reference}</TableCell>
                                            <TableCell className="text-right pr-8">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-900"><MoreHorizontal className="h-4 w-4" /></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="rounded-xl border-slate-200">
                                                            <DropdownMenuItem onClick={() => setSelectedPayment(p)} className="font-bold text-xs"><Eye className="mr-2 h-4 w-4" /> Ver detalles</DropdownMenuItem>
                                                            {p.status === 'pendiente' && (
                                                                <>
                                                                    <DropdownMenuSeparator className="bg-slate-100" />
                                                                    <DropdownMenuItem onClick={() => handleApprove(p)} className="text-emerald-600 font-black uppercase text-[10px]"><CheckCircle className="mr-2 h-4 w-4" /> Aprobar</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => { setSelectedPayment(p); setRejectionReason(''); }} className="text-red-600 font-black uppercase text-[10px]"><XCircle className="mr-2 h-4 w-4" /> Rechazar</DropdownMenuItem>
                                                                </>
                                                            )}
                                                            {p.status === 'aprobado' && (
                                                                <>
                                                                    <DropdownMenuSeparator className="bg-slate-100" />
                                                                    <DropdownMenuSub>
                                                                        <DropdownMenuSubTrigger className="font-bold text-xs"><Download className="mr-2 h-4 w-4"/>Recibo PDF</DropdownMenuSubTrigger>
                                                                        <DropdownMenuPortal>
                                                                            <DropdownMenuSubContent className="rounded-xl border-slate-200">
                                                                                {p.beneficiaries.map(ben => (
                                                                                    <DropdownMenuItem key={ben.ownerId} onClick={() => prepareAndGenerateReceipt('download', p, ben)} className="text-[10px] font-bold uppercase">{ben.ownerName}</DropdownMenuItem>
                                                                                ))}
                                                                            </DropdownMenuSubContent>
                                                                        </DropdownMenuPortal>
                                                                    </DropdownMenuSub>
                                                                    <DropdownMenuSeparator className="bg-slate-100" />
                                                                    <DropdownMenuItem className="text-red-600 font-bold text-xs" onClick={() => setPaymentToDelete(p)}><Trash2 className="mr-2 h-4 w-4"/>Eliminar</DropdownMenuItem>
                                                                </>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Tabs>
                <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
                    <DialogContent className="max-w-2xl rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                        <DialogHeader><DialogTitle className="text-xl font-black uppercase italic">Pago: {selectedPayment?.reference}</DialogTitle>{selectedPayment && <DialogDescription className="font-bold text-slate-400">Reportado el {format(selectedPayment.reportedAt.toDate(), 'dd/MM/yyyy HH:mm')}</DialogDescription>}</DialogHeader>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto">
                            <div className="space-y-4">
                                <Card className="rounded-2xl bg-slate-50 border-slate-100">
                                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-slate-400">Beneficiarios</CardTitle></CardHeader>
                                    <CardContent className="space-y-2">
                                        {selectedPayment?.beneficiaries.map((b, i) => (
                                            <div key={b.ownerId || i} className="text-xs flex justify-between items-center border-b border-white pb-1 last:border-0">
                                                <span className="font-bold text-slate-700 uppercase"><User className="inline h-3 w-3 mr-1 text-primary"/>{b.ownerName}</span>
                                                <span className="font-black text-slate-900">Bs. {formatCurrency(b.amount)}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                                <Card className="rounded-2xl bg-slate-50 border-slate-100"><CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-slate-400">Transacción</CardTitle></CardHeader><CardContent className="text-xs space-y-2 text-slate-700 font-bold"><p className="flex justify-between">Monto Total: <span className="text-slate-900 font-black text-sm">Bs. {formatCurrency(selectedPayment?.totalAmount || 0)}</span></p><p className="flex justify-between">Fecha: <span>{selectedPayment ? format(selectedPayment.paymentDate.toDate(), 'dd/MM/yyyy') : ''}</span></p><p className="flex justify-between">Método: <span className="uppercase text-primary">{selectedPayment?.paymentMethod}</span></p><p className="flex justify-between">Banco: <span className="uppercase">{selectedPayment?.bank}</span></p></CardContent></Card>
                                {selectedPayment?.status === 'pendiente' && (
                                    <div className="w-full space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Motivo del rechazo</Label>
                                        <Textarea className="rounded-xl font-bold bg-slate-50 border-slate-200" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Ej: Referencia no coincide..." />
                                    </div>
                                )}
                            </div>
                            <div>
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Comprobante Digital</Label>
                                {selectedPayment?.receiptUrl ? (<div className="mt-2 border rounded-3xl overflow-hidden shadow-sm"><Image src={selectedPayment.receiptUrl} alt="Comprobante" width={400} height={600} className="w-full h-auto" /></div>) : <div className="mt-2 h-40 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 font-bold italic text-xs">Sin comprobante adjunto</div>}
                            </div>
                        </div>
                        {selectedPayment?.status === 'pendiente' && (<DialogFooter className="border-t pt-6 gap-2"><Button variant="ghost" onClick={() => handleReject(selectedPayment!)} disabled={isVerifying || !rejectionReason} className="rounded-xl font-black uppercase text-[10px] text-red-600">Rechazar</Button><Button onClick={() => handleApprove(selectedPayment!)} disabled={isVerifying} className="rounded-xl font-black uppercase text-[10px] bg-slate-900 text-white flex-1 h-12 shadow-lg">Aprobar y Asentar</Button></DialogFooter>)}
                    </DialogContent>
                </Dialog>
                <Dialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
                     <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                        <DialogHeader><DialogTitle className="text-xl font-black uppercase italic text-red-600">¿Revertir Pago?</DialogTitle><DialogDescription className="font-bold text-slate-500">Esta acción descontará el monto de Tesorería, revertirá las deudas a pendientes y ajustará el saldo del propietario. ¿Continuar?</DialogDescription></DialogHeader>
                        <DialogFooter className="mt-4 gap-2"><Button variant="outline" className="rounded-xl font-bold h-12" onClick={() => setPaymentToDelete(null)}>Cancelar</Button><Button variant="destructive" className="rounded-xl font-black h-12 shadow-lg" onClick={handleDeletePayment}>Sí, Revertir Todo</Button></DialogFooter>
                     </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

function ReportPaymentComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const { user: authUser } = useAuth();
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
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';
    const isCashPayment = paymentMethod === 'efectivo_bs';
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
                        const allRates = (settings.exchangeRates || []);
                        const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                        const applicableRates = allRates.filter((r:any) => r.date <= paymentDateString).sort((a:any, b:any) => b.date.localeCompare(a.date));
                        if (applicableRates.length > 0) { setExchangeRate(applicableRates[0].rate); setExchangeRateMessage(''); } 
                        else { setExchangeRateMessage('No hay tasa para esta fecha.'); }
                    }
                }
            } catch (e) { console.error(e); }
        }
        fetchRate();
    }, [paymentDate, condoId]);
    useEffect(() => {
        if (isCashPayment) { setBank('Efectivo'); setReference('EFECTIVO'); } 
        else { if (bank === 'Efectivo') setBank(''); if (reference === 'EFECTIVO') setReference(''); }
    }, [isCashPayment, bank, reference]);
    useEffect(() => {
        const bs = parseFloat(totalAmount);
        if (!isNaN(bs) && exchangeRate && exchangeRate > 0) { setAmountUSD((bs / exchangeRate).toFixed(2)); } 
        else { setAmountUSD(''); }
    }, [totalAmount, exchangeRate]);
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const compressedBase64 = await compressImage(file, 800, 800);
            setReceiptImage(compressedBase64);
            toast({ title: 'Comprobante cargado' });
        } catch (error) { toast({ variant: 'destructive', title: 'Error de imagen' }); } 
        finally { setLoading(false); }
    };
    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balance = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);
    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });
    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => { if (beneficiaryRows.length > 1) { setBeneficiaryRows(rows => rows.filter(row => row.id !== id)); } };
    const getFilteredOwners = (searchTerm: string) => { if (!searchTerm || searchTerm.length < 2) return []; return allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase())); };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser || !condoId || !exchangeRate || !totalAmount) return;
        setIsSubmitting(true);
        try {
            const beneficiaries = beneficiaryRows.map(row => ({ ownerId: row.owner!.id, ownerName: row.owner!.name, ...(row.selectedProperty && { street: row.selectedProperty.street, house: row.selectedProperty.house }), amount: Number(row.amount) }));
            const paymentData = { reportedBy: authUser.uid, beneficiaries, beneficiaryIds: beneficiaries.map(b=>b.ownerId), totalAmount: Number(totalAmount), exchangeRate, paymentDate: Timestamp.fromDate(paymentDate!), paymentMethod, bank: isCashPayment ? 'Efectivo' : (bank === 'Otro' ? otherBank : bank), reference: isCashPayment ? 'EFECTIVO' : reference, receiptUrl: receiptImage, status: 'pendiente', reportedAt: serverTimestamp() };
            await addDoc(collection(db, "condominios", condoId, "payments"), paymentData);
            toast({ title: 'Pago Reportado' });
            setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
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
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Fecha del Pago</Label><Popover><PopoverTrigger asChild><Button variant={"outline"} className="w-full h-12 rounded-xl font-bold bg-slate-50 border-slate-200 text-slate-900"><CalendarIcon className="mr-2 h-4 w-4" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 rounded-2xl"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} /></PopoverContent></Popover></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Tasa Aplicable</Label><Input type="number" value={exchangeRate || ''} readOnly className="h-12 rounded-xl bg-slate-100 border-none font-black text-slate-900" /><p className="text-[9px] font-bold text-slate-400 mt-1 uppercase ml-2">{exchangeRateMessage}</p></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Método</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}><SelectTrigger className="h-12 rounded-xl font-bold bg-slate-50 border-slate-200 text-slate-900"><SelectValue/></SelectTrigger><SelectContent className="rounded-xl"><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem><SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem></SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Banco Emisor</Label><Button type="button" variant="outline" className="w-full h-12 rounded-xl font-bold bg-slate-50 border-slate-200 text-slate-900 justify-start" onClick={() => setIsBankModalOpen(true)} disabled={isCashPayment}>{isCashPayment ? 'EFECTIVO' : (bank || "Seleccionar...")}</Button></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nº Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))} disabled={isCashPayment} className="h-12 rounded-xl font-black bg-slate-50 border-slate-200 text-slate-900" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Monto Total Bs.</Label><Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="h-12 rounded-xl font-black text-lg bg-slate-50 border-slate-200 text-slate-900" /></div>
                    </div>
                    <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Soporte Digital</Label><Input type="file" onChange={handleImageUpload} className="h-12 rounded-xl bg-slate-50 border-slate-200 text-slate-900" /></div>
                    <Separator className="bg-slate-100" />
                    <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Asignación a Propietarios</Label>
                        {beneficiaryRows.map((row, index) => (
                            <Card key={row.id} className="p-6 bg-slate-50 border-slate-100 rounded-3xl relative">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        {!row.owner ? (<><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Nombre..." className="pl-9 h-12 rounded-xl bg-white border-slate-200" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} /></div>{row.searchTerm.length >= 2 && <Card className="border shadow-lg mt-1 rounded-xl overflow-hidden"><ScrollArea className="h-32">{getFilteredOwners(row.searchTerm).map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(row.id, owner)} className="p-3 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 font-bold text-xs text-slate-700 uppercase">{owner.name}</div>))}</ScrollArea></Card>}</>)
                                        : (
                                            <div className="p-4 bg-white rounded-2xl border border-slate-100 space-y-3">
                                                <div className="flex items-center justify-between"><p className="font-black text-slate-900 uppercase text-xs">{row.owner.name}</p><Button variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} disabled={beneficiaryRows.length === 1} className="h-8 w-8 text-red-400 hover:text-red-600"><XCircle className="h-5 w-5" /></Button></div>
                                                <div className="space-y-1"><Label className="text-[9px] font-black uppercase text-slate-400">Propiedad</Label><Select onValueChange={(v) => updateBeneficiaryRow(row.id, { selectedProperty: row.owner?.properties.find(p => `${p.street}-${p.house}` === v) || null })} value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}><SelectTrigger className="h-10 rounded-xl bg-slate-50 font-bold text-xs uppercase"><SelectValue placeholder="Casa..." /></SelectTrigger><SelectContent className="rounded-xl">{row.owner.properties.map((p, pIdx) => (<SelectItem key={pIdx} value={`${p.street}-${p.house}`} className="font-bold text-[10px] uppercase">{p.street} - {p.house}</SelectItem>))}</SelectContent></Select></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Monto Asignado Bs.</Label><Input type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={loading || !row.owner} className="h-12 rounded-xl font-black bg-white border-slate-200" /></div>
                                </div>
                            </Card>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} className="rounded-xl font-black uppercase text-[10px] border-slate-200 text-slate-600"><UserPlus className="mr-2 h-4 w-4"/>Añadir Beneficiario</Button>
                    </div>
                </CardContent>
                <CardFooter className="bg-slate-50 p-8 border-t flex justify-end gap-4"><div className="mr-auto flex flex-col"><span className="text-[10px] font-black uppercase text-slate-400">Diferencia:</span><span className={cn("font-black text-lg", balance !== 0 ? 'text-red-600' : 'text-emerald-600')}>Bs. {formatCurrency(balance)}</span></div><Button type="submit" disabled={isSubmitting || Math.abs(balance) > 0.01} className="h-14 px-10 rounded-2xl bg-slate-900 text-white font-black uppercase italic shadow-xl">{isSubmitting ? <Loader2 className="animate-spin"/> : 'Reportar y Validar'}</Button></CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(value) => { setBank(value); if (value !== 'Otro') setOtherBank(''); setIsBankModalOpen(false); }} />
        </Card>
    );
}

function PaymentCalculatorComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const { user: authUser } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loadingOwners, setLoadingOwners] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [ownerDebts, setOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';
    useEffect(() => {
        if (!condoId) { setLoadingOwners(false); return; }
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            setLoadingOwners(false);
        });
        return () => unsubscribe();
    }, [condoId, ownersCollectionName]);
    useEffect(() => {
        if (!selectedOwner || !condoId) { setOwnerDebts([]); return; }
        setLoadingDebts(true);
        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCondoFee(settings.condoFee || 0);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                setActiveRate(activeRateObj?.rate || (rates[0]?.rate) || 0);
            }
        });
        const debtsQuery = query(collection(db, "condominios", condoId, "debts"), where("ownerId", "==", selectedOwner.id));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData: Debt[] = [];
            snapshot.forEach(d => debtsData.push({ id: d.id, ...d.data() } as Debt));
            setOwnerDebts(debtsData.sort((a, b) => a.year - b.year || a.month - b.month));
            setLoadingDebts(false);
        });
        return () => { settingsUnsubscribe(); debtsUnsubscribe(); };
    }, [selectedOwner, condoId]);
    const filteredOwners = useMemo(() => { if (!searchTerm) return []; return allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase())); }, [searchTerm, allOwners]);
    if (!selectedOwner) {
        return (
            <Card className="rounded-[2rem] border-none shadow-sm bg-white">
                <CardHeader><CardTitle className="font-black uppercase italic text-slate-900">Calculadora: Seleccionar Propietario</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                     <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Buscar por nombre..." className="pl-9 h-12 rounded-xl bg-slate-50 border-slate-200 text-slate-900 font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                    {searchTerm && (
                        <Card className="border border-slate-100 rounded-2xl shadow-xl overflow-hidden mt-2"><ScrollArea className="h-60">
                                {filteredOwners.length > 0 ? filteredOwners.map(owner => (
                                    <div key={owner.id} onClick={() => { setSearchTerm(''); setSelectedOwner(owner); }} className="p-4 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 font-bold text-xs uppercase text-slate-700">{owner.name}</div>
                                )) : <p className="p-10 text-xs font-bold text-center text-slate-400 uppercase italic">Sin resultados.</p>}
                        </ScrollArea></Card>
                    )}
                </CardContent>
            </Card>
        )
    }
    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => setSelectedOwner(null)} className="font-black uppercase text-[10px] text-slate-500 hover:text-slate-900"><ArrowLeft className="mr-2 h-4 w-4"/> Cambiar Propietario</Button>
            {loadingDebts ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary"/></div> : <PaymentCalculatorUI owner={selectedOwner} debts={ownerDebts} activeRate={activeRate} condoFee={condoFee} condoId={condoId} showReportButton={false} />}
        </div>
    );
}

function PaymentCalculatorUI({ owner, debts, activeRate, condoFee, condoId, showReportButton = true }: { owner: any; debts: Debt[]; activeRate: number; condoFee: number, condoId: string | null, showReportButton?: boolean }) {
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    const now = new Date();
    const pendingDebts = useMemo(() => debts.filter(d => d.status === 'pending' || d.status === 'vencida').sort((a,b) => a.year - b.year || a.month - b.month), [debts]);
    const futureMonths = useMemo(() => {
        const paidAdvanceMonths = debts.filter(d => d.status === 'paid' && d.description.includes('Adelantado')).map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);
        return Array.from({ length: 12 }, (_, i) => {
            const date = addMonths(now, i);
            const value = format(date, 'yyyy-MM');
            return { value, label: format(date, 'MMMM yyyy', { locale: es }), disabled: paidAdvanceMonths.includes(value) };
        });
    }, [debts, now]);
    const paymentCalculator = useMemo(() => {
        const dueMonthsTotalUSD = pendingDebts.filter(d => selectedPendingDebts.includes(d.id)).reduce((sum, debt) => sum + debt.amountUSD, 0);
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalDebtBs = (dueMonthsTotalUSD + advanceMonthsTotalUSD) * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - (owner.balance || 0));
        return { totalToPay, hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0, dueMonthsCount: selectedPendingDebts.length, advanceMonthsCount: selectedAdvanceMonths.length, totalDebtBs, balanceInFavor: owner.balance || 0, condoFee };
    }, [selectedPendingDebts, selectedAdvanceMonths, pendingDebts, activeRate, condoFee, owner]);
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
                <Card className="rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
                    <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-sm font-black uppercase text-slate-600">Deudas Pendientes</CardTitle></CardHeader>
                    <Table>
                        <TableHeader><TableRow className="bg-slate-50/50"><TableHead className="w-[50px] text-center"></TableHead><TableHead className="text-[10px] font-black uppercase text-slate-500">Período</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-500">Concepto</TableHead><TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-500">Monto (Bs.)</TableHead></TableRow></TableHeader>
                        <TableBody>{pendingDebts.length === 0 ? <TableRow><TableCell colSpan={4} className="h-32 text-center text-slate-400 italic font-bold">Sin deudas pendientes.</TableCell></TableRow> : pendingDebts.map((debt) => (<TableRow key={debt.id} className="hover:bg-slate-50"><TableCell className="text-center pl-8"><Checkbox onCheckedChange={() => setSelectedPendingDebts(p => p.includes(debt.id) ? p.filter(id=>id!==debt.id) : [...p, debt.id])} checked={selectedPendingDebts.includes(debt.id)} /></TableCell><TableCell className="font-bold text-slate-900 text-xs">{MONTHS_LOCALE[debt.month]} {debt.year}</TableCell><TableCell className="text-xs text-slate-500 font-medium uppercase">{debt.description}</TableCell><TableCell className="text-right pr-8 font-black text-slate-900">Bs. {formatCurrency(debt.amountUSD * activeRate)}</TableCell></TableRow>))}</TableBody>
                    </Table>
                </Card>
                <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-8">
                    <CardHeader className="p-0 mb-6"><CardTitle className="text-sm font-black uppercase text-slate-600">Pagar Meses por Adelantado</CardTitle></CardHeader>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{futureMonths.map(month => <Button key={month.value} type="button" variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-bold uppercase text-[10px] transition-all", selectedAdvanceMonths.includes(month.value) ? "bg-slate-900 text-white" : "text-slate-600")} onClick={() => setSelectedAdvanceMonths(p => p.includes(month.value) ? p.filter(m=>m!==month.value) : [...p, month.value])} disabled={month.disabled}>{selectedAdvanceMonths.includes(month.value) && <Check className="h-3 w-3 mr-2" />} {month.label}</Button>)}</div>
                </Card>
            </div>
            <div className="lg:sticky lg:top-20">
                 {paymentCalculator.hasSelection && <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white p-8"><CardHeader className="p-0 mb-6"><CardTitle className="flex items-center gap-3 text-lg font-black uppercase italic tracking-tighter"><Calculator className="text-primary" /> Resumen de Pago</CardTitle></CardHeader><div className="space-y-4"><div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest"><span>Sub-Total Deuda</span><span className="text-white">Bs. {formatCurrency(paymentCalculator.totalDebtBs)}</span></div><div className="flex justify-between text-xs font-bold text-emerald-400 uppercase tracking-widest"><span>Saldo a Favor</span><span>- Bs. {formatCurrency(paymentCalculator.balanceInFavor)}</span></div><Separator className="bg-white/10" /><div className="flex justify-between items-center"><span className="text-lg font-black uppercase italic">Total a Pagar</span><span className="text-3xl font-black text-primary">Bs. {formatCurrency(paymentCalculator.totalToPay)}</span></div><p className="text-[9px] font-bold text-slate-500 uppercase text-center mt-4">Tasa BCV Aplicada: Bs. {formatCurrency(activeRate)}</p></div></Card>}
            </div>
        </div>
    );
}

function PaymentsPage() {
    const searchParams = useSearchParams();
    const condoId = useParams()?.condoId as string;
    const router = useRouter();
    const activeTab = searchParams?.get('tab') ?? 'verify';
    const handleTabChange = (value: string) => { router.push(`/${condoId}/admin/payments?tab=${value}`, { scroll: false }); };
    return (
        <div className="space-y-10">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-[#0081c9]">Pagos</span></h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">Validación de ingresos y conciliación de saldos en Tesorería.</p>
            </div>
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                 <TabsList className="grid w-full grid-cols-3 bg-slate-200 h-14 rounded-2xl p-1 shadow-inner"><TabsTrigger value="verify" className="rounded-xl font-black uppercase text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900">Verificación</TabsTrigger><TabsTrigger value="report" className="rounded-xl font-black uppercase text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900">Reporte Manual</TabsTrigger><TabsTrigger value="calculator" className="rounded-xl font-black uppercase text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900">Calculadora</TabsTrigger></TabsList>
                <TabsContent value="verify" className="mt-8"><VerificationComponent condoId={condoId} /></TabsContent>
                <TabsContent value="report" className="mt-8"><ReportPaymentComponent condoId={condoId} /></TabsContent>
                <TabsContent value="calculator" className="mt-8"><PaymentCalculatorComponent condoId={condoId} /></TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (<Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}><PaymentsPage /></Suspense>);
}

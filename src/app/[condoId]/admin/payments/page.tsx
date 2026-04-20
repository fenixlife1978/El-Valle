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
    Calculator, Minus, Equal, Receipt, Check, Info, DollarSign, Plus
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
import Image from 'next/image';
import { useAuthorization } from '@/hooks/use-authorization';
import { 
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
    DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub,
    DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal
} from '@/components/ui/dropdown-menu';
import { generatePaymentReceipt } from '@/lib/pdf-generator';
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
const CAJA_PRINCIPAL_ID = "fS0hdoWOyZBuTVuUJSic";

type Owner = { id: string; name: string; properties: { street: string, house: string }[]; balance?: number; role?: string; email?: string; };
type DistributionLine = { id: string; category: 'ordinaria' | 'extraordinaria'; amount: number; extraordinaryDebtId?: string; isOwn?: boolean; };
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; selectedProperty: { street: string, house: string } | null; distributionLines: DistributionLine[]; };
type PaymentMethod = 'movil' | 'transferencia' | 'efectivo_bs' | '';
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

                await runTransaction(db, async (transaction) => {
                    const ownerRefs = payment.beneficiaries.map(b => doc(db, 'condominios', condoId, ownersCollectionName, b.ownerId));
                    const ownerSnaps = await Promise.all(ownerRefs.map(ref => transaction.get(ref)));
                    
                    const receiptNumbers: { [ownerId: string]: string } = {};
                    const liquidatedConcepts: LiquidatedConcept[] = [];

                    for (let i = 0; i < payment.beneficiaries.length; i++) {
                        const beneficiary = payment.beneficiaries[i];
                        const ownerSnap = ownerSnaps[i];
                        const ownerRef = ownerRefs[i];

                        if (!ownerSnap.exists()) continue;

                        // ============================================
                        // CUOTA EXTRAORDINARIA - CORREGIDO COMPLETAMENTE
                        // ============================================
                        if (beneficiary.category === 'extraordinaria' && beneficiary.extraordinaryDebtId) {
                            const debtRef = doc(db, 'condominios', condoId, 'owner_extraordinary_debts', beneficiary.extraordinaryDebtId);
                            const debtSnap = await transaction.get(debtRef);
                            
                            if (debtSnap.exists()) {
                                const debtData = debtSnap.data();
                                const totalAmountUSD = debtData.amountUSD;
                                const paidAmountUSD = beneficiary.amount / payment.exchangeRate;
                                
                                // OBTENER EL CAMPAIGN ID REAL DESDE LA DEUDA
                                const campaignId = debtData.debtId;
                                const campaignName = debtData.description;
                                
                                // Obtener información completa de la campaña
                                let campaignAmountUSD = totalAmountUSD;
                                if (campaignId) {
                                    const campaignRef = doc(db, 'condominios', condoId, 'extraordinary_campaigns', campaignId);
                                    const campaignSnap = await transaction.get(campaignRef);
                                    if (campaignSnap.exists()) {
                                        campaignAmountUSD = campaignSnap.data().amountUSD;
                                    }
                                }
                                
                                // Calcular el monto pendiente ANTES del pago
                                const pendingBeforePayment = debtData.pendingUSD !== undefined ? debtData.pendingUSD : totalAmountUSD;
                                
                                // Calcular lo que ya se ha pagado anteriormente
                                const previouslyPaidUSD = debtData.amountPaidUSD || 0;
                                const totalPaidAfterThis = previouslyPaidUSD + paidAmountUSD;
                                const newPendingUSD = Math.max(0, totalAmountUSD - totalPaidAfterThis);
                                
                                // DETERMINAR SI ES LIQUIDACIÓN TOTAL
                                const isLiquidation = newPendingUSD <= 0.01;
                                
                                // Determinar nuevo estado
                                let newStatus: 'pending' | 'partial' | 'paid' = 'paid';
                                if (!isLiquidation && newPendingUSD > 0.01) {
                                    newStatus = 'partial';
                                }
                                
                                const partialPayment = {
                                    amountUSD: paidAmountUSD,
                                    amountBs: beneficiary.amount,
                                    date: payment.paymentDate,
                                    paymentId: payment.id,
                                    isLiquidation: isLiquidation
                                };
                                
                                const existingPartialPayments = debtData.partialPayments || [];
                                const newAmountPaidBs = (debtData.amountPaidBs || 0) + beneficiary.amount;
                                const newAmountPaidUSD = previouslyPaidUSD + paidAmountUSD;
                                
                                // ACTUALIZAR LA DEUDA CON EL ESTADO CORRECTO
                                transaction.update(debtRef, {
                                    status: newStatus,
                                    pendingUSD: newStatus === 'paid' ? 0 : newPendingUSD,
                                    paidAt: newStatus === 'paid' ? payment.paymentDate : (debtData.paidAt || null),
                                    paymentId: newStatus === 'paid' ? payment.id : (debtData.paymentId || null),
                                    partialPayments: [...existingPartialPayments, partialPayment],
                                    amountPaidBs: newAmountPaidBs,
                                    amountPaidUSD: newAmountPaidUSD,
                                    updatedAt: serverTimestamp()
                                });
                                
                                // CREAR MOVIMIENTO EN EXTRAORDINARY_FUNDS CON CAMPAIGN ID CORRECTO
                                const extraFundRef = doc(collection(db, 'condominios', condoId, 'extraordinary_funds'));
                                
                                // Descripción clara con nombre de campaña
                                const descripcionPago = isLiquidation 
                                    ? `PAGO CUOTA EXTRAORDINARIA: ${campaignName} [LIQUIDACIÓN TOTAL]`
                                    : `ABONO PARCIAL CUOTA EXTRAORDINARIA: ${campaignName} - PENDIENTE: $${formatUSD(newPendingUSD)}`;
                                
                                transaction.set(extraFundRef, {
                                    tipo: 'ingreso',
                                    monto: beneficiary.amount,
                                    montoUSD: paidAmountUSD,
                                    exchangeRate: payment.exchangeRate,
                                    descripcion: descripcionPago,
                                    referencia: payment.reference,
                                    fecha: payment.paymentDate,
                                    categoria: 'extraordinaria',
                                    sourceTransactionId: null,
                                    sourcePaymentId: payment.id,
                                    createdBy: user?.email,
                                    ownerId: beneficiary.ownerId,
                                    campaignId: campaignId,
                                    campaignName: campaignName,
                                    campaignAmountUSD: campaignAmountUSD,
                                    isLiquidation: isLiquidation,
                                    previousPendingUSD: isLiquidation ? pendingBeforePayment : null,
                                    createdAt: serverTimestamp()
                                });
                                
                                // REGISTRAR CONCEPTO LIQUIDADO CON NOMBRE DE CAMPAÑA
                                liquidatedConcepts.push({
                                    ownerId: beneficiary.ownerId,
                                    description: isLiquidation 
                                        ? `LIQUIDACIÓN TOTAL CUOTA EXTRAORDINARIA: ${campaignName}`
                                        : `ABONO PARCIAL CUOTA EXTRAORDINARIA: ${campaignName}`,
                                    amountUSD: paidAmountUSD,
                                    period: format(payment.paymentDate.toDate(), 'MMMM yyyy', { locale: es }).toUpperCase(),
                                    type: isLiquidation ? 'extraordinaria' : 'abono_extraordinaria'
                                });
                                
                                receiptNumbers[beneficiary.ownerId] = `REC-EXT-${Date.now().toString().substring(6)}-${beneficiary.ownerId.slice(-4)}`.toUpperCase();
                                transaction.update(ownerRef, { balance: ownerSnap.data().balance || 0 });
                                continue;
                            }
                        }
                        
                        // ============================================
                        // CUOTA ORDINARIA
                        // ============================================
                        let funds = new Decimal(beneficiary.amount).plus(new Decimal(ownerSnap.data().balance || 0));
                        
                        const debtsSnap = await getDocs(query(
                            collection(db, 'condominios', condoId, 'debts'),
                            where('ownerId', '==', beneficiary.ownerId),
                            where('status', 'in', ['pending', 'vencida'])
                        ));
                        
                        const pendingDebts = debtsSnap.docs
                            .map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any))
                            .sort((a, b) => a.year - b.year || a.month - b.month);

                        for (const debt of pendingDebts) {
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
                                    description: `${debt.description} (${beneficiary.street || ''} ${beneficiary.house || ''})`,
                                    amountUSD: debt.amountUSD,
                                    period: `${monthsLocale[debt.month]} ${debt.year}`,
                                    type: 'deuda'
                                });
                            } else break;
                        }

                        const advanceAmountBs = new Decimal(currentFee).times(payment.exchangeRate);
                        if (funds.gte(advanceAmountBs)) {
                            const allDebtsSnap = await getDocs(query(
                                collection(db, 'condominios', condoId, 'debts'),
                                where('ownerId', '==', beneficiary.ownerId)
                            ));
                            const allDebtsSorted = allDebtsSnap.docs
                                .map(d => d.data())
                                .sort((a, b) => a.year - b.year || a.month - b.month);
                            
                            let nextMonthDate = addMonths(new Date(), 1);
                            if (allDebtsSorted.length > 0) {
                                const lastDebt = allDebtsSorted[allDebtsSorted.length-1];
                                nextMonthDate = addMonths(new Date(lastDebt.year, lastDebt.month - 1), 1);
                            }

                            while (funds.gte(advanceAmountBs)) {
                                const year = nextMonthDate.getFullYear();
                                const month = nextMonthDate.getMonth() + 1;
                                
                                const newDebtRef = doc(collection(db, 'condominios', condoId, 'debts'));
                                transaction.set(newDebtRef, {
                                    ownerId: beneficiary.ownerId,
                                    property: { 
                                        street: beneficiary.street || '',
                                        house: beneficiary.house || '' 
                                    },
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
                                    description: `CUOTA ADELANTADA (${beneficiary.street || ''} ${beneficiary.house || ''})`,
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
                                description: `EXCEDENTE APLICADO A SALDO A FAVOR (${beneficiary.street || ''} ${beneficiary.house || ''})`,
                                amountUSD: funds.div(payment.exchangeRate).toNumber(),
                                period: 'SALDO',
                                type: 'abono'
                            });
                        }

                        receiptNumbers[beneficiary.ownerId] = `REC-${Date.now().toString().substring(6)}-${beneficiary.ownerId.slice(-4)}`.toUpperCase();
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
            const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCollectionName, ownerId));
            const ownerData = ownerSnap.exists() ? ownerSnap.data() : null;
            const propString = beneficiary.street && beneficiary.house ? `${beneficiary.street} - ${beneficiary.house}` : (ownerData?.properties?.[0] ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` : 'N/A');

            if (ownerConcepts.length === 0) {
                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('paymentId', '==', payment.id),
                    where('ownerId', '==', ownerId)
                ));
                
                ownerConcepts = debtsSnap.docs.map((d: any) => {
                    const data = d.data();
                    return {
                        ownerId: ownerId,
                        description: `${data.description} (${propString})`,
                        amountUSD: data.paidAmountUSD || data.amountUSD,
                        period: `${monthsLocale[data.month] || 'Mes'} ${data.year}`,
                        type: 'deuda'
                    } as LiquidatedConcept;
                });
                
                const totalPaidInDebtsUSD = ownerConcepts.reduce((sum, c) => sum + c.amountUSD, 0);
                const totalPaidInDebtsBs = totalPaidInDebtsUSD * payment.exchangeRate;
                const remainderBs = beneficiary.amount - totalPaidInDebtsBs;
                
                if (remainderBs > 0.05) {
                    ownerConcepts.push({
                        ownerId: ownerId,
                        description: `EXCEDENTE APLICADO A SALDO A FAVOR (${propString})`,
                        amountUSD: remainderBs / payment.exchangeRate,
                        period: 'SALDO',
                        type: 'abono'
                    });
                }
            } else {
                ownerConcepts = ownerConcepts.map(c => ({
                    ...c,
                    description: c.description.includes('(') ? c.description : `${c.description} (${propString})`
                }));
            }

            const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate as any) : new Date());
            const currentBalance = ownerData ? (ownerData.balance || 0) : 0;
            
            const transactionConcepts = ownerConcepts.filter(c => {
                if (c.type === 'abono' && !c.description.includes('EXCEDENTE')) {
                    return false;
                }
                return true;
            });

            const concepts = transactionConcepts.map(c => {
                const isAbonoExcedente = c.type === 'abono' && c.description.includes('EXCEDENTE');
                return [
                    c.period,
                    c.description.toUpperCase(),
                    isAbonoExcedente ? '' : `$${c.amountUSD.toFixed(2)}`,
                    formatCurrency(c.amountUSD * payment.exchangeRate)
                ];
            });

            const totalAbonadoEnDeudas = transactionConcepts.reduce((sum, c) => sum + (c.amountUSD * payment.exchangeRate), 0);
            const saldoFavorAnterior = Math.max(0, currentBalance - (beneficiary.amount - totalAbonadoEnDeudas));
            const saldoFavorActual = currentBalance;
            const totalPagado = beneficiary.amount;

            const data = {
                condoName: localCompanyInfo.name || 'CONDOMINIO',
                rif: localCompanyInfo.rif || 'J-40587208-0',
                receiptNumber: payment.receiptNumbers?.[ownerId] || 'S/N',
                ownerName: beneficiary.ownerName,
                property: propString,
                method: payment.paymentMethod?.toLowerCase() || 'N/A',
                bank: payment.bank || 'N/A',
                reference: payment.reference || 'N/A',
                date: format(pDate, 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                receivedAmount: formatCurrency(totalPagado),
                totalDebtPaid: formatCurrency(totalAbonadoEnDeudas),
                prevBalance: formatCurrency(saldoFavorAnterior),
                currentBalance: formatCurrency(saldoFavorActual),
                observations: payment.observations || 'Pago verificado y aplicado por la administración.',
                concepts
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
            const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCollectionName, ownerId));
            const ownerData = ownerSnap.exists() ? ownerSnap.data() : null;
            const propString = beneficiary.street && beneficiary.house ? `${beneficiary.street} - ${beneficiary.house}` : (ownerData?.properties?.[0] ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` : 'N/A');

            if (ownerConcepts.length === 0) {
                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('paymentId', '==', payment.id),
                    where('ownerId', '==', ownerId)
                ));
                
                ownerConcepts = debtsSnap.docs.map((d: any) => {
                    const data = d.data();
                    return {
                        ownerId: ownerId,
                        description: `${data.description} (${propString})`,
                        amountUSD: data.paidAmountUSD || data.amountUSD,
                        period: `${monthsLocale[data.month] || 'Mes'} ${data.year}`,
                        type: 'deuda'
                    } as LiquidatedConcept;
                });
                
                const totalPaidInDebtsUSD = ownerConcepts.reduce((sum, c) => sum + c.amountUSD, 0);
                const totalPaidInDebtsBs = totalPaidInDebtsUSD * payment.exchangeRate;
                const remainderBs = beneficiary.amount - totalPaidInDebtsBs;
                
                if (remainderBs > 0.05) {
                    ownerConcepts.push({
                        ownerId: ownerId,
                        description: `EXCEDENTE APLICADO A SALDO A FAVOR (${propString})`,
                        amountUSD: remainderBs / payment.exchangeRate,
                        period: 'SALDO',
                        type: 'abono'
                    });
                }
            } else {
                ownerConcepts = ownerConcepts.map(c => ({
                    ...c,
                    description: c.description.includes('(') ? c.description : `${c.description} (${propString})`
                }));
            }

            const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate as any) : new Date());
            const currentBalance = ownerData ? (ownerData.balance || 0) : 0;
            
            const transactionConcepts = ownerConcepts.filter(c => {
                if (c.type === 'abono' && !c.description.includes('EXCEDENTE')) {
                    return false;
                }
                return true;
            });

            const concepts = transactionConcepts.map(c => {
                const isAbonoExcedente = c.type === 'abono' && c.description.includes('EXCEDENTE');
                return [
                    c.period,
                    c.description.toUpperCase(),
                    isAbonoExcedente ? '' : `$${c.amountUSD.toFixed(2)}`,
                    formatCurrency(c.amountUSD * payment.exchangeRate)
                ];
            });

            const totalAbonadoEnDeudas = transactionConcepts.reduce((sum, c) => sum + (c.amountUSD * payment.exchangeRate), 0);
            const saldoFavorAnterior = Math.max(0, currentBalance - (beneficiary.amount - totalAbonadoEnDeudas));
            const saldoFavorActual = currentBalance;
            const totalPagado = beneficiary.amount;

            const data = {
                condoName: localCompanyInfo.name || 'CONDOMINIO',
                rif: localCompanyInfo.rif || 'J-40587208-0',
                receiptNumber: payment.receiptNumbers?.[ownerId] || 'S/N',
                ownerName: beneficiary.ownerName,
                property: propString,
                method: payment.paymentMethod?.toLowerCase() || 'N/A',
                bank: payment.bank || 'N/A',
                reference: payment.reference || 'N/A',
                date: format(pDate, 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                receivedAmount: formatCurrency(totalPagado),
                totalDebtPaid: formatCurrency(totalAbonadoEnDeudas),
                prevBalance: formatCurrency(saldoFavorAnterior),
                currentBalance: formatCurrency(saldoFavorActual),
                observations: payment.observations || 'Pago verificado y aplicado por la administración.',
                concepts
            };

            const blob = await generatePaymentReceipt(data, localCompanyInfo.logo, 'blob');
            if (blob && navigator.share) {
                const file = new File([blob as Blob], `Recibo_${beneficiary.ownerName.replace(/ /g, '_')}.pdf`, { type: 'application/pdf' });
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
                                <TableHeader className="bg-slate-800/20"><TableRow className="border-white/5">
                                    <TableHead className="px-8 py-6 text-[10px] font-black uppercase text-slate-400">Beneficiarios</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Fecha</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Monto</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Ref.</TableHead>
                                    <TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-400">Acción</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {filteredPayments.length === 0 ? (<TableRow><TableCell colSpan={5} className="h-40 text-center text-slate-500 font-bold italic uppercase text-[10px]">Sin reportes</TableCell></TableRow>) : 
                                    filteredPayments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-white/5 border-white/5 transition-colors">
                                            <TableCell className="px-8 py-6">
                                                <div className="font-black text-white text-xs uppercase italic">
                                                    {(p.beneficiaries || []).map(b => b.ownerName).filter(n => n).join(", ") || "Sin beneficiario"}
                                                </div>
                                                <div className="text-[9px] font-black text-primary uppercase mt-1">
                                                    {p.paymentMethod || "N/A"} • {p.bank || "N/A"}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-400 font-bold text-xs">{p.paymentDate?.toDate ? format(p.paymentDate.toDate(), 'dd/MM/yy') : 'N/A'}</TableCell>
                                            <TableCell className="font-black text-white text-lg italic">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                            <TableCell className="font-mono text-[10px] text-slate-500">{p.reference || 'N/A'}</TableCell>
                                            <TableCell className="text-right pr-8">
                                                <div className="flex justify-end items-center gap-2">
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
                                {(selectedPayment?.beneficiaries || []).map((b, i) => (
                                    <div key={b.ownerId + "_" + i} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
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

// ============================================
// REPORT PAYMENT COMPONENT
// ============================================

function ReportPaymentComponent() {
    const { toast } = useToast();
    const { user: authUser, ownerData: authOwnerData } = useAuth();
    const params = useParams();
    const condoId = params?.condoId as string;
    
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [extraordinaryDebts, setExtraordinaryDebts] = useState<any[]>([]);
    const [selectedOwnerForDebts, setSelectedOwnerForDebts] = useState<string | null>(null);
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
        if (!condoId || !selectedOwnerForDebts) return;
        
        const q = query(
            collection(db, 'condominios', condoId, 'owner_extraordinary_debts'),
            where('ownerId', '==', selectedOwnerForDebts),
            where('status', 'in', ['pending', 'partial'])
        );
        const unsubscribe = onSnapshot(q, (snap) => {
            const debts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setExtraordinaryDebts(debts);
        });
        return () => unsubscribe();
    }, [condoId, selectedOwnerForDebts]);

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

    const getTotalAssigned = () => {
        return beneficiaryRows.reduce((total, row) => {
            const rowTotal = (row.distributionLines || []).reduce((sum, line) => sum + (line.amount || 0), 0);
            return total + rowTotal;
        }, 0);
    };
    
    const totalAssigned = getTotalAssigned();
    const balance = (Number(totalAmount) || 0) - totalAssigned;

    const addDistributionLine = (rowId: string) => {
        setBeneficiaryRows(rows => rows.map(row => {
            if (row.id !== rowId) return row;
            const newLine: DistributionLine = {
                id: Date.now().toString(),
                category: 'ordinaria',
                amount: 0
            };
            return {
                ...row,
                distributionLines: [...(row.distributionLines || []), newLine]
            };
        }));
    };

    const updateDistributionLine = (rowId: string, lineId: string, updates: Partial<DistributionLine>) => {
        setBeneficiaryRows(rows => rows.map(row => {
            if (row.id !== rowId) return row;
            return {
                ...row,
                distributionLines: (row.distributionLines || []).map(line =>
                    line.id === lineId ? { ...line, ...updates } : line
                )
            };
        }));
    };

    const removeDistributionLine = (rowId: string, lineId: string) => {
        setBeneficiaryRows(rows => rows.map(row => {
            if (row.id !== rowId) return row;
            const newLines = (row.distributionLines || []).filter(line => line.id !== lineId);
            return {
                ...row,
                distributionLines: newLines.length > 0 ? newLines : [{ id: Date.now().toString(), category: 'ordinaria', amount: 0 }]
            };
        }));
    };

    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    
    const handleOwnerSelect = (rowId: string, owner: Owner) => {
        setSelectedOwnerForDebts(owner.id);
        updateBeneficiaryRow(rowId, { 
            owner, 
            searchTerm: '', 
            selectedProperty: owner.properties && owner.properties.length > 0 ? owner.properties[0] : null,
            distributionLines: [{ id: Date.now().toString(), category: 'ordinaria', amount: 0 }]
        });
    };

    const getFilteredOwnersFn = (searchTerm: string) => {
        if (searchTerm.length < 2) return [];
        return allOwners.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase()));
    };

    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { 
        id: Date.now().toString(), 
        owner: null, 
        searchTerm: '', 
        selectedProperty: null,
        distributionLines: [{ id: Date.now().toString(), category: 'ordinaria', amount: 0 }]
    }]);
    
    const removeBeneficiaryRow = (id: string) => setBeneficiaryRows(rows => rows.filter(row => row.id !== id));

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const imageUrl = await uploadToImgbb(file);
            if (imageUrl) {
                setReceiptImage(imageUrl);
                toast({ title: 'Comprobante subido', description: 'La imagen se ha subido correctamente.' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo subir el comprobante.' });
            }
        } catch (error) {
            console.error("Error subiendo comprobante:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Error al procesar el comprobante.' });
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser || !condoId || !exchangeRate || !totalAmount) {
            toast({ variant: 'destructive', title: 'Faltan datos', description: 'Monto y tasa son obligatorios.' });
            return;
        }
        
        const duplicateQuery = query(
            collection(db, 'condominios', condoId, 'payments'),
            where('reference', '==', reference),
            where('totalAmount', '==', Number(totalAmount)),
            where('paymentDate', '==', Timestamp.fromDate(paymentDate!)),
            where('reportedBy', '==', authUser?.uid)
        );
        const duplicateSnap = await getDocs(duplicateQuery);
        
        if (!duplicateSnap.empty) {
            toast({ 
                variant: 'destructive', 
                title: 'Pago Duplicado', 
                description: 'Ya existe un reporte de pago con la misma referencia, fecha y monto. Verifica antes de enviar nuevamente.' 
            });
            return;
        }
        
        const beneficiaries: any[] = [];
        for (const row of beneficiaryRows) {
            if (!row.owner) continue;
            for (const line of (row.distributionLines || [])) {
                if (line.amount > 0) {
                    const beneficiary: any = {
                        ownerId: row.owner.id,
                        ownerName: row.owner.name,
                        amount: line.amount,
                        category: line.category
                    };
                    
                    if (row.selectedProperty?.street) beneficiary.street = row.selectedProperty.street;
                    if (row.selectedProperty?.house) beneficiary.house = row.selectedProperty.house;
                    
                    if (line.category === 'extraordinaria' && line.extraordinaryDebtId) {
                        beneficiary.extraordinaryDebtId = line.extraordinaryDebtId;
                        beneficiary.isOwn = line.isOwn || false;
                    }
                    
                    beneficiaries.push(beneficiary);
                }
            }
        }
        
        if (beneficiaries.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe asignar al menos un monto a un beneficiario.' });
            return;
        }
        
        if (Math.abs(balance) > 0.01) {
            toast({ variant: 'destructive', title: 'Error de distribución', description: `La suma asignada (Bs. ${formatCurrency(totalAssigned)}) no coincide con el monto total (Bs. ${formatCurrency(Number(totalAmount))}).` });
            return;
        }
        
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "condominios", condoId, "payments"), { 
                reportedBy: authUser.uid, 
                beneficiaries,
                beneficiaryIds: [...new Set(beneficiaries.map(b => b.ownerId))], 
                totalAmount: Number(totalAmount), 
                exchangeRate, 
                paymentDate: paymentDate ? Timestamp.fromDate(paymentDate) : Timestamp.now(), 
                paymentMethod, 
                bank: paymentMethod === 'efectivo_bs' ? 'Efectivo' : bank, 
                reference: paymentMethod === 'efectivo_bs' ? 'EFECTIVO' : reference, 
                receiptUrl: receiptImage || "", 
                status: 'pendiente', 
                reportedAt: serverTimestamp() 
            });
            toast({ title: 'Reporte Enviado' });
            setTotalAmount(''); 
            setReference(''); 
            setReceiptImage(null); 
            setBeneficiaryRows([]);
        } catch (error) { 
            console.error(error);
            toast({ variant: "destructive", title: "Error" }); 
        } finally { 
            setIsSubmitting(false); 
        }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat italic">
            <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-white font-black uppercase italic text-2xl tracking-tighter">Reporte <span className="text-primary">Manual</span></CardTitle></CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 space-y-10">
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Fecha Pago</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left"><CalendarIcon className="mr-3 h-5 w-5 text-primary" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : "Seleccione"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 bg-slate-900 border-white/10"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} /></PopoverContent></Popover></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Tasa Bs.</Label><Input type="number" value={exchangeRate || ''} readOnly className="h-14 rounded-2xl bg-slate-800 border-none text-primary font-black italic" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Método</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}><SelectTrigger className="h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs"><SelectValue/></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white"><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem><SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem></SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Banco Emisor</Label><Button type="button" variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left" onClick={() => setIsBankModalOpen(true)} disabled={paymentMethod === 'efectivo_bs'}>{paymentMethod === 'efectivo_bs' ? 'EFECTIVO' : (bank || "Seleccionar...")}</Button></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))} disabled={paymentMethod === 'efectivo_bs'} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic" placeholder="6 DÍGITOS" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Monto Bs.</Label><Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black text-2xl italic text-right pr-6" placeholder="0,00" /></div>
                            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Equiv. USD</Label><div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" /><Input value={((parseFloat(totalAmount) || 0) / (exchangeRate || 1)).toFixed(2)} readOnly className="h-14 pl-9 rounded-2xl bg-slate-800 border-none text-emerald-500 font-black text-2xl italic text-right pr-6" /></div></div>
                        </div>
                        <div className="md:col-span-2 space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Soporte Digital (Opcional)</Label><Input type="file" accept="image/*" onChange={handleImageUpload} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-bold" /></div>
                    </div>
                    
                    <div className="space-y-6">
                        <Label className="text-[10px] font-black uppercase text-primary tracking-widest ml-2">Asignación de Beneficiarios</Label>
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
                                                        <div key={o.id} onClick={() => handleOwnerSelect(row.id, o)} className="p-4 hover:bg-white/5 cursor-pointer font-black text-sm uppercase text-white border-b border-white/5">
                                                            {o.name}
                                                        </div>
                                                    ))}
                                                </ScrollArea>
                                            </Card>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-black text-primary uppercase text-xs italic">{row.owner.name}</p>
                                                {row.selectedProperty && (
                                                    <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                                                        {row.selectedProperty.street} - {row.selectedProperty.house}
                                                    </p>
                                                )}
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} className="text-red-500 hover:bg-red-500/10 rounded-full">
                                                <XCircle className="h-5 w-5" />
                                            </Button>
                                        </div>
                                        
                                        {row.selectedProperty && row.owner.properties && row.owner.properties.length > 0 && (
                                            <Select onValueChange={(v) => {
                                                const found = row.owner?.properties.find(p => `${p.street}-${p.house}` === v);
                                                updateBeneficiaryRow(row.id, { selectedProperty: found || null });
                                            }} value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}>
                                                <SelectTrigger className="h-10 bg-slate-800 rounded-xl border-none text-white font-bold uppercase text-[10px]">
                                                    <SelectValue placeholder="Seleccionar propiedad..." />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 text-white border-white/10 italic">
                                                    {row.owner.properties.map((p, i) => (
                                                        <SelectItem key={i} value={`${p.street}-${p.house}`} className="text-[10px] font-black uppercase italic">{p.street} - {p.house}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        
                                        <div className="space-y-3">
                                            {(row.distributionLines || []).map((line, lineIdx) => (
                                                <div key={line.id} className="p-4 bg-slate-800 rounded-xl space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[8px] font-black text-primary bg-primary/20 px-2 py-0.5 rounded-full">Línea {lineIdx + 1}</span>
                                                            <Select value={line.category} onValueChange={(v: any) => updateDistributionLine(row.id, line.id, { category: v })}>
                                                                <SelectTrigger className="h-8 w-40 rounded-lg bg-slate-700 border-none text-white text-[10px]">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-slate-800 border-white/10">
                                                                    <SelectItem value="ordinaria" className="text-[10px]">Cuota de Condominio</SelectItem>
                                                                    <SelectItem value="extraordinaria" className="text-[10px]">Cuota Extraordinaria</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        {(row.distributionLines?.length || 0) > 1 && (
                                                            <Button variant="ghost" size="icon" onClick={() => removeDistributionLine(row.id, line.id)} className="text-red-500 h-6 w-6">
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                    
                                                    {line.category === 'extraordinaria' && (
                                                        <div className="space-y-2">
                                                            <Select value={line.extraordinaryDebtId} onValueChange={(v) => updateDistributionLine(row.id, line.id, { extraordinaryDebtId: v })}>
                                                                <SelectTrigger className="h-10 rounded-xl bg-slate-700 border-none text-white text-[10px]">
                                                                    <SelectValue placeholder="Seleccionar cuota extraordinaria..." />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-slate-800 border-white/10">
                                                                    {extraordinaryDebts.filter(d => d.ownerId === row.owner?.id).map(debt => (
                                                                        <SelectItem key={debt.id} value={debt.id} className="text-[10px]">
                                                                            {debt.description} (${formatUSD(debt.amountUSD)} USD)
                                                                            {debt.status === 'partial' && debt.pendingUSD && (
                                                                                <span className="text-yellow-400 ml-1">- Pendiente: ${formatUSD(debt.pendingUSD)}</span>
                                                                            )}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <div className="flex items-center gap-2">
                                                                <Checkbox
                                                                    checked={line.isOwn || false}
                                                                    onCheckedChange={(checked) => updateDistributionLine(row.id, line.id, { isOwn: !!checked })}
                                                                    className="border-primary data-[state=checked]:bg-primary"
                                                                />
                                                                <Label className="text-[8px] text-white/60">Es propio (no afecta balance)</Label>
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <Label className="text-[8px] font-black uppercase text-slate-500">Monto (Bs.)</Label>
                                                            <Input
                                                                type="number"
                                                                placeholder="0,00"
                                                                value={line.amount || ''}
                                                                onChange={(e) => updateDistributionLine(row.id, line.id, { amount: parseFloat(e.target.value) || 0 })}
                                                                className="h-10 rounded-xl bg-slate-700 border-none text-white font-black text-right"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[8px] font-black uppercase text-slate-500">Equivalente (USD)</Label>
                                                            <div className="h-10 rounded-xl bg-slate-700/50 flex items-center justify-end px-3">
                                                                <span className="text-emerald-400 font-black text-sm">
                                                                    ${formatUSD((line.amount || 0) / (exchangeRate || 1))}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            <Button type="button" variant="ghost" size="sm" onClick={() => addDistributionLine(row.id)} className="text-[10px] text-primary hover:bg-primary/10 w-full">
                                                <Plus className="h-3 w-3 mr-1" /> Agregar otra línea de pago
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} className="rounded-xl font-black uppercase text-[10px] border-white/10 text-slate-400 hover:bg-white/5">
                            <UserPlus className="mr-2 h-4 w-4 text-primary"/> Añadir Beneficiario
                        </Button>
                    </div>
                </CardContent>
                <CardFooter className="bg-white/5 p-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className={cn("font-black text-2xl italic tracking-tighter uppercase", balance !== 0 ? 'text-red-500' : 'text-emerald-500')}>
                        Diferencia: Bs. {formatCurrency(balance)}
                    </div>
                    <Button type="submit" disabled={isSubmitting || Math.abs(balance) > 0.01 || beneficiaryRows.length === 0} className="h-16 px-12 rounded-2xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95">
                        {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-5 w-5" />}
                        REGISTRAR PAGO Y ASENTAR
                    </Button>
                </CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(v) => { setBank(v); setIsBankModalOpen(false); }} />
        </Card>
    );
}

// ============================================
// CALCULATOR COMPONENT
// ============================================

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
            setAllOwners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Owner)).filter(o => o.email !== 'vallecondo@gmail.com').sort((a,b) => a.name.localeCompare(b.name)));
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
        const selectedAmountUSD = debts.filter(d => selectedDebts.includes(d.id)).reduce((sum, d) => sum + d.amountUSD, 0);
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
                                            {allOwners.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase())).map(o => (
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
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedOwner.properties.map(p => `${p.street} ${p.house}`).join(' | ')}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => { setSelectedOwner(null); setSelectedDebts([]); setSelectedAdvanceMonths([]); }} className="text-red-500 hover:bg-red-500/10 rounded-full h-12 w-12"><XCircle /></Button>
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
                                                        <Checkbox 
                                                            className="border-primary data-[state=checked]:bg-primary"
                                                            checked={selectedDebts.includes(d.id)} 
                                                            onCheckedChange={c => setSelectedDebts(p => c ? [...p, d.id] : p.filter(id => id !== d.id))}
                                                        />
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
                            <CardHeader className="bg-white/5 p-8 border-b border-white/5">
                                <CardTitle className="text-xl font-black uppercase italic tracking-tighter">3. Meses por Adelantado</CardTitle>
                                <CardDescription className="text-white/40 font-bold text-[10px] uppercase">Cuota actual: ${condoFee.toFixed(2)}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {futureMonths.map(month => (
                                        <Button 
                                            key={month.value}
                                            variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'}
                                            className={cn(
                                                "h-14 rounded-2xl font-black uppercase text-[10px] tracking-tighter transition-all",
                                                selectedAdvanceMonths.includes(month.value) ? "bg-primary text-slate-900" : "border-white/10 text-white hover:bg-white/5"
                                            )}
                                            onClick={() => setSelectedAdvanceMonths(p => p.includes(month.value) ? p.filter(m => m !== month.value) : [...p, month.value])}
                                        >
                                            {selectedAdvanceMonths.includes(month.value) && <Check className="h-3 w-3 mr-1" />}
                                            {month.label}
                                        </Button>
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
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase text-slate-400">Sub-Total Deuda</span>
                                <span className="font-black text-white italic">Bs. {formatCurrency(totals.subTotalBs)}</span>
                            </div>
                            <div className="flex justify-between items-center text-emerald-500">
                                <span className="text-[10px] font-black uppercase">(-) Saldo a Favor</span>
                                <span className="font-black italic">Bs. {formatCurrency(totals.balanceBs)}</span>
                            </div>
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

// ============================================
// PAYMENTS PAGE
// ============================================

function PaymentsPage() {
    const searchParams = useSearchParams();
    const condoId = useParams()?.condoId as string;
    const router = useRouter();
    const activeTab = searchParams?.get('tab') ?? 'verify';
    
    const [calcData, setCalcData] = useState<any>(null);

    const handleCalcReport = (data: any) => {
        setCalcData(data);
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
                <TabsList className="grid w-full grid-cols-3 bg-slate-800/50 h-16 rounded-2xl p-1 border border-white/5">
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

export default function PaymentsPageWrapper() {
    return (<Suspense fallback={<div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}><PaymentsPage /></Suspense>);
}
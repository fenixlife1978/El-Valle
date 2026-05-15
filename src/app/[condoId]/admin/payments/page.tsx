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
const CAJA_PRINCIPAL_ID = "fS0hdoWOyZBuTVuUJSic";

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

// ============================================
// FUNCIÓN DE CÁLCULO PRECISO PARA EL RECIBO
// ============================================
function calcularPagoReciboPreciso(params: {
    monto_pago_recibido_bs: number;
    tasa_cambio_bcv: number;
    total_deudas_liquidadas_usd: number;
    saldo_a_favor_anterior_bs: number;
}) {
    const montoPago = new Decimal(params.monto_pago_recibido_bs).toDecimalPlaces(2);
    const tasa = new Decimal(params.tasa_cambio_bcv).toDecimalPlaces(2);
    const totalDeudasUSD = new Decimal(params.total_deudas_liquidadas_usd).toDecimalPlaces(2);
    const saldoAnterior = new Decimal(params.saldo_a_favor_anterior_bs).toDecimalPlaces(2);

    const totalAbonadoEnDeudasBs = totalDeudasUSD.times(tasa).toDecimalPlaces(2);
    const excedenteDelPago = montoPago.minus(totalAbonadoEnDeudasBs).toDecimalPlaces(2);
    const nuevoSaldoFavor = saldoAnterior.plus(excedenteDelPago).toDecimalPlaces(2);

    return {
        monto_pago_recibido_bs: montoPago.toNumber(),
        total_abonado_en_deudas_bs: totalAbonadoEnDeudasBs.toNumber(),
        saldo_a_favor_anterior_bs: saldoAnterior.toNumber(),
        saldo_a_favor_actual_bs: nuevoSaldoFavor.toNumber(),
        excedente_del_pago_bs: excedenteDelPago.toNumber()
    };
}

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
    useEffect(() => {
        if (!condoId) return;
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
                let targetAccountId = isDigital ? BDV_ACCOUNT_ID : CAJA_PRINCIPAL_ID;
                let targetAccountName = isDigital ? "BANCO DE VENEZUELA" : "CAJA PRINCIPAL";
                if (isDolares && cuentasDolares.length > 0) {
                    targetAccountId = cuentasDolares[0].id;
                    targetAccountName = cuentasDolares[0].nombre;
                }
                const monthId = format(payment.paymentDate.toDate(), 'yyyy-MM');

                const settingsSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
                const currentFee = settingsSnap.exists() ? (settingsSnap.data().condoFee || 25) : 25;

                // ============================================
                // MOVER TODAS LAS LECTURAS FUERA DE LA TRANSACCIÓN
                // ============================================
                
                // Preparar datos de cuotas extraordinarias
                const extraordinaryPreparedData: any[] = [];
                for (const beneficiary of payment.beneficiaries) {
                    if (beneficiary.category === 'extraordinaria' && beneficiary.extraordinaryDebtId) {
                        const debtRef = doc(db, 'condominios', condoId, 'owner_extraordinary_debts', beneficiary.extraordinaryDebtId);
                        const debtSnap = await getDoc(debtRef);
                        
                        if (debtSnap.exists()) {
                            const debtData = debtSnap.data();
                            const totalAmountUSD = debtData.amountUSD;
                            const paidAmountUSD = isDolares ? beneficiary.amount : beneficiary.amount / payment.exchangeRate;
                            const campaignId = debtData.debtId;
                            const campaignName = debtData.description;
                            
                            let campaignAmountUSD = totalAmountUSD;
                            if (campaignId) {
                                const campaignRef = doc(db, 'condominios', condoId, 'extraordinary_campaigns', campaignId);
                                const campaignSnap = await getDoc(campaignRef);
                                if (campaignSnap.exists()) {
                                    campaignAmountUSD = campaignSnap.data().amountUSD;
                                }
                            }
                            
                            const pendingBeforePayment = debtData.pendingUSD !== undefined ? debtData.pendingUSD : totalAmountUSD;
                            const previouslyPaidUSD = debtData.amountPaidUSD || 0;
                            const totalPaidAfterThis = previouslyPaidUSD + paidAmountUSD;
                            const newPendingUSD = Math.max(0, totalAmountUSD - totalPaidAfterThis);
                            const isLiquidation = newPendingUSD <= 0.01;
                            
                            let newStatus: 'pending' | 'partial' | 'paid' = 'paid';
                            if (!isLiquidation && newPendingUSD > 0.01) {
                                newStatus = 'partial';
                            }
                            
                            extraordinaryPreparedData.push({
                                beneficiary,
                                debtRef,
                                debtData,
                                campaignId,
                                campaignName,
                                campaignAmountUSD,
                                paidAmountUSD,
                                newPendingUSD,
                                isLiquidation,
                                newStatus,
                                pendingBeforePayment,
                                totalPaidAfterThis
                            });
                        }
                    }
                }
                
                // Preparar datos de cuotas ordinarias
                const ordinaryPreparedData: any[] = [];
                for (const beneficiary of payment.beneficiaries) {
                    if (!beneficiary.category || beneficiary.category === 'ordinaria') {
                        const debtsSnap = await getDocs(query(
                            collection(db, 'condominios', condoId, 'debts'),
                            where('ownerId', '==', beneficiary.ownerId),
                            where('status', 'in', ['pending', 'vencida'])
                        ));
                        
                        const pendingDebts = debtsSnap.docs
                            .map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any))
                            .sort((a, b) => a.year - b.year || a.month - b.month);
                        
                        const allDebtsSnap = await getDocs(query(
                            collection(db, 'condominios', condoId, 'debts'),
                            where('ownerId', '==', beneficiary.ownerId)
                        ));
                        const allDebtsSorted = allDebtsSnap.docs
                            .map(d => d.data())
                            .sort((a, b) => a.year - b.year || a.month - b.month);
                        
                        ordinaryPreparedData.push({
                            beneficiary,
                            pendingDebts,
                            allDebtsSorted
                        });
                    }
                }

                // ============================================
                // AHORA SÍ, EJECUTAR LA TRANSACCIÓN (SOLO ESCRITURAS)
                // ============================================
                await runTransaction(db, async (transaction) => {
                    const ownerRefs = payment.beneficiaries.map(b => doc(db, 'condominios', condoId, ownersCollectionName, b.ownerId));
                    const ownerSnaps = await Promise.all(ownerRefs.map(ref => transaction.get(ref)));
                    
                    const receiptNumbers: { [ownerId: string]: string } = {};
                    const liquidatedConcepts: LiquidatedConcept[] = [];
                    const previousBalances: { [ownerId: string]: number } = {};

                    for (let i = 0; i < payment.beneficiaries.length; i++) {
                        const beneficiary = payment.beneficiaries[i];
                        const ownerSnap = ownerSnaps[i];
                        const ownerRef = ownerRefs[i];

                        if (!ownerSnap.exists()) continue;

                        // ============================================
                        // CUOTA EXTRAORDINARIA - CORREGIDO: FILTRAR POR ownerId Y extraordinaryDebtId
                        // ============================================
                        const extraordinaryData = extraordinaryPreparedData.find(d => 
                            d.beneficiary.ownerId === beneficiary.ownerId && 
                            d.beneficiary.extraordinaryDebtId === beneficiary.extraordinaryDebtId
                        );
                        
                        if (extraordinaryData) {
                            const { debtRef, campaignId, campaignName, campaignAmountUSD, paidAmountUSD, newPendingUSD, isLiquidation, newStatus, pendingBeforePayment, totalPaidAfterThis } = extraordinaryData;
                            const debtData = extraordinaryData.debtData;
                            
                            const partialPayment = {
                                amountUSD: paidAmountUSD,
                                amountBs: beneficiary.amount,
                                date: payment.paymentDate,
                                paymentId: payment.id,
                                isLiquidation: isLiquidation
                            };
                            
                            const existingPartialPayments = debtData.partialPayments || [];
                            const newAmountPaidBs = (debtData.amountPaidBs || 0) + beneficiary.amount;
                            
                            transaction.update(debtRef, {
                                status: newStatus,
                                pendingUSD: newPendingUSD,
                                paidAt: newStatus === 'paid' ? payment.paymentDate : null,
                                paymentId: newStatus === 'paid' ? payment.id : null,
                                partialPayments: [...existingPartialPayments, partialPayment],
                                amountPaidBs: newAmountPaidBs,
                                amountPaidUSD: totalPaidAfterThis,
                                updatedAt: serverTimestamp()
                            });
                            
                            const extraFundRef = doc(collection(db, 'condominios', condoId, 'extraordinary_funds'));
                            transaction.set(extraFundRef, {
                                tipo: 'ingreso',
                                monto: isDolares ? 0 : beneficiary.amount,
                                montoUSD: paidAmountUSD,
                                exchangeRate: payment.exchangeRate,
                                descripcion: isLiquidation 
                                    ? `PAGO CUOTA EXTRAORDINARIA: ${campaignName} [LIQUIDACIÓN TOTAL]`
                                    : `ABONO PARCIAL A CUOTA EXTRAORDINARIA: ${campaignName} - PENDIENTE: $${formatUSD(newPendingUSD)}`,
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
                            
                            liquidatedConcepts.push({
                                ownerId: beneficiary.ownerId,
                                description: isLiquidation 
                                    ? `CUOTA EXTRAORDINARIA: ${campaignName} [LIQUIDACIÓN TOTAL]`
                                    : `ABONO PARCIAL CUOTA EXTRAORDINARIA: ${campaignName}`,
                                amountUSD: paidAmountUSD,
                                period: format(payment.paymentDate.toDate(), 'MMMM yyyy', { locale: es }).toUpperCase(),
                                type: isLiquidation ? 'extraordinaria' : 'abono_extraordinaria'
                            });
                            
                            receiptNumbers[beneficiary.ownerId] = `REC-EXT-${Date.now().toString().substring(6)}-${beneficiary.ownerId.slice(-4)}`.toUpperCase();
                            transaction.update(ownerRef, { balance: ownerSnap.data().balance || 0 });
                            continue;
                        }
                        
                        // ============================================
                        // CUOTA ORDINARIA - USAR DATOS PREPARADOS
                        // ============================================
                        const ordinaryData = ordinaryPreparedData.find(d => d.beneficiary.ownerId === beneficiary.ownerId);
                        if (ordinaryData) {
                            const { pendingDebts, allDebtsSorted } = ordinaryData;
                            
                            // ✅ GUARDAR SALDO ANTERIOR (el balance que tiene AHORA antes de este pago)
                            const saldoAnteriorOwner = ownerSnap.data().balance || 0;
                            previousBalances[beneficiary.ownerId] = saldoAnteriorOwner;
                            
                            let funds = new Decimal(beneficiary.amount).plus(new Decimal(saldoAnteriorOwner));
                            
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
                        monto: isDolares ? 0 : payment.totalAmount,
                        montoUSD: isDolares ? payment.totalAmount : 0,
                        tipoCuenta: isDolares ? 'dolares' : 'bs', 
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
                        previousBalances,
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

    // ============================================
    // handleExportPDF CORREGIDO
    // Lee el saldo anterior desde previousBalances
    // ============================================
    const handleExportPDF = async (payment: Payment, ownerId: string) => {
        try {
            if (!localCompanyInfo) {
                toast({ variant: 'destructive', title: 'Error', description: 'Información de la empresa no disponible.' });
                return;
            }
            const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
            if (!beneficiary) return;

            // ✅ OBTENER SALDO ANTERIOR DESDE EL CAMPO GUARDADO DURANTE LIQUIDACIÓN
            const saldoAnteriorBs = payment.previousBalances?.[ownerId] ?? 0;

            // Obtener balance actual para referencia
            const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCollectionName, ownerId));
            const ownerData = ownerSnap.exists() ? ownerSnap.data() : null;
            const balanceActual = ownerData?.balance || 0;

            const propString = beneficiary.street && beneficiary.house 
                ? `${beneficiary.street} - ${beneficiary.house}` 
                : (ownerData?.properties?.[0] ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` : 'N/A');

            // OBTENER SOLO LAS DEUDAS LIQUIDADAS (sin el excedente)
            let deudasLiquidadas: LiquidatedConcept[] = (payment.liquidatedConcepts || [])
                .filter(c => c.ownerId === ownerId && (c.type === 'deuda' || c.type === 'adelanto' || c.type === 'extraordinaria'));
            
            if (deudasLiquidadas.length === 0) {
                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('paymentId', '==', payment.id),
                    where('ownerId', '==', ownerId)
                ));
                
                deudasLiquidadas = debtsSnap.docs.map((d: any) => {
                    const data = d.data();
                    return {
                        ownerId: ownerId,
                        description: `${data.description}`,
                        amountUSD: data.paidAmountUSD || data.amountUSD,
                        period: `${monthsLocale[data.month] || 'Mes'} ${data.year}`,
                        type: 'deuda'
                    } as LiquidatedConcept;
                });
            }

            const totalDeudasLiquidadasUSD = deudasLiquidadas.reduce((sum, c) => sum + c.amountUSD, 0);
            const excedenteBs = beneficiary.amount - (totalDeudasLiquidadasUSD * payment.exchangeRate);
            const tieneExcedente = excedenteBs > 0.01;

            // CONSTRUIR TABLA DE CONCEPTOS
            const isDol = (payment.paymentMethod || '').includes('usd') || (payment.paymentMethod || '').includes('dolares');
            const conceptosTabla: any[] = deudasLiquidadas.map(c => {
                const montoEnBs = c.amountUSD * payment.exchangeRate;
                return [
                    c.period,
                    c.description.toUpperCase(),
                    isDol ? '' : `$${c.amountUSD.toFixed(2)}`,
                    isDol ? `$ ${formatUSD(c.amountUSD)}` : formatCurrency(montoEnBs)
                ];
            });

            if (tieneExcedente) {
                conceptosTabla.push([
                    'REMANENTE',
                    'EXCEDENTE APLICADO A SALDO A FAVOR',
                    '',
                    formatCurrency(excedenteBs)
                ]);
            }

            // CÁLCULO PRECISO CON EL SALDO ANTERIOR CORRECTO
            const calculoPreciso = calcularPagoReciboPreciso({
                monto_pago_recibido_bs: beneficiary.amount,
                tasa_cambio_bcv: payment.exchangeRate,
                total_deudas_liquidadas_usd: totalDeudasLiquidadasUSD,
                saldo_a_favor_anterior_bs: saldoAnteriorBs
            });

            // GENERAR RECIBO
            const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate as any) : new Date());

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
                receivedAmount: formatCurrency(calculoPreciso.monto_pago_recibido_bs),
                totalDebtPaid: formatCurrency(calculoPreciso.total_abonado_en_deudas_bs),
                prevBalance: formatCurrency(calculoPreciso.saldo_a_favor_anterior_bs),
                currentBalance: formatCurrency(calculoPreciso.saldo_a_favor_actual_bs),
                observations: payment.observations || 'Pago verificado y aplicado por la administración.',
                concepts: conceptosTabla
            };

            await generatePaymentReceipt(data, localCompanyInfo.logo, 'download');
            toast({ title: "Recibo descargado" });
        } catch (error) {
            console.error("PDF Export Error:", error);
            toast({ variant: 'destructive', title: 'Error al generar PDF' });
        }
    };

    // ============================================
    // handleSharePDF CORREGIDO (misma lógica)
    // ============================================
    const handleSharePDF = async (payment: Payment, ownerId: string) => {
        try {
            if (!localCompanyInfo) {
                toast({ variant: 'destructive', title: 'Error', description: 'Información de la empresa no disponible.' });
                return;
            }
            const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
            if (!beneficiary) return;

            // ✅ OBTENER SALDO ANTERIOR DESDE EL CAMPO GUARDADO DURANTE LIQUIDACIÓN
            const saldoAnteriorBs = payment.previousBalances?.[ownerId] ?? 0;

            // Obtener balance actual para referencia
            const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCollectionName, ownerId));
            const ownerData = ownerSnap.exists() ? ownerSnap.data() : null;
            const balanceActual = ownerData?.balance || 0;

            const propString = beneficiary.street && beneficiary.house 
                ? `${beneficiary.street} - ${beneficiary.house}` 
                : (ownerData?.properties?.[0] ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` : 'N/A');

            let deudasLiquidadas: LiquidatedConcept[] = (payment.liquidatedConcepts || [])
                .filter(c => c.ownerId === ownerId && (c.type === 'deuda' || c.type === 'adelanto' || c.type === 'extraordinaria'));
            
            if (deudasLiquidadas.length === 0) {
                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('paymentId', '==', payment.id),
                    where('ownerId', '==', ownerId)
                ));
                
                deudasLiquidadas = debtsSnap.docs.map((d: any) => {
                    const data = d.data();
                    return {
                        ownerId: ownerId,
                        description: `${data.description}`,
                        amountUSD: data.paidAmountUSD || data.amountUSD,
                        period: `${monthsLocale[data.month] || 'Mes'} ${data.year}`,
                        type: 'deuda'
                    } as LiquidatedConcept;
                });
            }

            const totalDeudasLiquidadasUSD = deudasLiquidadas.reduce((sum, c) => sum + c.amountUSD, 0);
            const excedenteBs = beneficiary.amount - (totalDeudasLiquidadasUSD * payment.exchangeRate);
            const tieneExcedente = excedenteBs > 0.01;

            const isDol = (payment.paymentMethod || '').includes('usd') || (payment.paymentMethod || '').includes('dolares');
            const conceptosTabla: any[] = deudasLiquidadas.map(c => {
                const montoEnBs = c.amountUSD * payment.exchangeRate;
                return [
                    c.period,
                    c.description.toUpperCase(),
                    isDol ? '' : `$${c.amountUSD.toFixed(2)}`,
                    isDol ? `$ ${formatUSD(c.amountUSD)}` : formatCurrency(montoEnBs)
                ];
            });

            if (tieneExcedente) {
                conceptosTabla.push([
                    'REMANENTE',
                    'EXCEDENTE APLICADO A SALDO A FAVOR',
                    '',
                    formatCurrency(excedenteBs)
                ]);
            }

            const calculoPreciso = calcularPagoReciboPreciso({
                monto_pago_recibido_bs: beneficiary.amount,
                tasa_cambio_bcv: payment.exchangeRate,
                total_deudas_liquidadas_usd: totalDeudasLiquidadasUSD,
                saldo_a_favor_anterior_bs: saldoAnteriorBs
            });

            const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate as any) : new Date());

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
                receivedAmount: formatCurrency(calculoPreciso.monto_pago_recibido_bs),
                totalDebtPaid: formatCurrency(calculoPreciso.total_abonado_en_deudas_bs),
                prevBalance: formatCurrency(calculoPreciso.saldo_a_favor_anterior_bs),
                currentBalance: formatCurrency(calculoPreciso.saldo_a_favor_actual_bs),
                observations: payment.observations || 'Pago verificado y aplicado por la administración.',
                concepts: conceptosTabla
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

    // ✅ NUEVA FUNCIÓN: Comprobante de Efectivo para CAJA PRINCIPAL
    const handleExportCashReceipt = async (payment: Payment) => {
        try {
            if (!localCompanyInfo) {
                toast({ variant: 'destructive', title: 'Error', description: 'Información de la empresa no disponible.' });
                return;
            }
            
            // Obtener el nombre de todos los beneficiarios
            const beneficiaryNames = payment.beneficiaries.map(b => b.ownerName).join(', ');
            const firstBeneficiary = payment.beneficiaries[0];
            const property = firstBeneficiary?.street && firstBeneficiary?.house 
                ? `${firstBeneficiary.street} - ${firstBeneficiary.house}` 
                : 'N/A';
            
            const data = {
                condoName: localCompanyInfo.name || 'CONDOMINIO',
                rif: localCompanyInfo.rif || 'J-40587208-0',
                receiptNumber: `CASH-${payment.id.slice(-8).toUpperCase()}`,
                ownerName: beneficiaryNames,
                property: property,
                paymentDate: payment.paymentDate?.toDate ? format(payment.paymentDate.toDate(), 'dd/MM/yyyy') : 'N/A',
                amount: payment.totalAmount,
                exchangeRate: payment.exchangeRate,
                reference: payment.reference || 'EFECTIVO',
                observations: payment.observations || 'Pago en efectivo registrado en CAJA PRINCIPAL.'
            };
            
            await generateCashReceipt(data, localCompanyInfo.logo, 'download');
            toast({ title: "Comprobante generado", description: "Comprobante de efectivo descargado." });
        } catch (error) {
            console.error("Error generando comprobante de efectivo:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el comprobante.' });
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
                                            <TableCell className="font-black text-white text-lg italic">{(p.paymentMethod || '').includes('usd') || (p.paymentMethod || '').includes('dolares') ? `$ ${formatUSD(p.totalAmount)} USD` : `Bs. ${formatCurrency(p.totalAmount)}`}</TableCell>
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
                                                                            {p.beneficiaries.map(ben => (<DropdownMenuItem key={`${ben.ownerId}_${ben.category || ''}_${ben.extraordinaryDebtId || ''}`} onClick={() => handleExportPDF(p, ben.ownerId)} className="font-black uppercase text-[9px] p-2">{ben.ownerName}</DropdownMenuItem>))}
                                                                        </DropdownMenuSubContent></DropdownMenuPortal>
                                                                    </DropdownMenuSub>
                                                                    <DropdownMenuSub>
                                                                        <DropdownMenuSubTrigger className="font-black uppercase text-[10px] p-3 gap-2"><Share2 className="h-4 w-4 text-emerald-400" /> Compartir</DropdownMenuSubTrigger>
                                                                        <DropdownMenuPortal><DropdownMenuSubContent className="bg-slate-900 text-white border-white/10 italic">
                                                                            {p.beneficiaries.map(ben => (<DropdownMenuItem key={`${ben.ownerId}_${ben.category || ''}_${ben.extraordinaryDebtId || ''}`} onClick={() => handleSharePDF(p, ben.ownerId)} className="font-black uppercase text-[9px] p-2">{ben.ownerName}</DropdownMenuItem>))}
                                                                        </DropdownMenuSubContent></DropdownMenuPortal>
                                                                    </DropdownMenuSub>
                                                                    
                                                                    {/* ✅ NUEVO: Comprobante de Efectivo (solo si es efectivo_bs) */}
                                                                    {p.paymentMethod === 'efectivo_bs' && (
                                                                        <DropdownMenuItem 
                                                                            onClick={() => handleExportCashReceipt(p)} 
                                                                            className="font-black uppercase text-[10px] p-3 gap-2 text-amber-400"
                                                                        >
                                                                            <Receipt className="h-4 w-4" /> Comprobante Efectivo
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    
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
                                    <div key={`ben_${b.ownerId}_${i}`} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
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
                                            <div key={`concept_${concept.ownerId}_${idx}`} className="flex justify-between items-start gap-4 text-[10px]">
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
    const { user: authUser } = useAuth();
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
                bank: (paymentMethod === 'efectivo_bs' || isDolares) ? 'Efectivo' : bank, 
                reference: isDolares ? 'EFECTIVO USD' : paymentMethod === 'efectivo_bs' ? 'EFECTIVO' : reference, 
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
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Tasa Bs.</Label><Input type="number" value={isDolares ? '1.00' : (exchangeRate || '')} readOnly className="h-14 rounded-2xl bg-slate-800 border-none text-primary font-black italic" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Método</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}><SelectTrigger className="h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs"><SelectValue/></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white"><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem><SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem><SelectItem value="efectivo_usd">💲 Efectivo USD (Administrador)</SelectItem></SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Banco Emisor</Label><Button type="button" variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left" onClick={() => setIsBankModalOpen(true)} disabled={paymentMethod === 'efectivo_bs' || isDolares}>{isDolares ? 'EFECTIVO USD' : paymentMethod === 'efectivo_bs' ? 'EFECTIVO' : (bank || "Seleccionar...")}</Button></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))} disabled={paymentMethod === 'efectivo_bs' || isDolares} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic" placeholder="6 DÍGITOS" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">{isDolares ? 'Monto USD $' : 'Monto Bs.'}</Label><Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className={cn("h-14 rounded-2xl bg-slate-800 border-none font-black text-2xl italic text-right pr-6", isDolares ? "text-yellow-500" : "text-white")} placeholder="0,00" /></div>
                            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">{isDolares ? 'Equiv. Bs.' : 'Equiv. USD'}</Label><div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" /><Input value={isDolares ? formatCurrency((parseFloat(totalAmount) || 0) * (exchangeRate || 0)) : ((parseFloat(totalAmount) || 0) / (exchangeRate || 1)).toFixed(2)} readOnly className="h-14 pl-9 rounded-2xl bg-slate-800 border-none text-emerald-500 font-black text-2xl italic text-right pr-6" /></div></div>
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
                                                            <Label className="text-[8px] font-black uppercase text-slate-500">{isDolares ? 'Monto USD $' : 'Monto (Bs.)'}</Label>
                                                            <Input
                                                                type="number"
                                                                placeholder="0,00"
                                                                value={line.amount || ''}
                                                                onChange={(e) => updateDistributionLine(row.id, line.id, { amount: parseFloat(e.target.value) || 0 })}
                                                                className={cn("h-10 rounded-xl bg-slate-700 border-none font-black text-right", isDolares ? "text-yellow-500" : "text-white")}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[8px] font-black uppercase text-slate-500">{isDolares ? 'Equiv. Bs.' : 'Equiv. USD'}</Label>
                                                            <div className="h-10 rounded-xl bg-slate-700/50 flex items-center justify-end px-3">
                                                                <span className="text-emerald-400 font-black text-sm">
                                                                    {isDolares ? `Bs. ${formatCurrency((line.amount || 0) * (exchangeRate || 0))}` : `$${formatUSD((line.amount || 0) / (exchangeRate || 1))}`}
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
                        Diferencia: {isDolares ? `$ ${formatUSD(Math.abs(balance))}` : `Bs. ${formatCurrency(Math.abs(balance))}`}
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
// TRANSIT PAYMENTS COMPONENT
// ============================================

function TransitPaymentsComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [transitPayments, setTransitPayments] = useState<any[]>([]);
    const [isAddingTransit, setIsAddingTransit] = useState(false);
    const [isConciliating, setIsConciliating] = useState(false);
    const [selectedTransit, setSelectedTransit] = useState<any | null>(null);
    const [allOwners, setAllOwners] = useState<any[]>([]);
    const [extraordinaryDebts, setExtraordinaryDebts] = useState<any[]>([]);
    const [transitForm, setTransitForm] = useState({
        fecha: format(new Date(), 'yyyy-MM-dd'),
        monto: '',
        referencia: '',
        banco: '',
        metodo: 'transferencia',
        descripcion: ''
    });

    // Estados para el formulario de conciliación/distribución
    const [distributionRows, setDistributionRows] = useState<BeneficiaryRow[]>([]);
    const [selectedOwnerForDebts, setSelectedOwnerForDebts] = useState<string | null>(null);
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [isSubmittingDistribution, setIsSubmittingDistribution] = useState(false);
    const [historicalRateForDisplay, setHistoricalRateForDisplay] = useState<number | null>(null);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    // Cargar tasa de cambio
    useEffect(() => {
        if (!condoId) return;
        const fetchRate = async () => {
            const docSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            if (docSnap.exists()) {
                const allRates = (docSnap.data().exchangeRates || []);
                const applicable = allRates.filter((r: any) => r.date <= format(new Date(), 'yyyy-MM-dd')).sort((a: any, b: any) => b.date.localeCompare(a.date));
                setExchangeRate(applicable.length > 0 ? applicable[0].rate : null);
            }
        };
        fetchRate();
    }, [condoId]);

    // Cargar pagos en tránsito
    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, 'transit_payments'), orderBy('fecha', 'desc'));
        return onSnapshot(q, (snap) => {
            setTransitPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
    }, [condoId]);

    // Cargar propietarios
    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, ownersCollectionName), where('role', '==', 'propietario'));
        return onSnapshot(q, (snap) => {
            setAllOwners(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [condoId]);

    // Cargar cuotas extraordinarias cuando se selecciona un propietario para distribuir
    useEffect(() => {
        if (!condoId || !selectedOwnerForDebts) return;
        const q = query(
            collection(db, 'condominios', condoId, 'owner_extraordinary_debts'),
            where('ownerId', '==', selectedOwnerForDebts),
            where('status', 'in', ['pending', 'partial'])
        );
        return onSnapshot(q, (snap) => {
            setExtraordinaryDebts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    }, [condoId, selectedOwnerForDebts]);

    const handleAddTransit = async () => {
        if (!transitForm.monto || !transitForm.referencia || !transitForm.banco) {
            toast({ variant: 'destructive', title: 'Error', description: 'Complete monto, referencia y banco.' });
            return;
        }
        setIsAddingTransit(true);
        try {
            const montoNum = parseFloat(transitForm.monto);

            // Crear el pago en tránsito
            const transitRef = await addDoc(collection(db, 'condominios', condoId, 'transit_payments'), {
                fecha: Timestamp.fromDate(new Date(transitForm.fecha + 'T00:00:00')),
                monto: montoNum,
                referencia: transitForm.referencia,
                banco: transitForm.banco,
                metodo: transitForm.metodo,
                descripcion: transitForm.descripcion.toUpperCase() || 'PAGO EN TRÁNSITO',
                status: 'pendiente',
                createdBy: user?.email,
                createdAt: serverTimestamp()
            });

            // ✅ Buscar cuenta BANCO DE VENEZUELA
            const cuentaBanco = await getDocs(query(
                collection(db, 'condominios', condoId, 'cuentas'),
                where('nombre', '==', 'BANCO DE VENEZUELA')
            ));

            if (!cuentaBanco.empty) {
                const bancoId = cuentaBanco.docs[0].id;
                const bancoNombre = cuentaBanco.docs[0].data().nombre;

                await runTransaction(db, async (transaction) => {
                    const transRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                    transaction.set(transRef, {
                        monto: montoNum,
                        tipo: 'ingreso',
                        cuentaId: bancoId,
                        nombreCuenta: bancoNombre,
                        descripcion: `PAGO EN TRÁNSITO: REF ${transitForm.referencia} - ${transitForm.banco}`.toUpperCase(),
                        referencia: transitForm.referencia,
                        fecha: Timestamp.fromDate(new Date(transitForm.fecha + 'T00:00:00')),
                        sourcePaymentId: transitRef.id,
                        transitPaymentId: transitRef.id,
                        tipoCuenta: 'bs',
                        esTransito: true,
                        createdAt: serverTimestamp(),
                        createdBy: user?.email
                    });

                    const cuentaRef = doc(db, 'condominios', condoId, 'cuentas', bancoId);
                    transaction.update(cuentaRef, { saldoActual: increment(montoNum) });
                });
            }

            toast({ title: 'Pago en tránsito registrado', description: 'Movimiento asentado en el libro diario del banco.' });
            setTransitForm({ fecha: format(new Date(), 'yyyy-MM-dd'), monto: '', referencia: '', banco: '', metodo: 'transferencia', descripcion: '' });
        } catch (e) { toast({ variant: 'destructive', title: 'Error' }); }
        finally { setIsAddingTransit(false); }
    };

    // ============================================
    // CONCILIAR CON DISTRIBUCIÓN
    // ============================================
    const handleOpenConciliateDialog = async (transit: any) => {
        setSelectedTransit(transit);
        
        // Calcular tasa histórica para mostrar
        let historicalRate = exchangeRate;
        if (transit.fecha?.toDate) {
            const transitDate = transit.fecha.toDate();
            const transitDateStr = format(transitDate, 'yyyy-MM-dd');
            const settingsSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            if (settingsSnap.exists()) {
                const allRates = (settingsSnap.data().exchangeRates || []);
                const applicable = allRates.filter((r: any) => r.date <= transitDateStr).sort((a: any, b: any) => b.date.localeCompare(a.date));
                if (applicable.length > 0) historicalRate = applicable[0].rate;
            }
        }
        setHistoricalRateForDisplay(historicalRate);
        
        // Inicializar una fila de distribución para el formulario
        setDistributionRows([{
            id: Date.now().toString(),
            owner: null,
            searchTerm: '',
            selectedProperty: null,
            distributionLines: [{ id: Date.now().toString(), category: 'ordinaria', amount: 0 }]
        }]);
    };

    const addDistributionRow = () => {
        setDistributionRows(rows => [...rows, {
            id: Date.now().toString(),
            owner: null,
            searchTerm: '',
            selectedProperty: null,
            distributionLines: [{ id: Date.now().toString(), category: 'ordinaria', amount: 0 }]
        }]);
    };

    const removeDistributionRow = (rowId: string) => {
        setDistributionRows(rows => rows.filter(r => r.id !== rowId));
    };

    const updateDistributionRow = (rowId: string, updates: Partial<BeneficiaryRow>) => {
        setDistributionRows(rows => rows.map(r => r.id === rowId ? { ...r, ...updates } : r));
    };

    const handleOwnerSelectForDistribution = (rowId: string, owner: any) => {
        setSelectedOwnerForDebts(owner.id);
        updateDistributionRow(rowId, {
            owner,
            searchTerm: '',
            selectedProperty: owner.properties?.[0] || null,
            distributionLines: [{ id: Date.now().toString(), category: 'ordinaria', amount: 0 }]
        });
    };

    const addDistributionLine = (rowId: string) => {
        setDistributionRows(rows => rows.map(row => {
            if (row.id !== rowId) return row;
            return { ...row, distributionLines: [...(row.distributionLines || []), { id: Date.now().toString(), category: 'ordinaria', amount: 0 }] };
        }));
    };

    const updateDistributionLineAmount = (rowId: string, lineId: string, amount: number) => {
        setDistributionRows(rows => rows.map(row => {
            if (row.id !== rowId) return row;
            return {
                ...row,
                distributionLines: (row.distributionLines || []).map(line =>
                    line.id === lineId ? { ...line, amount } : line
                )
            };
        }));
    };

    const updateDistributionLineCategory = (rowId: string, lineId: string, category: 'ordinaria' | 'extraordinaria') => {
        setDistributionRows(rows => rows.map(row => {
            if (row.id !== rowId) return row;
            return {
                ...row,
                distributionLines: (row.distributionLines || []).map(line =>
                    line.id === lineId ? { ...line, category, extraordinaryDebtId: undefined } : line
                )
            };
        }));
    };

    const updateDistributionLineDebt = (rowId: string, lineId: string, extraordinaryDebtId: string) => {
        setDistributionRows(rows => rows.map(row => {
            if (row.id !== rowId) return row;
            return {
                ...row,
                distributionLines: (row.distributionLines || []).map(line =>
                    line.id === lineId ? { ...line, extraordinaryDebtId } : line
                )
            };
        }));
    };

    const removeDistributionLine = (rowId: string, lineId: string) => {
        setDistributionRows(rows => rows.map(row => {
            if (row.id !== rowId) return row;
            return { ...row, distributionLines: (row.distributionLines || []).filter(l => l.id !== lineId) };
        }));
    };

    const getTotalAssigned = () => {
        return distributionRows.reduce((total, row) => {
            return total + (row.distributionLines || []).reduce((sum, line) => sum + (line.amount || 0), 0);
        }, 0);
    };

    const handleSubmitDistribution = async () => {
        if (!selectedTransit || !exchangeRate) return;
        
        // ✅ Obtener la tasa de cambio de la fecha del pago en transito
        let transitExchangeRate = exchangeRate;
        if (selectedTransit.fecha?.toDate) {
            const transitDate = selectedTransit.fecha.toDate();
            const transitDateStr = format(transitDate, 'yyyy-MM-dd');
            const settingsSnap2 = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            if (settingsSnap2.exists()) {
                const allRates = (settingsSnap2.data().exchangeRates || []);
                const applicable = allRates.filter((r: any) => r.date <= transitDateStr).sort((a: any, b: any) => b.date.localeCompare(a.date));
                if (applicable.length > 0) transitExchangeRate = applicable[0].rate;
            }
        }

        const totalAssigned = getTotalAssigned();
        if (Math.abs(totalAssigned - selectedTransit.monto) > 0.01) {
            toast({ variant: 'destructive', title: 'Error', description: `La suma asignada (Bs. ${formatCurrency(totalAssigned)}) no coincide con el monto del pago (Bs. ${formatCurrency(selectedTransit.monto)}).` });
            return;
        }

        setIsSubmittingDistribution(true);
        try {
            // 1. Crear beneficiarios
            const beneficiaries: any[] = [];
            for (const row of distributionRows) {
                if (!row.owner) continue;
                for (const line of (row.distributionLines || [])) {
                    if (line.amount > 0) {
                        const b: any = { ownerId: row.owner.id, ownerName: row.owner.name, amount: line.amount, category: line.category };
                        if (row.selectedProperty?.street) b.street = row.selectedProperty.street;
                        if (row.selectedProperty?.house) b.house = row.selectedProperty.house;
                        if (line.category === 'extraordinaria' && line.extraordinaryDebtId) b.extraordinaryDebtId = line.extraordinaryDebtId;
                        beneficiaries.push(b);
                    }
                }
            }

            if (beneficiaries.length === 0) {
                toast({ variant: 'destructive', title: 'Error', description: 'Asigne al menos un beneficiario.' });
                setIsSubmittingDistribution(false);
                return;
            }

            // 2. Crear registro de pago (payment) como si fuera un reporte manual
            const paymentRef = await addDoc(collection(db, 'condominios', condoId, 'payments'), {
                reportedBy: user?.uid,
                beneficiaries,
                beneficiaryIds: [...new Set(beneficiaries.map(b => b.ownerId))],
                totalAmount: selectedTransit.monto,
                exchangeRate: transitExchangeRate,
                paymentMethod: selectedTransit.metodo,
                bank: selectedTransit.banco,
                reference: selectedTransit.referencia,
                paymentDate: selectedTransit.fecha,
                status: 'aprobado', // Se aprueba automáticamente
                receiptUrl: '',
                observations: `PAGO EN TRÁNSITO CONCILIADO. ${selectedTransit.descripcion || ''}`.toUpperCase(),
                isTransitConciliation: true,
                transitPaymentId: selectedTransit.id,
                reportedAt: serverTimestamp()
            });

            // 3. Liquidar deudas (cuotas ordinarias y extraordinarias)
            const liquidatedConcepts: any[] = [];
            const settingsSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            const currentFee = settingsSnap.exists() ? (settingsSnap.data().condoFee || 25) : 25;

            for (const beneficiary of beneficiaries) {
                const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId));
                const ownerData = ownerSnap.data();
                let funds = new Decimal(beneficiary.amount).plus(new Decimal(ownerData?.balance || 0));

                // Cuota extraordinaria
                if (beneficiary.category === 'extraordinaria' && beneficiary.extraordinaryDebtId) {
                    const debtRef = doc(db, 'condominios', condoId, 'owner_extraordinary_debts', beneficiary.extraordinaryDebtId);
                    const debtSnap = await getDoc(debtRef);
                    if (debtSnap.exists()) {
                        const debtData = debtSnap.data();
                        const paidAmountUSD = beneficiary.amount / transitExchangeRate;
                        const totalAmountUSD = debtData.amountUSD;
                        const previouslyPaidUSD = debtData.amountPaidUSD || 0;
                        const totalPaidAfterThis = previouslyPaidUSD + paidAmountUSD;
                        const newPendingUSD = Math.max(0, totalAmountUSD - totalPaidAfterThis);
                        const isLiquidation = newPendingUSD <= 0.01;
                        const newStatus = isLiquidation ? 'paid' : 'partial';

                        await updateDoc(debtRef, {
                            status: newStatus,
                            pendingUSD: newPendingUSD,
                            paidAt: isLiquidation ? selectedTransit.fecha : null,
                            paymentId: isLiquidation ? paymentRef.id : null,
                            amountPaidBs: (debtData.amountPaidBs || 0) + beneficiary.amount,
                            amountPaidUSD: totalPaidAfterThis,
                            updatedAt: serverTimestamp()
                        });

                        liquidatedConcepts.push({
                            ownerId: beneficiary.ownerId,
                            description: isLiquidation ? `CUOTA EXTRAORDINARIA: ${debtData.description} [LIQUIDACIÓN TOTAL]` : `ABONO PARCIAL CUOTA EXTRAORDINARIA: ${debtData.description}`,
                            amountUSD: paidAmountUSD,
                            period: format(selectedTransit.fecha.toDate(), 'MMMM yyyy', { locale: es }).toUpperCase(),
                            type: isLiquidation ? 'extraordinaria' : 'abono_extraordinaria'
                        });
                    }
                    continue;
                }

                // Cuotas ordinarias
                const debtsSnap = await getDocs(query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('ownerId', '==', beneficiary.ownerId),
                    where('status', 'in', ['pending', 'vencida'])
                ));
                const pendingDebts = debtsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any))
                    .sort((a, b) => a.year - b.year || a.month - b.month);

                for (const debt of pendingDebts) {
                    const debtAmountBs = new Decimal(debt.amountUSD).times(new Decimal(transitExchangeRate));
                    if (funds.gte(debtAmountBs)) {
                        funds = funds.minus(debtAmountBs);
                        await updateDoc(debt.ref, {
                            status: 'paid',
                            paidAmountUSD: debt.amountUSD,
                            paymentDate: selectedTransit.fecha,
                            paymentId: paymentRef.id
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

                const advanceAmountBs = new Decimal(currentFee).times(transitExchangeRate);
                if (funds.gte(advanceAmountBs)) {
                    let nextMonthDate = addMonths(new Date(), 1);
                    while (funds.gte(advanceAmountBs)) {
                        const year = nextMonthDate.getFullYear(), month = nextMonthDate.getMonth() + 1;
                        await addDoc(collection(db, 'condominios', condoId, 'debts'), {
                            ownerId: beneficiary.ownerId,
                            property: { street: beneficiary.street || '', house: beneficiary.house || '' },
                            year, month, amountUSD: currentFee,
                            description: 'Cuota de Condominio (Adelantado)',
                            status: 'paid', paidAmountUSD: currentFee,
                            paymentDate: selectedTransit.fecha, paymentId: paymentRef.id, published: true
                        });
                        liquidatedConcepts.push({
                            ownerId: beneficiary.ownerId,
                            description: `CUOTA ADELANTADA (${beneficiary.street || ''} ${beneficiary.house || ''})`,
                            amountUSD: currentFee,
                            period: `${monthsLocale[month]} ${year}`, type: 'adelanto'
                        });
                        funds = funds.minus(advanceAmountBs);
                        nextMonthDate = addMonths(nextMonthDate, 1);
                    }
                }

                if (funds.gt(0)) {
                    liquidatedConcepts.push({
                        ownerId: beneficiary.ownerId,
                        description: `EXCEDENTE A SALDO A FAVOR (${beneficiary.street || ''} ${beneficiary.house || ''})`,
                        amountUSD: funds.div(transitExchangeRate).toNumber(),
                        period: 'SALDO', type: 'abono'
                    });
                }
            }

            // 4. Actualizar el payment con los conceptos liquidados
            await updateDoc(doc(db, 'condominios', condoId, 'payments', paymentRef.id), {
                liquidatedConcepts,
                receiptNumbers: Object.fromEntries(beneficiaries.map(b => [b.ownerId, `REC-TRANSIT-${Date.now().toString(36).toUpperCase()}`]))
            });

            // 5. Marcar el pago en tránsito como conciliado
            await updateDoc(doc(db, 'condominios', condoId, 'transit_payments', selectedTransit.id), {
                status: 'conciliado',
                ownerId: beneficiaries[0]?.ownerId,
                ownerName: beneficiaries[0]?.ownerName,
                paymentId: paymentRef.id,
                conciliatedBy: user?.email,
                conciliatedAt: serverTimestamp()
            });

            toast({ title: 'Pago conciliado y distribuido', description: `${beneficiaries.length} beneficiario(s) procesado(s).` });
            setSelectedTransit(null);
            setDistributionRows([]);
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar la conciliación.' });
        } finally {
            setIsSubmittingDistribution(false);
        }
    };

    const handleDeleteTransit = async (transit: any) => {
        if (!condoId || !transit) return;
        setIsConciliating(true);
        try {
            const txSnap = await getDocs(query(
                collection(db, 'condominios', condoId, 'transacciones'),
                where('transitPaymentId', '==', transit.id)
            ));
            
            await runTransaction(db, async (transaction) => {
                for (const txDoc of txSnap.docs) {
                    const txData = txDoc.data();
                    if (txData.cuentaId) {
                        const cuentaRef = doc(db, 'condominios', condoId, 'cuentas', txData.cuentaId);
                        transaction.update(cuentaRef, { saldoActual: increment(-txData.monto) });
                    }
                    transaction.delete(txDoc.ref);
                }
                transaction.delete(doc(db, 'condominios', condoId, 'transit_payments', transit.id));
            });
            
            toast({ title: 'Pago en tránsito eliminado', description: 'El movimiento contable ha sido revertido.' });
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar.' });
        } finally {
            setIsConciliating(false);
        }
    };

    const handleExportTransitPDF = async (type: 'pendiente' | 'conciliado' | 'all') => {
        const filtered = transitPayments.filter(t => type === 'all' ? true : t.status === type);
        const total = filtered.reduce((s, t) => s + t.monto, 0);
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pagos en Tránsito - ${type.toUpperCase()}</title>
        <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Helvetica,sans-serif;margin:20px;background:white}h1{text-align:center;font-size:20px;margin-bottom:10px}.summary{display:flex;gap:20px;margin-bottom:20px}.card{flex:1;background:#f8fafc;padding:12px;border-radius:8px;text-align:center;border-left:4px solid #F28705}.card label{font-size:10px;color:#64748b;text-transform:uppercase}.card value{font-size:16px;font-weight:900}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#1A1D23;color:white;padding:10px}td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:center}.text-left{text-align:left}.text-right{text-align:right}.footer{margin-top:20px;text-align:center;font-size:8px;color:#94a3b8}</style></head><body>
        <h1>PAGOS EN TRÁNSITO - ${type.toUpperCase()}</h1>
        <div class="summary"><div class="card"><label>Total Pagos</label><value>${filtered.length}</value></div><div class="card"><label>Monto Total</label><value>Bs. ${total.toLocaleString('es-VE', {minimumFractionDigits:2})}</value></div></div>
        <table><thead><tr><th>Fecha</th><th>Referencia</th><th>Banco</th><th>Método</th><th class="text-left">Descripción</th><th class="text-right">Monto</th><th>Estado</th><th>Propietario</th></tr></thead><tbody>
        ${filtered.map(t => `<tr><td>${t.fecha?.toDate ? format(t.fecha.toDate(), 'dd/MM/yy') : 'N/A'}</td><td>${t.referencia}</td><td>${t.banco}</td><td>${t.metodo}</td><td class="text-left">${t.descripcion || '-'}</td><td class="text-right">Bs. ${formatCurrency(t.monto)}</td><td>${t.status === 'conciliado' ? 'CONCILIADO' : 'PENDIENTE'}</td><td>${t.ownerName || '-'}</td>`).join('')}
        </tbody>}在这个<div class="footer"><p>EFASCondoSys - Pagos en Tránsito</p></div></body></html>`;
        downloadPDF(html, `Pagos_Transito_${type}_${format(new Date(), 'yyyy_MM_dd')}.pdf`);
    };

    const totalAssigned = getTotalAssigned();
    const balanceTransit = selectedTransit ? selectedTransit.monto - totalAssigned : 0;

    const getFilteredOwnersFn = (searchTerm: string) => {
        if (searchTerm.length < 2) return [];
        return allOwners.filter(o => o.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat italic">
            <CardHeader className="bg-white/5 p-8 border-b border-white/5 flex flex-row justify-between items-center">
                <CardTitle className="text-white font-black uppercase italic text-2xl tracking-tighter">Pagos en <span className="text-amber-400">Tránsito</span></CardTitle>
                <div className="flex gap-2">
                    <Button onClick={() => handleExportTransitPDF('pendiente')} variant="outline" size="sm" className="rounded-xl border-yellow-500/30 text-yellow-400 font-black uppercase text-[9px]"><Download className="mr-1 h-3 w-3" /> Pendientes</Button>
                    <Button onClick={() => handleExportTransitPDF('conciliado')} variant="outline" size="sm" className="rounded-xl border-emerald-500/30 text-emerald-400 font-black uppercase text-[9px]"><Download className="mr-1 h-3 w-3" /> Conciliados</Button>
                    <Button onClick={() => handleExportTransitPDF('all')} variant="outline" size="sm" className="rounded-xl border-sky-500/30 text-sky-400 font-black uppercase text-[9px]"><Download className="mr-1 h-3 w-3" /> Todo</Button>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                {/* FORMULARIO PARA AGREGAR PAGO EN TRÁNSITO */}
                <div className="bg-slate-800/50 p-6 rounded-3xl border border-white/5">
                    <h3 className="font-black text-white text-sm uppercase mb-4">Registrar Pago en Tránsito</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Input type="date" value={transitForm.fecha} onChange={e => setTransitForm({...transitForm, fecha: e.target.value})} className="rounded-xl bg-slate-700 border-none text-white" />
                        <Input type="number" placeholder="Monto Bs." value={transitForm.monto} onChange={e => setTransitForm({...transitForm, monto: e.target.value})} className="rounded-xl bg-slate-700 border-none text-white" />
                        <Input placeholder="Referencia" value={transitForm.referencia} onChange={e => setTransitForm({...transitForm, referencia: e.target.value})} className="rounded-xl bg-slate-700 border-none text-white" />
                        <Input placeholder="Banco" value={transitForm.banco} onChange={e => setTransitForm({...transitForm, banco: e.target.value})} className="rounded-xl bg-slate-700 border-none text-white" />
                        <Select value={transitForm.metodo} onValueChange={v => setTransitForm({...transitForm, metodo: v})}>
                            <SelectTrigger className="rounded-xl bg-slate-700 border-none text-white"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-slate-800 border-white/10 text-white">
                                <SelectItem value="transferencia">Transferencia</SelectItem>
                                <SelectItem value="movil">Pago Móvil</SelectItem>
                                <SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input placeholder="Descripción (opcional)" value={transitForm.descripcion} onChange={e => setTransitForm({...transitForm, descripcion: e.target.value})} className="rounded-xl bg-slate-700 border-none text-white md:col-span-3" />
                    </div>
                    <Button onClick={handleAddTransit} disabled={isAddingTransit} className="mt-4 rounded-xl bg-amber-600 text-white font-black uppercase text-[10px]">
                        {isAddingTransit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Registrar Tránsito
                    </Button>
                </div>

                {/* TABLA DE PAGOS EN TRÁNSITO */}
                <div className="overflow-x-auto"><Table><TableHeader className="bg-slate-800/30"><TableRow className="border-white/5">
                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Fecha</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Referencia</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Banco</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Método</TableHead>
                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">Monto</TableHead>
                    <TableHead className="text-center text-[10px] font-black uppercase text-slate-400">Estado</TableHead>
                    <TableHead className="text-center text-[10px] font-black uppercase text-slate-400">Propietario</TableHead>
                    <TableHead className="text-center text-[10px] font-black uppercase text-slate-400">Acción</TableHead>
                </TableRow></TableHeader><TableBody>
                {transitPayments.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-500">No hay pagos en tránsito</TableCell></TableRow> :
                transitPayments.map(tp => (
                    <TableRow key={tp.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="text-white text-xs">{tp.fecha?.toDate ? format(tp.fecha.toDate(), 'dd/MM/yy') : 'N/A'}</TableCell>
                        <TableCell className="text-white font-mono text-xs">{tp.referencia}</TableCell>
                        <TableCell className="text-white text-xs">{tp.banco}</TableCell>
                        <TableCell className="text-white text-xs">{tp.metodo}</TableCell>
                        <TableCell className="text-right text-white font-black">Bs. {formatCurrency(tp.monto)}</TableCell>
                        <TableCell className="text-center"><Badge className={tp.status === 'conciliado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}>{tp.status === 'conciliado' ? 'CONCILIADO' : 'PENDIENTE'}</Badge></TableCell>
                        <TableCell className="text-center text-white text-[9px]">{tp.ownerName || '-'}</TableCell>
                        <TableCell className="text-center">
                            {tp.status === 'pendiente' && (
                                <>
                                    <Button variant="ghost" size="sm" onClick={() => handleOpenConciliateDialog(tp)} className="text-amber-400 text-[9px]">Conciliar</Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteTransit(tp)} className="text-red-500 hover:bg-red-500/10 h-7 w-7 ml-2"><Trash2 className="h-3 w-3" /></Button>
                                </>
                            )}
                            {tp.status === 'conciliado' && (
                                <span className="text-emerald-400 text-[9px]">✓</span>
                            )}
                        
                     </TableCell>
                    </TableRow>
                ))}
                </TableBody></Table></div>
            </CardContent>

            {/* DIÁLOGO PARA CONCILIAR CON DISTRIBUCIÓN */}
            <Dialog open={!!selectedTransit} onOpenChange={() => { setSelectedTransit(null); setDistributionRows([]); }}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase">Conciliar y Distribuir Pago</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Asigne el pago en tránsito a uno o más beneficiarios. No se creará un nuevo movimiento bancario.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="bg-slate-800 p-4 rounded-xl">
                            <p className="text-[10px] text-slate-400">Referencia: <span className="text-white font-black">{selectedTransit?.referencia}</span></p>
                            <p className="text-[10px] text-slate-400">Monto a distribuir: <span className="text-amber-400 font-black">Bs. {formatCurrency(selectedTransit?.monto || 0)}</span></p>
                            <p className="text-[10px] text-slate-400">Tasa: <span className="text-white">{historicalRateForDisplay ? `Bs. ${formatCurrency(historicalRateForDisplay)}` : 'Cargando...'}</span></p>
                        </div>

                        {/* FORMULARIO DE DISTRIBUCIÓN */}
                        <div className="space-y-4">
                            <Label className="text-[10px] font-black uppercase text-amber-400">Asignación de Beneficiarios</Label>
                            {distributionRows.map((row) => (
                                <div key={row.id} className="p-4 bg-slate-800/50 rounded-xl space-y-3">
                                    {!row.owner ? (
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                            <Input placeholder="Buscar Residente..." className="pl-9 rounded-xl bg-slate-700 border-none text-white text-sm" value={row.searchTerm} onChange={(e) => updateDistributionRow(row.id, { searchTerm: e.target.value })} />
                                            {row.searchTerm.length >= 2 && getFilteredOwnersFn(row.searchTerm).length > 0 && (
                                                <div className="absolute z-50 w-full mt-1 bg-slate-700 border border-white/10 rounded-xl max-h-48 overflow-auto">
                                                    {getFilteredOwnersFn(row.searchTerm).map(o => (
                                                        <div key={o.id} onClick={() => handleOwnerSelectForDistribution(row.id, o)} className="p-3 hover:bg-white/10 cursor-pointer"><p className="text-white text-sm">{o.name}</p></div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center">
                                                <p className="text-white font-black text-sm">{row.owner.name}</p>
                                                <Button variant="ghost" size="icon" onClick={() => removeDistributionRow(row.id)} className="text-red-500 h-6 w-6"><XCircle className="h-4 w-4" /></Button>
                                            </div>
                                            {(row.distributionLines || []).map((line, lineIdx) => (
                                                <div key={line.id} className="space-y-2 pl-4 border-l-2 border-slate-600">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] text-slate-400">Línea {lineIdx + 1}</span>
                                                        <Select value={line.category} onValueChange={(v: any) => updateDistributionLineCategory(row.id, line.id, v)}>
                                                            <SelectTrigger className="h-8 w-36 rounded-lg bg-slate-700 border-none text-white text-[10px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent className="bg-slate-800 border-white/10">
                                                                <SelectItem value="ordinaria" className="text-[10px]">Cuota Condominio</SelectItem>
                                                                <SelectItem value="extraordinaria" className="text-[10px]">Cuota Extraordinaria</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        {(row.distributionLines?.length || 0) > 1 && (
                                                            <Button variant="ghost" size="icon" onClick={() => removeDistributionLine(row.id, line.id)} className="text-red-500 h-5 w-5"><Trash2 className="h-3 w-3" /></Button>
                                                        )}
                                                    </div>
                                                    {line.category === 'extraordinaria' && (
                                                        <Select value={line.extraordinaryDebtId} onValueChange={(v) => updateDistributionLineDebt(row.id, line.id, v)}>
                                                            <SelectTrigger className="h-8 rounded-lg bg-slate-700 border-none text-white text-[10px]"><SelectValue placeholder="Seleccionar cuota..." /></SelectTrigger>
                                                            <SelectContent className="bg-slate-800 border-white/10">
                                                                {extraordinaryDebts.filter(d => d.ownerId === row.owner?.id).map(debt => (
                                                                    <SelectItem key={debt.id} value={debt.id} className="text-[10px]">{debt.description} (${formatUSD(debt.amountUSD)})</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                    <Input type="number" placeholder="Monto Bs." value={line.amount || ''} onChange={(e) => updateDistributionLineAmount(row.id, line.id, parseFloat(e.target.value) || 0)} className="h-8 rounded-lg bg-slate-700 border-none text-white text-right" />
                                                </div>
                                            ))}
                                            <Button variant="ghost" size="sm" onClick={() => addDistributionLine(row.id)} className="text-[9px] text-primary"><Plus className="h-3 w-3 mr-1" /> Agregar línea</Button>
                                        </>
                                    )}
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={addDistributionRow} className="rounded-xl border-white/10 text-slate-400 text-[10px]"><UserPlus className="mr-1 h-3 w-3" /> Añadir Beneficiario</Button>
                        </div>

                        {/* RESUMEN */}
                        <div className="bg-slate-800 p-4 rounded-xl flex justify-between">
                            <span className="text-[10px] text-slate-400">Diferencia:</span>
                            <span className={cn("font-black", balanceTransit === 0 ? "text-emerald-400" : "text-red-500")}>
                                Bs. {formatCurrency(Math.abs(balanceTransit))}
                            </span>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => { setSelectedTransit(null); setDistributionRows([]); }}>Cancelar</Button>
                        <Button onClick={handleSubmitDistribution} disabled={isSubmittingDistribution || balanceTransit !== 0 || getTotalAssigned() === 0} className="bg-amber-600 text-white font-black uppercase text-[10px]">
                            {isSubmittingDistribution ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Conciliar y Distribuir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
                <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 h-16 rounded-2xl p-1 border border-white/5">
                    <TabsTrigger value="verify" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Verificación</TabsTrigger>
                    <TabsTrigger value="report" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Reporte Manual</TabsTrigger>
                    <TabsTrigger value="calculator" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Calculadora</TabsTrigger>
                    <TabsTrigger value="transit" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Tránsito</TabsTrigger>
                </TabsList>
                <TabsContent value="verify" className="mt-8"><VerificationComponent condoId={condoId} /></TabsContent>
                <TabsContent value="report" className="mt-8"><ReportPaymentComponent /></TabsContent>
                <TabsContent value="calculator" className="mt-8"><CalculatorComponent condoId={condoId} onReport={handleCalcReport} /></TabsContent>
                <TabsContent value="transit" className="mt-8"><TransitPaymentsComponent condoId={condoId} /></TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (<Suspense fallback={<div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}><PaymentsPage /></Suspense>);
}
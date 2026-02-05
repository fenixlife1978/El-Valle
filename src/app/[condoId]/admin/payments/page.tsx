

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
import { ArrowLeft, Calculator, CalendarIcon, Check, CheckCircle, Clock, DollarSign, Eye, FileText, Hash, Loader2, Upload, Banknote, Info, X, Save, FileUp, UserPlus, Trash2, XCircle, Search, ChevronDown, Minus, Equal, Receipt, AlertTriangle, User, MoreHorizontal, Download, Share2 } from 'lucide-react';
import { format, isBefore, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, writeBatch, orderBy, runTransaction, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthorization } from '@/hooks/use-authorization';
import { generatePaymentReceipt } from '@/lib/pdf-generator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { processPaymentLiquidation } from '@/lib/payment-processor';


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
type Debt = { id: string; ownerId: string; year: number; month: number; amountUSD: number; description: string; status: 'pending' | 'paid' | 'vencida'; property: { street: string; house: string }; paidAmountUSD?: number;};
type Payment = { id: string; beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[]; beneficiaryIds: string[]; totalAmount: number; exchangeRate: number; paymentDate: Timestamp; reportedAt: Timestamp; paymentMethod: 'transferencia' | 'movil' | 'efectivo' | 'zelle'; bank: string; reference: string; status: 'pendiente' | 'aprobado' | 'rechazado'; receiptUrl?: string; observations?: string; receiptNumbers?: { [ownerId: string]: string }; type?: string; };
type ReceiptData = { payment: Payment; beneficiary: any; ownerName: string; ownerUnit: string; paidDebts: Debt[]; previousBalance: number; currentBalance: number; qrCodeUrl?: string; receiptNumber: string; } | null;
type PaymentDetails = { paymentMethod: 'movil' | 'transferencia' | ''; bank: string; otherBank: string; reference: string; };


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
const formatCurrency = (num: number) => num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


// --- VERIFICATION COMPONENT ---
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
                // --- PRE-TRANSACTION READS ---
                const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const settingsDoc = await getDoc(settingsRef);
                if (!settingsDoc.exists() || !settingsDoc.data().condoFee) {
                    throw new Error("No se encontró la cuota de condominio (condoFee) en la configuración.");
                }
                const condoFeeUSD = settingsDoc.data().condoFee;
                const costoCuotaActualBs = condoFeeUSD * payment.exchangeRate;
    
                const beneficiaryIds = payment.beneficiaries.map(b => b.ownerId);
                if (beneficiaryIds.length === 0) throw new Error("El pago no tiene beneficiarios.");
                
                const allDebtsQuery = query(collection(db, 'condominios', condoId, 'debts'), where('ownerId', 'in', beneficiaryIds));
                const allDebtsSnapshot = await getDocs(allDebtsQuery);
                const allDebtsForTx = allDebtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
    
                // --- START TRANSACTION ---
                await runTransaction(db, async (transaction) => {
                    const paymentRef = doc(db, 'condominios', condoId, 'payments', payment.id);
                    const receiptNumbers: { [ownerId: string]: string } = {};
    
                    // --- TRANSACTION READ PHASE ---
                    const ownerRefs = beneficiaryIds.map(id => doc(db, 'condominios', condoId, ownersCollectionName, id));
                    const ownerDocs = await Promise.all(ownerRefs.map(ref => transaction.get(ref)));
    
                    // --- LOGIC & WRITE PHASE ---
                    for (const beneficiary of payment.beneficiaries) {
                        const ownerDoc = ownerDocs.find(d => d.id === beneficiary.ownerId);
                        if (!ownerDoc || !ownerDoc.exists()) throw new Error(`El propietario ${beneficiary.ownerName} no fue encontrado.`);
                        
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
    
                        // 1. Update liquidated pending debts
                        for (const liquidada of liquidationResult.cuotasLiquidadas) {
                            const debtRef = doc(db, 'condominios', condoId, 'debts', liquidada.id);
                            transaction.update(debtRef, {
                                status: 'paid',
                                paymentId: payment.id,
                                paymentDate: payment.paymentDate,
                                paidAmountUSD: liquidada.amountUSD
                            });
                        }
    
                        // 2. Handle advance payments
                        if (liquidationResult.cuotasAdelantadas > 0 && condoFeeUSD > 0) {
                            let lastPaidPeriod = { year: 1970, month: 0 };
                            
                            const allPotentiallyPaidDebts = allOwnerDebts.map(d => {
                                const isNewlyLiquidated = liquidationResult.cuotasLiquidadas.some(l => l.id === d.id);
                                return { ...d, status: isNewlyLiquidated ? 'paid' : d.status };
                            });

                            allPotentiallyPaidDebts.forEach(d => {
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
                                });
                                nextPeriodDate = addMonths(nextPeriodDate, 1);
                            }
                        }
    
                        // 3. Update owner's balance
                        transaction.update(ownerDoc.ref, { balance: liquidationResult.nuevoSaldoAFavor });
                        
                        // 4. Generate receipt number
                        receiptNumbers[beneficiary.ownerId] = `REC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
                    }
    
                    transaction.update(paymentRef, { status: 'aprobado', observations: 'Pago verificado y aplicado por la administración.', receiptNumbers });
                });
                
                toast({ title: 'Pago Aprobado', description: 'El pago ha sido procesado con la nueva lógica de liquidación.', className: 'bg-green-100 border-green-400 text-green-800' });
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
                
                await runTransaction(db, async (transaction) => {
                    // --- 1. FASE DE LECTURA ---
                    const paymentDoc = await transaction.get(paymentRef);
                    if (!paymentDoc.exists()) return;
                    
                    const paymentData = paymentDoc.data() as Payment;
                    const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
    
                    const ownerRefs = paymentData.beneficiaries.map(b => {
                        return doc(db, 'condominios', condoId, ownersCollectionName, b.ownerId);
                    });
                    const ownerDocs = await Promise.all(ownerRefs.map(ref => transaction.get(ref)));
    
                    // --- 2. FASE DE LÓGICA ---
                    let totalAmountAppliedToDebts = 0;
                    paidDebtsSnapshot.forEach(debtDoc => {
                        const debtData = debtDoc.data() as Debt;
                        totalAmountAppliedToDebts += (debtData.paidAmountUSD || debtData.amountUSD) * paymentData.exchangeRate;
                    });
                    const totalSurplus = paymentData.totalAmount - totalAmountAppliedToDebts;
    
                    // --- 3. FASE DE ESCRITURA ---
                    paidDebtsSnapshot.forEach(debtDoc => {
                        transaction.update(debtDoc.ref, {
                            status: 'pending',
                            paymentId: deleteField(),
                            paymentDate: deleteField(),
                            paidAmountUSD: deleteField()
                        });
                    });
    
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
    
                toast({ title: 'Pago Eliminado', description: 'El pago y sus efectos han sido revertidos.' });
                setPaymentToDelete(null);
    
            } catch (error: any) {
                console.error("Error deleting payment:", error);
                toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
            } finally {
                setIsVerifying(false);
            }
        });
    };

    const handleGenerateAndAct = async (action: 'download' | 'share', data: ReceiptData) => {
        if (!data || !companyInfo) return;
        setIsGenerating(true);
    
        const { payment, beneficiary, paidDebts, previousBalance, currentBalance, receiptNumber } = data;

        const conceptsForPdf = paidDebts.map(debt => {
            const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
            const propertyLabel = debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A';
            const concept = `${debt.description} (${propertyLabel})`;
            return [ 
                `${MONTHS_LOCALE[debt.month]} ${debt.year}`,
                concept, 
                `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`, 
                formatCurrency(debtAmountBs) 
            ];
        });
    
        if (paidDebts.length === 0 && beneficiary.amount > 0) {
             conceptsForPdf.push(['', 'Abono a Saldo a Favor', '', formatCurrency(beneficiary.amount)]);
        }
        
        const totalDebtPaidInBs = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
    
        const dataForPdf = {
            condoName: companyInfo.name,
            rif: companyInfo.rif,
            receiptNumber: receiptNumber,
            ownerName: data.ownerName,
            method: payment.paymentMethod,
            bank: payment.bank,
            reference: payment.reference,
            date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
            rate: formatCurrency(payment.exchangeRate),
            concepts: conceptsForPdf,
            prevBalance: formatCurrency(previousBalance),
            receivedAmount: formatCurrency(beneficiary.amount),
            totalDebtPaid: formatCurrency(totalDebtPaidInBs),
            currentBalance: formatCurrency(currentBalance),
            observations: payment.observations || 'Sin observaciones.'
        };
        
        try {
            if (action === 'download') {
                generatePaymentReceipt(dataForPdf, companyInfo.logo, 'download');
            } else if (navigator.share) {
                const pdfBlob = generatePaymentReceipt(dataForPdf, companyInfo.logo, 'blob');
                if (pdfBlob) {
                    const pdfFile = new File([pdfBlob], `Recibo_${data.ownerName.replace(/\s/g, '_')}.pdf`, { type: 'application/pdf' });
                    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                        await navigator.share({
                            title: `Recibo de Pago para ${data.ownerName}`,
                            text: `Recibo de pago para ${data.ownerName}.`,
                            files: [pdfFile],
                        });
                    } else {
                         throw new Error('No se puede compartir el PDF en este navegador.');
                    }
                }
            } else {
              throw new Error('La API de compartir no está soportada en este navegador.');
            }
        } catch (error: any) {
            console.error('Error en Share/Download:', error);
            // Fallback to download if sharing fails
            generatePaymentReceipt(dataForPdf, companyInfo.logo, 'download');
            toast({ title: 'Compartir no disponible', description: 'Se ha iniciado la descarga del PDF.'});
        } finally {
            setIsGenerating(false);
        }
    };
    
    const prepareAndGenerateReceipt = async (action: 'download' | 'share', payment: Payment, beneficiary: any) => {
        if (!beneficiary || !beneficiary.ownerId || !condoId) {
            toast({ variant: "destructive", title: "Error", description: "Datos del beneficiario son inválidos." });
            return;
        }

        if (companyInfoLoading) {
            toast({ title: 'Cargando...', description: 'Información del condominio está cargando, por favor intente de nuevo en un momento.' });
            return;
        }

        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Error de Configuración', description: 'No se encontró la información del condominio. Por favor, complete la sección "Identidad" en Ajustes.' });
            return;
        }
        
        setIsGenerating(true);
        try {
            const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId);
            const ownerSnap = await getDoc(ownerRef);
            if (!ownerSnap.exists()) {
                throw new Error('Owner profile not found.');
            }
            const ownerData = ownerSnap.data();
    
            const paidDebtsSnapshot = await getDocs(
                query(collection(db, 'condominios', condoId, 'debts'), where('paymentId', '==', payment.id), where('ownerId', '==', beneficiary.ownerId))
            );
            const paidDebts = paidDebtsSnapshot.docs.map(d => d.data() as Debt);
            
            const totalDebtPaidWithPayment = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
            const previousBalance = (ownerData.balance || 0) - (beneficiary.amount - totalDebtPaidWithPayment);
            const receiptNumber = payment.receiptNumbers?.[beneficiary.ownerId] || `N/A-${payment.id.slice(-5)}`;
    
            const dataForPdf: ReceiptData = {
                payment,
                beneficiary,
                ownerName: ownerData.name,
                ownerUnit: `${ownerData.properties?.[0]?.street} - ${ownerData.properties?.[0]?.house}`,
                paidDebts: paidDebts.sort((a,b) => a.year - b.year || a.month - b.month),
                previousBalance: previousBalance,
                currentBalance: ownerData.balance || 0,
                receiptNumber: receiptNumber
            };
            
            await handleGenerateAndAct(action, dataForPdf);
    
        } catch (error: any) {
            console.error("Error al preparar recibo:", error);
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo cargar la información para el recibo.' });
        } finally {
            setIsGenerating(false);
        }
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
                                            <TableCell>{p.paymentDate ? format(p.paymentDate.toDate(), 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                            <TableCell>{formatCurrency(p.totalAmount)}</TableCell>
                                            <TableCell className="font-mono">{p.reference}</TableCell>
                                            <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Abrir menú</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => setSelectedPayment(p)}>
                                                                <Eye className="mr-2 h-4 w-4" /> Ver detalles
                                                            </DropdownMenuItem>
                                                            
                                                            {p.status === 'pendiente' && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={() => handleApprove(p)} className="text-emerald-600 focus:text-emerald-600">
                                                                        <CheckCircle className="mr-2 h-4 w-4" /> Aprobar
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => { setSelectedPayment(p); setRejectionReason(''); }} className="text-destructive focus:text-destructive">
                                                                        <XCircle className="mr-2 h-4 w-4" /> Rechazar
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            
                                                            {p.status === 'aprobado' && p.beneficiaries?.length > 0 && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    {p.beneficiaries.length === 1 ? (
                                                                        <>
                                                                            <DropdownMenuItem onClick={() => prepareAndGenerateReceipt('download', p, p.beneficiaries[0])} disabled={isGenerating}>
                                                                                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />} Exportar PDF
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => prepareAndGenerateReceipt('share', p, p.beneficiaries[0])} disabled={isGenerating}>
                                                                                <Share2 className="mr-2 h-4 w-4" /> Compartir Recibo
                                                                            </DropdownMenuItem>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <DropdownMenuSub>
                                                                                <DropdownMenuSubTrigger><Download className="mr-2 h-4 w-4"/>Exportar Recibo</DropdownMenuSubTrigger>
                                                                                <DropdownMenuPortal>
                                                                                    <DropdownMenuSubContent>
                                                                                        {p.beneficiaries.map(ben => (
                                                                                            <DropdownMenuItem key={ben.ownerId} onClick={() => prepareAndGenerateReceipt('download', p, ben)}>
                                                                                                {ben.ownerName}
                                                                                            </DropdownMenuItem>
                                                                                        ))}
                                                                                    </DropdownMenuSubContent>
                                                                                </DropdownMenuPortal>
                                                                            </DropdownMenuSub>
                                                                            <DropdownMenuSub>
                                                                                <DropdownMenuSubTrigger><Share2 className="mr-2 h-4 w-4"/>Compartir Recibo</DropdownMenuSubTrigger>
                                                                                 <DropdownMenuPortal>
                                                                                    <DropdownMenuSubContent>
                                                                                        {p.beneficiaries.map(ben => (
                                                                                            <DropdownMenuItem key={ben.ownerId} onClick={() => prepareAndGenerateReceipt('share', p, ben)}>
                                                                                                {ben.ownerName}
                                                                                            </DropdownMenuItem>
                                                                                        ))}
                                                                                    </DropdownMenuSubContent>
                                                                                </DropdownMenuPortal>
                                                                            </DropdownMenuSub>
                                                                        </>
                                                                    )}
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setPaymentToDelete(p)}>
                                                                        <Trash2 className="mr-2 h-4 w-4"/>Eliminar
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                             {p.status === 'rechazado' && (
                                                                 <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setPaymentToDelete(p)}>
                                                                        <Trash2 className="mr-2 h-4 w-4"/>Eliminar
                                                                    </DropdownMenuItem>
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
                    <DialogContent className="max-w-2xl">
                        <DialogHeader><DialogTitle>Detalles del Pago - {selectedPayment?.reference}</DialogTitle>{selectedPayment && <DialogDescription>Reportado el {format(selectedPayment.reportedAt.toDate(), 'dd/MM/yyyy HH:mm')}</DialogDescription>}</DialogHeader>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto">
                            <div className="space-y-4">
                                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Beneficiarios</CardTitle></CardHeader><CardContent>{selectedPayment?.beneficiaries.map((b, i) => (<div key={b.ownerId || i} className="text-sm flex justify-between items-center"><span><User className="inline h-4 w-4 mr-1"/>{b.ownerName}</span><span className="font-bold">{formatCurrency(b.amount)}</span></div>))}</CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Detalles de la Transacción</CardTitle></CardHeader><CardContent className="text-sm space-y-1"><p><strong>Monto Total:</strong> {formatCurrency(selectedPayment?.totalAmount || 0)}</p><p><strong>Fecha:</strong> {selectedPayment ? format(selectedPayment.paymentDate.toDate(), 'dd/MM/yyyy') : ''}</p><p><strong>Método:</strong> {selectedPayment?.paymentMethod}</p><p><strong>Banco:</strong> {selectedPayment?.bank}</p></CardContent></Card>
                                {selectedPayment?.status === 'rechazado' && (<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>Motivo del Rechazo:</strong> {selectedPayment.observations}</AlertDescription></Alert>)}
                                {selectedPayment?.status === 'pendiente' && (
                                    <div className="w-full space-y-2">
                                        <Label htmlFor="rejectionReason">Motivo del rechazo (si aplica)</Label>
                                        <Textarea id="rejectionReason" value={rejectionReason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectionReason(e.target.value)} placeholder="Ej: Referencia no coincide, monto incorrecto..." />
                                    </div>
                                )}
                            </div>
                            <div>
                                <Label>Comprobante de Pago</Label>
                                {selectedPayment?.receiptUrl ? (<div className="mt-2 border rounded-lg overflow-hidden"><Image src={selectedPayment.receiptUrl} alt="Comprobante" width={400} height={600} className="w-full h-auto" /></div>) : <p className="text-sm text-muted-foreground">No se adjuntó comprobante.</p>}
                            </div>
                            {selectedPayment?.status === 'aprobado' && (
                                <div className="md:col-span-2 mt-4">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base flex items-center gap-2">
                                                <CheckCircle className="h-5 w-5 text-success" />
                                                Desglose de Liquidación
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            {loadingDetails ? (
                                                <div className="flex justify-center p-4">
                                                    <Loader2 className="animate-spin text-primary"/>
                                                </div>
                                            ) : (
                                                liquidatedDetails && (
                                                    <ul className="space-y-2 text-sm">
                                                        {liquidatedDetails.debts.map(debt => (
                                                            <li key={debt.id} className="flex justify-between items-center p-2 rounded-md hover:bg-muted/50">
                                                                <div>
                                                                    <p className="font-medium">{debt.description}</p>
                                                                    <p className="text-xs text-muted-foreground">{MONTHS_LOCALE[debt.month]} {debt.year}</p>
                                                                </div>
                                                                <span className="font-mono font-semibold text-right">Bs. {formatCurrency((debt.paidAmountUSD || debt.amountUSD) * selectedPayment.exchangeRate)}</span>
                                                            </li>
                                                        ))}
                                                        {liquidatedDetails.balanceCredit > 0 && (
                                                            <li className="flex justify-between items-center p-2 rounded-md bg-green-50 text-green-700">
                                                                <p className="font-semibold">Abono a Saldo a Favor</p>
                                                                <span className="font-mono font-bold">Bs. {formatCurrency(liquidatedDetails.balanceCredit)}</span>
                                                            </li>
                                                        )}
                                                        {liquidatedDetails.debts.length === 0 && liquidatedDetails.balanceCredit <= 0 && (
                                                            <p className="text-muted-foreground italic text-center p-4">Este pago no liquidó conceptos específicos o ya fue revertido.</p>
                                                        )}
                                                    </ul>
                                                )
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </div>
                        {selectedPayment?.status === 'pendiente' && (<DialogFooter className="border-t pt-4 gap-2 flex-col sm:flex-row"><Button variant="destructive" onClick={() => handleReject(selectedPayment!)} disabled={isVerifying || !rejectionReason}>{isVerifying ? <Loader2 className="animate-spin" /> : <XCircle className="mr-2"/>} Rechazar</Button><Button onClick={() => handleApprove(selectedPayment!)} disabled={isVerifying} className="bg-green-500 hover:bg-green-600">{isVerifying ? <Loader2 className="animate-spin" /> : <CheckCircle className="mr-2"/>} Aprobar</Button></DialogFooter>)}
                    </DialogContent>
                </Dialog>
                <Dialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
                     <DialogContent>
                        <DialogHeader><DialogTitle className="text-destructive">Confirmar Eliminación</DialogTitle><DialogDescription>Esta acción revertirá el pago, las deudas liquidadas volverán a estar pendientes y se ajustará el saldo a favor. ¿Está seguro?</DialogDescription></DialogHeader>
                        <DialogFooter><Button variant="outline" onClick={() => setPaymentToDelete(null)}>Cancelar</Button><Button variant="destructive" onClick={handleDeletePayment}>Sí, Eliminar Pago</Button></DialogFooter>
                     </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

// --- COMPONENT: REPORT PAYMENT COMPONENT (for Admin) ---
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
        const bs = parseFloat(totalAmount);
        if (!isNaN(bs) && exchangeRate && exchangeRate > 0) {
            setAmountUSD((bs / exchangeRate).toFixed(2));
        } else {
            setAmountUSD('');
        }
    }, [totalAmount, exchangeRate]);

    const resetForm = () => {
        setPaymentDate(new Date()); setPaymentMethod('movil'); setBank(''); setOtherBank('');
        setReference(''); setTotalAmount(''); setReceiptImage(null); setAmountUSD('');
        setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const compressedBase64 = await compressImage(file, 800, 0.7);
            setReceiptImage(compressedBase64);
            toast({ title: 'Comprobante cargado', description: 'La imagen se ha optimizado.' });
        } catch (error) { toast({ variant: 'destructive', title: 'Error de imagen' }); } 
        finally { setLoading(false); }
    };
    
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
    
    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        if (!paymentDate || !exchangeRate || !paymentMethod || !bank || !totalAmount || Number(totalAmount) <= 0 || reference.length < 4) return { isValid: false, error: 'Complete todos los campos de la transacción (referencia min. 4 dígitos).' };
        if (beneficiaryRows.some(row => !row.owner || !row.amount || Number(row.amount) <= 0 || !row.selectedProperty)) return { isValid: false, error: 'Complete la información para cada beneficiario.' };
        if (Math.abs(balance) > 0.01) return { isValid: false, error: 'El monto total no coincide con la suma de los montos asignados.' };
        if (!condoId) return { isValid: false, error: "No se encontró un condominio activo." };
        try {
            const q = query(collection(db, "condominios", condoId, "payments"), where("reference", "==", reference), where("totalAmount", "==", Number(totalAmount)), where("paymentDate", "==", Timestamp.fromDate(paymentDate)));
            if (!(await getDocs(q)).empty) return { isValid: false, error: 'Ya existe un reporte con esta misma referencia, monto y fecha.' };
        } catch (dbError) { return { isValid: false, error: "No se pudo verificar si el pago ya existe." }; }
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

        if (!authUser || !condoId) {
            toast({ variant: 'destructive', title: 'Error de Autenticación'});
            setIsSubmitting(false);
            return;
        }

        try {
            const beneficiaries = beneficiaryRows.map(row => ({ ownerId: row.owner!.id, ownerName: row.owner!.name, ...(row.selectedProperty && { street: row.selectedProperty.street, house: row.selectedProperty.house }), amount: Number(row.amount) }));
            const paymentData = { reportedBy: authUser.uid, beneficiaries, beneficiaryIds: beneficiaries.map(b=>b.ownerId), totalAmount: Number(totalAmount), exchangeRate, paymentDate: Timestamp.fromDate(paymentDate!), paymentMethod, bank: bank === 'Otro' ? otherBank : bank, reference, receiptUrl: receiptImage, status: 'pendiente', reportedAt: serverTimestamp() };
            
            await addDoc(collection(db, "condominios", condoId, "payments"), paymentData);

            const batch = writeBatch(db);
            beneficiaries.forEach(beneficiary => {
                const notificationsRef = doc(collection(db, `condominios/${condoId}/${ownersCollectionName}/${beneficiary.ownerId}/notifications`));
                batch.set(notificationsRef, {
                    title: "Pago Registrado por Administración",
                    body: `La administración ha registrado un pago a su favor por Bs. ${beneficiary.amount.toFixed(2)}. Será verificado y aplicado pronto.`,
                    createdAt: serverTimestamp(),
                    read: false,
                    href: `/${condoId}/owner/dashboard`
                });
            });
            await batch.commit();

            resetForm();
            toast({ title: 'Pago Reportado', description: 'El pago ha sido registrado y los propietarios notificados.' });

        } catch (error) {
            console.error("Error submitting payment: ", error);
            toast({ variant: "destructive", title: "Error Inesperado" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card>
            <CardHeader><CardTitle>Reportar Pago Manualmente</CardTitle><CardDescription>Registre un pago en nombre de uno o varios propietarios.</CardDescription></CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2"><Label>Fecha del Pago</Label><Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !paymentDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} /></PopoverContent></Popover></div>
                        <div className="space-y-2"><Label>Tasa de Cambio (Bs.)</Label><Input type="number" value={exchangeRate || ''} onChange={(e) => setExchangeRate(parseFloat(e.target.value) || null)} placeholder="Tasa del día del pago" /><p className="text-xs text-muted-foreground">{exchangeRateMessage}</p></div>
                        <div className="space-y-2"><Label>Método de Pago</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><Label>Banco Emisor</Label><Button type="button" variant="outline" className="w-full justify-start text-left font-normal" onClick={() => setIsBankModalOpen(true)}>{bank || "Seleccione un banco..."}</Button></div>
                        {bank === 'Otro' && <div className="space-y-2"><Label>Nombre del Otro Banco</Label><Input value={otherBank} onChange={(e) => setOtherBank(e.target.value)} /></div>}
                        <div className="space-y-2"><Label>Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))}/></div>
                    </div>
                    <div className="space-y-2"><Label>Comprobante (Opcional)</Label><Input type="file" onChange={handleImageUpload} />{receiptImage && <p className="text-xs text-green-600">Comprobante cargado.</p>}</div>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2"><Label>Monto Total (Bs.)</Label><Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" /></div>
                        <div className="space-y-2"><Label>Monto Equivalente (USD)</Label><div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input type="text" value={amountUSD} readOnly className="pl-9 bg-muted"/></div></div>
                    </div>
                    <div className="space-y-4"><Label className="font-semibold">Asignación de Montos</Label>
                        {beneficiaryRows.map((row, index) => (
                            <Card key={row.id} className="p-4 bg-muted/50 relative">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2"><Label htmlFor={`search-${row.id}`}>Beneficiario {index + 1}</Label>
                                        {!row.owner ? (<><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id={`search-${row.id}`} placeholder="Buscar por nombre..." className="pl-9" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} disabled={loading} /></div>{row.searchTerm.length >= 2 && getFilteredOwners(row.searchTerm).length > 0 && <Card className="border rounded-md"><ScrollArea className="h-32">{getFilteredOwners(row.searchTerm).map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(row.id, owner)} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium text-sm">{owner.name}</p></div>))}</ScrollArea></Card>}</>)
                                        : (<div className="p-3 bg-background rounded-md flex items-center justify-between"><div><p className="font-semibold text-primary">{row.owner.name}</p></div><Button variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading || beneficiaryRows.length === 1}><XCircle className="h-5 w-5 text-destructive" /></Button></div>)}
                                    </div>
                                    <div className="space-y-2"><Label htmlFor={`amount-${row.id}`}>Monto Asignado (Bs.)</Label><Input id={`amount-${row.id}`} type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={loading || !row.owner} /></div>
                                </div>
                                {row.owner && (
                                  <div className="mt-4 space-y-2">
                                    <Label>Asignar a Propiedad</Label>
                                    <Select onValueChange={(v) => { const props = Array.isArray(row.owner?.properties) ? row.owner.properties : []; const found = props.find(p => `${p.street}-${p.house}` === v); updateBeneficiaryRow(row.id, { selectedProperty: found || null });}} value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''} disabled={loading || !row.owner || !Array.isArray(row.owner.properties)}>
                                      <SelectTrigger><SelectValue placeholder={Array.isArray(row.owner.properties) ? "Seleccione una propiedad..." : "Usuario sin propiedades"} /></SelectTrigger>
                                      <SelectContent>{Array.isArray(row.owner?.properties) ? (row.owner.properties.map((p, pIdx) => (<SelectItem key={`${p.street}-${p.house}-${pIdx}`} value={`${p.street}-${p.house}`}>{`${p.street} - ${p.house}`}</SelectItem>))) : (<SelectItem value="none" disabled>No hay propiedades</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>
                                )}
                                {beneficiaryRows.length > 1 && <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading}><Trash2 className="h-4 w-4"/></Button>}
                            </Card>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} disabled={loading}><UserPlus className="mr-2 h-4 w-4"/>Añadir Beneficiario</Button>
                        <CardFooter className="p-4 bg-muted/50 rounded-lg space-y-2 mt-4 flex-col items-stretch">
                            <div className="flex justify-between text-sm font-medium"><span>Monto Total del Pago:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                            <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div><hr className="my-1 border-border"/><div className={cn("flex justify-between text-base font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                        </CardFooter>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin"/> : 'Reportar Pago'}</Button>
                </CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(value) => { setBank(value); if (value !== 'Otro') setOtherBank(''); setIsBankModalOpen(false); }} />
        </Card>
    );
}


// --- COMPONENT: PAYMENT CALCULATOR (ADMIN) ---

function PaymentCalculatorComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const router = useRouter();
    const { user: authUser, ownerData: authOwnerData } = useAuth();
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
        if (!condoId) {
            setLoadingOwners(false);
            return;
        }
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            setLoadingOwners(false);
        });
        return () => unsubscribe();
    }, [condoId, ownersCollectionName]);

    useEffect(() => {
        if (!selectedOwner || !condoId) {
            setOwnerDebts([]);
            return;
        }
        setLoadingDebts(true);
        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCondoFee(settings.condoFee || 0);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) setActiveRate(activeRateObj.rate);
                else if (rates.length > 0) {
                    const sortedRates = [...rates].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setActiveRate(sortedRates[0].rate);
                }
            }
        });

        const debtsQuery = query(collection(db, "condominios", condoId, "debts"), where("ownerId", "==", selectedOwner.id));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData: Debt[] = [];
            snapshot.forEach(d => debtsData.push({ id: d.id, ...d.data() } as Debt));
            setOwnerDebts(debtsData.sort((a, b) => a.year - b.year || a.month - b.month));
            setLoadingDebts(false);
        });
        return () => {
            settingsUnsubscribe();
            debtsUnsubscribe();
        };
    }, [selectedOwner, condoId]);

    const filteredOwners = useMemo(() => {
        if (!searchTerm) return [];
        return allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm, allOwners]);

    if (loadingOwners) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    if (!selectedOwner) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Seleccionar Propietario</CardTitle>
                    <CardDescription>Busque y seleccione un propietario para calcular su deuda.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar por nombre..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    {searchTerm && (
                        <Card className="border rounded-lg">
                            <ScrollArea className="h-60">
                                {filteredOwners.length > 0 ? filteredOwners.map(owner => (
                                    <div key={owner.id} onClick={() => { setSearchTerm(''); setSelectedOwner(owner); }} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                        <p className="font-medium text-sm">{owner.name}</p>
                                        <p className="text-xs text-muted-foreground">{(owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}</p>
                                    </div>
                                )) : <p className="p-4 text-sm text-center text-muted-foreground">No se encontraron propietarios.</p>}
                            </ScrollArea>
                        </Card>
                    )}
                </CardContent>
            </Card>
        )
    }

    return (
        <div>
            <Button variant="outline" onClick={() => setSelectedOwner(null)} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4"/>
                Cambiar de Propietario
            </Button>
            {loadingDebts ? (
                <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
            ) : (
                <PaymentCalculatorUI owner={selectedOwner} debts={ownerDebts} activeRate={activeRate} condoFee={condoFee} condoId={condoId} showReportButton={false} />
            )}
        </div>
    );
}


// --- UI for Calculator (reused) ---
function PaymentCalculatorUI({ owner, debts, activeRate, condoFee, condoId, showReportButton = true }: { owner: any; debts: Debt[]; activeRate: number; condoFee: number, condoId: string | null, showReportButton?: boolean }) {
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    const router = useRouter();
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
        const totalDebtUSD = dueMonthsTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - (owner.balance || 0));
        return { totalToPay, hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0, dueMonthsCount: selectedPendingDebts.length, advanceMonthsCount: selectedAdvanceMonths.length, totalDebtBs, balanceInFavor: owner.balance || 0, condoFee };
    }, [selectedPendingDebts, selectedAdvanceMonths, pendingDebts, activeRate, condoFee, owner]);
    
    const formatCurrency = (num: number) => {
        if (typeof num !== 'number' || isNaN(num)) return '0,00';
        return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-4">
                <Card>
                    <CardHeader><CardTitle>1. Deudas Pendientes</CardTitle></CardHeader>
                    <CardContent className="p-0">
                       <Table>
                            <TableHeader><TableRow><TableHead className="w-[50px] text-center">Pagar</TableHead><TableHead>Período</TableHead><TableHead>Concepto</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Monto (Bs.)</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {pendingDebts.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center"><Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />No tiene deudas pendientes.</TableCell></TableRow> : 
                                 pendingDebts.map((debt) => {
                                    const debtMonthDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                    const isOverdue = isBefore(debtMonthDate, startOfMonth(now));
                                    const status = debt.status === 'vencida' || (debt.status === 'pending' && isOverdue) ? 'Vencida' : 'Pendiente';
                                    return <TableRow key={debt.id} data-state={selectedPendingDebts.includes(debt.id) ? 'selected' : ''}>
                                            <TableCell className="text-center"><Checkbox onCheckedChange={() => setSelectedPendingDebts(p => p.includes(debt.id) ? p.filter(id=>id!==debt.id) : [...p, debt.id])} checked={selectedPendingDebts.includes(debt.id)} /></TableCell>
                                            <TableCell className="font-medium">{MONTHS_LOCALE[debt.month]} {debt.year}</TableCell>
                                            <TableCell>{debt.description}</TableCell>
                                            <TableCell><Badge variant={status === 'Vencida' ? 'destructive' : 'warning'}>{status}</Badge></TableCell>
                                            <TableCell className="text-right">Bs. {formatCurrency(debt.amountUSD * activeRate)}</TableCell>
                                        </TableRow>
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>2. Pagar Meses por Adelantado</CardTitle><CardDescription>Cuota mensual actual: ${condoFee.toFixed(2)}</CardDescription></CardHeader>
                    <CardContent><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{futureMonths.map(month => <Button key={month.value} type="button" variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'} className="flex items-center justify-center gap-2 capitalize" onClick={() => setSelectedAdvanceMonths(p => p.includes(month.value) ? p.filter(m=>m!==month.value) : [...p, month.value])} disabled={month.disabled}>{selectedAdvanceMonths.includes(month.value) && <Check className="h-4 w-4" />} {month.label}</Button>)}</div></CardContent>
                </Card>
            </div>
            <div className="lg:sticky lg:top-20">
                 {paymentCalculator.hasSelection && <Card>
                     <CardHeader><CardTitle className="flex items-center"><Calculator className="mr-2 h-5 w-5"/> 3. Resumen de Pago</CardTitle><CardDescription>Cálculo basado en su selección.</CardDescription></CardHeader>
                    <CardContent className="space-y-3">
                        {paymentCalculator.dueMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.dueMonthsCount} mes(es) adeudado(s) seleccionado(s).</p>}
                        {paymentCalculator.advanceMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.advanceMonthsCount} mes(es) por adelanto seleccionado(s) x ${(paymentCalculator.condoFee ?? 0).toFixed(2)} c/u.</p>}
                        <hr className="my-2"/><div className="flex justify-between items-center text-lg"><span className="text-muted-foreground">Sub-Total Deuda:</span><span className="font-medium">Bs. {formatCurrency(paymentCalculator.totalDebtBs)}</span></div>
                        <div className="flex justify-between items-center text-md"><span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span><span className="font-medium text-green-500">Bs. {formatCurrency(paymentCalculator.balanceInFavor)}</span></div>
                        <hr className="my-2"/><div className="flex justify-between items-center text-2xl font-bold"><span className="flex items-center"><Equal className="mr-2 h-5 w-5"/> TOTAL SUGERIDO A PAGAR:</span><span className="font-bold text-primary">Bs. {formatCurrency(paymentCalculator.totalToPay)}</span></div>
                    </CardContent>
                    <CardFooter>
                       {showReportButton && (
                            <Button
                                className="w-full"
                                disabled={!paymentCalculator.hasSelection || paymentCalculator.totalToPay <= 0}
                                onClick={() => router.push(`/${condoId}/owner/payments?tab=report`)}
                            >
                                <Receipt className="mr-2 h-4 w-4" />
                                Proceder al Reporte de Pago
                            </Button>
                        )}
                    </CardFooter>
                </Card>}
            </div>
        </div>
    );
}

function PaymentsPage() {
    const searchParams = useSearchParams();
    const condoId = useParams()?.condoId as string;
    const router = useRouter();

    const activeTab = searchParams?.get('tab') ?? 'verify';

    const handleTabChange = (value: string) => {
        router.push(`/${condoId}/admin/payments?tab=${value}`, { scroll: false });
    };

    return (
        <div className="space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Gestión de <span className="text-primary">Pagos</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                   Verificación de pagos, reportes manuales y calculadora de cuotas.
                </p>
            </div>
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                 <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="verify">Verificación</TabsTrigger>
                    <TabsTrigger value="report">Reporte Manual</TabsTrigger>
                    <TabsTrigger value="calculator">Calculadora</TabsTrigger>
                </TabsList>
                <TabsContent value="verify" className="mt-6">
                    <VerificationComponent condoId={condoId} />
                </TabsContent>
                <TabsContent value="report" className="mt-6">
                    <ReportPaymentComponent condoId={condoId} />
                </TabsContent>
                <TabsContent value="calculator" className="mt-6">
                    <PaymentCalculatorComponent condoId={condoId} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    const params = useParams();
    const condoId = params?.condoId as string;
    
    return (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <PaymentsPage />
        </Suspense>
    );
}

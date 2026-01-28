
'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, CheckCircle2, Trash2, PlusCircle, Loader2, Search, XCircle, Wand2, UserPlus, Banknote, Info, Receipt, Calculator, Minus, Equal, Check, MoreHorizontal, Filter, Eye, AlertTriangle, Paperclip, Upload, DollarSign, ChevronDown, Save, FileUp, Hash, Share2, Download } from 'lucide-react';
import { format, parseISO, isBefore, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, setDoc, writeBatch, updateDoc, deleteDoc, runTransaction, limit, orderBy, deleteField } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { inferPaymentDetails } from '@/ai/flows/infer-payment-details';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { useAuthorization } from '@/hooks/use-authorization';
import Decimal from 'decimal.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter, useSearchParams } from 'next/navigation';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';


// --- Type Definitions (Shared) ---
type Owner = {
    id: string;
    name: string;
    balance: number;
    properties: { street: string, house: string }[];
    receiptCounter?: number;
};
type ExchangeRate = { id: string; date: string; rate: number; active: boolean; };
type Debt = { id: string; ownerId: string; year: number; month: number; amountUSD: number; description: string; status: 'pending' | 'paid' | 'vencida'; property: {street:string, house:string}; paymentId?:string; paidAmountUSD?: number; paymentDate?:Timestamp};
type PaymentDetails = { paymentMethod: 'movil' | 'transferencia' | ''; bank: string; otherBank: string; reference: string; };
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; amount: string; selectedProperty: { street: string, house: string } | null; };
type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil' | 'adelanto' | 'conciliacion';
type Beneficiary = { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; };
type FullPayment = { id: string; beneficiaries: Beneficiary[]; beneficiaryIds: string[]; totalAmount: number; exchangeRate: number; paymentDate: Timestamp; status: PaymentStatus; user?: string; unit: string; amount: number; date: string; bank: string; type: PaymentMethod; reference: string; receiptNumber?: string; receiptNumbers?: { [ownerId: string]: string }; receiptUrl?: string; reportedBy: string; reportedAt?: Timestamp; observations?: string; isReconciled?: boolean; };
type CompanyInfo = { name: string; address: string; rif: string; phone: string; email: string; logo: string;};
type ReceiptData = { payment: FullPayment; beneficiary: Beneficiary; ownerName: string; ownerUnit: string; paidDebts: Debt[]; previousBalance: number; currentBalance: number; qrCodeUrl?: string; receiptNumber: string; } | null;

// --- Constants ---
const ADMIN_USER_ID = 'valle-admin-main-account';
const monthsLocale: { [key: number]: string } = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
const venezuelanBanks = [ { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' }, { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' }, { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'otro', label: 'Otro' }];
const statusVariantMap: { [key in PaymentStatus]: 'warning' | 'success' | 'destructive' } = { pendiente: 'warning', aprobado: 'success', rechazado: 'destructive' };
const statusTextMap: { [key in PaymentStatus]: string } = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };
const formatToTwoDecimals = (num: number) => { if (typeof num !== 'number' || isNaN(num)) return '0,00'; const truncated = Math.trunc(num * 100) / 100; return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };


// ===================================================================================
// VERIFY PAYMENTS COMPONENT
// ===================================================================================
function VerifyPaymentsTab() {
    const [payments, setPayments] = useState<FullPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<PaymentStatus | 'todos'>('todos');
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [condoFee, setCondoFee] = useState(0);
    const [paymentToDelete, setPaymentToDelete] = useState<FullPayment | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const { ownerData, loading: authLoading } = useAuth();
    const [ownersMap, setOwnersMap] = useState<Map<string, Owner>>(new Map());
    const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
    const [receiptImageToView, setReceiptImageToView] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const [isBeneficiarySelectionOpen, setIsBeneficiarySelectionOpen] = useState(false);
    const [paymentForBeneficiarySelection, setPaymentForBeneficiarySelection] = useState<FullPayment | null>(null);


    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "owners")), (snapshot) => {
            const newOwnersMap = new Map<string, Owner>();
            snapshot.forEach(doc => newOwnersMap.set(doc.id, { id: doc.id, ...doc.data() } as Owner));
            setOwnersMap(newOwnersMap);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (authLoading || !ownerData?.condominioId || ownersMap.size === 0) {
            if (!authLoading) setLoading(false);
            return;
        }
    
        let unsubscribe: (() => void) | undefined;
    
        const fetchPayments = () => {
            setLoading(true);
            try {
                const q = query(
                    collection(db, "payments"),
                    where("condominioId", "==", ownerData.condominioId),
                    orderBy('reportedAt', 'desc')
                );
    
                unsubscribe = onSnapshot(q, (snapshot) => {
                    const paymentsData: FullPayment[] = snapshot.docs.map(doc => {
                        const data = doc.data();
                        const firstBeneficiary = data.beneficiaries?.[0];
                        let userName = 'Beneficiario no identificado';
                        let unit = 'Propiedad no especificada';
                        if (firstBeneficiary?.ownerId) {
                            const owner = ownersMap.get(firstBeneficiary.ownerId);
                            if (owner) {
                                userName = owner.name;
                                if (data.beneficiaries?.length > 1) {
                                    unit = "Múltiples Propiedades";
                                } else if (firstBeneficiary.street && firstBeneficiary.house) {
                                    unit = `${firstBeneficiary.street} - ${firstBeneficiary.house}`;
                                } else if (owner.properties && owner.properties.length > 0) {
                                    unit = `${owner.properties[0].street} - ${owner.properties[0].house}`;
                                }
                            }
                        }
                        return { 
                            id: doc.id, 
                            user: userName, 
                            unit: unit, 
                            amount: data.totalAmount, 
                            date: new Date(data.paymentDate.seconds * 1000).toISOString(), 
                            bank: data.bank, 
                            type: data.paymentMethod, 
                            reference: data.reference, 
                            ...data 
                        } as FullPayment;
                    });
                    setPayments(paymentsData);
                    setLoading(false);
                }, (error) => {
                    console.error("Error fetching payments:", error);
                    toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos.' });
                    setLoading(false);
                });
            } catch (error) {
                console.error("Error setting up payment fetch:", error);
                setLoading(false);
            }
        };
    
        fetchPayments();
    
        const fetchSettings = async () => {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                const settings = docSnap.data();
                setCompanyInfo(settings.companyInfo as CompanyInfo);
                setCondoFee(settings.condoFee || 0);
            }
        };
        fetchSettings();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [ownerData?.condominioId, authLoading, ownersMap, toast]);


    const handleStatusChange = async (id: string, newStatus: PaymentStatus) => {
        const paymentRef = doc(db, 'payments', id);
      
        requestAuthorization(async () => {
            if (newStatus === 'rechazado') {
              try {
                await updateDoc(paymentRef, { status: 'rechazado' });
                toast({ title: 'Pago Rechazado', description: `El pago ha sido marcado como rechazado.` });
              } catch (error) {
                console.error("Error rejecting payment: ", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
              }
              return;
            }
          
            if (newStatus === 'aprobado') {
                try {
                    await runTransaction(db, async (transaction) => {
                        const paymentDoc = await transaction.get(paymentRef);
                        if (!paymentDoc.exists() || paymentDoc.data().status === 'aprobado') throw new Error('El pago no existe o ya fue aprobado anteriormente.');
                        const paymentData = { id: paymentDoc.id, ...paymentDoc.data() } as FullPayment;
        
                        const settingsRef = doc(db, 'config', 'mainSettings');
                        const settingsSnap = await transaction.get(settingsRef);
                        if (!settingsSnap.exists()) throw new Error('No se encontró el documento de configuración.');
                        
                        const settingsData = settingsSnap.data();
                        const allRates = (settingsData.exchangeRates || []) as {date: string, rate: number}[];
                        const currentCondoFee = new Decimal(settingsData.condoFee || 0);
                        
                        if (currentCondoFee.lessThanOrEqualTo(0) && paymentData.type !== 'adelanto') throw new Error('La cuota de condominio debe ser mayor a cero. Por favor, configúrela.');
        
                        const paymentDateString = format(paymentData.paymentDate.toDate(), 'yyyy-MM-dd');
                        const applicableRates = allRates.filter(r => r.date <= paymentDateString).sort((a, b) => b.date.localeCompare(a.date));
                        const exchangeRate = new Decimal(applicableRates.length > 0 ? applicableRates[0].rate : 0);
                        
                        if (exchangeRate.lessThanOrEqualTo(0) && paymentData.type !== 'adelanto') throw new Error(`No se encontró una tasa de cambio válida para la fecha del pago (${paymentDateString}).`);
                        paymentData.exchangeRate = exchangeRate.toNumber();
        
                        const allBeneficiaryIds = Array.from(new Set(paymentData.beneficiaries.map(b => b.ownerId)));
                        if (allBeneficiaryIds.length === 0) throw new Error("El pago no tiene beneficiarios definidos.");
        
                        const ownerDocs = await Promise.all(allBeneficiaryIds.map(ownerId => transaction.get(doc(db, 'owners', ownerId))));
                        const ownerDataMap = new Map<string, any>();
                        ownerDocs.forEach((ownerDoc) => {
                            if (!ownerDoc.exists()) throw new Error(`El propietario ${ownerDoc.id} no fue encontrado.`);
                            ownerDataMap.set(ownerDoc.id, ownerDoc.data());
                        });
        
                        const newReceiptNumbers: { [key: string]: string } = {};
        
                        for (const beneficiary of paymentData.beneficiaries) {
                            const ownerId = beneficiary.ownerId;
                            const ownerData = ownerDataMap.get(ownerId);
                            if (!ownerData) continue;
        
                            const ownerRef = doc(db, 'owners', ownerId);
                            const receiptCounter = ownerData.receiptCounter || 0;
                            const newReceiptCounter = receiptCounter + 1;
                            const receiptNumber = `REC-${ownerId.substring(0, 4).toUpperCase()}-${String(newReceiptCounter).padStart(5, '0')}`;
                            newReceiptNumbers[ownerId] = receiptNumber;
        
                            let availableFunds = new Decimal(beneficiary.amount).plus(new Decimal(ownerData.balance || 0));
                            
                            const debtsQuery = query(collection(db, 'debts'), where('ownerId', '==', ownerId));
                            const debtsSnapshot = await getDocs(debtsQuery); 
                            
                            const allOwnerDebts = debtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
                            const pendingDebts = allOwnerDebts.filter(d => d.status === 'pending').sort((a, b) => a.year - b.year || a.month - b.month);
                            
                            for (const debt of pendingDebts) {
                                const debtRef = doc(db, 'debts', debt.id);
                                const debtAmountBs = new Decimal(debt.amountUSD).times(exchangeRate);
                                if (availableFunds.greaterThanOrEqualTo(debtAmountBs)) {
                                    availableFunds = availableFunds.minus(debtAmountBs);
                                    transaction.update(debtRef, { status: 'paid', paidAmountUSD: debt.amountUSD, paymentDate: paymentData.paymentDate, paymentId: paymentData.id });
                                } else break; 
                            }
                            
                            if (currentCondoFee.greaterThan(0)) {
                                const condoFeeBs = currentCondoFee.times(exchangeRate);
                                const allPaidPeriods = new Set(allOwnerDebts.map(d => `${d.year}-${d.month}`));
                                let lastPaidPeriod = { year: 1970, month: 1 };
                                allOwnerDebts.forEach(d => { if (d.status === 'paid' || pendingDebts.some(pd => pd.id === d.id)) { if (d.year > lastPaidPeriod.year || (d.year === lastPaidPeriod.year && d.month > lastPaidPeriod.month)) lastPaidPeriod = { year: d.year, month: d.month }; }});
                                let nextPeriodDate = addMonths(new Date(lastPaidPeriod.year, lastPaidPeriod.month - 1), 1);
                                
                                const ownerProperties = ownerData.properties || [];
                                if (ownerProperties.length > 0) {
                                    const property = ownerProperties[0];
                                    for (let i = 0; i < 24; i++) {
                                        if (availableFunds.lessThan(condoFeeBs)) break;
                                        const futureYear = nextPeriodDate.getFullYear();
                                        const futureMonth = nextPeriodDate.getMonth() + 1;
                                        const periodKey = `${futureYear}-${futureMonth}`;
                                        if (allPaidPeriods.has(periodKey)) { nextPeriodDate = addMonths(nextPeriodDate, 1); continue; }
                                        availableFunds = availableFunds.minus(condoFeeBs);
                                        const debtRef = doc(collection(db, 'debts'));
                                        transaction.set(debtRef, { ownerId: ownerId, property: property, year: futureYear, month: futureMonth, amountUSD: currentCondoFee.toNumber(), description: "Cuota de Condominio (Pagada por adelantado)", status: 'paid', paidAmountUSD: currentCondoFee.toNumber(), paymentDate: paymentData.paymentDate, paymentId: paymentData.id });
                                        allPaidPeriods.add(periodKey);
                                        nextPeriodDate = addMonths(nextPeriodDate, 1);
                                    }
                                }
                            }
                            
                            const finalBalance = availableFunds.toDecimalPlaces(2).toNumber();
                            transaction.update(ownerRef, { balance: finalBalance, receiptCounter: newReceiptCounter });
                            
                            const notificationsRef = doc(collection(ownerRef, "notifications"));
                            await setDoc(notificationsRef, { title: "Pago Aprobado", body: `Tu pago de Bs. ${formatToTwoDecimals(beneficiary.amount)} ha sido aprobado y aplicado.`, createdAt: Timestamp.now(), read: false, href: `/owner/dashboard`, paymentId: paymentData.id });
                        }
                        const observationNote = `Pago aprobado. Tasa aplicada: Bs. ${exchangeRate.toDecimalPlaces(2).toNumber()}.`;
                        transaction.update(paymentRef, { status: 'aprobado', observations: observationNote, exchangeRate: exchangeRate.toNumber(), receiptNumbers: newReceiptNumbers });
                    });
            
                    toast({ title: 'Pago Aprobado y Procesado', description: 'El saldo de los propietarios y las deudas han sido actualizados.', className: 'bg-green-100 border-green-400 text-green-800' });
                } catch (error) {
                    console.error("Error processing payment approval: ", error);
                    const errorMessage = error instanceof Error ? error.message : 'No se pudo aprobar y procesar el pago.';
                    toast({ variant: 'destructive', title: 'Error en la Operación', description: errorMessage });
                }
            }
        });
      };
    
    const confirmDelete = async () => {
        if (!paymentToDelete) return;
        requestAuthorization(async () => {
            const paymentRef = doc(db, "payments", paymentToDelete.id);
            try {
                if (paymentToDelete.status === 'aprobado') {
                     const batch = writeBatch(db);
                    for (const beneficiary of paymentToDelete.beneficiaries) {
                        const ownerRef = doc(db, 'owners', beneficiary.ownerId);
                        const ownerDoc = await getDoc(ownerRef);
                        if (ownerDoc.exists()) {
                            const currentBalance = ownerDoc.data().balance || 0;
                            const amountToRevert = beneficiary.amount || 0;
                            batch.update(ownerRef, { balance: currentBalance + amountToRevert });
                        }
                    }
                    const debtsToRevertQuery = query(collection(db, 'debts'), where('paymentId', '==', paymentToDelete.id));
                    const debtsToRevertSnapshot = await getDocs(debtsToRevertQuery);
                    debtsToRevertSnapshot.forEach(debtDoc => {
                        if (debtDoc.data().description.includes('Pagada por adelantado')) batch.delete(debtDoc.ref);
                        else batch.update(debtDoc.ref, { status: 'pending', paymentDate: deleteField(), paidAmountUSD: deleteField(), paymentId: deleteField() });
                    });
                    batch.delete(paymentRef);
                    await batch.commit();
                    toast({ title: "Pago Revertido", description: "El pago ha sido eliminado y las deudas y saldos han sido revertidos." });
                } else {
                    await deleteDoc(paymentRef);
                    toast({ title: "Pago Eliminado", description: "El registro del pago pendiente/rechazado ha sido eliminado." });
                }
            } catch (error) {
                console.error("Error deleting/reverting payment: ", error);
                const errorMessage = error instanceof Error ? error.message : "No se pudo completar la operación.";
                toast({ variant: "destructive", title: "Error en la Operación", description: errorMessage });
            } finally {
                setIsDeleteConfirmationOpen(false);
                setPaymentToDelete(null);
            }
        });
    };
    
    const handleGenerateAndAct = async (action: 'download' | 'share', data: ReceiptData) => {
        if (!data || !companyInfo) return;
        setIsGenerating(true);
    
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const { payment, beneficiary, paidDebts, previousBalance, currentBalance, qrCodeUrl, receiptNumber } = data;

            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;
            let startY = margin;
    
            if (companyInfo.logo) {
                try { doc.addImage(companyInfo.logo, 'PNG', margin, startY, 25, 25); }
                catch(e) { console.error("Error adding logo to PDF", e); }
            }
            
            const infoX = margin + 30;
            doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, infoX, startY + 5);
            doc.setFontSize(9).setFont('helvetica', 'normal');
            const addressLines = doc.splitTextToSize(companyInfo.address, 90);
            doc.text(`${companyInfo.rif}`, infoX, startY + 11);
            doc.text(addressLines, infoX, startY + 16);
            const addressHeight = addressLines.length * 4;
            doc.text(`Teléfono: ${companyInfo.phone}`, infoX, startY + 16 + addressHeight);
            
            doc.setFontSize(9).text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, startY + 5, { align: 'right' });
            
            startY += 32;
            doc.setLineWidth(0.5).line(margin, startY, pageWidth - margin, startY);
            startY += 12;
    
            doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, startY, { align: 'center' });
            
            const qrSize = 30;
            const qrX = pageWidth - margin - qrSize;
            doc.setFontSize(9).setFont('helvetica', 'normal').text(`N° de recibo: ${receiptNumber}`, qrX + qrSize, startY + 8, { align: 'right' });
            if(qrCodeUrl) {
                doc.addImage(qrCodeUrl, 'PNG', qrX, startY + 10, qrSize, qrSize);
            }
            
            startY += 8;
    
            doc.setFontSize(9);
            const detailsX = margin;
            doc.text(`Beneficiario: ${beneficiary.ownerName} (${data.ownerUnit})`, detailsX, startY);
            startY += 5;
            doc.text(`Método de pago: ${payment.type}`, detailsX, startY);
            startY += 5;
            doc.text(`Banco Emisor: ${payment.bank}`, detailsX, startY);
            startY += 5;
            doc.text(`N° de Referencia Bancaria: ${payment.reference}`, detailsX, startY);
            startY += 5;
            doc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, detailsX, startY);
            startY += 5;
            doc.text(`Tasa de Cambio Aplicada: Bs. ${formatToTwoDecimals(payment.exchangeRate)} por USD`, detailsX, startY);
            
            startY += 15;
    
            let totalPaidInConcepts = 0;
            const tableBody = paidDebts.map(debt => {
                const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
                totalPaidInConcepts += debtAmountBs;
                const propertyLabel = debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A';
                const concept = `${debt.description} (${propertyLabel})`;
                return [ 
                    `${monthsLocale[debt.month]} ${debt.year}`,
                    concept, 
                    `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`, 
                    `Bs. ${formatToTwoDecimals(debtAmountBs)}` 
                ];
            });
    
            if (paidDebts.length === 0) {
                totalPaidInConcepts = beneficiary.amount;
                tableBody.push(['', 'Abono a Saldo a Favor', '', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`]);
            }
    
            autoTable(doc, { 
                startY: startY, 
                head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']], 
                body: tableBody, 
                theme: 'striped', 
                headStyles: { fillColor: [30, 80, 180], textColor: 255 }, 
                styles: { fontSize: 9, cellPadding: 2.5 },
                columnStyles: {
                    2: { halign: 'right' },
                    3: { halign: 'right' },
                }
            });
            startY = (doc as any).lastAutoTable.finalY + 10;
            
            const rightColX = pageWidth - margin;
            doc.setFontSize(9);
            
            doc.text('Saldo a Favor Anterior:', rightColX - 50, startY, { align: 'right' });
            doc.text(`Bs. ${formatToTwoDecimals(previousBalance)}`, rightColX, startY, { align: 'right' });
            startY += 5;
            
            doc.text('Monto del Pago Recibido:', rightColX - 50, startY, { align: 'right' });
            doc.text(`Bs. ${formatToTwoDecimals(beneficiary.amount)}`, rightColX, startY, { align: 'right' });
            startY += 5;
    
            doc.text('Total Abonado en Deudas:', rightColX - 50, startY, { align: 'right' });
            doc.text(`Bs. ${formatToTwoDecimals(totalPaidInConcepts)}`, rightColX, startY, { align: 'right' });
            startY += 5;
    
            doc.text('Saldo a Favor Actual:', rightColX - 50, startY, { align: 'right' });
            doc.text(`Bs. ${formatToTwoDecimals(currentBalance)}`, rightColX, startY, { align: 'right' });
            startY += 8;
    
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL PAGADO:', rightColX - 50, startY, { align: 'right' });
            doc.text(`Bs. ${formatToTwoDecimals(beneficiary.amount)}`, rightColX, startY, { align: 'right' });
            startY += 10;
    
            // 6. Footer Notes
            startY = Math.max(startY, 220); 
            doc.setFontSize(8).setFont('helvetica', 'normal');
    
            if (payment.observations) {
                const obsText = `Observaciones: ${payment.observations}`;
                doc.text(obsText, margin, startY);
                startY += 5;
            }
    
            const note1 = 'Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.';
            const note2 = "Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.";
            const note3 = `Firma electrónica: '${companyInfo.name} - Condominio'`;
    
            doc.text(note1, margin, startY);
            startY += 4;
            doc.text(note2, margin, startY);
            startY += 4;
            doc.text(note3, margin, startY);
            startY += 8;
    
            doc.setLineWidth(0.2).line(margin, startY, pageWidth - margin, startY);
            startY += 4;
            doc.setFont('helvetica', 'italic').text('Este recibo se generó de manera automatica y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});
            
            const pdfOutput = doc.output('blob');
            const pdfFile = new File([pdfOutput], `recibo_${receiptNumber}.pdf`, { type: 'application/pdf' });
    
            if (action === 'download') {
                doc.save(`recibo_${receiptNumber}.pdf`);
            } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                await navigator.share({
                    title: `Recibo de Pago ${data.receiptNumber}`, 
                    text: `Recibo de pago para ${data.ownerName}.`,
                    files: [pdfFile],
                });
            } else {
                const url = URL.createObjectURL(pdfFile);
                window.open(url, '_blank');
            }
        } catch(error) {
            console.error("Error generating PDF:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo generar el documento PDF." });
        } finally {
            setIsGenerating(false);
        }
    };

    const openReceiptForBeneficiary = async (payment: FullPayment, beneficiary: Beneficiary) => {
        if (!companyInfo) {
            toast({ variant: "destructive", title: "Error", description: "Datos de la compañía no cargados." });
            return;
        }

        const owner = ownersMap.get(beneficiary.ownerId);
        if (!owner) {
            toast({ variant: "destructive", title: "Error", description: "No se encontró al propietario." });
            return;
        }

        setIsGenerating(true);
        try {
            const { default: QRCode } = await import('qrcode');

            const paidDebtsSnapshot = await getDocs(
                query(collection(db, 'debts'), where('paymentId', '==', payment.id), where('ownerId', '==', beneficiary.ownerId))
            );
            const paidDebts = paidDebtsSnapshot.docs.map(d => d.data() as Debt);
            
            const totalDebtPaidWithPayment = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
            
            const ownerDoc = await getDoc(doc(db, 'owners', beneficiary.ownerId));
            const currentBalance = ownerDoc.exists() ? (ownerDoc.data().balance || 0) : 0;
            const previousBalance = currentBalance - (beneficiary.amount - totalDebtPaidWithPayment);

            const receiptNumber = payment.receiptNumbers?.[beneficiary.ownerId] || `N/A-${payment.id.slice(-5)}`;
            const receiptUrl = `${window.location.origin}/receipt/${payment.id}/${beneficiary.ownerId}`;
            const qrDataContent = JSON.stringify({ receiptNumber, date: format(new Date(), 'yyyy-MM-dd'), amount: beneficiary.amount, ownerId: beneficiary.ownerId, url: receiptUrl });
            const qrCodeUrl = await QRCode.toDataURL(qrDataContent, { errorCorrectionLevel: 'M', margin: 2, scale: 4, color: { dark: '#000000', light: '#FFFFFF' } });

            const ownerUnit = (beneficiary.street && beneficiary.house) 
                ? `${beneficiary.street} - ${beneficiary.house}` 
                : (owner.properties?.[0] ? `${owner.properties[0].street} - ${owner.properties[0].house}`: 'N/A');

            setReceiptData({
                payment, beneficiary, ownerName: owner.name,
                ownerUnit: ownerUnit,
                paidDebts: paidDebts.sort((a,b) => a.year - b.year || a.month - a.month),
                previousBalance, currentBalance: currentBalance,
                receiptNumber, qrCodeUrl
            });
            setIsReceiptPreviewOpen(true);
        } catch (error) {
            console.error("Error preparing receipt preview:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar la vista previa del recibo.' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePreviewReceipt = async (payment: FullPayment) => {
        if (payment.beneficiaries.length > 1) {
            setPaymentForBeneficiarySelection(payment);
            setIsBeneficiarySelectionOpen(true);
        } else {
            const beneficiary = payment.beneficiaries[0];
            await openReceiptForBeneficiary(payment, beneficiary);
        }
    };


    const filteredPayments = payments.filter(p => filter === 'todos' || p.status === filter);
    
    return (
        <Card>
            <CardHeader className="bg-primary text-primary-foreground rounded-t-2xl">
                <div className="flex justify-between items-center">
                    <CardTitle>Pagos Registrados</CardTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline"><Filter className="mr-2 h-4 w-4" />Filtrar por: <span className="font-semibold ml-1 capitalize">{filter === 'todos' ? 'Todos' : statusTextMap[filter]}</span></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setFilter('todos')}>Todos</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('pendiente')}>{statusTextMap['pendiente']}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('aprobado')}>{statusTextMap['aprobado']}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('rechazado')}>{statusTextMap['rechazado']}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>Beneficiario</TableHead><TableHead>Monto</TableHead><TableHead>Fecha</TableHead><TableHead>Referencia</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {loading ? <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                         : filteredPayments.length === 0 ? <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No hay pagos que coincidan con el filtro seleccionado.</TableCell></TableRow>
                         : filteredPayments.map((payment) => (
                            <TableRow key={payment.id}>
                                <TableCell className="font-medium">{payment.user}</TableCell>
                                <TableCell>{payment.type === 'adelanto' ? `$${formatToTwoDecimals(payment.amount)}` : `Bs. ${formatToTwoDecimals(payment.amount)}`}</TableCell>
                                <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                                <TableCell>{payment.reference}</TableCell>
                                <TableCell><Badge variant={statusVariantMap[payment.status]}>{statusTextMap[payment.status]}</Badge></TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                             {payment.status === 'aprobado' && <DropdownMenuItem onClick={() => handlePreviewReceipt(payment)}><Eye className="mr-2 h-4 w-4" />Ver Recibo</DropdownMenuItem>}
                                             {payment.receiptUrl && <DropdownMenuItem onClick={() => setReceiptImageToView(payment.receiptUrl!)}><Paperclip className="mr-2 h-4 w-4" /> Ver Comprobante Adjunto</DropdownMenuItem>}
                                            {payment.status === 'pendiente' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'aprobado')}><CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />Aprobar</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'rechazado')} className="text-destructive"><XCircle className="mr-2 h-4 w-4" />Rechazar</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                </>
                                            )}
                                             <DropdownMenuItem onClick={() => {setPaymentToDelete(payment); setIsDeleteConfirmationOpen(true);}} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Está seguro?</DialogTitle>
                        <DialogDescription>Esta acción no se puede deshacer. Esto eliminará permanentemente el registro del pago. Si el pago ya fue aprobado, se revertirán las deudas y saldos del propietario afectado.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar pago</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={isBeneficiarySelectionOpen} onOpenChange={setIsBeneficiarySelectionOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Seleccionar Beneficiario</DialogTitle>
                        <DialogDescription>
                            Este pago fue asignado a múltiples propietarios. Por favor, seleccione el recibo que desea ver.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        {paymentForBeneficiarySelection?.beneficiaries.map((beneficiary, index) => (
                            <Button
                                key={index}
                                variant="outline"
                                className="w-full justify-start text-left h-auto"
                                onClick={async () => {
                                    setIsBeneficiarySelectionOpen(false);
                                    if(paymentForBeneficiarySelection) {
                                      await openReceiptForBeneficiary(paymentForBeneficiarySelection, beneficiary);
                                    }
                                }}
                            >
                                <div>
                                    <p className="font-semibold">{beneficiary.ownerName}</p>
                                    <p className="text-sm text-muted-foreground">
                                        Monto: Bs. {formatToTwoDecimals(beneficiary.amount)}
                                        {beneficiary.street && ` | Propiedad: ${beneficiary.street} - ${beneficiary.house}`}
                                    </p>
                                </div>
                            </Button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={!!receiptImageToView} onOpenChange={() => setReceiptImageToView(null)}>
                <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Comprobante de Pago</DialogTitle></DialogHeader><div className="p-4 flex justify-center"><img src={receiptImageToView!} alt="Comprobante de pago" className="max-w-full max-h-[80vh] object-contain"/></div></DialogContent>
            </Dialog>
            <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
                 <DialogContent className="sm:max-w-2xl">
                    {receiptData ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Receipt className="text-primary"/> Recibo de Pago N°: {receiptData.receiptNumber}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto p-4 border rounded-lg">
                                <div className="text-sm">
                                    <p><strong>Beneficiario:</strong> {receiptData.ownerName}</p>
                                    <p><strong>Propiedad:</strong> {receiptData.ownerUnit}</p>
                                    <p><strong>Fecha del Pago:</strong> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                                </div>
                                <Separator/>
                                <h4 className="font-semibold mb-2">Conceptos Pagados</h4>
                                    {receiptData.paidDebts.length > 0 ? (
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Período</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Monto (Bs)</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {receiptData.paidDebts.map(debt => (
                                                    <TableRow key={debt.id}>
                                                        <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                        <TableCell>{debt.description}</TableCell>
                                                        <TableCell className="text-right">{formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (<p className="text-xs italic text-muted-foreground">El pago fue abonado al saldo a favor.</p>)}
                            </div>
                           <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
                                <Button className="w-full sm:w-auto" onClick={() => handleGenerateAndAct('download', receiptData)} disabled={isGenerating}>
                                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Download className="h-4 w-4 mr-2"/>}
                                    Descargar PDF
                                </Button>
                                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => handleGenerateAndAct('share', receiptData)} disabled={isGenerating}>
                                    <Share2 className="h-4 w-4 mr-2"/>
                                    Compartir
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                          <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin" />
                          </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// ===================================================================================
// REPORT PAYMENT COMPONENT
// ===================================================================================
function ReportPaymentTab() {
    const { toast } = useToast();
    const { user: authUser, ownerData: authOwnerData } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<any>('');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [amountUSD, setAmountUSD] = useState<string>('');
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [openSections, setOpenSections] = useState({ details: true, beneficiaries: true });

    useEffect(() => {
        const q = query(collection(db, "owners"), where("role", "==", "propietario"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        setPaymentDate(new Date());
        if (authOwnerData) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: { id: authUser!.uid, name: authOwnerData.name, properties: authOwnerData.properties, balance: authOwnerData.balance },
                searchTerm: '',
                amount: '',
                selectedProperty: authOwnerData.properties?.[0] || null
            }]);
        }
    }, [authOwnerData, authUser]);
    
    useEffect(() => {
        const fetchRate = async () => {
             try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    if (paymentDate) {
                        setExchangeRate(null);
                        setExchangeRateMessage('Buscando tasa...');
                        const allRates = (settings.exchangeRates || []) as ExchangeRate[];
                        const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                        const applicableRates = allRates.filter(r => r.date <= paymentDateString).sort((a, b) => b.date.localeCompare(a.date));
                        if (applicableRates.length > 0) {
                             setExchangeRate(applicableRates[0].rate);
                             setExchangeRateMessage('');
                        } else setExchangeRateMessage('No hay tasa para esta fecha.');
                    } else { setExchangeRate(null); setExchangeRateMessage(''); }
                } else setExchangeRateMessage('No hay configuraciones.');
            } catch (e) { setExchangeRateMessage('Error al buscar tasa.'); }
        }
        fetchRate();
    }, [paymentDate]);

    useEffect(() => {
        if (exchangeRate && exchangeRate > 0) {
            const bs = parseFloat(totalAmount);
            if (!isNaN(bs) && bs > 0) {
                setAmountUSD((bs / exchangeRate).toFixed(2));
            } else {
                setAmountUSD('');
            }
        }
    }, [totalAmount, exchangeRate]);

    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balance = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);

    const resetForm = () => {
        setPaymentDate(new Date()); setExchangeRate(null); setExchangeRateMessage(''); setPaymentMethod(''); setBank(''); setOtherBank(''); setReference(''); setTotalAmount(''); setAmountUSD('');
        setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
        setReceiptImage(null);
    }

    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });
    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => {
        if (beneficiaryRows.length > 1) setBeneficiaryRows(rows => rows.filter(row => row.id !== id));
        else setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    };
    const getFilteredOwners = (searchTerm: string) => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    };
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressedBase64 = await compressImage(file, 800, 800);
                setReceiptImage(compressedBase64);
                toast({ title: 'Comprobante cargado', description: 'La imagen se ha optimizado y está lista para ser enviada.' });
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error de imagen', description: 'No se pudo procesar la imagen.' });
            }
        }
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setIsSubmitting(true);
        const validationResult = await validateForm();
        if (!validationResult.isValid) { toast({ variant: 'destructive', title: 'Error de Validación', description: validationResult.error, duration: 6000 }); setIsSubmitting(false); return; }
        try {
            const beneficiaries = beneficiaryRows.map(row => ({ ownerId: row.owner!.id, ownerName: row.owner!.name, ...(row.selectedProperty || {}), amount: Number(row.amount) }));
            const paymentData = { 
                condominioId: authOwnerData.condominioId,
                paymentDate: Timestamp.fromDate(paymentDate!), 
                exchangeRate, 
                paymentMethod, 
                bank: bank === 'Otro' ? otherBank : bank, 
                reference, 
                totalAmount: Number(totalAmount), 
                beneficiaries, 
                beneficiaryIds: Array.from(new Set(beneficiaries.map(b => b.ownerId))), 
                status: 'pendiente' as 'pendiente', 
                reportedAt: serverTimestamp(), 
                reportedBy: authUser?.uid || 'unknown_admin', 
                receiptUrl: receiptImage 
            };
            await addDoc(collection(db, "payments"), paymentData);
            resetForm(); setIsInfoDialogOpen(true);
        } catch (error) { console.error("Error submitting payment:", error); toast({ variant: "destructive", title: "Error Inesperado", description: "No se pudo enviar el reporte." });
        } finally { setIsSubmitting(false); }
    };
    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        if (!paymentDate || !exchangeRate || !paymentMethod || !bank || !totalAmount || Number(totalAmount) <= 0 || reference.length < 4) return { isValid: false, error: 'Por favor, complete todos los campos de la transacción (referencia min. 4 dígitos).' };
        if (!receiptImage) {
            return { isValid: false, error: 'Debe adjuntar una imagen del comprobante de pago.' };
        }
        if (beneficiaryRows.some(row => !row.owner || !row.amount || Number(row.amount) <= 0 || !row.selectedProperty)) return { isValid: false, error: 'Por favor, complete todos los campos para cada beneficiario.' };
        if (Math.abs(balance) > 0.01) return { isValid: false, error: 'El monto total no coincide con la suma de los montos asignados.' };
        try {
            const q = query(
                collection(db, "payments"),
                where("condominioId", "==", authOwnerData.condominioId),
                where("reference", "==", reference), 
                where("totalAmount", "==", Number(totalAmount)), 
                where("paymentDate", "==", Timestamp.fromDate(paymentDate))
            );
            if (!(await getDocs(q)).empty) return { isValid: false, error: 'Ya existe un reporte de pago con esta misma referencia, monto y fecha.' };
        } catch (dbError) { return { isValid: false, error: "No se pudo verificar si el pago ya existe." }; }
        return { isValid: true };
    };

    return (
        <div>
            <Card className="w-full max-w-4xl border-2 border-white overflow-hidden shadow-2xl rounded-2xl">
                <CardHeader className="bg-primary text-primary-foreground p-4 flex flex-row items-center justify-between rounded-t-2xl">
                     <div className="flex items-center gap-3">
                        <Banknote className="w-7 h-7" />
                        <CardTitle>Reportar Pago</CardTitle>
                    </div>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4 p-4">
                        <Collapsible open={openSections.details} onOpenChange={(isOpen) => setOpenSections(prev => ({...prev, details: isOpen}))}>
                            <Card className="border-none bg-background/5">
                                <CollapsibleTrigger className="w-full">
                                    <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                                        <CardTitle>1. Detalles de la Transacción</CardTitle>
                                        <ChevronDown className={`h-5 w-5 transition-transform ${openSections.details ? 'rotate-180' : ''}`} />
                                    </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <CardContent className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-2"><Label htmlFor="paymentDate">Fecha del Pago</Label><Popover><PopoverTrigger asChild><Button id="paymentDate" variant={"outline"} className={cn("w-full justify-start", !paymentDate && "text-muted-foreground")} disabled={loading}><CalendarIcon className="mr-2 h-4 w-4" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} /></PopoverContent></Popover></div>
                                        <div className="space-y-2"><Label>Tasa de Cambio (Bs. por USD)</Label><Input type="text" value={exchangeRate ? `Bs. ${exchangeRate.toFixed(2)}` : exchangeRateMessage || 'Seleccione una fecha'} readOnly className={cn("bg-muted/50")} /></div>
                                        <div className="space-y-2"><Label htmlFor="paymentMethod">Tipo de Pago</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)} disabled={loading}><SelectTrigger id="paymentMethod"><SelectValue placeholder="Seleccione..." /></SelectTrigger><SelectContent><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem></SelectContent></Select></div>
                                        <div className="space-y-2"><Label htmlFor="bank">Banco Emisor</Label><Button type="button" id="bank" variant="outline" className="w-full justify-start text-left font-normal" onClick={() => setIsBankModalOpen(true)} disabled={loading}>{bank ? <><Banknote className="mr-2 h-4 w-4" />{bank}</> : <span>Seleccione un banco...</span>}</Button></div>
                                        {bank === 'Otro' && <div className="space-y-2 md:col-span-2"><Label htmlFor="otherBank">Nombre del Otro Banco</Label><Input id="otherBank" value={otherBank} onChange={(e) => setOtherBank(e.target.value)} disabled={loading}/></div>}
                                        <div className="space-y-2"><Label htmlFor="reference">Últimos 6 dígitos de la Referencia</Label><Input id="reference" value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} disabled={loading} /><p className="text-xs text-muted-foreground">La referencia debe tener al menos 4 dígitos.</p></div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label htmlFor="receipt">Comprobante de Pago (Opcional)</Label>
                                            <Input id="receipt" type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} disabled={loading}/>
                                            {receiptImage && (
                                                <div className="mt-2 relative w-32 h-32 border p-1 rounded-lg">
                                                    <img src={receiptImage} alt="Vista previa del comprobante" className="w-full h-full object-contain" />
                                                    <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => setReceiptImage(null)}>
                                                        <XCircle className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                        <Collapsible open={openSections.beneficiaries} onOpenChange={(isOpen) => setOpenSections(prev => ({...prev, beneficiaries: isOpen}))}>
                            <Card className="border-none bg-background/5">
                                 <CollapsibleTrigger className="w-full">
                                    <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                                        <CardTitle>2. Monto y Beneficiarios</CardTitle>
                                        <ChevronDown className={`h-5 w-5 transition-transform ${openSections.beneficiaries ? 'rotate-180' : ''}`} />
                                    </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <CardContent className="space-y-6 pt-4">
                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label htmlFor="totalAmount">Monto Total del Pago (Bs.)</Label>
                                                <Input id="totalAmount" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" disabled={loading}/>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Monto Equivalente (USD)</Label>
                                                <div className="relative">
                                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                    <Input type="text" value={amountUSD} readOnly className="pl-9 bg-muted/50" placeholder="0.00" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4"><Label className="font-semibold">Asignación de Montos</Label>
                                            {beneficiaryRows.map((row, index) => (
                                                <Card key={row.id} className="p-4 bg-muted/50 relative">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2"><Label htmlFor={`search-${row.id}`}>Beneficiario {index + 1}</Label>
                                                            {!row.owner ? (<><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id={`search-${row.id}`} placeholder="Buscar por nombre..." className="pl-9" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} disabled={loading} /></div>{row.searchTerm.length >= 2 && getFilteredOwners(row.searchTerm).length > 0 && <Card className="border rounded-md"><ScrollArea className="h-32">{getFilteredOwners(row.searchTerm).map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(row.id, owner)} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium text-sm">{owner.name}</p></div>))}</ScrollArea></Card>}</>)
                                                            : (<div className="p-3 bg-background rounded-md flex items-center justify-between"><div><p className="font-semibold text-primary">{row.owner.name}</p></div><Button variant="ghost" size="icon" onClick={() => updateBeneficiaryRow(row.id, { owner: null, selectedProperty: null })} disabled={loading}><XCircle className="h-5 w-5 text-destructive" /></Button></div>)}
                                                        </div>
                                                        <div className="space-y-2"><Label htmlFor={`amount-${row.id}`}>Monto Asignado (Bs.)</Label><Input id={`amount-${row.id}`} type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={loading || !row.owner} /></div>
                                                    </div>
                                                    {row.owner && <div className="mt-4 space-y-2"><Label>Asignar a Propiedad</Label><Select onValueChange={(v) => updateBeneficiaryRow(row.id, { selectedProperty: row.owner!.properties?.find(p => `${p.street}-${p.house}` === v) || null })} value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''} disabled={loading || !row.owner}><SelectTrigger><SelectValue placeholder="Seleccione una propiedad..." /></SelectTrigger><SelectContent>{row.owner.properties?.map(p => (<SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{`${p.street} - ${p.house}`}</SelectItem>))}</SelectContent></Select></div>}
                                                    {index > 0 && <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading}><Trash2 className="h-4 w-4"/></Button>}
                                                </Card>
                                            ))}
                                            <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} disabled={loading}><UserPlus className="mr-2 h-4 w-4"/>Añadir Otro Beneficiario</Button>
                                            <CardFooter className="p-4 bg-background/50 rounded-lg space-y-2 mt-4 flex-col items-stretch">
                                                <div className="flex justify-between text-sm font-medium"><span>Monto Total del Pago:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                                <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div><hr className="my-1 border-border"/><div className={cn("flex justify-between text-base font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                                            </CardFooter>
                                        </div>
                                    </CardContent>
                                   </CollapsibleContent>
                                </Card>
                            </Collapsible>
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
                </Card>
    
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
        </div>
    );
}

// ===================================================================================
// MAIN PAGE COMPONENT (DEFAULT EXPORT)
// ===================================================================================
export default function PaymentsPage() {
    return (
        <div className="space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                    Gestión de <span className="text-primary">Pagos</span>
                </h2>
                <div className="h-1.5 w-20 bg-yellow-400 mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
                    Verificación de pagos reportados y registro manual.
                </p>
            </div>
            <Tabs defaultValue="verify" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="verify">Verificar Pagos de Propietarios</TabsTrigger>
                    <TabsTrigger value="report">Registrar un Pago Manualmente</TabsTrigger>
                </TabsList>
                <TabsContent value="verify" className="mt-4">
                    <Suspense fallback={<Loader2 className="animate-spin" />}>
                        <VerifyPaymentsTab />
                    </Suspense>
                </TabsContent>
                <TabsContent value="report" className="mt-4">
                    <ReportPaymentTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}

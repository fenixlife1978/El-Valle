

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, MoreHorizontal, Printer, Filter, Loader2, Trash2, Share2, FileText, Download, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { collection, onSnapshot, query, doc, updateDoc, getDoc, writeBatch, where, orderBy, Timestamp, getDocs, deleteField, deleteDoc, runTransaction, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, addMonths, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useAuthorization } from '@/hooks/use-authorization';

type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil' | 'adelanto' | 'conciliacion';

type Owner = {
    id: string;
    name: string;
    properties?: { street: string, house: string }[];
    receiptCounter?: number;
    balance: number;
};

type Beneficiary = { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; };

type FullPayment = {
  id: string;
  beneficiaries: Beneficiary[];
  beneficiaryIds: string[];
  totalAmount: number;
  exchangeRate: number;
  paymentDate: Timestamp;
  status: PaymentStatus;
  user?: string; 
  unit: string;
  amount: number;
  date: string;
  bank: string;
  type: PaymentMethod;
  reference: string;
  receiptNumber?: string;
  receiptNumbers?: { [ownerId: string]: string };
  reportedBy: string;
  reportedAt?: Timestamp;
  observations?: string;
  isReconciled?: boolean;
};

type Debt = {
    id: string;
    ownerId: string;
    property: { street: string; house: string; };
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number; // Amount at which the debt was paid
    paymentDate?: Timestamp;
    paymentId?: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type ReceiptData = {
    payment: FullPayment;
    beneficiary: Beneficiary;
    ownerName: string;
    ownerUnit: string;
    paidDebts: Debt[];
    previousBalance: number;
    currentBalance: number;
    qrCodeUrl?: string;
    receiptNumber: string;
} | null;


const statusVariantMap: { [key in PaymentStatus]: 'warning' | 'success' | 'destructive' } = {
  pendiente: 'warning',
  aprobado: 'success',
  rechazado: 'destructive',
};

const statusTextMap: { [key in PaymentStatus]: string } = {
    pendiente: 'Pendiente',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export default function VerifyPaymentsPage() {
  const [payments, setPayments] = useState<FullPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PaymentStatus | 'todos'>('todos');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [condoFee, setCondoFee] = useState(0);
  const [paymentToDelete, setPaymentToDelete] = useState<FullPayment | null>(null);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const { toast } = useToast();
  const { requestAuthorization } = useAuthorization();
  const [ownersMap, setOwnersMap] = useState<Map<string, Owner>>(new Map());
  const router = useRouter();

  const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  useEffect(() => {
    const ownersQuery = query(collection(db, "owners"));
    const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
        const newOwnersMap = new Map<string, Owner>();
        snapshot.forEach(doc => {
            newOwnersMap.set(doc.id, { id: doc.id, ...doc.data() } as Owner);
        });
        setOwnersMap(newOwnersMap);
    });

    return () => ownersUnsubscribe();
  }, []);

  useEffect(() => {
    if (ownersMap.size === 0) return;

    setLoading(true);

    const q = query(collection(db, "payments"), orderBy('reportedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const paymentsData: FullPayment[] = [];
        snapshot.forEach(doc => {
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
                        // Fallback to the first property of the owner
                        unit = `${owner.properties[0].street} - ${owner.properties[0].house}`;
                    }
                }
            }

            paymentsData.push({
                id: doc.id,
                user: userName,
                unit: unit,
                amount: data.totalAmount,
                date: new Date(data.paymentDate.seconds * 1000).toISOString(),
                bank: data.bank,
                type: data.paymentMethod,
                reference: data.reference,
                receiptNumber: data.receiptNumber,
                receiptNumbers: data.receiptNumbers,
                status: data.status,
                beneficiaries: data.beneficiaries,
                beneficiaryIds: data.beneficiaryIds || [],
                totalAmount: data.totalAmount,
                exchangeRate: data.exchangeRate,
                paymentDate: data.paymentDate,
                reportedBy: data.reportedBy,
                reportedAt: data.reportedAt,
                observations: data.observations,
                isReconciled: data.isReconciled,
            });
        });

        setPayments(paymentsData);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching payments: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos.' });
        setLoading(false);
    });
    
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

    return () => unsubscribe();
  }, [toast, ownersMap]);


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
                    // --- 1. READS ---
                    const paymentDoc = await transaction.get(paymentRef);
                    if (!paymentDoc.exists() || paymentDoc.data().status === 'aprobado') {
                        throw new Error('El pago no existe o ya fue aprobado anteriormente.');
                    }
                    const paymentData = { id: paymentDoc.id, ...paymentDoc.data() } as FullPayment;
    
                    const settingsRef = doc(db, 'config', 'mainSettings');
                    const settingsSnap = await transaction.get(settingsRef);
                    if (!settingsSnap.exists()) throw new Error('No se encontró el documento de configuración.');
                    
                    const settingsData = settingsSnap.data();
                    const allRates = (settingsData.exchangeRates || []) as {date: string, rate: number}[];
                    const currentCondoFee = settingsData.condoFee || 0;
                    
                    if (currentCondoFee <= 0 && paymentData.type !== 'adelanto') {
                        throw new Error('La cuota de condominio debe ser mayor a cero. Por favor, configúrela.');
                    }
    
                    const paymentDateString = format(paymentData.paymentDate.toDate(), 'yyyy-MM-dd');
                    const applicableRates = allRates.filter(r => r.date <= paymentDateString).sort((a, b) => b.date.localeCompare(a.date));
                    const exchangeRate = applicableRates.length > 0 ? applicableRates[0].rate : 0;
                    
                    if (!exchangeRate || exchangeRate <= 0) {
                        throw new Error(`No se encontró una tasa de cambio válida para la fecha del pago (${paymentDateString}).`);
                    }
                    paymentData.exchangeRate = exchangeRate;
    
                    const allBeneficiaryIds = Array.from(new Set(paymentData.beneficiaries.map(b => b.ownerId)));
                    if (allBeneficiaryIds.length === 0) throw new Error("El pago no tiene beneficiarios definidos.");
    
                    const ownerDocs = await Promise.all(allBeneficiaryIds.map(ownerId => transaction.get(doc(db, 'owners', ownerId))));
                    const ownerDataMap = new Map<string, any>();
                    ownerDocs.forEach((ownerDoc) => {
                        if (!ownerDoc.exists()) throw new Error(`El propietario ${ownerDoc.id} no fue encontrado.`);
                        ownerDataMap.set(ownerDoc.id, ownerDoc.data());
                    });
    
                    // --- 2. LOGIC AND WRITES ---
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
    
                        const initialBalance = ownerData.balance || 0;
                        const paymentAmountForOwner = beneficiary.amount;
    
                        let availableFundsInCents = Math.round(paymentAmountForOwner * 100) + Math.round(initialBalance * 100);
                        
                        const debtsQuery = query(collection(db, 'debts'), where('ownerId', '==', ownerId), where('status', '==', 'pending'));
                        const debtsSnapshot = await getDocs(debtsQuery); // This read is outside transaction but fine as it is before writes.
                        
                        const sortedDebts = debtsSnapshot.docs
                            .map(d => ({ id: d.id, ...d.data() } as Debt))
                            .sort((a, b) => a.year - b.year || a.month - b.month);
                        
                        let hasPendingDebts = sortedDebts.length > 0;
                        
                        if (hasPendingDebts) {
                            for (const debt of sortedDebts) {
                                const debtRef = doc(db, 'debts', debt.id);
                                const debtAmountInCents = Math.round(debt.amountUSD * exchangeRate * 100);
                                
                                if (availableFundsInCents >= debtAmountInCents) {
                                    availableFundsInCents -= debtAmountInCents;
                                    transaction.update(debtRef, {
                                        status: 'paid', paidAmountUSD: debt.amountUSD,
                                        paymentDate: paymentData.paymentDate, paymentId: paymentData.id,
                                    });
                                }
                            }
                            // Re-check if any debts are still pending after applying funds
                            const remainingPendingQuery = query(collection(db, 'debts'), where('ownerId', '==', ownerId), where('status', '==', 'pending'));
                            const remainingSnapshot = await getDocs(remainingPendingQuery);
                            hasPendingDebts = !remainingSnapshot.empty;
                        }
                        
                        const condoFeeInCents = Math.round(currentCondoFee * exchangeRate * 100);
                        // Only process advance payments if there are NO pending debts left.
                        if (!hasPendingDebts && paymentData.type !== 'adelanto' && availableFundsInCents >= condoFeeInCents) {
                            const allExistingDebtsQuery = query(collection(db, 'debts'), where('ownerId', '==', ownerId));
                            const allExistingDebtsSnap = await getDocs(allExistingDebtsQuery); // Outside transaction read
                            const existingDebtPeriods = new Set(allExistingDebtsSnap.docs.map(d => `${d.data().year}-${d.data().month}`));
    
                            const startDate = startOfMonth(new Date());
    
                            if (ownerData.properties && ownerData.properties.length > 0) {
                                 for (const property of ownerData.properties) {
                                    for (let i = 0; i < 24; i++) { // Limit future debt creation
                                        if (availableFundsInCents < condoFeeInCents) break;
    
                                        const futureDebtDate = addMonths(startDate, i);
                                        const futureYear = futureDebtDate.getFullYear();
                                        const futureMonth = futureDebtDate.getMonth() + 1;
                                        const periodKey = `${futureYear}-${futureMonth}`;
                                        
                                        if (existingDebtPeriods.has(periodKey)) continue;
    
                                        availableFundsInCents -= condoFeeInCents;
                                        
                                        const debtRef = doc(collection(db, 'debts'));
                                        transaction.set(debtRef, {
                                            ownerId: ownerId,
                                            property: property,
                                            year: futureYear, month: futureMonth,
                                            amountUSD: currentCondoFee,
                                            description: "Cuota de Condominio (Pagada por adelantado)",
                                            status: 'paid', paidAmountUSD: currentCondoFee,
                                            paymentDate: paymentData.paymentDate, paymentId: paymentData.id,
                                        });
                                        existingDebtPeriods.add(periodKey);
                                    }
                                    if (availableFundsInCents < condoFeeInCents) break;
                                }
                            }
                        }
                        
                        const finalBalance = availableFundsInCents / 100;
                        transaction.update(ownerRef, { balance: finalBalance, receiptCounter: newReceiptCounter });
                        
                        // Create notification for the owner
                        const notificationsRef = doc(collection(ownerRef, "notifications"));
                        transaction.set(notificationsRef, {
                            title: "Pago Aprobado",
                            body: `Tu pago de Bs. ${formatToTwoDecimals(beneficiary.amount)} ha sido aprobado y aplicado.`,
                            createdAt: serverTimestamp(),
                            read: false,
                            href: `/owner/dashboard`,
                            paymentId: paymentData.id
                        });
                    }
                     const observationNote = `Pago aprobado. Tasa aplicada: Bs. ${formatToTwoDecimals(exchangeRate)}.`;
                     transaction.update(paymentRef, { status: 'aprobado', observations: observationNote, exchangeRate: exchangeRate, receiptNumbers: newReceiptNumbers });
    
                });
        
                toast({
                    title: 'Pago Aprobado y Procesado',
                    description: 'El saldo de los propietarios y las deudas han sido actualizados.',
                    className: 'bg-green-100 border-green-400 text-green-800',
                });
            } catch (error) {
                console.error("Error processing payment approval: ", error);
                const errorMessage = error instanceof Error ? error.message : 'No se pudo aprobar y procesar el pago.';
                toast({ variant: 'destructive', title: 'Error en la Operación', description: errorMessage });
            }
        }
    });
  };

  const openReceiptPreview = async (payment: FullPayment, beneficiary: Beneficiary) => {
    if (!companyInfo) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información de la empresa.' });
      return;
    }

    try {
      const ownerDoc = await getDoc(doc(db, "owners", beneficiary.ownerId));
      if (!ownerDoc.exists()) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se encontró al propietario.' });
        return;
      }
      const currentOwnerData = ownerDoc.data() as Owner;
      const currentBalance = currentOwnerData.balance || 0;

      const ownerUnitSummary = (beneficiary.street && beneficiary.house) ? `${beneficiary.street} - ${beneficiary.house}` : "Propiedad no especificada";

      const paidDebtsQuery = query(collection(db, "debts"), where("paymentId", "==", payment.id), where("ownerId", "==", beneficiary.ownerId));
      const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
      const paidDebts = paidDebtsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Debt).sort((a, b) => a.year - b.year || a.month - b.month);

      const totalDebtPaidWithPayment = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
      const paymentAmountForOwner = beneficiary.amount;
      const previousBalance = currentBalance - (paymentAmountForOwner - totalDebtPaidWithPayment);

      const receiptNumber = payment.receiptNumbers?.[beneficiary.ownerId] || payment.id.substring(0, 10);
      
      const receiptUrl = `${window.location.origin}/receipt/${payment.id}/${beneficiary.ownerId}`;
      const qrDataContent = JSON.stringify({ receiptNumber, date: format(new Date(), 'yyyy-MM-dd'), amount: beneficiary.amount, ownerId: beneficiary.ownerId, url: receiptUrl });
      const qrCodeUrl = await QRCode.toDataURL(qrDataContent, { errorCorrectionLevel: 'M', margin: 2, scale: 4, color: { dark: '#000000', light: '#FFFFFF' } });

      setReceiptData({
        payment,
        beneficiary,
        ownerName: beneficiary.ownerName,
        ownerUnit: ownerUnitSummary,
        paidDebts,
        previousBalance,
        currentBalance,
        qrCodeUrl,
        receiptNumber
      });
      setIsReceiptPreviewOpen(true);

    } catch (error) {
      console.error("Error preparing receipt data: ", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo preparar la vista previa del recibo.' });
    }
  };

  const generateAndAct = async (action: 'download' | 'share', data: ReceiptData) => {
    if (!data || !companyInfo) return;

    const { payment, beneficiary, paidDebts, previousBalance, currentBalance, qrCodeUrl, receiptNumber } = data;
    
    const pdfDoc = new jsPDF();
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const margin = 14;

    if (companyInfo.logo) {
        try { pdfDoc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
        catch(e) { console.error("Error adding logo to PDF", e); }
    }
    pdfDoc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
    pdfDoc.setFontSize(9).setFont('helvetica', 'normal');
    pdfDoc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
    pdfDoc.text(companyInfo.address, margin + 30, margin + 19);
    
    pdfDoc.setFontSize(10).text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
    
    pdfDoc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);
    pdfDoc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
    pdfDoc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${receiptNumber}`, pageWidth - margin, margin + 45, { align: 'right' });
    if(qrCodeUrl) {
      const qrSize = 30;
      pdfDoc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - qrSize, margin + 48, qrSize, qrSize);
    }
    
    let startY = margin + 60;
    pdfDoc.setFontSize(10).text(`Beneficiario: ${beneficiary.ownerName} (${data.ownerUnit})`, margin, startY);
    startY += 6;
    pdfDoc.text(`Método de pago: ${payment.type}`, margin, startY);
    startY += 6;
    pdfDoc.text(`Banco Emisor: ${payment.bank}`, margin, startY);
    startY += 6;
    pdfDoc.text(`N° de Referencia Bancaria: ${payment.reference}`, margin, startY);
    startY += 6;
    pdfDoc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, startY);
    startY += 6;
    pdfDoc.text(`Tasa de Cambio Aplicada: Bs. ${formatToTwoDecimals(payment.exchangeRate)} por USD`, margin, startY);
    startY += 10;
    
    let totalPaidInConcepts = 0;
    const tableBody = paidDebts.map(debt => {
        const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
        totalPaidInConcepts += debtAmountBs;
        const propertyLabel = debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A';
        const periodLabel = `${monthsLocale[debt.month]} ${debt.year}`;
        const concept = `${debt.description} (${propertyLabel})`;
        return [ periodLabel, concept, `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`, `Bs. ${formatToTwoDecimals(debtAmountBs)}` ];
    });

    if (paidDebts.length > 0) {
        autoTable(pdfDoc, { startY: startY, head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']], body: tableBody, theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
        startY = (pdfDoc as any).lastAutoTable.finalY;
    } else {
        totalPaidInConcepts = beneficiary.amount;
        autoTable(pdfDoc, { startY: startY, head: [['Concepto', 'Monto Pagado (Bs)']], body: [['Abono a Saldo a Favor', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`]], theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
        startY = (pdfDoc as any).lastAutoTable.finalY;
    }
    startY += 8;
    
    const summaryData = [
        ['Saldo a Favor Anterior:', `Bs. ${formatToTwoDecimals(previousBalance)}`],
        ['Monto del Pago Recibido:', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`],
        ['Total Abonado en Deudas:', `Bs. ${formatToTwoDecimals(totalPaidInConcepts)}`],
        ['Saldo a Favor Actual:', `Bs. ${formatToTwoDecimals(currentBalance)}`],
    ];
    autoTable(pdfDoc, { startY: startY, body: summaryData, theme: 'plain', styles: { fontSize: 9, fontStyle: 'bold' }, columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right'} } });
    startY = (pdfDoc as any).lastAutoTable.finalY + 10;
    
    const totalLabel = "TOTAL PAGADO:";
    const totalValue = `Bs. ${formatToTwoDecimals(beneficiary.amount)}`;
    pdfDoc.setFontSize(11).setFont('helvetica', 'bold');
    const totalValueWidth = pdfDoc.getStringUnitWidth(totalValue) * 11 / pdfDoc.internal.scaleFactor;
    pdfDoc.text(totalValue, pageWidth - margin, startY, { align: 'right' });
    pdfDoc.text(totalLabel, pageWidth - margin - totalValueWidth - 2, startY, { align: 'right' });

    const footerStartY = pdfDoc.internal.pageSize.getHeight() - 55;
    startY = startY > footerStartY ? footerStartY : startY + 10;
    if (payment.observations) {
        pdfDoc.setFontSize(8).setFont('helvetica', 'italic');
        const splitObservations = pdfDoc.splitTextToSize(`Observaciones: ${payment.observations}`, pageWidth - margin * 2);
        pdfDoc.text(splitObservations, margin, startY);
        startY += (splitObservations.length * 3.5) + 4;
    }
    const legalNote = 'Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.';
    const splitLegalNote = pdfDoc.splitTextToSize(legalNote, pageWidth - (margin * 2));
    pdfDoc.setFontSize(8).setFont('helvetica', 'bold').text(splitLegalNote, margin, startY);
    let noteY = startY + (splitLegalNote.length * 3) + 2;
    pdfDoc.setFontSize(8).setFont('helvetica', 'normal').text('Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.', margin, noteY);
    noteY += 4;
    pdfDoc.setFont('helvetica', 'bold').text(`Firma electrónica: '${companyInfo.name} - Condominio'`, margin, noteY);
    noteY += 6;
    pdfDoc.setLineWidth(0.2).line(margin, noteY, pageWidth - margin, noteY);
    noteY += 4;
    pdfDoc.setFontSize(7).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, noteY, { align: 'center'});

    const pdfOutput = pdfDoc.output('blob');
    const pdfFile = new File([pdfOutput], `recibo_${receiptNumber}.pdf`, { type: 'application/pdf' });

    if (action === 'download') {
      pdfDoc.save(`recibo_${receiptNumber}.pdf`);
    } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({
            title: `Recibo de Pago ${receiptNumber}`,
            text: `Adjunto el recibo de pago para ${data.ownerName}.`,
            files: [pdfFile],
          });
        } catch (error) {
          console.error('Error al compartir:', error);
          const url = URL.createObjectURL(pdfFile);
          window.open(url, '_blank');
        }
      } else {
        const url = URL.createObjectURL(pdfFile);
        window.open(url, '_blank');
      }
  }


  const handleDeletePayment = (payment: FullPayment) => {
    setPaymentToDelete(payment);
    setIsDeleteConfirmationOpen(true);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;
    
    requestAuthorization(async () => {
        const paymentRef = doc(db, "payments", paymentToDelete.id);

        try {
            if (paymentToDelete.status === 'aprobado') {
                 const batch = writeBatch(db);
    
                // Revert owner balances
                for (const beneficiary of paymentToDelete.beneficiaries) {
                    const ownerRef = doc(db, 'owners', beneficiary.ownerId);
                    const ownerDoc = await getDoc(ownerRef);
                    if (ownerDoc.exists()) {
                        const currentBalance = ownerDoc.data().balance || 0;
                        const amountToRevert = beneficiary.amount || 0;
                        batch.update(ownerRef, { balance: currentBalance + amountToRevert });
                    }
                }
    
                // Un-pay associated debts
                const debtsToRevertQuery = query(collection(db, 'debts'), where('paymentId', '==', paymentToDelete.id));
                const debtsToRevertSnapshot = await getDocs(debtsToRevertQuery);
                debtsToRevertSnapshot.forEach(debtDoc => {
                    if (debtDoc.data().description.includes('Pagada por adelantado')) {
                        batch.delete(debtDoc.ref);
                    } else {
                        batch.update(debtDoc.ref, {
                            status: 'pending',
                            paymentDate: deleteField(),
                            paidAmountUSD: deleteField(),
                            paymentId: deleteField()
                        });
                    }
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
            toast({
                variant: "destructive",
                title: "Error en la Operación",
                description: errorMessage,
            });
        } finally {
            setIsDeleteConfirmationOpen(false);
            setPaymentToDelete(null);
        }
    });
  };


  const filteredPayments = payments.filter(p => filter === 'todos' || p.status === filter);

  return (
    <div className="space-y-8">
        
        <div>
            <h1 className="text-3xl font-bold font-headline">Verificación de Pagos</h1>
            <p className="text-muted-foreground">Aprueba o rechaza los pagos reportados y genera recibos.</p>
        </div>

        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Pagos Registrados</CardTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <Filter className="mr-2 h-4 w-4" />
                                Filtrar por: <span className="font-semibold ml-1 capitalize">{filter === 'todos' ? 'Todos' : statusTextMap[filter]}</span>
                            </Button>
                        </DropdownMenuTrigger>
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
                    <TableHeader>
                        <TableRow>
                            <TableHead>Beneficiario</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Referencia</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : filteredPayments.length === 0 ? (
                             <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    No hay pagos que coincidan con el filtro seleccionado.
                                </TableCell>
                             </TableRow>
                        ) : (
                            filteredPayments.map((payment) => (
                            <TableRow key={payment.id}>
                                <TableCell className="font-medium">{payment.user}</TableCell>
                                <TableCell>
                                    {payment.type === 'adelanto' 
                                        ? `$${formatToTwoDecimals(payment.amount)}`
                                        : `Bs. ${formatToTwoDecimals(payment.amount)}`
                                    }
                                </TableCell>
                                <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                                <TableCell>{payment.reference}</TableCell>
                                <TableCell>
                                    <Badge variant={statusVariantMap[payment.status]}>
                                        {statusTextMap[payment.status]}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Abrir menú</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {payment.status === 'pendiente' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'aprobado')}>
                                                        <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                                        Aprobar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'rechazado')} className="text-destructive">
                                                        <XCircle className="mr-2 h-4 w-4" />
                                                        Rechazar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                </>
                                            )}
                                            {payment.status === 'aprobado' && (
                                                payment.beneficiaries.length > 1 ? (
                                                    <DropdownMenuSub>
                                                        <DropdownMenuSubTrigger>
                                                            <Printer className="mr-2 h-4 w-4" />
                                                            Ver Recibo
                                                        </DropdownMenuSubTrigger>
                                                        <DropdownMenuSubContent>
                                                            {payment.beneficiaries.map(beneficiary => (
                                                                <DropdownMenuItem key={beneficiary.ownerId} onClick={() => openReceiptPreview(payment, beneficiary)}>
                                                                    {beneficiary.ownerName}
                                                                </DropdownMenuItem>
                                                            ))}
                                                        </DropdownMenuSubContent>
                                                    </DropdownMenuSub>
                                                ) : (
                                                    <DropdownMenuItem onClick={() => openReceiptPreview(payment, payment.beneficiaries[0])}>
                                                        <Printer className="mr-2 h-4 w-4" />
                                                        Ver Recibo
                                                    </DropdownMenuItem>
                                                )
                                            )}
                                             <DropdownMenuItem onClick={() => handleDeletePayment(payment)} className="text-destructive">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Eliminar
                                             </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Receipt Preview Dialog */}
        <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo: {receiptData?.receiptNumber}</DialogTitle>
                    <DialogDescription>
                        Recibo de pago para {receiptData?.ownerName} ({receiptData?.ownerUnit}).
                    </DialogDescription>
                </DialogHeader>
                {receiptData && (
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><span className="font-semibold">Fecha de Pago:</span> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</div>
                            <div><span className="font-semibold">Monto Pagado:</span> Bs. {formatToTwoDecimals(receiptData.beneficiary.amount)}</div>
                            <div><span className="font-semibold">Tasa Aplicada:</span> Bs. {formatToTwoDecimals(receiptData.payment.exchangeRate)}</div>
                            <div><span className="font-semibold">Referencia:</span> {receiptData.payment.reference}</div>
                        </div>
                        <h4 className="font-semibold">Conceptos Pagados</h4>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Período</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Monto (Bs)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receiptData.paidDebts.length > 0 ? (
                                    receiptData.paidDebts.map(debt => (
                                        <TableRow key={debt.id}>
                                            <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                            <TableCell>{debt.description}</TableCell>
                                            <TableCell className="text-right">Bs. {formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3}>Abono a Saldo a Favor</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                         <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
                            <div className="text-right text-muted-foreground">Saldo Anterior:</div>
                            <div className="text-right">Bs. {formatToTwoDecimals(receiptData.previousBalance)}</div>
                             <div className="text-right text-muted-foreground">Saldo Actual:</div>
                            <div className="text-right font-bold">Bs. {formatToTwoDecimals(receiptData.currentBalance)}</div>
                           </div>
                    </div>
                )}
                <DialogFooter className="sm:justify-end gap-2">
                    <Button variant="outline" onClick={() => generateAndAct('download', receiptData!)}>
                        <Download className="mr-2 h-4 w-4" /> Exportar PDF
                    </Button>
                    <Button onClick={() => generateAndAct('share', receiptData!)}>
                           <Share2 className="mr-2 h-4 w-4" /> Compartir PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>


        <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>¿Está seguro?</DialogTitle>
                    <DialogDescription>
                        Esta acción no se puede deshacer. Esto eliminará permanentemente el registro del pago. Si el pago ya fue aprobado, se revertirán las deudas y saldos del propietario afectado.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                    <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar pago</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}



'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, MoreHorizontal, Printer, Filter, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, onSnapshot, query, doc, updateDoc, getDoc, writeBatch, where, orderBy, Timestamp, getDocs, deleteField, deleteDoc, runTransaction, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, addMonths, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil' | 'adelanto' | 'conciliacion';

type Beneficiary = { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; };

type FullPayment = {
  id: string;
  beneficiaries: Beneficiary[];
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
    paidAmountUSD?: number;
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
    ownerName: string; 
    ownerUnit: string; // This can represent the primary unit or a summary
    paidDebts: Debt[];
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
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptPdfPreviewOpen, setIsReceiptPdfPreviewOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<FullPayment | null>(null);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const { toast } = useToast();
  const [ownersMap, setOwnersMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    // Pre-fetch all owners to create a map of ID -> Name
    const ownersQuery = query(collection(db, "owners"));
    const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
        const newOwnersMap = new Map<string, string>();
        snapshot.forEach(doc => {
            newOwnersMap.set(doc.id, doc.data().name);
        });
        setOwnersMap(newOwnersMap);
    });

    return () => ownersUnsubscribe();
  }, []);

  useEffect(() => {
    if (ownersMap.size === 0) return; // Don't fetch payments until owners are loaded

    setLoading(true);

    const q = query(collection(db, "payments"), orderBy('reportedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const paymentsData: FullPayment[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();

            const firstBeneficiary = data.beneficiaries?.[0];
            
            let userName = 'Beneficiario no identificado'; // Fallback text
            if (firstBeneficiary?.ownerName) {
                userName = firstBeneficiary.ownerName;
            } else if (firstBeneficiary?.ownerId && ownersMap.has(firstBeneficiary.ownerId)) {
                userName = ownersMap.get(firstBeneficiary.ownerId)!;
            }

            let unit = 'N/A';
            if (data.beneficiaries?.length > 1) {
                unit = "Múltiples Propiedades";
            } else if (firstBeneficiary && firstBeneficiary.street && firstBeneficiary.house) {
                unit = `${firstBeneficiary.street} - ${firstBeneficiary.house}`;
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
                status: data.status,
                beneficiaries: data.beneficiaries,
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
                if (!paymentDoc.exists() || paymentDoc.data().status === 'aprobado') {
                    throw new Error('El pago no existe o ya fue aprobado anteriormente.');
                }
    
                const paymentData = { id: paymentDoc.id, ...paymentDoc.data() } as FullPayment;

                // --- Get correct exchange rate for the payment date ---
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (!settingsSnap.exists()) throw new Error('No se encontró el documento de configuración.');
                
                const allRates = (settingsSnap.data().exchangeRates || []) as {date: string, rate: number}[];
                const paymentDateString = format(paymentData.paymentDate.toDate(), 'yyyy-MM-dd');
                const applicableRates = allRates
                    .filter(r => r.date <= paymentDateString)
                    .sort((a, b) => b.date.localeCompare(a.date));

                const exchangeRate = applicableRates.length > 0 ? applicableRates[0].rate : 0;
                
                if (!exchangeRate || exchangeRate <= 0) throw new Error('La tasa de cambio para este pago es inválida o no está definida.');
                if (condoFee <= 0) throw new Error('La cuota de condominio no está configurada.');
                
                const beneficiary = paymentData.beneficiaries[0];
                if (!beneficiary) throw new Error('El pago no tiene un beneficiario definido.');

                const ownerRef = doc(db, 'owners', beneficiary.ownerId);
                const ownerDoc = await transaction.get(ownerRef);
                if (!ownerDoc.exists()) throw new Error(`El propietario ${beneficiary.ownerId} no fue encontrado.`);
                
                const ownerData = ownerDoc.data();
                const initialBalance = ownerData.balance || 0;
                
                // --- Switch to cents for all calculations ---
                const initialBalanceInCents = Math.round(initialBalance * 100);
                const paymentAmountInCents = Math.round(paymentData.totalAmount * 100);
                let availableFundsInCents = paymentAmountInCents + initialBalanceInCents;
                
                // --- 1. Liquidate Pending Debts (in cents) ---
                const debtsQuery = query(
                    collection(db, 'debts'),
                    where('ownerId', '==', beneficiary.ownerId),
                    where('status', '==', 'pending')
                );
                const debtsSnapshot = await getDocs(debtsQuery);
                // ALWAYS sort debts chronologically to ensure the oldest are paid first.
                const sortedDebts = debtsSnapshot.docs.sort((a, b) => {
                    const dataA = a.data();
                    const dataB = b.data();
                    if (dataA.year !== dataB.year) return dataA.year - dataB.year;
                    return dataA.month - dataB.month;
                });
                
                if (sortedDebts.length > 0) {
                    for (const debtDoc of sortedDebts) {
                        const debt = { id: debtDoc.id, ...debtDoc.data() } as Debt;
                        const debtAmountInCents = Math.round(debt.amountUSD * exchangeRate * 100);
                        
                        if (availableFundsInCents >= debtAmountInCents) {
                            availableFundsInCents -= debtAmountInCents;
                            transaction.update(debtDoc.ref, {
                                status: 'paid', paidAmountUSD: debt.amountUSD,
                                paymentDate: paymentData.paymentDate, paymentId: paymentData.id,
                            });
                        } else {
                            break; // Stop if funds are insufficient for the next oldest debt
                        }
                    }
                }
                
                // --- 2 & 3. Create and Liquidate Future Debts (in cents) ---
                const condoFeeInCents = Math.round(condoFee * exchangeRate * 100);
                if (availableFundsInCents >= condoFeeInCents) {
                    const allExistingDebtsQuery = query(collection(db, 'debts'), where('ownerId', '==', beneficiary.ownerId));
                    const allExistingDebtsSnap = await getDocs(allExistingDebtsQuery);
                    const existingDebtPeriods = new Set(allExistingDebtsSnap.docs.map(d => `${d.data().year}-${d.data().month}`));

                    const startDate = startOfMonth(new Date());
                    const propertyForFutureDebts = ownerData.properties?.[0];

                    if (propertyForFutureDebts) {
                         for (let i = 0; i < 24; i++) { // Look ahead 24 months
                            const futureDebtDate = addMonths(startDate, i);
                            const futureYear = futureDebtDate.getFullYear();
                            const futureMonth = futureDebtDate.getMonth() + 1;
                            const periodKey = `${futureYear}-${futureMonth}`;
                            
                            if (existingDebtPeriods.has(periodKey)) continue;

                            if (availableFundsInCents >= condoFeeInCents) {
                                availableFundsInCents -= condoFeeInCents;
                                
                                const debtRef = doc(collection(db, 'debts'));
                                transaction.set(debtRef, {
                                    ownerId: beneficiary.ownerId,
                                    property: propertyForFutureDebts,
                                    year: futureYear, month: futureMonth,
                                    amountUSD: condoFee,
                                    description: "Cuota de Condominio (Pagada por adelantado)",
                                    status: 'paid', paidAmountUSD: condoFee,
                                    paymentDate: paymentData.paymentDate, paymentId: paymentData.id,
                                });
                            } else {
                                break;
                            }
                        }
                    }
                }
                
                // --- 4. Update Balance and generate Observation Note ---
                const finalBalance = availableFundsInCents / 100; // Convert back to Bs
                const observationNote = `Pago por Bs. ${formatToTwoDecimals(paymentData.totalAmount)}. Tasa aplicada: Bs. ${formatToTwoDecimals(exchangeRate)}. Saldo Anterior: Bs. ${formatToTwoDecimals(initialBalance)}. Saldo a Favor Actual: Bs. ${formatToTwoDecimals(finalBalance)}.`;
                
                transaction.update(ownerRef, { balance: finalBalance });
                transaction.update(paymentRef, { status: 'aprobado', observations: observationNote, exchangeRate: exchangeRate });
            });
    
            toast({
                title: 'Pago Aprobado y Procesado',
                description: 'El saldo del propietario y las deudas han sido actualizados.',
                className: 'bg-green-100 border-green-400 text-green-800',
            });
        } catch (error) {
            console.error("Error processing payment approval: ", error);
            const errorMessage = error instanceof Error ? error.message : 'No se pudo aprobar y procesar el pago.';
            toast({ variant: 'destructive', title: 'Error en la Operación', description: errorMessage });
        }
    }
  };

  const showReceiptPdfPreview = async (payment: FullPayment) => {
    if (!payment.id) {
        toast({ variant: 'destructive', title: 'Error', description: 'ID de pago inválido.' });
        return;
    }
    try {
        const ownerName = payment.user || 'Beneficiario no identificado';
        
        const ownerUnitSummary = payment.beneficiaries.length > 1 
            ? "Múltiples Propiedades" 
            : (payment.unit || 'N/A');

        const paidDebtsQuery = query(
            collection(db, "debts"),
            where("paymentId", "==", payment.id)
        );
        const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
        const paidDebts = paidDebtsSnapshot.docs
            .map(doc => ({id: doc.id, ...doc.data()}) as Debt)
            .sort((a,b) => b.year - a.year || b.month - a.month);
        
        setReceiptData({ 
            payment, 
            ownerName: ownerName,
            ownerUnit: ownerUnitSummary, 
            paidDebts 
        });
        setIsReceiptPdfPreviewOpen(true);
    } catch (error) {
        console.error("Error generating receipt preview: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos para el recibo.' });
    }
  }

  const handleDeletePayment = (payment: FullPayment) => {
    setPaymentToDelete(payment);
    setIsDeleteConfirmationOpen(true);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;
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
                    // This logic is simplified; a full reversal would require knowing how much balance was used.
                    // For now, we revert the paid amount back to the balance.
                    batch.update(ownerRef, { balance: currentBalance + amountToRevert });
                }
            }

            // Un-pay associated debts
            const debtsToRevertQuery = query(collection(db, 'debts'), where('paymentId', '==', paymentToDelete.id));
            const debtsToRevertSnapshot = await getDocs(debtsToRevertQuery);
            debtsToRevertSnapshot.forEach(debtDoc => {
                if (debtDoc.data().description.includes('Pagada por adelantado')) {
                    // If it was an advance payment debt, delete it entirely
                    batch.delete(debtDoc.ref);
                } else {
                    // Otherwise, revert it to pending
                    batch.update(debtDoc.ref, {
                        status: 'pending',
                        paymentDate: deleteField(),
                        paidAmountUSD: deleteField(),
                        paymentId: deleteField()
                    });
                }
            });
            
            // Delete the payment itself
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
  };


  const handleDownloadPdf = () => {
    if (!receiptData || !companyInfo) return;
    const { payment, ownerName, paidDebts } = receiptData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    if (companyInfo.logo) {
        try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
        catch(e) { console.error("Error adding logo to PDF", e); }
    }
    doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
    doc.setFontSize(9).setFont('helvetica', 'normal');
    doc.text(companyInfo.rif, margin + 30, margin + 14);
    doc.text(companyInfo.address, margin + 30, margin + 19);
    doc.text(`Teléfono: ${companyInfo.phone}`, margin + 30, margin + 24);
    
    doc.setFontSize(10).text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
    
    doc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);

    doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
    doc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${payment.id.substring(0, 10)}`, pageWidth - margin, margin + 50, { align: 'right' });

    let startY = margin + 60;
    doc.setFontSize(10).text(`Nombre del Beneficiario: ${ownerName}`, margin, startY);
    startY += 6;
    doc.text(`Método de pago: ${payment.type}`, margin, startY);
    startY += 6;
    doc.text(`Banco Emisor: ${payment.bank}`, margin, startY);
    startY += 6;
    doc.text(`N° de Referencia Bancaria: ${payment.reference}`, margin, startY);
    startY += 6;
    doc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, startY);
    startY += 6;
    doc.text(`Tasa de Cambio Aplicada: Bs. ${formatToTwoDecimals(payment.exchangeRate)} por USD`, margin, startY);

    startY += 10;
    
    let totalPaidInConcepts = 0;
    const tableBody = paidDebts.map(debt => {
        const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
        totalPaidInConcepts += debtAmountBs;
        const propertyLabel = debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A';
        const periodLabel = `${monthsLocale[debt.month]} ${debt.year}`;
        const concept = `${debt.description} (${propertyLabel})`;
        
        return [
            periodLabel,
            concept,
            `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`,
            `Bs. ${formatToTwoDecimals(debtAmountBs)}`
        ];
    });

    if (paidDebts.length > 0) {
        (doc as any).autoTable({
            startY: startY,
            head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            didDrawPage: (data: any) => { startY = data.cursor.y; }
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
    } else {
        totalPaidInConcepts = payment.totalAmount;
        (doc as any).autoTable({
            startY: startY,
            head: [['Concepto', 'Monto Pagado (Bs)']],
            body: [['Abono a Saldo a Favor', `Bs. ${formatToTwoDecimals(payment.totalAmount)}`]],
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            didDrawPage: (data: any) => { startY = data.cursor.y; }
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
    }
    
    // Totals Section
    const totalLabel = "TOTAL PAGADO:";
    const totalValue = `Bs. ${formatToTwoDecimals(totalPaidInConcepts)}`;
    doc.setFontSize(11).setFont('helvetica', 'bold');
    const totalValueWidth = doc.getStringUnitWidth(totalValue) * 11 / doc.internal.scaleFactor;
    doc.text(totalValue, pageWidth - margin, startY, { align: 'right' });
    doc.text(totalLabel, pageWidth - margin - totalValueWidth - 2, startY, { align: 'right' });


    startY += 10;
    
    // Observations Section
    if (payment.observations) {
        doc.setFontSize(9).setFont('helvetica', 'italic');
        const splitObservations = doc.splitTextToSize(payment.observations, pageWidth - margin * 2);
        doc.text("Observaciones:", margin, startY);
        startY += 5;
        doc.text(splitObservations, margin, startY);
        startY += (splitObservations.length * 4) + 4;
    }

    // --- Footer Section ---
    const legalNote = 'Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.';
    const splitLegalNote = doc.splitTextToSize(legalNote, pageWidth - (margin * 2));
    doc.setFontSize(9).setFont('helvetica', 'bold').text(splitLegalNote, margin, startY);
    startY += (splitLegalNote.length * 4) + 4;

    doc.setFontSize(9).setFont('helvetica', 'normal').text('Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.', margin, startY);
    startY += 8;
    doc.setFont('helvetica', 'bold').text(`Firma electrónica: '${companyInfo.name} - Condominio'`, margin, startY);
    startY += 10;
    doc.setLineWidth(0.2).line(margin, startY, pageWidth - margin, startY);
    startY += 5;
    doc.setFontSize(8).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});

    doc.save(`Recibo_de_Pago_${payment.id.substring(0,7)}.pdf`);
    setIsReceiptPdfPreviewOpen(false);
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
                            <TableHead>Unidad</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Banco</TableHead>
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
                                <TableCell>{payment.unit}</TableCell>
                                <TableCell>
                                    {payment.type === 'adelanto' 
                                        ? `$${formatToTwoDecimals(payment.amount)}`
                                        : `Bs. ${formatToTwoDecimals(payment.amount)}`
                                    }
                                </TableCell>
                                <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                                <TableCell>{payment.bank}</TableCell>
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
                                                </>
                                            )}
                                            {payment.status === 'aprobado' && (
                                                <DropdownMenuItem onClick={() => showReceiptPdfPreview(payment)}>
                                                    <Printer className="mr-2 h-4 w-4" />
                                                    Generar Recibo
                                                </DropdownMenuItem>
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

        <Dialog open={isReceiptPdfPreviewOpen} onOpenChange={setIsReceiptPdfPreviewOpen}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo</DialogTitle>
                    <DialogDescription>
                        Revise el recibo antes de descargarlo. El diseño se ajustará en el PDF final.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto pr-4 -mr-4">
                {receiptData && companyInfo && (
                     <div className="border rounded-md p-4 bg-white text-black font-sans text-xs space-y-4">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                {companyInfo.logo && <img src={companyInfo.logo} alt="Logo" className="w-20 h-20 object-contain"/>}
                                <div>
                                    <p className="font-bold">{companyInfo.name}</p>
                                    <p>{companyInfo.rif}</p>
                                    <p>{companyInfo.address}</p>
                                    <p>Teléfono: {companyInfo.phone}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-lg">RECIBO DE PAGO</p>
                                <p><strong>Fecha Emisión:</strong> {format(new Date(), 'dd/MM/yyyy')}</p>
                                <p><strong>N° Recibo:</strong> {receiptData.payment.id.substring(0, 10)}</p>
                            </div>
                        </div>
                        <hr className="my-2 border-gray-400"/>
                         <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                             <p><strong>Beneficiario:</strong></p><p>{receiptData.ownerName}</p>
                             <p><strong>Unidad:</strong></p><p>{receiptData.ownerUnit}</p>
                             <p><strong>Método de pago:</strong></p><p>{receiptData.payment.type}</p>
                             <p><strong>Banco Emisor:</strong></p><p>{receiptData.payment.bank}</p>
                             <p><strong>N° de Referencia:</strong></p><p>{receiptData.payment.reference}</p>
                             <p><strong>Fecha del pago:</strong></p><p>{format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                             <p><strong>Tasa de Cambio Aplicada:</strong></p><p>Bs. {formatToTwoDecimals(receiptData.payment.exchangeRate)} por USD</p>
                        </div>
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="bg-gray-700 text-white hover:bg-gray-800">
                                    <TableHead className="text-white">Período</TableHead>
                                    <TableHead className="text-white">Concepto (Propiedad)</TableHead>
                                    <TableHead className="text-white text-right">Monto ($)</TableHead>
                                    <TableHead className="text-white text-right">Monto Pagado (Bs)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receiptData.paidDebts.length > 0 ? (
                                    receiptData.paidDebts.map((debt, index) => (
                                        <TableRow key={index} className="even:bg-gray-100">
                                            <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                            <TableCell>{debt.description} ({debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A'})</TableCell>
                                            <TableCell className="text-right">${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}</TableCell>
                                            <TableCell className="text-right">Bs. {formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">Abono a Saldo a Favor</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                         <div className="text-right font-bold mt-2 pr-4">
                            Total Pagado: Bs. {formatToTwoDecimals(receiptData.paidDebts.reduce((acc, debt) => acc + ((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate), 0) > 0 ? receiptData.paidDebts.reduce((acc, debt) => acc + ((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate), 0) : receiptData.payment.amount)}
                         </div>
                         {receiptData.payment.observations && (
                            <div className="mt-4 p-2 border-t text-xs">
                                <p className="font-bold">Observaciones:</p>
                                <p className="italic whitespace-pre-wrap">{receiptData.payment.observations}</p>
                            </div>
                         )}
                        <div className="mt-6 text-gray-600 text-[10px] space-y-2">
                             <p className="text-left text-[11px] font-bold">Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.</p>
                             <p className="text-left">Este recibo confirma que su pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.</p>
                             <p className="text-left font-bold mt-2">Firma electrónica: '{companyInfo.name} - Condominio'</p>
                             <hr className="my-4 border-gray-400"/>
                             <p className="italic text-center">Este recibo se generó de manera automática y es válido sin firma manuscrita.</p>
                        </div>
                    </div>
                )}
                </div>
                <DialogFooter className="mt-auto pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsReceiptPdfPreviewOpen(false)}>Cerrar</Button>
                    <Button onClick={handleDownloadPdf}>
                        <Printer className="mr-2 h-4 w-4"/> Descargar PDF
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
    
    

    

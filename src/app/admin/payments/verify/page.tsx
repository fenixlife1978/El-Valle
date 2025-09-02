
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, MoreHorizontal, Eye, Printer, Filter, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, onSnapshot, query, doc, updateDoc, getDoc, writeBatch, where, orderBy, Timestamp, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addMonths, format, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil' | 'adelanto' | 'conciliacion';

type Beneficiary = { ownerId: string; amount: number; street?: string; house?: string; };

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


export default function VerifyPaymentsPage() {
  const [payments, setPayments] = useState<FullPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PaymentStatus | 'todos'>('todos');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [condoFee, setCondoFee] = useState(0);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<FullPayment | null>(null);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);

    const fetchAllOwners = async () => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersSnapshot = await getDocs(ownersQuery);
        const ownersMap = new Map<string, {name: string, properties: any[]}>();
        ownersSnapshot.forEach(doc => {
            ownersMap.set(doc.id, { name: doc.data().name, properties: doc.data().properties || [] });
        });
        return ownersMap;
    };

    const q = query(collection(db, "payments"), orderBy('reportedAt', 'desc'));
    
    fetchAllOwners().then(ownersMap => {
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const paymentsData: FullPayment[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const ownerId = data.beneficiaries?.[0]?.ownerId || data.reportedBy;
                const ownerInfo = ownerId ? ownersMap.get(ownerId) : null;
                const userName = ownerInfo?.name || 'No disponible';

                let unit = 'N/A';
                if (data.beneficiaries?.length === 1) {
                    const b = data.beneficiaries[0];
                    unit = b && b.street && b.house ? `${b.street} - ${b.house}` : (ownerInfo?.properties?.[0] ? `${ownerInfo.properties[0].street} - ${ownerInfo.properties[0].house}`: 'N/A');
                } else if (data.beneficiaries?.length > 1) {
                    unit = "Múltiples Propiedades";
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
                    isReconciled: data.isReconciled
                });
            });

            setPayments(paymentsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching payments: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos.' });
            setLoading(false);
        });
        return unsubscribe;
    }).catch(error => {
        console.error("Error fetching owners map: ", error);
        toast({ variant: 'destructive', title: 'Error Crítico', description: 'No se pudieron cargar los datos de los propietarios.' });
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

  }, [toast]);


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
        if (condoFee <= 0) {
            toast({ variant: 'destructive', title: 'Error de Configuración', description: 'La cuota de condominio no está configurada. No se puede aprobar el pago.' });
            return;
        }

        try {
            // --- PHASE 1: COMPREHENSIVE UPFRONT READS ---
            const paymentDoc = await getDoc(paymentRef);
            if (!paymentDoc.exists() || paymentDoc.data().status === 'aprobado') {
                toast({ title: 'Operación Cancelada', description: 'El pago no existe o ya fue aprobado anteriormente.' });
                return;
            }
            const paymentData = { id: paymentDoc.id, ...paymentDoc.data() } as FullPayment;

            const beneficiaryIds = paymentData.beneficiaries.map(b => b.ownerId);
            if (beneficiaryIds.length === 0) throw new Error("El pago no tiene beneficiarios definidos.");
            
            const ownersQuery = query(collection(db, 'owners'), where('__name__', 'in', beneficiaryIds));
            const ownersSnapshot = await getDocs(ownersQuery);
            const ownersDataMap = new Map(ownersSnapshot.docs.map(d => [d.id, d.data()]));

            const allOwnerDebtsQuery = query(collection(db, 'debts'), where('ownerId', 'in', beneficiaryIds));
            const allDebtsSnapshot = await getDocs(allOwnerDebtsQuery);
            const allDebtsByOwner = new Map<string, Debt[]>();
            allDebtsSnapshot.forEach(d => {
                const debt = { id: d.id, ...d.data() } as Debt;
                const ownerDebts = allDebtsByOwner.get(debt.ownerId) || [];
                ownerDebts.push(debt);
                allDebtsByOwner.set(debt.ownerId, ownerDebts);
            });
            
            // --- PHASE 2: IN-MEMORY CALCULATIONS ---
            const batch = writeBatch(db);
            let finalObservation = paymentData.observations || '';

            for (const beneficiary of paymentData.beneficiaries) {
                const ownerData = ownersDataMap.get(beneficiary.ownerId);
                if (!ownerData) {
                    console.warn(`Saltando beneficiario no encontrado: ${beneficiary.ownerId}`);
                    continue;
                }

                let availableFundsBs = beneficiary.amount + (ownerData.balance || 0);
                const condoFeeInBs = condoFee * paymentData.exchangeRate;

                if ((ownerData.balance || 0) > 0 && beneficiary.amount > 0) {
                    finalObservation = `Observación Especial:\nMonto de Cuota Condominial cubierto en su totalidad por el pago recibido de Bs. ${beneficiary.amount.toFixed(2)} sumado al saldo a favor que poseía la persona por un monto de Bs. ${(ownerData.balance || 0).toFixed(2)}, cubriendo así la totalidad de la cuota por un monto de Bs. ${(beneficiary.amount + (ownerData.balance || 0)).toFixed(2)} a la tasa de cambio del día de hoy.`;
                }

                // Settle pending debts
                const pendingDebts = (allDebtsByOwner.get(beneficiary.ownerId) || []).filter(d => d.status === 'pending').sort((a,b) => a.year - b.year || a.month - a.month);
                for (const debt of pendingDebts) {
                    const debtAmountBs = debt.amountUSD * paymentData.exchangeRate;
                    if (availableFundsBs >= debtAmountBs) {
                        availableFundsBs -= debtAmountBs;
                        const debtRef = doc(db, 'debts', debt.id);
                        batch.update(debtRef, {
                            status: 'paid', paidAmountUSD: debt.amountUSD,
                            paymentDate: paymentData.paymentDate, paymentId: paymentData.id
                        });
                    }
                }
                
                // Settle future debts (using pre-fetched data)
                if (availableFundsBs >= condoFeeInBs) {
                    const existingDebtPeriods = new Set((allDebtsByOwner.get(beneficiary.ownerId) || []).map(d => `${d.year}-${d.month}`));
                    const startDate = startOfMonth(new Date());

                    for (let i = 0; i < 12; i++) { // Look ahead 12 months
                        const futureDebtDate = addMonths(startDate, i);
                        const futureYear = futureDebtDate.getFullYear();
                        const futureMonth = futureDebtDate.getMonth() + 1;
                        if (existingDebtPeriods.has(`${futureYear}-${futureMonth}`)) continue;

                        if (availableFundsBs >= condoFeeInBs) {
                            availableFundsBs -= condoFeeInBs;
                            const newDebtRef = doc(collection(db, 'debts'));
                            batch.set(newDebtRef, {
                                ownerId: beneficiary.ownerId,
                                property: ownerData.properties?.[0] || {}, // Assign to first property as fallback
                                year: futureYear, month: futureMonth,
                                amountUSD: condoFee, description: `Cuota de Condominio (Pagada por adelantado)`,
                                status: 'paid', paidAmountUSD: condoFee,
                                paymentDate: paymentData.paymentDate, paymentId: paymentData.id
                            });
                        } else { break; }
                    }
                }
                
                const ownerRef = doc(db, 'owners', beneficiary.ownerId);
                batch.update(ownerRef, { balance: availableFundsBs });
            }

            batch.update(paymentRef, { status: 'aprobado', observations: finalObservation });
            
            // --- PHASE 3: COMMIT ATOMIC WRITES ---
            await batch.commit();

            toast({
                title: 'Pago Aprobado y Procesado',
                description: 'El saldo del propietario y las deudas han sido actualizados.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

        } catch (error) {
            console.error("Error processing payment approval: ", error);
            const errorMessage = error instanceof Error ? error.message : 'No se pudo aprobar y procesar el pago.';
            toast({ variant: 'destructive', title: 'Error en la Operación', description: errorMessage });
        }
    }
  };

  const showReceiptPreview = async (payment: FullPayment) => {
    if (!payment.id) {
        toast({ variant: 'destructive', title: 'Error', description: 'ID de pago inválido.' });
        return;
    }
    try {
        const ownersMap = new Map<string, {name: string}>();
        const ownersQuery = query(collection(db, "owners"));
        const ownersSnapshot = await getDocs(ownersQuery);
        ownersSnapshot.forEach(doc => {
            ownersMap.set(doc.id, { name: doc.data().name });
        });

        const primaryOwnerId = payment.reportedBy;
        const ownerName = ownersMap.get(primaryOwnerId)?.name || 'No disponible';
        
        const ownerUnitSummary = payment.beneficiaries.length > 1 
            ? "Múltiples Propiedades" 
            : (payment.unit || 'N/A');

        const paidDebtsQuery = query(
            collection(db, "debts"),
            where("paymentId", "==", payment.id)
        );
        const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
        const paidDebts = paidDebtsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Debt);
        
        setReceiptData({ 
            payment, 
            ownerName, 
            ownerUnit: ownerUnitSummary, 
            paidDebts 
        });
        setIsReceiptPreviewOpen(true);
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
                    batch.update(ownerRef, { balance: currentBalance - amountToRevert });
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
                        paidAmountUSD: null,
                        paymentDate: null,
                        paymentId: null,
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
        doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
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
    doc.setFontSize(10).text(`Nombre del Propietario: ${ownerName}`, margin, startY);
    startY += 6;
    doc.text(`Método de pago: ${payment.type}`, margin, startY);
    startY += 6;
    doc.text(`Banco Emisor: ${payment.bank}`, margin, startY);
    startY += 6;
    doc.text(`N° de Referencia Bancaria: ${payment.reference}`, margin, startY);
    startY += 6;
    doc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, startY);
    startY += 10;
    
    const tableBody = paidDebts.map(debt => {
        const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
        const propertyLabel = debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A';
        const periodLabel = `${monthsLocale[debt.month]} ${debt.year}`;
        const concept = `${debt.description} (${propertyLabel})`;
        
        return [
            periodLabel,
            concept,
            `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`,
            `Bs. ${debtAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
        ];
    });

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
    
    // Totals Section
    doc.setFontSize(11).setFont('helvetica', 'bold');
    doc.text('TOTAL PAGADO:', pageWidth - margin - 50, startY, { align: 'left' });
    doc.text(`Bs. ${payment.totalAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, pageWidth - margin, startY, { align: 'right' });

    startY += 10;

    // Footer Section
    doc.setFontSize(9).setFont('helvetica', 'normal').text('Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.', margin, startY);
    startY += 8;
    doc.setFont('helvetica', 'bold').text(`Firma electrónica: '${companyInfo.name} - Condominio'`, margin, startY);
    startY += 10;
    doc.setLineWidth(0.2).line(margin, startY, pageWidth - margin, startY);
    startY += 5;
    doc.setFontSize(8).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});

    doc.save(`Recibo_de_Pago_${payment.id.substring(0,7)}.pdf`);
    setIsReceiptPreviewOpen(false);
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
                            <TableHead>Usuario</TableHead>
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
                                <TableCell className="font-medium">{payment.user || 'No disponible'}</TableCell>
                                <TableCell>{payment.unit}</TableCell>
                                <TableCell>
                                    {payment.type === 'adelanto' 
                                        ? `$ ${payment.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}`
                                        : `Bs. ${payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}`
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
                                            <DropdownMenuItem>
                                                <Eye className="mr-2 h-4 w-4" />
                                                Ver Comprobante
                                            </DropdownMenuItem>
                                            {payment.status === 'aprobado' && (
                                                <DropdownMenuItem onClick={() => showReceiptPreview(payment)}>
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

        <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo</DialogTitle>
                    <DialogDescription>
                        Revise el recibo antes de descargarlo. El diseño se ajustará en el PDF final.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto pr-4 -mr-4">
                {receiptData && companyInfo && (
                     <div className="border rounded-md p-4 bg-white text-black font-sans text-xs">
                        <div className="flex justify-between items-start mb-4">
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
                                <p>Fecha de Emisión:</p>
                                <p className="font-bold">{format(new Date(), 'dd/MM/yyyy')}</p>
                            </div>
                        </div>
                        <hr className="my-2 border-gray-400"/>
                        <div className="text-center my-4">
                            <h2 className="font-bold text-lg">RECIBO DE PAGO</h2>
                            <p className="text-right text-xs">N° de recibo: {receiptData.payment.id.substring(0, 10)}</p>
                        </div>
                         <div className="mb-4 text-xs">
                             <p><strong>Propietario:</strong> {receiptData.ownerName}</p>
                             <p><strong>Método de pago:</strong> {receiptData.payment.type}</p>
                             <p><strong>Banco Emisor:</strong> {receiptData.payment.bank}</p>
                             <p><strong>N° de Referencia:</strong> {receiptData.payment.reference}</p>
                             <p><strong>Fecha del pago:</strong> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                        </div>
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="bg-gray-700 text-white">
                                    <TableHead className="text-white">Período</TableHead>
                                    <TableHead className="text-white">Concepto (Propiedad)</TableHead>
                                    <TableHead className="text-white text-right">Monto ($)</TableHead>
                                    <TableHead className="text-white text-right">Monto Pagado (Bs)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receiptData.paidDebts.length > 0 ? receiptData.paidDebts.map((debt, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                        <TableCell>{debt.description} ({debt.property.street} - {debt.property.house})</TableCell>
                                        <TableCell className="text-right">${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">Bs. {((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center">No hay detalles de deudas para este pago.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                         <div className="text-right font-bold mt-2 pr-4">
                            Total Pagado: Bs. {receiptData.payment.totalAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                         </div>
                        <div className="mt-6 text-center text-gray-600 text-[10px]">
                             <p className="text-left">Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.</p>
                             <p className="text-left font-bold mt-2">Firma electrónica: '{companyInfo.name} - Condominio'</p>
                             <hr className="my-4 border-gray-400"/>
                             <p className="italic">Este recibo se generó de manera automática y es válido sin firma manuscrita.</p>
                        </div>
                    </div>
                )}
                </div>
                <DialogFooter className="mt-auto pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsReceiptPreviewOpen(false)}>Cerrar</Button>
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
                        Esta acción no se puede deshacer. Esto eliminará permanentemente el registro del pago. Si el pago ya fue aprobado, se revertirán las deudas y el saldo del propietario afectado.
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

    
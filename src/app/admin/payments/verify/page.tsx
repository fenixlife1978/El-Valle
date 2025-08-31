
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
import { collection, onSnapshot, query, doc, updateDoc, getDoc, writeBatch, runTransaction, where, orderBy, Timestamp, getDocs, addDoc, limit, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';

type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil' | 'adelanto';

type FullPayment = {
  id: string;
  beneficiaries: { ownerId: string; amount: number; street?: string; house?: string; }[];
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
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number;
    paymentDate?: Timestamp;
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
    ownerUnit: string;
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
  const [receiptData, setReceiptData] = useState<ReceiptData>(null);
  const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<FullPayment | null>(null);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);

    const fetchAllOwners = async () => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersSnapshot = await getDocs(ownersQuery);
        const ownersMap = new Map<string, {name: string}>();
        ownersSnapshot.forEach(doc => {
            ownersMap.set(doc.id, { name: doc.data().name });
        });
        return ownersMap;
    };

    const q = query(collection(db, "payments"));
    
    fetchAllOwners().then(ownersMap => {
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const paymentsData: FullPayment[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const userName = ownersMap.get(data.reportedBy)?.name || (data.beneficiaries?.[0]?.ownerId ? ownersMap.get(data.beneficiaries[0].ownerId)?.name : 'No disponible');
                const beneficiary = data.beneficiaries?.[0];
                const unit = beneficiary && beneficiary.street && beneficiary.house ? `${beneficiary.street} - ${beneficiary.house}` : (beneficiary ? beneficiary.house || 'N/A' : 'N/A');


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
                    reportedBy: data.reportedBy
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
    
    const fetchCompanyInfo = async () => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
        }
    };
    fetchCompanyInfo();

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
        try {
            await runTransaction(db, async (transaction) => {
                const paymentDoc = await transaction.get(paymentRef);
                if (!paymentDoc.exists() || paymentDoc.data().status === 'aprobado') {
                    throw new Error("El pago no existe o ya fue aprobado.");
                }

                const paymentData = paymentDoc.data() as FullPayment;

                // Process each beneficiary of the payment
                for (const beneficiary of paymentData.beneficiaries) {
                    const ownerRef = doc(db, "owners", beneficiary.ownerId);
                    const ownerDoc = await transaction.get(ownerRef);

                    if (!ownerDoc.exists()) {
                       throw new Error(`Propietario con ID ${beneficiary.ownerId} no encontrado.`);
                    }
                    
                    const ownerBalanceBs = ownerDoc.data().balance || 0;
                    const paymentAmountBs = beneficiary.amount;
                    let availableFundsBs = ownerBalanceBs + paymentAmountBs;
                    
                    const debtsQuery = query(
                        collection(db, "debts"),
                        where("ownerId", "==", beneficiary.ownerId),
                        where("status", "==", "pending"),
                        orderBy("year", "asc"),
                        orderBy("month", "asc")
                    );
                    
                    const debtsSnapshot = await getDocs(debtsQuery);
                    
                    const pendingDebts: Debt[] = debtsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Debt));
                    
                    if (pendingDebts.length > 0) {
                        for (const debt of pendingDebts) {
                            const debtAmountBs = debt.amountUSD * paymentData.exchangeRate;
                            // Business Rule: A debt is only paid if the available funds cover the entire amount. No partial payments.
                            if (availableFundsBs >= debtAmountBs) {
                                availableFundsBs -= debtAmountBs;
                                const debtRef = doc(db, "debts", debt.id);
                                transaction.update(debtRef, { 
                                    status: 'paid',
                                    paidAmountUSD: debt.amountUSD,
                                    paymentDate: paymentData.paymentDate,
                                });
                            } else {
                                break; 
                            }
                        }
                    } 
                    
                    // Whatever is left in availableFundsBs is the new balance. It remains in Bs.
                    transaction.update(ownerRef, { balance: availableFundsBs });
                }

                // Finally, mark the payment itself as approved.
                transaction.update(paymentRef, { status: 'aprobado' });
            });
            
            toast({
                title: 'Pago Aprobado y Conciliado',
                description: 'El pago se ha procesado exitosamente. Las deudas han sido saldadas y/o el saldo ha sido actualizado.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

        } catch (error) {
            console.error("Error processing payment approval: ", error);
            const errorMessage = error instanceof Error ? error.message : 'No se pudo aprobar y conciliar el pago.';
            toast({ variant: 'destructive', title: 'Error en la Transacción', description: errorMessage });
        }
    }
  };

  const showReceiptPreview = async (payment: FullPayment) => {
    const beneficiaryId = payment.beneficiaries?.[0]?.ownerId;
    if (!beneficiaryId) {
        toast({ variant: 'destructive', title: 'Error', description: 'El pago no tiene un beneficiario claro.' });
        return;
    }

    try {
        const ownerRef = doc(db, 'owners', beneficiaryId);
        const ownerSnap = await getDoc(ownerRef);
        
        if (!ownerSnap.exists()) {
             toast({ variant: 'destructive', title: 'Error', description: 'No se encontró el propietario beneficiario.' });
            return;
        }
        
        const ownerData = ownerSnap.data();
        const ownerName = ownerData.name;
        const property = (ownerData.properties && ownerData.properties.length > 0) ? ownerData.properties[0] : null;
        const ownerUnit = property ? `${property.street} - ${property.house}` : 'N/A';

        // Find all debts paid with this specific payment
        const paidDebtsQuery = query(
            collection(db, "debts"),
            where("ownerId", "==", beneficiaryId),
            where("status", "==", "paid"),
            where("paymentDate", "==", payment.paymentDate) // Exact match on timestamp
        );
        const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
        const paidDebts = paidDebtsSnapshot.docs.map(doc => doc.data() as Debt);
        
        setReceiptData({ payment, ownerName, ownerUnit, paidDebts });
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
            await runTransaction(db, async (transaction) => {
                const paymentDoc = await transaction.get(paymentRef);
                if (!paymentDoc.exists()) throw new Error("El pago ya fue eliminado.");
                
                const paymentData = paymentDoc.data() as FullPayment;

                for (const beneficiary of paymentData.beneficiaries) {
                    const ownerRef = doc(db, 'owners', beneficiary.ownerId);
                    const ownerDoc = await transaction.get(ownerRef);
                    if (!ownerDoc.exists()) throw new Error(`Propietario ${beneficiary.ownerId} no encontrado.`);

                    // 1. Revert owner's balance
                    const currentBalance = ownerDoc.data().balance || 0;
                    const paymentAmountForBeneficiary = beneficiary.amount || 0;
                    const newBalance = currentBalance - paymentAmountForBeneficiary;
                    transaction.update(ownerRef, { balance: newBalance });

                    // 2. Find and revert debts that were paid by this specific payment
                    const paidDebtsQuery = query(
                        collection(db, "debts"),
                        where("ownerId", "==", beneficiary.ownerId),
                        where("status", "==", "paid"),
                        where("paymentDate", "==", paymentData.paymentDate)
                    );
                    
                    const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
                    
                    paidDebtsSnapshot.forEach(debtDoc => {
                        const debtRef = doc(db, "debts", debtDoc.id);
                        transaction.update(debtRef, { 
                            status: 'pending',
                            paidAmountUSD: deleteField(),
                            paymentDate: deleteField(),
                        });
                    });
                }

                // 3. Delete the payment itself
                transaction.delete(paymentRef);
            });
            toast({ title: "Pago Revertido", description: "El pago y sus efectos han sido revertidos." });
        } else {
            // If payment was pending or rejected, just delete it
            await deleteDoc(paymentRef);
            toast({ title: "Pago Eliminado", description: "El registro del pago ha sido eliminado." });
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
    const { payment, ownerName, ownerUnit, paidDebts } = receiptData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // --- Header ---
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

    // --- Title ---
    doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
    doc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${payment.id.substring(0, 10)}`, pageWidth - margin, margin + 50, { align: 'right' });

    // --- Payment Details ---
    let startY = margin + 60;
    doc.setFontSize(10).text(`Nombre del residente: ${ownerName}`, margin, startY);
    startY += 6;
    doc.text(`Unidad: ${ownerUnit}`, margin, startY);
    startY += 6;
    doc.text(`Método de pago: ${payment.type}`, margin, startY);
    startY += 6;
    doc.text(`Banco Emisor: ${payment.bank}`, margin, startY);
    startY += 6;
    doc.text(`N° de Referencia Bancaria: ${payment.reference}`, margin, startY);
    startY += 6;
    doc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, startY);
    startY += 10;
    
    // --- Concept Table ---
    const totalPaidUSD = paidDebts.reduce((sum, debt) => sum + (debt.paidAmountUSD || debt.amountUSD), 0);
    const conceptText = paidDebts.length > 0 
        ? `Pago cuota(s) ${companyInfo.name || 'Condominio'}: ${paidDebts.map(d => `${monthsLocale[d.month]} ${d.year}`).join(', ')}`
        : `Abono a saldo a favor`;

    const tableBody = [
        [
            conceptText,
            totalPaidUSD.toFixed(2),
            `${payment.exchangeRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
            payment.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })
        ]
    ];

    (doc as any).autoTable({
        startY: startY,
        head: [['Concepto', 'Monto ($)', 'Tasa Aplicada (Bs/$)', 'Monto Pagado (Bs)']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 2.5 },
        didDrawPage: (data: any) => { startY = data.cursor.y; }
    });

    startY = (doc as any).lastAutoTable.finalY + 15;

    // --- Footer ---
    doc.setFontSize(9).text('Este recibo confirma que su pago ha sido validado conforme a los términos establecidos por la comunidad.', margin, startY);
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

        {/* Receipt Preview Dialog */}
        <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo</DialogTitle>
                    <DialogDescription>
                        Revise el recibo antes de descargarlo. El diseño se ajustará en el PDF final.
                    </DialogDescription>
                </DialogHeader>
                {receiptData && companyInfo && (
                     <div className="flex-grow overflow-y-auto pr-4 -mr-4 border rounded-md p-4 bg-white text-black font-sans text-xs">
                        {/* Header */}
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
                        {/* Title */}
                        <div className="text-center my-4">
                            <h2 className="font-bold text-lg">RECIBO DE PAGO</h2>
                            <p className="text-right text-xs">N° de recibo: {receiptData.payment.id.substring(0, 10)}</p>
                        </div>
                        {/* Details */}
                        <div className="mb-4 text-xs">
                             <p><strong>Nombre del residente:</strong> {receiptData.ownerName}</p>
                             <p><strong>Unidad:</strong> {receiptData.ownerUnit}</p>
                             <p><strong>Método de pago:</strong> {receiptData.payment.type}</p>
                             <p><strong>Banco Emisor:</strong> {receiptData.payment.bank}</p>
                             <p><strong>N° de Referencia Bancaria:</strong> {receiptData.payment.reference}</p>
                             <p><strong>Fecha del pago:</strong> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                        </div>
                        {/* Concept Table */}
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="bg-gray-700 text-white">
                                    <TableHead className="text-white">Concepto</TableHead>
                                    <TableHead className="text-white text-right">Monto ($)</TableHead>
                                    <TableHead className="text-white text-right">Tasa Aplicada (Bs/$)</TableHead>
                                    <TableHead className="text-white text-right">Monto Pagado (Bs)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell>
                                        {receiptData.paidDebts.length > 0 
                                            ? `Pago cuota(s) ${companyInfo.name || 'Condominio'}: ${receiptData.paidDebts.map(d => `${monthsLocale[d.month]} ${d.year}`).join(', ')}`
                                            : `Abono a saldo a favor`
                                        }
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {receiptData.paidDebts.reduce((sum, debt) => sum + (debt.paidAmountUSD || debt.amountUSD), 0).toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {receiptData.payment.exchangeRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right font-bold">
                                        {receiptData.payment.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                        {/* Footer */}
                        <div className="mt-6 text-center text-gray-600 text-xs">
                             <p className="text-left">Este recibo confirma que su pago ha sido validado conforme a los términos establecidos por la comunidad.</p>
                             <p className="text-left font-bold mt-2">Firma electrónica: '{companyInfo.name} - Condominio'</p>
                             <hr className="my-4 border-gray-400"/>
                             <p className="italic text-xs">Este recibo se generó de manera automática y es válido sin firma manuscrita.</p>
                        </div>
                    </div>
                )}
                <DialogFooter className="mt-auto pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsReceiptPreviewOpen(false)}>Cerrar</Button>
                    <Button onClick={handleDownloadPdf}>
                        <Printer className="mr-2 h-4 w-4"/> Descargar PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
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

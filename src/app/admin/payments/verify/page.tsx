
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
import { collection, onSnapshot, query, doc, updateDoc, getDoc, writeBatch, runTransaction, where, orderBy, Timestamp, getDocs, addDoc, limit, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addMonths, format } from 'date-fns';

type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil' | 'adelanto';

type FullPayment = {
  id: string;
  beneficiaries: { ownerId: string; amount: number; house?: string; }[];
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
    const q = query(collection(db, "payments"));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const ownerIds = new Set<string>();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.beneficiaries && Array.isArray(data.beneficiaries)) {
                data.beneficiaries.forEach((b: any) => {
                    if (b.ownerId) ownerIds.add(b.ownerId);
                });
            }
             if (data.reportedBy) {
                ownerIds.add(data.reportedBy);
            }
        });

        const ownersData: {[key: string]: {name: string}} = {};
        if (ownerIds.size > 0) {
            const ownersQuery = query(collection(db, "owners"), where("__name__", "in", Array.from(ownerIds)));
            const ownersSnapshot = await getDocs(ownersQuery);
            ownersSnapshot.forEach(doc => {
                ownersData[doc.id] = { name: doc.data().name };
            });
        }
        
        const paymentsData: FullPayment[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Use reportedBy as the primary source for user name, fallback to beneficiaries
            const userName = ownersData[data.reportedBy]?.name || (data.beneficiaries?.[0]?.ownerId ? ownersData[data.beneficiaries[0].ownerId]?.name : 'No disponible');

            paymentsData.push({
                id: doc.id,
                user: userName,
                unit: data.beneficiaries[0]?.house || 'N/A',
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
    
    const fetchCompanyInfo = async () => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
        }
    };
    fetchCompanyInfo();

    return () => unsubscribe();
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
    let ownerName = 'No disponible';
    let ownerUnit = 'N/A';
    
    const ownerId = payment.reportedBy || payment.beneficiaries?.[0]?.ownerId;
    if (ownerId) {
        const ownerRef = doc(db, 'owners', ownerId);
        const ownerSnap = await getDoc(ownerRef);
        if (ownerSnap.exists()) {
            const ownerData = ownerSnap.data();
            ownerName = ownerData.name;
            const property = (ownerData.properties && ownerData.properties.length > 0) ? ownerData.properties[0] : null;
            ownerUnit = property ? `${property.street} - ${property.house}` : 'N/A';
        }
    }
    setReceiptData({ payment, ownerName, ownerUnit });
    setIsReceiptPreviewOpen(true);
  }

  const handleDeletePayment = (payment: FullPayment) => {
    setPaymentToDelete(payment);
    setIsDeleteConfirmationOpen(true);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;
    const paymentRef = doc(db, "payments", paymentToDelete.id);

    try {
      // If the payment was approved, we need to revert the changes in a transaction
      if (paymentToDelete.status === 'aprobado') {
        await runTransaction(db, async (transaction) => {
          
          for(const beneficiary of paymentToDelete.beneficiaries) {
            const ownerRef = doc(db, 'owners', beneficiary.ownerId);
            const ownerDoc = await transaction.get(ownerRef);
            if (!ownerDoc.exists()) throw new Error(`Propietario ${beneficiary.ownerId} no encontrado.`);

            // 1. Revert owner's balance
            const currentBalance = ownerDoc.data().balance || 0;
            const newBalance = currentBalance - beneficiary.amount;
            transaction.update(ownerRef, { balance: newBalance });

            // 2. Find and revert debts that were paid by this payment
            const paidDebtsQuery = query(
              collection(db, "debts"),
              where("ownerId", "==", beneficiary.ownerId),
              where("status", "==", "paid"),
              where("paymentDate", "==", paymentToDelete.paymentDate)
            );
            
            const paidDebtsSnapshot = await getDocs(paidDebtsQuery); // Cannot use transaction.get() on a query
            
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
    if (!receiptData) return;
    const { payment, ownerName, ownerUnit } = receiptData;
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    if (companyInfo?.logo) {
        try {
            doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        } catch(e) {
            console.error("Error adding logo to PDF", e);
        }
    }
    
    if (companyInfo) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(companyInfo.name, margin + 30, margin + 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
        doc.text(companyInfo.address, margin + 30, margin + 19);
        doc.text(companyInfo.email, margin + 30, margin + 24);
    }
    
    doc.setFontSize(10);
    doc.text(`Fecha de Emisión:`, pageWidth - margin, margin + 8, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(new Date().toLocaleDateString('es-VE'), pageWidth - margin, margin + 13, { align: 'right' });
    
    doc.setLineWidth(0.5);
    doc.line(margin, margin + 32, pageWidth - margin, margin + 32);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Recibo de Pago de Condominio', pageWidth / 2, margin + 45, { align: 'center' });

    (doc as any).autoTable({
        startY: margin + 55,
        head: [['Concepto', 'Detalle']],
        body: [
            ['ID de Transacción', payment.id],
            ['Propietario', ownerName],
            ['Unidad', ownerUnit],
            ['Fecha de Pago', new Date(payment.date).toLocaleDateString('es-VE')],
            ['Monto Pagado', `Bs. ${payment.amount.toFixed(2)}`],
            ['Banco Emisor', payment.bank],
            ['Tipo de Pago', payment.type],
            ['Referencia', payment.reference],
            ['Estado del Pago', statusTextMap[payment.status]],
        ],
        theme: 'striped',
        headStyles: { fillColor: [30, 80, 180] },
    });

    doc.save(`recibo-${ownerUnit.replace(/\s/g, '_')}-${payment.id.substring(0,5)}.pdf`);
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
                                <TableCell>Bs. {payment.amount.toFixed(2)}</TableCell>
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
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo</DialogTitle>
                    <DialogDescription>
                        Revise el recibo antes de descargarlo.
                    </DialogDescription>
                </DialogHeader>
                {receiptData && (
                     <div className="border rounded-lg p-6 my-4 bg-white text-black font-sans">
                        <header className="flex justify-between items-start pb-4 border-b">
                            <div className="flex items-center gap-4">
                                {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="w-20 h-20 object-contain"/>}
                                <div>
                                    <h3 className="font-bold text-lg">{companyInfo?.name}</h3>
                                    <p className="text-xs">{companyInfo?.rif}</p>
                                    <p className="text-xs">{companyInfo?.address}</p>
                                    <p className="text-xs">{companyInfo?.phone} | {companyInfo?.email}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <h4 className="font-bold text-xl">RECIBO DE PAGO</h4>
                                <p className="text-sm">ID: {receiptData.payment.id}</p>
                                <p className="text-sm">Fecha: {new Date().toLocaleDateString('es-VE')}</p>
                            </div>
                        </header>
                        <section className="mt-6">
                            <h5 className="font-bold mb-2">Detalles del Propietario</h5>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                <p><span className="font-semibold">Nombre:</span> {receiptData.ownerName}</p>
                                <p><span className="font-semibold">Unidad:</span> {receiptData.ownerUnit}</p>
                            </div>
                        </section>
                         <section className="mt-6">
                            <h5 className="font-bold mb-2">Detalles del Pago</h5>
                            <Table className="text-sm">
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="text-black">Concepto</TableHead>
                                        <TableHead className="text-right text-black">Monto</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>
                                            <p>Pago de Condominio</p>
                                            <p className="text-xs text-muted-foreground">
                                                Ref: {receiptData.payment.reference} | {receiptData.payment.bank} | {new Date(receiptData.payment.date).toLocaleDateString('es-VE')}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">Bs. {receiptData.payment.amount.toFixed(2)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                            <div className="flex justify-end mt-4">
                                <div className="w-64">
                                    <div className="flex justify-between text-lg font-bold border-t-2 pt-2">
                                        <span>TOTAL PAGADO:</span>
                                        <span>Bs. {receiptData.payment.amount.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </section>
                        <footer className="mt-8 text-center text-xs text-muted-foreground">
                            <p>Este es un recibo generado por el sistema. Válido sin firma ni sello.</p>
                            <p>Gracias por su pago.</p>
                        </footer>
                    </div>
                )}
                <DialogFooter>
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

    

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CheckCircle2, XCircle, MoreHorizontal, Eye, Printer, Filter, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, onSnapshot, query, doc, updateDoc, getDoc, writeBatch, runTransaction, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil';

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
  const { toast } = useToast();

  useEffect(() => {
    const q = query(collection(db, "payments"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const paymentsData: FullPayment[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            paymentsData.push({
                id: doc.id,
                unit: data.beneficiaries[0]?.house || 'N/A', // Simplified
                amount: data.totalAmount,
                date: new Date(data.paymentDate.seconds * 1000).toISOString(),
                bank: data.bank,
                type: data.paymentMethod,
                reference: data.reference,
                status: data.status,
                // Full data for processing
                beneficiaries: data.beneficiaries,
                totalAmount: data.totalAmount,
                exchangeRate: data.exchangeRate,
                paymentDate: data.paymentDate,
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
    const paymentToProcess = payments.find(p => p.id === id);

    if (!paymentToProcess) {
        toast({ variant: 'destructive', title: 'Error', description: 'Pago no encontrado.' });
        return;
    }
    
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
                const paymentAmountUSD = paymentData.totalAmount / paymentData.exchangeRate;

                // Process each beneficiary of the payment
                for (const beneficiary of paymentData.beneficiaries) {
                    const ownerRef = doc(db, "owners", beneficiary.ownerId);
                    const ownerDoc = await transaction.get(ownerRef);

                    if (!ownerDoc.exists()) {
                       throw new Error(`Propietario con ID ${beneficiary.ownerId} no encontrado.`);
                    }
                    
                    const ownerBalanceUSD = ownerDoc.data().balance || 0;
                    const beneficiaryAmountUSD = beneficiary.amount / paymentData.exchangeRate;
                    let availableFundsUSD = ownerBalanceUSD + beneficiaryAmountUSD;
                    
                    const debtsQuery = query(
                        collection(db, "debts"),
                        where("ownerId", "==", beneficiary.ownerId),
                        where("status", "==", "pending"),
                        orderBy("year", "asc"),
                        orderBy("month", "asc")
                    );
                    const debtsSnapshot = await getDocs(debtsQuery); // Note: getDocs inside transaction is not ideal, but necessary here. Better with a cloud function.
                    
                    const pendingDebts: Debt[] = [];
                    debtsSnapshot.forEach(doc => pendingDebts.push({id: doc.id, ...doc.data()} as Debt));

                    for (const debt of pendingDebts) {
                        if (availableFundsUSD >= debt.amountUSD) {
                            availableFundsUSD -= debt.amountUSD;
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
                    
                    transaction.update(ownerRef, { balance: availableFundsUSD });
                }

                // Finally, update the payment status
                transaction.update(paymentRef, { status: 'aprobado' });
            });
            
            toast({
                title: 'Pago Aprobado y Conciliado',
                description: 'Las deudas han sido saldadas y el saldo actualizado.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

        } catch (error) {
            console.error("Error processing payment approval: ", error);
            const errorMessage = error instanceof Error ? error.message : 'No se pudo aprobar y conciliar el pago.';
            toast({ variant: 'destructive', title: 'Error en la Transacción', description: errorMessage });
        }
    }
  };

  const generateReceipt = (payment: FullPayment) => {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    if (companyInfo?.logo) {
        doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
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
            ['Propietario', payment.user || 'No disponible'],
            ['Unidad', payment.unit],
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

    doc.save(`recibo-${payment.unit}-${payment.id.substring(0,5)}.pdf`);
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
                                                <DropdownMenuItem onClick={() => generateReceipt(payment)}>
                                                    <Printer className="mr-2 h-4 w-4" />
                                                    Generar Recibo
                                                </DropdownMenuItem>
                                            )}
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
    </div>
  );
}

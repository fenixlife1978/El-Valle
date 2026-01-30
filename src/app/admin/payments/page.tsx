
'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
    collection, query, onSnapshot, doc, writeBatch, runTransaction, Timestamp, getDocs, where, orderBy
} from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import {
    Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Loader2, Search, CheckCircle, Clock, XCircle, Eye, AlertTriangle, User
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Image from 'next/image';

// Types
type Payment = {
    id: string;
    beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[];
    beneficiaryIds: string[];
    totalAmount: number;
    exchangeRate: number;
    paymentDate: Timestamp;
    reportedAt: Timestamp;
    paymentMethod: 'transferencia' | 'movil' | 'efectivo' | 'zelle';
    bank: string;
    reference: string;
    status: 'pendiente' | 'aprobado' | 'rechazado';
    receiptUrl?: string;
    observations?: string;
    receiptNumbers?: { [ownerId: string]: string };
};

type Debt = {
    id: string;
    ownerId: string;
    property: { street: string; house: string };
    year: number;
    month: number;
    amountUSD: number;
    status: 'pending' | 'paid' | 'vencida';
};

const formatCurrency = (num: number) => `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Main Component
export default function PaymentsVerificationPage() {
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const { toast } = useToast();

    // Prioritize support_mode_id if super-admin is using it
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const { activeCondoId } = useAuth();
    const workingCondoId = (sId && user?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pendiente');

    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        if (!workingCondoId) {
            setLoading(false);
            return;
        }

        const q = query(collection(db, 'condominios', workingCondoId, 'payments'), orderBy('reportedAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const paymentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
            setPayments(paymentsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching payments: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos.' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [workingCondoId, toast]);

    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            const statusMatch = p.status === activeTab;
            const searchMatch = searchTerm === '' ||
                p.reference.includes(searchTerm) ||
                p.beneficiaries.some(b => b.ownerName.toLowerCase().includes(searchTerm.toLowerCase()));
            return statusMatch && searchMatch;
        });
    }, [payments, activeTab, searchTerm]);

    const handleApprove = (payment: Payment) => {
        requestAuthorization(async () => {
            if (!workingCondoId) return;
            setIsVerifying(true);
            try {
                await runTransaction(db, async (transaction) => {
                    const paymentRef = doc(db, 'condominios', workingCondoId, 'payments', payment.id);
                    const receiptNumbers: { [ownerId: string]: string } = {};

                    for (const beneficiary of payment.beneficiaries) {
                        const ownerRef = doc(db, 'condominios', workingCondoId, 'owners', beneficiary.ownerId);
                        const ownerDoc = await transaction.get(ownerRef);
                        if (!ownerDoc.exists()) throw new Error(`El propietario ${beneficiary.ownerName} no fue encontrado.`);

                        let ownerBalance = ownerDoc.data().balance || 0;
                        let paymentAmountLeft = beneficiary.amount;
                        
                        receiptNumbers[beneficiary.ownerId] = `REC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;

                        // 1. Pay pending debts
                        const debtsQuery = query(
                            collection(db, 'condominios', workingCondoId, 'debts'),
                            where('ownerId', '==', beneficiary.ownerId),
                            where('status', 'in', ['pending', 'vencida']),
                            orderBy('year'),
                            orderBy('month')
                        );
                        // Important: getDocs needs to be outside the transaction's read operations
                        const debtsSnapshot = await getDocs(debtsQuery);

                        for (const debtDoc of debtsSnapshot.docs) {
                            if (paymentAmountLeft <= 0) break;
                            const debt = debtDoc.data() as Debt;
                            const debtAmountBs = debt.amountUSD * payment.exchangeRate;

                            if (paymentAmountLeft >= debtAmountBs) {
                                transaction.update(debtDoc.ref, {
                                    status: 'paid',
                                    paymentId: payment.id,
                                    paymentDate: payment.paymentDate,
                                    paidAmountUSD: debt.amountUSD
                                });
                                paymentAmountLeft -= debtAmountBs;
                            }
                        }

                        // 2. Add remaining amount to balance
                        if (paymentAmountLeft > 0) {
                            ownerBalance += paymentAmountLeft;
                            transaction.update(ownerRef, { balance: ownerBalance });
                        }
                    }

                    // 3. Update payment status
                    transaction.update(paymentRef, {
                        status: 'aprobado',
                        observations: 'Pago verificado y aplicado por la administración.',
                        receiptNumbers: receiptNumbers,
                    });
                });
                
                toast({
                    title: 'Pago Aprobado',
                    description: 'El pago ha sido verificado y aplicado correctamente.',
                    className: 'bg-green-100 border-green-400 text-green-800'
                });
                setSelectedPayment(null);

            } catch (error: any) {
                console.error("Error approving payment:", error);
                toast({ variant: 'destructive', title: 'Error al Aprobar', description: error.message || 'No se pudo completar la transacción.' });
            } finally {
                setIsVerifying(false);
            }
        });
    };

    const handleReject = (payment: Payment) => {
        if (!rejectionReason) {
            toast({ variant: 'destructive', title: 'Razón requerida', description: 'Debe especificar un motivo para el rechazo.' });
            return;
        }
        requestAuthorization(async () => {
            if (!workingCondoId) return;
            setIsVerifying(true);
            try {
                const paymentRef = doc(db, 'condominios', workingCondoId, 'payments', payment.id);
                await updateDoc(paymentRef, {
                    status: 'rechazado',
                    observations: rejectionReason,
                });
                toast({ title: 'Pago Rechazado', description: 'El pago ha sido marcado como rechazado.' });
                setSelectedPayment(null);
                setRejectionReason('');
            } catch (error: any) {
                console.error("Error rejecting payment:", error);
                toast({ variant: 'destructive', title: 'Error al Rechazar', description: error.message || 'No se pudo actualizar el pago.' });
            } finally {
                setIsVerifying(false);
            }
        });
    };
    
    return (
        <div className="space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Gestión de <span className="text-primary">Pagos</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Verificación, aprobación y rechazo de los pagos reportados por los propietarios.
                </p>
            </div>

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
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Propietario(s)</TableHead>
                                            <TableHead>Fecha de Pago</TableHead>
                                            <TableHead>Monto (Bs.)</TableHead>
                                            <TableHead>Referencia</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredPayments.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay pagos en esta categoría.</TableCell></TableRow>
                                        ) : filteredPayments.map(p => (
                                            <TableRow key={p.id}>
                                                <TableCell className="font-medium">
                                                    {p.beneficiaries.map(b => b.ownerName).join(', ')}
                                                </TableCell>
                                                <TableCell>{format(p.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{formatCurrency(p.totalAmount)}</TableCell>
                                                <TableCell className="font-mono">{p.reference}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => setSelectedPayment(p)}>
                                                        <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </Tabs>
                </CardContent>
            </Card>

            {/* --- Details Dialog --- */}
            {selectedPayment && (
                <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Detalles del Pago - {selectedPayment.reference}</DialogTitle>
                            <DialogDescription>
                                Reportado el {format(selectedPayment.reportedAt.toDate(), 'dd/MM/yyyy HH:mm')}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto">
                            <div className="space-y-4">
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm">Beneficiarios</CardTitle></CardHeader>
                                    <CardContent>
                                        {selectedPayment.beneficiaries.map((b, i) => (
                                            <div key={i} className="text-sm flex justify-between items-center">
                                                <span><User className="inline h-4 w-4 mr-1"/>{b.ownerName}</span>
                                                <span className="font-bold">{formatCurrency(b.amount)}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                                 <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm">Detalles de la Transacción</CardTitle></CardHeader>
                                    <CardContent className="text-sm space-y-1">
                                        <p><strong>Monto Total:</strong> {formatCurrency(selectedPayment.totalAmount)}</p>
                                        <p><strong>Fecha:</strong> {format(selectedPayment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                                        <p><strong>Método:</strong> {selectedPayment.paymentMethod}</p>
                                        <p><strong>Banco:</strong> {selectedPayment.bank}</p>
                                    </CardContent>
                                </Card>
                                 {selectedPayment.status === 'rechazado' && (
                                     <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>
                                            <strong>Motivo del Rechazo:</strong> {selectedPayment.observations}
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                             <div>
                                <Label>Comprobante de Pago</Label>
                                {selectedPayment.receiptUrl ? (
                                    <div className="mt-2 border rounded-lg overflow-hidden">
                                        <Image src={selectedPayment.receiptUrl} alt="Comprobante" width={400} height={600} className="w-full h-auto" />
                                    </div>
                                ) : <p className="text-sm text-muted-foreground">No se adjuntó comprobante.</p>}
                            </div>
                        </div>

                         {selectedPayment.status === 'pendiente' && (
                            <DialogFooter className="border-t pt-4 gap-4">
                                <div className="w-full">
                                    <Label htmlFor="rejectionReason">Motivo del rechazo (opcional)</Label>
                                    <Textarea id="rejectionReason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Ej: Referencia no coincide, monto incorrecto..." />
                                </div>
                                <div className="w-full flex flex-col sm:flex-row gap-2 justify-end">
                                    <Button variant="destructive" onClick={() => handleReject(selectedPayment)} disabled={isVerifying || !rejectionReason}>
                                        {isVerifying ? <Loader2 className="animate-spin" /> : <XCircle className="mr-2"/>} Rechazar
                                    </Button>
                                    <Button onClick={() => handleApprove(selectedPayment)} disabled={isVerifying} className="bg-success hover:bg-success/80">
                                        {isVerifying ? <Loader2 className="animate-spin" /> : <CheckCircle className="mr-2"/>} Aprobar
                                    </Button>
                                </div>
                            </DialogFooter>
                        )}
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

    
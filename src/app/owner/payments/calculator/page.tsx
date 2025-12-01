
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Info, Calculator, Minus, Equal, Check, Receipt, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, writeBatch, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { isBefore, startOfMonth, format, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
};

type PaymentDetails = {
    paymentMethod: 'movil' | 'transferencia' | '';
    bank: string;
    otherBank: string;
    reference: string;
};

const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'tesoro', label: 'Banco del Tesoro' },
    { value: 'otro', label: 'Otro' },
];

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};


export default function OwnerPaymentCalculatorPage() {
    const { user, ownerData, loading: authLoading } = useAuth();
    const router = useRouter();
    const [ownerDebts, setOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({ paymentMethod: '', bank: '', otherBank: '', reference: '' });

    const { toast } = useToast();

    useEffect(() => {
        if (authLoading || !user || !ownerData) return;

        const settingsRef = doc(db(), 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCondoFee(settings.condoFee || 0);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) setActiveRate(activeRateObj.rate);
                else if (rates.length > 0) {
                    const sortedRates = [...rates].sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setActiveRate(sortedRates[0].rate);
                }
            }
        });
        
        const debtsQuery = query(collection(db(), "debts"), where("ownerId", "==", user.uid));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData: Debt[] = [];
            snapshot.forEach(d => debtsData.push({ id: d.id, ...d.data() } as Debt));
            setOwnerDebts(debtsData.sort((a, b) => a.year - a.year || a.month - b.month));
            setLoadingDebts(false);
        });

        return () => {
            settingsUnsubscribe();
            debtsUnsubscribe();
        };

    }, [user, ownerData, authLoading]);
    
    const pendingDebts = useMemo(() => {
        return ownerDebts
           .filter(d => d.status === 'pending' || d.status === 'vencida')
           .sort((a, b) => a.year - b.year || a.month - b.month);
   }, [ownerDebts]);

    const handleDebtSelection = (debtId: string) => {
        setSelectedPendingDebts(prev => prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]);
    };

    const handleAdvanceMonthSelection = (monthValue: string) => {
        setSelectedAdvanceMonths(prev => prev.includes(monthValue) ? prev.filter(m => m !== monthValue) : [...prev, monthValue]);
    };
    
    const futureMonths = useMemo(() => {
        const paidAdvanceMonths = ownerDebts
            .filter(d => d.status === 'paid' && d.description.includes('Adelantado'))
            .map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);

        return Array.from({ length: 12 }, (_, i) => {
            const date = addMonths(new Date(), i);
            const value = format(date, 'yyyy-MM');
            return {
                value,
                label: format(date, 'MMMM yyyy', { locale: es }),
                disabled: paidAdvanceMonths.includes(value),
            };
        });
    }, [ownerDebts]);


    const paymentCalculator = useMemo(() => {
        if (!ownerData) return { totalToPay: 0, hasSelection: false, dueMonthsCount: 0, advanceMonthsCount: 0, totalDebtBs: 0, balanceInFavor: 0 };
        
        const dueMonthsTotalUSD = pendingDebts
            .filter(debt => selectedPendingDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
        
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalDebtUSD = dueMonthsTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - (ownerData.balance || 0));

        return {
            totalToPay,
            hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0,
            dueMonthsCount: selectedPendingDebts.length,
            advanceMonthsCount: selectedAdvanceMonths.length,
            totalDebtBs: totalDebtBs,
            balanceInFavor: ownerData.balance || 0,
            condoFee,
        };
    }, [selectedPendingDebts, selectedAdvanceMonths, pendingDebts, activeRate, condoFee, ownerData]);

    const formatToTwoDecimals = (num: number) => {
        if (typeof num !== 'number' || isNaN(num)) return '0,00';
        return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const handleRegisterPayment = async () => {
        if (!paymentDetails.paymentMethod || !paymentDetails.bank || !paymentDetails.reference) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, complete todos los detalles del pago.' });
            return;
        }
        if (paymentDetails.bank === 'otro' && !paymentDetails.otherBank) {
            toast({ variant: 'destructive', title: 'Campo requerido', description: 'Por favor, especifique el nombre del otro banco.' });
            return;
        }

        setProcessingPayment(true);
        if (!ownerData || !user) return;

        try {
            const paymentAmountBs = paymentCalculator.totalToPay;
            if (paymentAmountBs <= 0) {
                toast({ variant: "destructive", title: "Monto Inválido", description: "El monto a pagar debe ser mayor que cero." });
                setProcessingPayment(false);
                return;
            }

            const paymentData = {
                reportedBy: user.uid,
                beneficiaries: [{ ownerId: user.uid, ownerName: ownerData.name, ...ownerData.properties[0], amount: paymentAmountBs }],
                beneficiaryIds: [user.uid],
                totalAmount: paymentAmountBs,
                exchangeRate: activeRate,
                paymentDate: Timestamp.now(),
                reportedAt: Timestamp.now(),
                paymentMethod: paymentDetails.paymentMethod,
                bank: paymentDetails.bank === 'otro' ? paymentDetails.otherBank : paymentDetails.bank,
                reference: paymentDetails.reference,
                status: 'pendiente',
                observations: `Pago desde calculadora para ${paymentCalculator.dueMonthsCount} deuda(s) y ${paymentCalculator.advanceMonthsCount} adelanto(s).`
            };

            await addDoc(collection(db(), 'payments'), paymentData);

            toast({ title: 'Pago Reportado Exitosamente', description: 'Tu pago ha sido enviado para verificación.', className: 'bg-green-100 border-green-400 text-green-800' });
            setIsPaymentDialogOpen(false);
            setPaymentDetails({ paymentMethod: '', bank: '', otherBank: '', reference: '' });
            setSelectedPendingDebts([]);
            setSelectedAdvanceMonths([]);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo reportar el pago.' });
        } finally {
            setProcessingPayment(false);
        }
    };


    if (authLoading || loadingDebts) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }
    
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold font-headline">Calculadora de Pagos</h1>
                <p className="text-muted-foreground">Seleccione las deudas que desea pagar para calcular el monto total.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader><CardTitle>1. Deudas Pendientes</CardTitle></CardHeader>
                        <CardContent className="p-0">
                           <Table>
                                <TableHeader><TableRow><TableHead className="w-[50px] text-center">Pagar</TableHead><TableHead>Período</TableHead><TableHead>Concepto</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Monto (Bs.)</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {pendingDebts.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center"><Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />No tiene deudas pendientes.</TableCell></TableRow>
                                    ) : (
                                        pendingDebts.map((debt) => {
                                            const debtMonthDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                            const isOverdue = isBefore(debtMonthDate, startOfMonth(new Date()));
                                            const status = debt.status === 'vencida' || (debt.status === 'pending' && isOverdue) ? 'Vencida' : 'Pendiente';

                                            return (
                                            <TableRow key={debt.id} data-state={selectedPendingDebts.includes(debt.id) ? 'selected' : ''}>
                                                <TableCell className="text-center"><Checkbox onCheckedChange={() => handleDebtSelection(debt.id)} checked={selectedPendingDebts.includes(debt.id)} /></TableCell>
                                                <TableCell className="font-medium">{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                <TableCell>{debt.description}</TableCell>
                                                <TableCell>
                                                    <Badge variant={status === 'Vencida' ? 'destructive' : 'warning'}>{status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">Bs. {formatToTwoDecimals(debt.amountUSD * activeRate)}</TableCell>
                                            </TableRow>
                                        )})
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>2. Pagar Meses por Adelantado</CardTitle><CardDescription>Cuota mensual actual: ${condoFee.toFixed(2)}</CardDescription></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {futureMonths.map(month => (
                                    <Button key={month.value} type="button" variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'}
                                        className="flex items-center justify-center gap-2 capitalize" onClick={() => handleAdvanceMonthSelection(month.value)} disabled={month.disabled}>
                                        {selectedAdvanceMonths.includes(month.value) && <Check className="h-4 w-4" />}
                                        {month.label}
                                    </Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
                
                <div className="lg:sticky lg:top-20">
                     {paymentCalculator.hasSelection && (
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center"><Calculator className="mr-2 h-5 w-5"/> 3. Resumen de Pago</CardTitle>
                                <CardDescription>Cálculo basado en su selección.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {paymentCalculator.dueMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.dueMonthsCount} mes(es) adeudado(s) seleccionado(s).</p>}
                                {paymentCalculator.advanceMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.advanceMonthsCount} mes(es) por adelanto seleccionado(s) x ${(paymentCalculator.condoFee ?? 0).toFixed(2)} c/u.</p>}
                                <hr className="my-2"/>
                                <div className="flex justify-between items-center text-lg">
                                    <span className="text-muted-foreground">Sub-Total Deuda:</span>
                                    <span className="font-medium">Bs. {formatToTwoDecimals(paymentCalculator.totalDebtBs)}</span>
                                </div>
                                <div className="flex justify-between items-center text-md">
                                    <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                    <span className="font-medium text-green-500">Bs. {formatToTwoDecimals(paymentCalculator.balanceInFavor)}</span>
                                </div>
                                <hr className="my-2"/>
                                <div className="flex justify-between items-center text-2xl font-bold">
                                    <span className="flex items-center"><Equal className="mr-2 h-5 w-5"/> TOTAL A PAGAR:</span>
                                    <span className="text-primary">Bs. {formatToTwoDecimals(paymentCalculator.totalToPay)}</span>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full" onClick={() => setIsPaymentDialogOpen(true)} disabled={!paymentCalculator.hasSelection || paymentCalculator.totalToPay <= 0}>
                                    <Receipt className="mr-2 h-4 w-4" />
                                    Reportar Pago
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                </div>
            </div>

            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reportar Pago por Bs. {formatToTwoDecimals(paymentCalculator.totalToPay)}</DialogTitle>
                        <DialogDescription>
                            Ingrese los detalles de la transacción para completar el reporte.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                           <Label htmlFor="paymentMethod">Tipo de Pago</Label>
                           <Select value={paymentDetails.paymentMethod} onValueChange={(v) => setPaymentDetails(d => ({...d, paymentMethod: v as any}))}>
                                <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="movil">Pago Móvil</SelectItem>
                                </SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bank">Banco Emisor</Label>
                            <Select value={paymentDetails.bank} onValueChange={(v) => setPaymentDetails(d => ({...d, bank: v}))}>
                                <SelectTrigger><SelectValue placeholder="Seleccione un banco..." /></SelectTrigger>
                                <SelectContent>{venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {paymentDetails.bank === 'otro' && (
                            <div className="space-y-2">
                                <Label htmlFor="otherBank">Nombre del Otro Banco</Label>
                                <Input id="otherBank" value={paymentDetails.otherBank} onChange={(e) => setPaymentDetails(d => ({...d, otherBank: e.target.value}))} />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="reference">Referencia</Label>
                            <Input id="reference" value={paymentDetails.reference} onChange={(e) => setPaymentDetails(d => ({...d, reference: e.target.value.replace(/\D/g, '')}))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)} disabled={processingPayment}>Cancelar</Button>
                        <Button onClick={handleRegisterPayment} disabled={processingPayment}>
                            {processingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                            Confirmar y Reportar Pago
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

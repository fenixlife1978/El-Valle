
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Info, Calculator, Minus, Equal, Check, Receipt, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { isBefore, startOfMonth, format, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';

const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'otro', label: 'Otro' },
];

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function OwnerPaymentCalculatorPage({ params }: { params: { condoId: string } }) {
    const workingCondoId = params.condoId;
    const { user, ownerData, loading: authLoading } = useAuth();
    const router = useRouter();
    
    const [ownerDebts, setOwnerDebts] = useState<any[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState({ paymentMethod: '', bank: '', otherBank: '', reference: '' });
    const { toast } = useToast();

    useEffect(() => {
        if (!workingCondoId) return;
        const settingsRef = doc(db, 'condominios', workingCondoId, 'config', 'mainSettings');
        const unsub = onSnapshot(settingsRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setCondoFee(data.condoFee || 0);
                const rates = data.exchangeRates || [];
                const active = rates.find((r: any) => r.active || r.status === 'active');
                setActiveRate(active?.rate || active?.value || 0);
            }
        });
        return () => unsub();
    }, [workingCondoId]);

    useEffect(() => {
        if (!workingCondoId || !user?.uid) return;
        const q = query(
            collection(db, 'condominios', workingCondoId, 'debts'),
            where("ownerId", "==", user.uid)
        );
        const unsub = onSnapshot(q, (snap) => {
            setOwnerDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoadingDebts(false);
        });
        return () => unsub();
    }, [workingCondoId, user]);

    const pendingDebts = useMemo(() => {
        return ownerDebts
           .filter(d => d.status === 'pending' || d.status === 'vencida')
           .sort((a, b) => a.year - b.year || a.month - b.month);
    }, [ownerDebts]);

    const futureMonths = useMemo(() => {
        const now = new Date();
        const paidAdvanceMonths = ownerDebts
            .filter(d => d.status === 'paid' && d.description.includes('Adelantado'))
            .map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);
        
        return Array.from({ length: 12 }, (_, i) => {
            const date = addMonths(now, i);
            const value = format(date, 'yyyy-MM');
            return { 
                value, 
                label: format(date, 'MMMM yyyy', { locale: es }), 
                disabled: paidAdvanceMonths.includes(value) 
            };
        });
    }, [ownerDebts]);

    const paymentCalculator = useMemo(() => {
        const dueMonthsTotalUSD = pendingDebts
            .filter(debt => selectedPendingDebts.includes(debt.id))
            .reduce((sum, debt) => sum + (debt.amountUSD || 0), 0);
        
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalDebtBs = (dueMonthsTotalUSD + advanceMonthsTotalUSD) * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - (ownerData?.balance || 0));

        return {
            totalToPay,
            hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0,
            dueMonthsCount: selectedPendingDebts.length,
            advanceMonthsCount: selectedAdvanceMonths.length,
            totalDebtBs,
            balanceInFavor: ownerData?.balance || 0,
            condoFee
        };
    }, [selectedPendingDebts, selectedAdvanceMonths, pendingDebts, activeRate, condoFee, ownerData]);

    const handleRegisterPayment = async () => {
        if (!workingCondoId || !user || !ownerData) return;
        setProcessingPayment(true);
        try {
            const paymentData = {
                reportedBy: user.uid,
                condoId: workingCondoId,
                beneficiaries: [{ 
                    ownerId: user.uid, 
                    ownerName: ownerData.name, 
                    amount: paymentCalculator.totalToPay 
                }],
                beneficiaryIds: [user.uid],
                totalAmount: paymentCalculator.totalToPay,
                exchangeRate: activeRate,
                paymentDate: Timestamp.now(),
                reportedAt: Timestamp.now(),
                paymentMethod: paymentDetails.paymentMethod,
                bank: paymentDetails.bank === 'otro' ? paymentDetails.otherBank : paymentDetails.bank,
                reference: paymentDetails.reference,
                status: 'pendiente',
                observations: `Pago vía calculadora en ${workingCondoId}: ${paymentCalculator.dueMonthsCount} deuda(s), ${paymentCalculator.advanceMonthsCount} adelanto(s).`
            };

            await addDoc(collection(db, 'condominios', workingCondoId, 'payments'), paymentData);
            toast({ title: 'Pago Reportado', description: 'Enviado para verificación exitosamente.' });
            setIsPaymentDialogOpen(false);
            setSelectedPendingDebts([]);
            setSelectedAdvanceMonths([]);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al reportar el pago' });
        } finally {
            setProcessingPayment(false);
        }
    };

    if (authLoading || loadingDebts) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4">
                <Loader2 className="animate-spin h-10 w-10 text-amber-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Calculando Deudas...</p>
            </div>
        );
    }
    
    return (
        <div className="p-6 space-y-6 font-montserrat max-w-7xl mx-auto">
            <div className="mb-10">
                <h1 className="text-4xl font-black uppercase italic tracking-tighter">
                    Calculadora de <span className="text-amber-500">Pagos</span>
                </h1>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-4">
                    Sincronizado con: <span className="text-foreground">{workingCondoId}</span>
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader><CardTitle>1. Deudas Pendientes</CardTitle></CardHeader>
                        <CardContent className="p-0">
                           <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px] text-center">Pagar</TableHead>
                                        <TableHead>Período</TableHead>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Monto (Bs.)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingDebts.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                                No tiene deudas pendientes.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                     pendingDebts.map((debt) => {
                                        const debtMonthDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                        const isOverdue = isBefore(debtMonthDate, startOfMonth(new Date()));
                                        const status = debt.status === 'vencida' || (debt.status === 'pending' && isOverdue) ? 'Vencida' : 'Pendiente';
                                        return (
                                            <TableRow key={debt.id} data-state={selectedPendingDebts.includes(debt.id) ? 'selected' : ''}>
                                                <TableCell className="text-center">
                                                    <Checkbox 
                                                        onCheckedChange={() => setSelectedPendingDebts(p => p.includes(debt.id) ? p.filter(id=>id!==debt.id) : [...p, debt.id])} 
                                                        checked={selectedPendingDebts.includes(debt.id)} 
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                <TableCell>{debt.description}</TableCell>
                                                <TableCell><Badge variant={status === 'Vencida' ? 'destructive' : 'warning'}>{status}</Badge></TableCell>
                                                <TableCell className="text-right">Bs. {formatToTwoDecimals(debt.amountUSD * activeRate)}</TableCell>
                                            </TableRow>
                                        );
                                    }))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>2. Pagar Meses por Adelantado</CardTitle>
                            <CardDescription>Cuota mensual actual: ${condoFee.toFixed(2)}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {futureMonths.map(month => (
                                    <Button 
                                        key={month.value} 
                                        type="button" 
                                        variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'} 
                                        className="flex items-center justify-center gap-2 capitalize" 
                                        onClick={() => setSelectedAdvanceMonths(p => p.includes(month.value) ? p.filter(m=>m!==month.value) : [...p, month.value])} 
                                        disabled={month.disabled}
                                    >
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
                                    <span className="font-bold text-primary">Bs. {formatToTwoDecimals(paymentCalculator.totalToPay)}</span>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full" disabled={!paymentCalculator.hasSelection || paymentCalculator.totalToPay <= 0} onClick={() => router.push(`/${workingCondoId}/owner/payments`)}>
                                    <Receipt className="mr-2 h-4 w-4"/>
                                    Proceder al Reporte de Pago
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
                        <DialogDescription>Complete los detalles de su transacción.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Método de Pago</Label>
                            <Select value={paymentDetails.paymentMethod} onValueChange={v => setPaymentDetails(p => ({...p, paymentMethod: v}))}>
                                <SelectTrigger><SelectValue placeholder="Seleccione..."/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="movil">Pago Móvil</SelectItem>
                                    <SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem>
                                    <SelectItem value="efectivo_usd">Efectivo USD</SelectItem>
                                    <SelectItem value="zelle">Zelle</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label>Banco Emisor</Label>
                            <Select value={paymentDetails.bank} onValueChange={v => setPaymentDetails(p => ({...p, bank: v}))}>
                                <SelectTrigger><SelectValue placeholder="Seleccione..."/></SelectTrigger>
                                <SelectContent>
                                    {venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {paymentDetails.bank === 'otro' && (
                             <div className="space-y-2">
                                <Label>Nombre del Otro Banco</Label>
                                <Input value={paymentDetails.otherBank} onChange={e => setPaymentDetails(p => ({...p, otherBank: e.target.value}))}/>
                            </div>
                        )}
                         <div className="space-y-2">
                            <Label>Referencia</Label>
                            <Input value={paymentDetails.reference} onChange={e => setPaymentDetails(p => ({...p, reference: e.target.value}))}/>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleRegisterPayment} disabled={processingPayment}>
                            {processingPayment ? <Loader2 className="animate-spin" /> : 'Confirmar y Reportar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

'use client';

import { useState, useEffect, useMemo, use } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Info, Calculator, Minus, Equal, Check, Receipt, ArrowLeft, CalendarIcon, Hash, Banknote, DollarSign, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, Timestamp, addDoc, getDoc, updateDoc } from 'firebase/firestore';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'otro', label: 'Otro' },
];

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function OwnerPaymentCalculatorPage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const workingCondoId = resolvedParams.condoId;
    const { user, ownerData, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    const [ownerDebts, setOwnerDebts] = useState<any[]>([]);
    const [extraordinaryDebts, setExtraordinaryDebts] = useState<any[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedExtraordinaryDebts, setSelectedExtraordinaryDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date>(new Date());
    const [selectedRate, setSelectedRate] = useState<number | null>(null);
    const [rateLoading, setRateLoading] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState({ 
        paymentMethod: '', 
        bank: '', 
        otherBank: '', 
        reference: ''
    });

    // Cargar tasa según la fecha seleccionada
    useEffect(() => {
        if (!workingCondoId || !paymentDate) return;
        const fetchRate = async () => {
            setRateLoading(true);
            try {
                const settingsRef = doc(db, 'condominios', workingCondoId, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    const allRates = (settings.exchangeRates || []) as any[];
                    const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                    const applicableRates = allRates
                        .filter(r => r.date <= paymentDateString)
                        .sort((a, b) => b.date.localeCompare(a.date));
                    if (applicableRates.length > 0) {
                        setSelectedRate(applicableRates[0].rate);
                    } else {
                        setSelectedRate(null);
                    }
                }
            } catch (error) {
                console.error("Error fetching rate:", error);
                setSelectedRate(null);
            } finally {
                setRateLoading(false);
            }
        };
        fetchRate();
    }, [paymentDate, workingCondoId]);

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

    // Cargar deudas ordinarias
    useEffect(() => {
        if (!workingCondoId || !user?.uid) return;
        const q = query(
            collection(db, 'condominios', workingCondoId, 'debts'),
            where("ownerId", "==", user.uid)
        );
        const unsub = onSnapshot(q, (snap) => {
            setOwnerDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [workingCondoId, user]);

    // Cargar deudas extraordinarias
    useEffect(() => {
        if (!workingCondoId || !user?.uid) return;
        const q = query(
            collection(db, 'condominios', workingCondoId, 'owner_extraordinary_debts'),
            where("ownerId", "==", user.uid),
            where("status", "==", "pending")
        );
        const unsub = onSnapshot(q, (snap) => {
            const debts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setExtraordinaryDebts(debts);
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
            .filter(d => d.status === 'paid' && d.description?.includes('Adelantado'))
            .map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);
        
        return Array.from({ length: 12 }, (_, i) => {
            const date = addMonths(now, i);
            const value = format(date, 'yyyy-MM');
            return { 
                value, 
                label: format(date, 'MMMM yyyy', { locale: es }).toUpperCase(), 
                disabled: paidAdvanceMonths.includes(value) 
            };
        });
    }, [ownerDebts]);

    const paymentCalculator = useMemo(() => {
        const dueMonthsTotalUSD = pendingDebts
            .filter(debt => selectedPendingDebts.includes(debt.id))
            .reduce((sum, debt) => sum + (debt.amountUSD || 0), 0);
        
        const extraordinaryTotalUSD = extraordinaryDebts
            .filter(debt => selectedExtraordinaryDebts.includes(debt.id))
            .reduce((sum, debt) => sum + (debt.amountUSD || 0), 0);
        
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalUSD = dueMonthsTotalUSD + extraordinaryTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalUSD * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - (ownerData?.balance || 0));

        return {
            totalToPay,
            hasSelection: selectedPendingDebts.length > 0 || selectedExtraordinaryDebts.length > 0 || selectedAdvanceMonths.length > 0,
            dueMonthsCount: selectedPendingDebts.length,
            extraordinaryCount: selectedExtraordinaryDebts.length,
            advanceMonthsCount: selectedAdvanceMonths.length,
            totalUSD,
            totalDebtBs,
            balanceInFavor: ownerData?.balance || 0,
            condoFee
        };
    }, [selectedPendingDebts, selectedExtraordinaryDebts, selectedAdvanceMonths, pendingDebts, extraordinaryDebts, activeRate, condoFee, ownerData]);

    const totalToPayWithSelectedRate = useMemo(() => {
        if (!selectedRate || selectedRate <= 0) return paymentCalculator.totalToPay;
        
        const dueMonthsTotalUSD = pendingDebts
            .filter(debt => selectedPendingDebts.includes(debt.id))
            .reduce((sum, debt) => sum + (debt.amountUSD || 0), 0);
        const extraordinaryTotalUSD = extraordinaryDebts
            .filter(debt => selectedExtraordinaryDebts.includes(debt.id))
            .reduce((sum, debt) => sum + (debt.amountUSD || 0), 0);
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalUSD = dueMonthsTotalUSD + extraordinaryTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalUSD * selectedRate;
        return Math.max(0, totalDebtBs - (ownerData?.balance || 0));
    }, [selectedRate, pendingDebts, selectedPendingDebts, extraordinaryDebts, selectedExtraordinaryDebts, selectedAdvanceMonths, condoFee, ownerData]);

    const handleRegisterPayment = async () => {
        if (!workingCondoId || !user || !ownerData) return;
        if (!selectedRate) {
            toast({ variant: 'destructive', title: 'Error', description: 'No hay tasa disponible para la fecha seleccionada.' });
            return;
        }
        setProcessingPayment(true);
        try {
            // Crear el pago
            const paymentData = {
                reportedBy: user.uid,
                condoId: workingCondoId,
                beneficiaries: [{ 
                    ownerId: user.uid, 
                    ownerName: ownerData.name, 
                    amount: totalToPayWithSelectedRate 
                }],
                beneficiaryIds: [user.uid],
                totalAmount: totalToPayWithSelectedRate,
                exchangeRate: selectedRate,
                paymentDate: Timestamp.fromDate(paymentDate),
                reportedAt: Timestamp.now(),
                paymentMethod: paymentDetails.paymentMethod,
                bank: paymentDetails.bank === 'otro' ? paymentDetails.otherBank : paymentDetails.bank,
                reference: paymentDetails.reference,
                status: 'pendiente',
                paymentCategory: 'ordinaria',
                observations: `Pago vía calculadora: ${paymentCalculator.dueMonthsCount} deuda(s), ${paymentCalculator.extraordinaryCount} extraordinaria(s), ${paymentCalculator.advanceMonthsCount} adelanto(s).`
            };

            const paymentRef = await addDoc(collection(db, 'condominios', workingCondoId, 'payments'), paymentData);
            
            // Marcar deudas extraordinarias como pagadas
            for (const debtId of selectedExtraordinaryDebts) {
                const debt = extraordinaryDebts.find(d => d.id === debtId);
                if (debt) {
                    await updateDoc(doc(db, 'condominios', workingCondoId, 'owner_extraordinary_debts', debtId), {
                        status: 'paid',
                        paidAt: Timestamp.fromDate(paymentDate),
                        paymentId: paymentRef.id
                    });
                }
            }
            
            toast({ title: 'Pago Reportado', description: 'Enviado para verificación exitosamente.' });
            setIsPaymentDialogOpen(false);
            setSelectedPendingDebts([]);
            setSelectedExtraordinaryDebts([]);
            setSelectedAdvanceMonths([]);
            router.push(`/${workingCondoId}/owner/payments`);
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error al reportar el pago' });
        } finally {
            setProcessingPayment(false);
        }
    };

    if (authLoading || loadingDebts) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Calculando Deudas...</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            {/* HEADER */}
            <div className="mb-10">
                <div className="flex items-center justify-between">
                    <Button 
                        variant="outline" 
                        onClick={() => router.push(`/${workingCondoId}/owner/dashboard`)}
                        className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Dashboard
                    </Button>
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            Calculadora de <span className="text-primary">Pagos</span>
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                        <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                            Selecciona las deudas y meses adelantados que deseas pagar.
                        </p>
                    </div>
                    <div className="w-[100px]" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* DEUDAS ORDINARIAS PENDIENTES */}
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden">
                        <CardHeader className="bg-white/5 p-6 border-b border-white/5">
                            <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter">1. Deudas Pendientes (Cuotas Ordinarias)</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-slate-800/30">
                                    <TableRow className="border-white/5">
                                        <TableHead className="w-[50px] text-center text-[10px] font-black uppercase text-slate-400">Pagar</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Período</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Concepto</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Estado</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase text-slate-400 pr-8">Monto (Bs.)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingDebts.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center text-slate-500 font-bold italic uppercase text-[10px]">
                                                Sin deudas pendientes
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pendingDebts.map((debt) => {
                                            const debtMonthDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                            const isOverdue = isBefore(debtMonthDate, startOfMonth(new Date()));
                                            const status = debt.status === 'vencida' || (debt.status === 'pending' && isOverdue) ? 'Vencida' : 'Pendiente';
                                            return (
                                                <TableRow key={debt.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                                    <TableCell className="text-center">
                                                        <Checkbox 
                                                            className="border-primary data-[state=checked]:bg-primary"
                                                            onCheckedChange={() => setSelectedPendingDebts(p => p.includes(debt.id) ? p.filter(id => id !== debt.id) : [...p, debt.id])} 
                                                            checked={selectedPendingDebts.includes(debt.id)} 
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-black text-white text-xs uppercase italic">{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                    <TableCell className="text-[10px] font-bold text-slate-500 uppercase">{debt.description}</TableCell>
                                                    <TableCell>
                                                        <Badge className={status === 'Vencida' ? 'bg-red-500/20 text-red-500 border-none' : 'bg-yellow-500/20 text-yellow-500 border-none'}>
                                                            {status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-black text-white italic pr-8">Bs. {formatCurrency(debt.amountUSD * activeRate)}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* DEUDAS EXTRAORDINARIAS */}
                    {extraordinaryDebts.length > 0 && (
                        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-primary/20">
                            <CardHeader className="bg-primary/10 p-6 border-b border-primary/20">
                                <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                                    <DollarSign className="h-5 w-5 text-primary" /> 2. Cuotas Extraordinarias Pendientes
                                </CardTitle>
                                <CardDescription className="text-white/40 font-bold text-[10px] uppercase">
                                    Estas cuotas son independientes y no afectan su saldo ordinario
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader className="bg-slate-800/30">
                                        <TableRow className="border-white/5">
                                            <TableHead className="w-[50px] text-center text-[10px] font-black uppercase text-slate-400">Pagar</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase text-slate-400">Descripción</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase text-slate-400">Propiedad</TableHead>
                                            <TableHead className="text-right text-[10px] font-black uppercase text-slate-400 pr-8">Monto (USD)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {extraordinaryDebts.map((debt) => (
                                            <TableRow key={debt.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                                <TableCell className="text-center">
                                                    <Checkbox 
                                                        className="border-primary data-[state=checked]:bg-primary"
                                                        onCheckedChange={() => setSelectedExtraordinaryDebts(p => p.includes(debt.id) ? p.filter(id => id !== debt.id) : [...p, debt.id])} 
                                                        checked={selectedExtraordinaryDebts.includes(debt.id)} 
                                                    />
                                                </TableCell>
                                                <TableCell className="font-black text-white text-xs uppercase italic">{debt.description}</TableCell>
                                                <TableCell className="text-[10px] text-white/60">{debt.property}</TableCell>
                                                <TableCell className="text-right font-black text-primary italic pr-8">${formatUSD(debt.amountUSD)} USD</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    {/* MESES ADELANTADOS */}
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden">
                        <CardHeader className="bg-white/5 p-6 border-b border-white/5">
                            <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter">3. Pagar Meses por Adelantado</CardTitle>
                            <CardDescription className="text-white/40 font-bold text-[10px] uppercase">
                                Cuota actual: <span className="text-primary">${condoFee.toFixed(2)}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {futureMonths.map(month => (
                                    <Button 
                                        key={month.value} 
                                        type="button" 
                                        variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'} 
                                        className={cn(
                                            "h-14 rounded-2xl font-black uppercase text-[10px] tracking-tighter transition-all",
                                            selectedAdvanceMonths.includes(month.value) 
                                                ? "bg-primary text-slate-900 hover:bg-primary/90" 
                                                : "border-white/10 text-white hover:bg-white/5"
                                        )}
                                        onClick={() => setSelectedAdvanceMonths(p => p.includes(month.value) ? p.filter(m => m !== month.value) : [...p, month.value])} 
                                        disabled={month.disabled}
                                    >
                                        {selectedAdvanceMonths.includes(month.value) && <Check className="h-3 w-3 mr-1" />} 
                                        {month.label}
                                    </Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* RESUMEN */}
                <div className="lg:sticky lg:top-24">
                    <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[3rem] border border-white/5">
                        <CardHeader className="bg-primary text-slate-900 p-6 text-center">
                            <CardTitle className="text-2xl font-black uppercase italic tracking-tighter flex items-center justify-center gap-3">
                                <Calculator className="h-6 w-6" /> Liquidación
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase text-slate-500">TASA BCV</span>
                                <Badge variant="outline" className="font-black text-primary border-primary/20 bg-slate-800">Bs. {formatCurrency(activeRate)}</Badge>
                            </div>
                            <hr className="bg-white/5" />
                            <div className="space-y-3">
                                {paymentCalculator.dueMonthsCount > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Deudas Ordinarias</span>
                                        <span className="font-black text-white italic">{paymentCalculator.dueMonthsCount} mes(es)</span>
                                    </div>
                                )}
                                {paymentCalculator.extraordinaryCount > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Cuotas Extraordinarias</span>
                                        <span className="font-black text-primary italic">{paymentCalculator.extraordinaryCount} cuota(s)</span>
                                    </div>
                                )}
                                {paymentCalculator.advanceMonthsCount > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Meses Adelantados</span>
                                        <span className="font-black text-white italic">{paymentCalculator.advanceMonthsCount} mes(es)</span>
                                    </div>
                                )}
                            </div>
                            <hr className="bg-white/5" />
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase text-slate-400">Sub-Total Deuda</span>
                                <span className="font-black text-white italic">Bs. {formatCurrency(paymentCalculator.totalDebtBs)}</span>
                            </div>
                            <div className="flex justify-between items-center text-emerald-500">
                                <span className="text-[10px] font-black uppercase">(-) Saldo a Favor</span>
                                <span className="font-black italic">Bs. {formatCurrency(paymentCalculator.balanceInFavor)}</span>
                            </div>
                            <div className="flex flex-col gap-1 text-center bg-white/5 p-6 rounded-[2rem] border border-white/5 shadow-inner">
                                <span className="text-[10px] font-black uppercase text-primary tracking-widest">TOTAL A PAGAR</span>
                                <span className="text-4xl font-black text-white italic drop-shadow-2xl">Bs. {formatCurrency(paymentCalculator.totalToPay)}</span>
                                <span className="text-[10px] font-bold text-emerald-500 uppercase mt-1">
                                    EQUIV: ${formatUSD(paymentCalculator.totalToPay / (activeRate || 1))}
                                </span>
                            </div>
                        </CardContent>
                        <CardFooter className="px-6 pb-6">
                            <Button 
                                onClick={() => setIsPaymentDialogOpen(true)} 
                                disabled={!paymentCalculator.hasSelection || paymentCalculator.totalToPay <= 0} 
                                className="w-full h-14 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95"
                            >
                                <Receipt className="mr-2 h-5 w-5" /> PROCEDER AL REPORTE
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>

            {/* DIÁLOGO DE PAGO */}
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Reportar <span className="text-primary">Pago</span></DialogTitle>
                        <DialogDescription className="text-slate-400 font-bold text-sm uppercase">
                            Complete los detalles de su transacción por Bs. {formatCurrency(paymentCalculator.totalToPay)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Fecha del Pago</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-14 rounded-2xl bg-slate-800 border-none text-white uppercase italic text-xs hover:bg-slate-800", !paymentDate && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-3 h-5 w-5 text-primary" />
                                            {paymentDate ? format(paymentDate, "PPP", { locale: es }) : "Seleccione una fecha"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10">
                                        <Calendar mode="single" selected={paymentDate} onSelect={(date: Date | undefined) => date && setPaymentDate(date)} initialFocus locale={es} disabled={(date: Date) => date > new Date()} />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Tasa BCV</Label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                                    <Input 
                                        type="text" 
                                        value={selectedRate ? formatCurrency(selectedRate) : rateLoading ? 'Buscando...' : 'Seleccione fecha'} 
                                        readOnly 
                                        className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic text-right pr-6"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Método de Pago</Label>
                                <Select value={paymentDetails.paymentMethod} onValueChange={v => setPaymentDetails(p => ({...p, paymentMethod: v}))}>
                                    <SelectTrigger className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black uppercase text-xs">
                                        <FileText className="mr-3 h-5 w-5 text-primary" />
                                        <SelectValue placeholder="Seleccione un método..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="transferencia" className="font-black uppercase text-[10px] italic">Transferencia</SelectItem>
                                        <SelectItem value="movil" className="font-black uppercase text-[10px] italic">Pago Móvil</SelectItem>
                                        <SelectItem value="efectivo_bs" className="font-black uppercase text-[10px] italic">Efectivo Bs.</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Banco Emisor</Label>
                                <Select value={paymentDetails.bank} onValueChange={v => setPaymentDetails(p => ({...p, bank: v}))}>
                                    <SelectTrigger className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black uppercase text-xs">
                                        <Banknote className="mr-3 h-5 w-5 text-primary" />
                                        <SelectValue placeholder="Seleccione un banco..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        {venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value} className="font-black uppercase text-[10px] italic">{b.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            {paymentDetails.bank === 'otro' && (
                                <div className="space-y-2 md:col-span-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Nombre del Otro Banco</Label>
                                    <div className="relative">
                                        <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                                        <Input 
                                            value={paymentDetails.otherBank} 
                                            onChange={e => setPaymentDetails(p => ({...p, otherBank: e.target.value}))}
                                            className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 md:col-span-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Referencia</Label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                                    <Input 
                                        value={paymentDetails.reference} 
                                        onChange={e => setPaymentDetails(p => ({...p, reference: e.target.value}))}
                                        className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic text-center text-xl tracking-widest"
                                        placeholder="Número de referencia"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="gap-3 mt-4">
                        <Button variant="ghost" onClick={() => setIsPaymentDialogOpen(false)} className="rounded-xl font-black uppercase text-[10px] h-12 text-slate-400">
                            Cancelar
                        </Button>
                        <Button onClick={handleRegisterPayment} disabled={processingPayment || !selectedRate} className="bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 rounded-xl italic">
                            {processingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                            Confirmar y Reportar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

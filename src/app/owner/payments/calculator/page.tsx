
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Info, Calculator, Minus, Equal, Check, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { isBefore, startOfMonth, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
};

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
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
    
    const { toast } = useToast();

    useEffect(() => {
        if (authLoading || !user || !ownerData) return;

        const settingsRef = doc(db, 'config', 'mainSettings');
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
        
        const debtsQuery = query(collection(db, "debts"), where("ownerId", "==", user.uid), where("status", "in", ["pending", "vencida"]));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData: Debt[] = [];
            snapshot.forEach(d => debtsData.push({ id: d.id, ...d.data() } as Debt));
            setOwnerDebts(debtsData.sort((a, b) => b.year - a.year || b.month - b.month));
            setLoadingDebts(false);
        });

        return () => {
            settingsUnsubscribe();
            debtsUnsubscribe();
        };

    }, [user, ownerData, authLoading]);

    const handleDebtSelection = (debtId: string) => {
        setSelectedDebts(prev => prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]);
    };

    const paymentCalculator = useMemo(() => {
        if (!ownerData) return { totalToPay: 0, hasSelection: false };
        
        const totalSelectedDebtUSD = ownerDebts
            .filter(debt => selectedDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
        
        const totalSelectedDebtBs = totalSelectedDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalSelectedDebtBs - (ownerData.balance || 0));

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: ownerData.balance || 0,
            totalToPay,
            hasSelection: selectedDebts.length > 0,
        };
    }, [selectedDebts, ownerDebts, activeRate, ownerData]);

    const formatToTwoDecimals = (num: number) => {
        if (typeof num !== 'number' || isNaN(num)) return '0,00';
        return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Deudas Pendientes</CardTitle>
                        </CardHeader>
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
                                    {ownerDebts.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center"><Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />No tiene deudas pendientes.</TableCell></TableRow>
                                    ) : (
                                        ownerDebts.map((debt) => {
                                            const debtMonthDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                            const isOverdue = isBefore(debtMonthDate, startOfMonth(new Date()));
                                            const status = debt.status === 'vencida' || (debt.status === 'pending' && isOverdue) ? 'Vencida' : 'Pendiente';

                                            return (
                                            <TableRow key={debt.id} data-state={selectedDebts.includes(debt.id) ? 'selected' : ''}>
                                                <TableCell className="text-center"><Checkbox onCheckedChange={() => handleDebtSelection(debt.id)} checked={selectedDebts.includes(debt.id)} /></TableCell>
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
                </div>
                
                <div className="lg:sticky lg:top-20">
                     {paymentCalculator.hasSelection && (
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center"><Calculator className="mr-2 h-5 w-5"/> Resumen de Pago</CardTitle>
                                <CardDescription>Cálculo basado en su selección.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Total Seleccionado:</span>
                                    <span className="font-medium">Bs. {formatToTwoDecimals(paymentCalculator.totalSelectedBs)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                    <span className="font-medium text-green-500">Bs. {formatToTwoDecimals(paymentCalculator.balanceInFavor)}</span>
                                </div>
                                <hr className="my-2"/>
                                <div className="flex justify-between items-center text-lg">
                                    <span className="font-bold flex items-center"><Equal className="mr-2 h-4 w-4"/> TOTAL SUGERIDO A PAGAR:</span>
                                    <span className="font-bold text-primary">Bs. {formatToTwoDecimals(paymentCalculator.totalToPay)}</span>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full" onClick={() => router.push('/owner/payments')}>
                                    <Receipt className="mr-2 h-4 w-4" />
                                    Ir a Reportar Pago
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

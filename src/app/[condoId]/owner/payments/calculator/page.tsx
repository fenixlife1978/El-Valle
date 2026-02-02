
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

const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'otro', label: 'Otro' },
];

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

export default function OwnerPaymentCalculatorPage({ params }: { params: { condoId: string } }) {
    const workingCondoId = params.condoId;
    const { user, ownerData, loading: authLoading } = useAuth();
    
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

    const formatToTwoDecimals = (num: number) => 
        num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

            <Card className="border-none shadow-xl rounded-[2rem] bg-card/50 backdrop-blur-md p-8 border border-white/5">
                <div className="text-center py-10">
                    <Calculator className="h-12 w-12 text-amber-500 mx-auto mb-4 opacity-50" />
                    <h3 className="font-black uppercase italic tracking-tight text-xl">Interfaz de Calculadora Activa</h3>
                    <p className="text-muted-foreground text-sm mt-2">Selecciona tus meses pendientes para generar el reporte de pago en Bolívares.</p>
                </div>
            </Card>
        </div>
    );
}

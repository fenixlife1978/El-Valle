
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Megaphone, Loader2, Wallet, FileText, CalendarClock, Scale, Calculator, Minus, Equal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCommunityUpdates } from '@/ai/flows/community-updates';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDoc, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type Payment = {
    id: string;
    date: string;
    amount: number;
    bank: string;
    type: string;
    ref: string;
    status: 'aprobado' | 'pendiente' | 'rechazado';
};

type UserData = {
    id: string;
    unit: string;
    name: string;
    balance: number;
};

type Debt = {
    id: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
};

type SolvencyStatus = 'solvente' | 'moroso' | 'saldo a favor' | 'cargando...';

const statusVariantMap: { [key in SolvencyStatus]: 'success' | 'destructive' | 'default' | 'outline' } = {
  'solvente': 'success',
  'moroso': 'destructive',
  'saldo a favor': 'default',
  'cargando...': 'outline',
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
];

export default function OwnerDashboardPage() {
    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [dashboardStats, setDashboardStats] = useState({
        balanceInFavor: 0,
        totalDebt: 0,
        condoFeeBs: 0,
        exchangeRate: 0,
        dueDate: '',
        isOverdue: false,
    });
    const [solvencyStatus, setSolvencyStatus] = useState<SolvencyStatus>('cargando...');
    const [communityUpdates, setCommunityUpdates] = useState<string[]>([]);
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
    
    const userId = "088a5367-a75b-4355-b0b0-3162b2b64b1f"; 

    useEffect(() => {
        if (!userId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                let condoFeeUSD = 25;
                let activeRate = 36.5;
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    condoFeeUSD = settings.condoFee || 0;
                    const rate = settings.exchangeRates?.find((r: any) => r.active);
                    if (rate) activeRate = rate.rate;
                }

                const now = new Date();
                const dueDate = new Date(now.getFullYear(), now.getMonth(), 5);
                const isOverdue = now.getDate() > 5;
                
                const userDocRef = doc(db, "owners", userId);
                const userSnap = await getDoc(userDocRef);
                 if (userSnap.exists()) {
                    const ownerData = { id: userSnap.id, ...userSnap.data() } as UserData;
                    setUserData(ownerData);
                    
                    const debtsQuery = query(collection(db, "debts"), where("ownerId", "==", userId), where("status", "==", "pending"));
                    const debtsSnapshot = await getDocs(debtsQuery);
                    
                    const debtsData: Debt[] = [];
                    let totalDebtUSD = 0;
                    debtsSnapshot.forEach((doc) => {
                        const debt = { id: doc.id, ...doc.data() } as Debt
                        debtsData.push(debt);
                        totalDebtUSD += debt.amountUSD;
                    });
                    
                    setDebts(debtsData.sort((a,b) => b.year - a.year || b.month - a.month));
                    const totalDebtBs = totalDebtUSD * activeRate;

                    if (totalDebtBs > 0) {
                        setSolvencyStatus('moroso');
                    } else if (ownerData.balance > 0) {
                        setSolvencyStatus('saldo a favor');
                    } else {
                        setSolvencyStatus('solvente');
                    }

                    setDashboardStats({
                        balanceInFavor: (ownerData.balance || 0) > 0 ? (ownerData.balance * activeRate) : 0,
                        totalDebt: totalDebtBs,
                        condoFeeBs: condoFeeUSD * activeRate,
                        exchangeRate: activeRate,
                        dueDate: format(dueDate, "dd 'de' MMMM", { locale: es }),
                        isOverdue: isOverdue,
                    });
                } else {
                    console.log("No such user document!");
                }
            } catch (error) {
                console.error("Error fetching dashboard data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        const paymentsQuery = query(
            collection(db, "payments"),
            where("reportedBy", "==", userId),
            orderBy("reportedAt", "desc"),
            limit(5)
        );
        const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
            const paymentsData: Payment[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                paymentsData.push({
                    id: doc.id,
                    date: new Date(data.paymentDate.seconds * 1000).toISOString(),
                    amount: data.totalAmount,
                    bank: data.bank,
                    type: data.paymentMethod,
                    ref: data.reference,
                    status: data.status,
                });
            });
            setPayments(paymentsData);
        });
        
        return () => {
            paymentsUnsubscribe();
        };

    }, [userId]);
    
    const handleDebtSelection = (debtId: string) => {
        setSelectedDebts(prev => 
            prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]
        );
    };

    const paymentCalculator = useMemo(() => {
        const totalSelectedDebtUSD = debts
            .filter(debt => selectedDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
            
        const totalSelectedDebtBs = totalSelectedDebtUSD * dashboardStats.exchangeRate;
        const totalToPay = Math.max(0, totalSelectedDebtBs - dashboardStats.balanceInFavor);

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: dashboardStats.balanceInFavor,
            totalToPay: totalToPay,
            hasSelection: selectedDebts.length > 0,
        };
    }, [selectedDebts, debts, dashboardStats]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Propietario</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estado de Cuenta</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : 
            <Badge variant={statusVariantMap[solvencyStatus]} className="text-lg capitalize">
              {solvencyStatus}
            </Badge>
            }
            <p className="text-xs text-muted-foreground mt-2">Su situación financiera actual.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo a Favor</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">Bs. {dashboardStats.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>}
            <p className="text-xs text-muted-foreground">Balance positivo en tu cuenta.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deuda Total Pendiente</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">Bs. {dashboardStats.totalDebt.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>}
             <p className="text-xs text-muted-foreground">Suma de todas las cuotas pendientes.</p>
          </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cuota del Mes</CardTitle>
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : (
                    <div>
                        <div className="text-2xl font-bold">Bs. {dashboardStats.condoFeeBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                        <p className="text-xs text-muted-foreground">
                            Tasa de cambio: Bs. {dashboardStats.exchangeRate.toLocaleString('es-VE', {minimumFractionDigits: 2})}
                        </p>
                        <div className={`mt-2 text-sm font-semibold ${dashboardStats.isOverdue ? 'text-destructive' : 'text-green-600'}`}>
                            {dashboardStats.isOverdue ? `Vencida. (Venció el ${dashboardStats.dueDate})` : `Vence el ${dashboardStats.dueDate}`}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
      </div>

       <div className="grid gap-8 lg:grid-cols-1">
          <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Desglose de Deudas Pendientes</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[50px] text-center">Pagar</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : debts.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">¡Felicidades! No tienes deudas pendientes.</TableCell></TableRow>
                    ) : (
                    debts.map((debt) => (
                    <TableRow key={debt.id} data-state={selectedDebts.includes(debt.id) ? 'selected' : ''}>
                        <TableCell className="text-center">
                            <Checkbox 
                                onCheckedChange={() => handleDebtSelection(debt.id)}
                                checked={selectedDebts.includes(debt.id)}
                                aria-label={`Seleccionar deuda de ${months.find(m => m.value === debt.month)?.label} ${debt.year}`}
                            />
                        </TableCell>
                        <TableCell className="font-medium">{months.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
                        <TableCell>{debt.description}</TableCell>
                        <TableCell className="text-right">Bs. {(debt.amountUSD * dashboardStats.exchangeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                    </TableRow>
                    )))}
                </TableBody>
                </Table>
                 {paymentCalculator.hasSelection && (
                    <CardFooter className="p-4 bg-muted/50 border-t">
                        <div className="w-full max-w-md ml-auto space-y-2">
                             <h3 className="text-lg font-semibold flex items-center"><Calculator className="mr-2 h-5 w-5"/> Calculadora de Pago</h3>
                             <div className="flex justify-between items-center">
                                 <span className="text-muted-foreground">Total Seleccionado:</span>
                                 <span className="font-medium">Bs. {paymentCalculator.totalSelectedBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                             </div>
                             <div className="flex justify-between items-center text-sm">
                                 <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                 <span className="font-medium">Bs. {paymentCalculator.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                             </div>
                             <hr className="my-1"/>
                             <div className="flex justify-between items-center text-lg">
                                 <span className="font-bold flex items-center"><Equal className="mr-2 h-4 w-4"/> TOTAL A PAGAR:</span>
                                 <span className="font-bold text-primary">Bs. {paymentCalculator.totalToPay.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                             </div>
                        </div>
                    </CardFooter>
                )}
            </Card>
           
        </div>

        <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Mis Últimos Pagos</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : payments.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No tienes pagos registrados.</TableCell></TableRow>
                    ) : (
                    payments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                        <TableCell>Bs. {payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                        <TableCell>{payment.bank}</TableCell>
                        <TableCell>{payment.ref}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === 'aprobado' ? 'success' : payment.status === 'rechazado' ? 'destructive' : 'warning'}>
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Badge>
                        </TableCell>
                         <TableCell className="text-right">
                            <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4"/>
                                <span className="sr-only">Ver Comprobante</span>
                            </Button>
                        </TableCell>
                    </TableRow>
                    )))}
                </TableBody>
                </Table>
            </Card>
        </div>
      </div>
    </div>
  );
}

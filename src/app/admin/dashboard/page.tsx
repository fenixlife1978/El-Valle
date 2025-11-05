
'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2, Users, Receipt, TrendingUp, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, Timestamp, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type Payment = {
    id: string;
    beneficiaries: { ownerName: string }[];
    totalAmount: number;
    paymentDate: Timestamp;
    reference: string;
};


export default function AdminDashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    const [recentPayments, setRecentPayments] = useState<Payment[]>([]);

    useEffect(() => {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthTimestamp = Timestamp.fromDate(startOfMonth);

        const fetchSettings = async () => {
             const settingsRef = doc(db, 'config', 'mainSettings');
             const settingsSnap = await getDoc(settingsRef);
             if (settingsSnap.exists()) {
                 const settings = settingsSnap.data();
                 const rates = (settings.exchangeRates || []);
                 const activeRateObj = rates.find((r: any) => r.active);
                 if (activeRateObj) {
                     setActiveRate(activeRateObj.rate);
                 } else if (rates.length > 0) {
                     const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                     setActiveRate(sortedRates[0].rate);
                 }
             }
        };
        fetchSettings();

        const paymentsQuery = query(
            collection(db, 'payments'),
            where('status', '==', 'aprobado'),
            where('paymentDate', '>=', startOfMonthTimestamp)
        );

        const pendingPaymentsQuery = query(collection(db, 'payments'), where('status', '==', 'pendiente'));
        const ownersQuery = query(collection(db, 'owners'));

        const recentPaymentsQuery = query(
            collection(db, 'payments'), 
            where('status', '==', 'aprobado')
        );

        const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
            let totalBs = 0;
            let totalUsd = 0;
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const amountBs = data.totalAmount || 0;
                totalBs += amountBs;

                // Handle USD conversion based on type
                if (data.paymentMethod === 'adelanto') {
                    totalUsd += amountBs; // For 'adelanto', totalAmount is in USD
                } else {
                    const rate = data.exchangeRate || activeRate || 1; // Fallback to active rate or 1
                     if (rate > 0) {
                        totalUsd += amountBs / rate;
                    }
                }
            });

            setStats(prev => ({ ...prev, monthlyIncome: totalBs, monthlyIncomeUSD: totalUsd }));
        });

        const unsubPending = onSnapshot(pendingPaymentsQuery, (snapshot) => {
            setStats(prev => ({ ...prev, pendingPayments: snapshot.size }));
        });

        const unsubOwners = onSnapshot(ownersQuery, (snapshot) => {
            setStats(prev => ({ ...prev, totalOwners: snapshot.size - 1 })); // Exclude admin
        });

        const unsubRecent = onSnapshot(recentPaymentsQuery, (snapshot) => {
            const allApprovedPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
            const sortedPayments = allApprovedPayments.sort((a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis());
            setRecentPayments(sortedPayments.slice(0, 5));
        });

        setLoading(false);
        
        return () => {
            unsubPayments();
            unsubPending();
            unsubOwners();
            unsubRecent();
        }

    }, [activeRate]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Administrador</h1>
      
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pagos Recibidos este Mes</CardTitle>
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                        <>
                            <div className="text-2xl font-bold">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                            <p className="text-sm text-muted-foreground">~ ${formatToTwoDecimals(stats.monthlyIncomeUSD)}</p>
                        </>
                    }
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pagos Pendientes</CardTitle>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                     {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                        <div className="text-2xl font-bold">{stats.pendingPayments}</div>
                     }
                    <p className="text-xs text-muted-foreground">Pagos reportados esperando verificación.</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Unidades Totales</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                        <div className="text-2xl font-bold">{stats.totalOwners}</div>
                    }
                    <p className="text-xs text-muted-foreground">Número de propietarios registrados.</p>
                </CardContent>
            </Card>
        </div>

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="text-green-500" />
                    Últimos Pagos Aprobados
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Propietario</TableHead>
                            <TableHead>Monto (Bs.)</TableHead>
                            <TableHead>Fecha de Pago</TableHead>
                            <TableHead>Referencia</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                        ) : recentPayments.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No hay pagos aprobados recientemente.</TableCell></TableRow>
                        ) : (
                            recentPayments.map(payment => (
                                <TableRow key={payment.id}>
                                    <TableCell className="font-medium">{payment.beneficiaries[0]?.ownerName || 'N/A'}</TableCell>
                                    <TableCell>Bs. {formatToTwoDecimals(payment.totalAmount)}</TableCell>
                                    <TableCell>{format(payment.paymentDate.toDate(), 'dd MMMM, yyyy', { locale: es })}</TableCell>
                                    <TableCell>{payment.reference}</TableCell>
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


'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2, Users, Receipt, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export default function AdminDashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        pendingPayments: 0,
        totalOwners: 0
    });

    useEffect(() => {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthTimestamp = Timestamp.fromDate(startOfMonth);

        const paymentsQuery = query(
            collection(db, 'payments'),
            where('status', '==', 'aprobado'),
            where('paymentDate', '>=', startOfMonthTimestamp)
        );

        const pendingPaymentsQuery = query(collection(db, 'payments'), where('status', '==', 'pendiente'));
        const ownersQuery = query(collection(db, 'owners'));

        const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
            const total = snapshot.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
            setStats(prev => ({ ...prev, monthlyIncome: total }));
        });

        const unsubPending = onSnapshot(pendingPaymentsQuery, (snapshot) => {
            setStats(prev => ({ ...prev, pendingPayments: snapshot.size }));
        });

        const unsubOwners = onSnapshot(ownersQuery, (snapshot) => {
            setStats(prev => ({ ...prev, totalOwners: snapshot.size -1 })); // Exclude admin
        });

        setLoading(false);
        
        return () => {
            unsubPayments();
            unsubPending();
            unsubOwners();
        }

    }, []);

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
                            <p className="text-xs text-muted-foreground">Total de pagos aprobados en el mes actual.</p>
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
    </div>
  );
}

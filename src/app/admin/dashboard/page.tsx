
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collection, onSnapshot, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Payment = {
  id: string;
  user: string;
  unit: string;
  amount: number;
  date: string;
  bank: string;
  type: string;
  status: 'aprobado' | 'pendiente' | 'rechazado';
};

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    paymentsThisMonthBs: 0,
    paymentsThisMonthUsd: 0,
    pendingPayments: 0,
    totalUnits: 0,
  });
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);

  useEffect(() => {
    // Fetch stats
    const ownersQuery = query(collection(db, "owners"));
    const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
      setStats(prev => ({ ...prev, totalUnits: snapshot.size }));
    });

    const paymentsQuery = query(collection(db, "payments"));
    const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
        let monthTotalBs = 0;
        let monthTotalUsd = 0;
        let pendingCount = 0;
        const now = new Date();
        snapshot.forEach(doc => {
            const payment = doc.data();
            const paymentDate = new Date(payment.paymentDate.seconds * 1000);
            
            // Exclude advance payments from monthly totals
            if (payment.status === 'aprobado' && payment.paymentMethod !== 'adelanto' && paymentDate.getMonth() === now.getMonth() && paymentDate.getFullYear() === now.getFullYear()) {
                const amountBs = Number(payment.totalAmount);
                monthTotalBs += amountBs;
                if (payment.exchangeRate && payment.exchangeRate > 0) {
                    monthTotalUsd += amountBs / payment.exchangeRate;
                }
            }
            if (payment.status === 'pendiente') {
                pendingCount++;
            }
        });
        setStats(prev => ({ ...prev, paymentsThisMonthBs: monthTotalBs, paymentsThisMonthUsd: monthTotalUsd, pendingPayments: pendingCount }));
    });

    // Fetch recent payments
    const recentPaymentsQuery = query(collection(db, "payments"), orderBy('reportedAt', 'desc'), limit(5));
    const recentPaymentsUnsubscribe = onSnapshot(recentPaymentsQuery, (snapshot) => {
      const paymentsData: Payment[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        paymentsData.push({ 
            id: doc.id,
            user: "Usuario", // This should be fetched/joined from owners collection
            unit: data.beneficiaries[0]?.house || 'N/A', // Simplified for now
            amount: data.totalAmount,
            date: new Date(data.paymentDate.seconds * 1000).toISOString(),
            bank: data.bank,
            type: data.paymentMethod,
            status: data.status,
        });
      });
      setRecentPayments(paymentsData);
      setLoading(false);
    });

    return () => {
      ownersUnsubscribe();
      paymentsUnsubscribe();
      recentPaymentsUnsubscribe();
    }
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Administrador</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Recibidos este Mes</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
              <div>
                <div className="text-2xl font-bold">Bs. {stats.paymentsThisMonthBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                <p className="text-xs text-muted-foreground">~ ${stats.paymentsThisMonthUsd.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Pendientes</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{stats.pendingPayments}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unidades Totales</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{stats.totalUnits}</div>}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4 font-headline">Últimos Pagos Registrados</h2>
        <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Tipo de Pago</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : recentPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No hay pagos registrados recientemente.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.user}</TableCell>
                    <TableCell>{payment.unit}</TableCell>
                    <TableCell>Bs. {payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                    <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                    <TableCell>{payment.bank}</TableCell>
                    <TableCell>{payment.type}</TableCell>
                    <TableCell>
                      <Badge variant={payment.status === 'aprobado' ? 'success' : payment.status === 'rechazado' ? 'destructive' : 'warning'}>
                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex gap-2">
                        <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4"/>
                            <span className="sr-only">Ver</span>
                        </Button>
                        <Button variant="ghost" size="icon">
                            <Printer className="h-4 w-4"/>
                            <span className="sr-only">Imprimir</span>
                        </Button>
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
        </Card>
      </div>
    </div>
  );
}

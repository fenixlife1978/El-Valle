
'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Loader2, AlertCircle, CheckCircle, Receipt } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfMonth } from "date-fns";
import { es } from 'date-fns/locale';
import Link from "next/link";

type Debt = {
    id: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
};

type Payment = {
    id: string;
    status: 'pendiente' | 'aprobado' | 'rechazado';
    totalAmount: number;
    paymentDate: Timestamp;
    reference: string;
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export default function OwnerDashboardPage() {
    const { user, ownerData, loading } = useAuth();
    const [debts, setDebts] = useState<Debt[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [activeRate, setActiveRate] = useState(0);

    useEffect(() => {
        if (loading || !user) return;
        
        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) setActiveRate(activeRateObj.rate);
            }
        });
        
        const debtsQuery = query(collection(db, "debts"), where("ownerId", "==", user.uid));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData: Debt[] = [];
            snapshot.forEach(doc => debtsData.push({ id: doc.id, ...doc.data() } as Debt));
            setDebts(debtsData);
            setLoadingData(false);
        });

        const paymentsQuery = query(collection(db, "payments"), where("reportedBy", "==", user.uid), where("status", "in", ["pendiente", "rechazado"]));
        const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
            const paymentsData: Payment[] = [];
            snapshot.forEach(doc => paymentsData.push({ id: doc.id, ...doc.data() } as Payment));
            setPayments(paymentsData);
        });

        return () => {
            settingsUnsubscribe();
            debtsUnsubscribe();
            paymentsUnsubscribe();
        };

    }, [user, loading]);
    
    const pendingDebts = useMemo(() => {
        return debts
            .filter(d => d.status === 'pending' || d.status === 'vencida')
            .sort((a,b) => a.year - b.year || a.month - b.month)
            .slice(0, 5);
    }, [debts]);

    const totalDebtUSD = useMemo(() => {
        return debts
            .filter(d => d.status === 'pending' || d.status === 'vencida')
            .reduce((sum, d) => sum + d.amountUSD, 0);
    }, [debts]);

    const balanceInFavor = ownerData?.balance || 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Bienvenido, {ownerData?.name || 'Propietario'}</h1>
                <p className="text-muted-foreground">Aquí tienes un resumen de tu estado de cuenta y accesos rápidos.</p>
            </div>
          
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Deuda Total Pendiente</CardTitle>
                        <CardDescription>Monto total de tus cuotas y cargos por pagar.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingData ? <Loader2 className="h-8 w-8 animate-spin"/> :
                            <>
                                <p className="text-3xl font-bold text-destructive">${totalDebtUSD.toFixed(2)}</p>
                                <p className="text-sm text-muted-foreground">Bs. {formatToTwoDecimals(totalDebtUSD * activeRate)}</p>
                            </>
                        }
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Saldo a Favor</CardTitle>
                        <CardDescription>Monto disponible para ser usado en futuros pagos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {loadingData ? <Loader2 className="h-8 w-8 animate-spin"/> :
                            <p className="text-3xl font-bold text-green-500">Bs. {formatToTwoDecimals(balanceInFavor)}</p>
                         }
                    </CardContent>
                </Card>
                <Card className="bg-primary text-primary-foreground">
                    <CardHeader>
                        <CardTitle>Reportar un Pago</CardTitle>
                        <CardDescription className="text-primary-foreground/80">¿Realizaste un pago? Notifícalo aquí para que sea procesado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/owner/payments">
                            <Button variant="secondary" className="w-full">
                                Reportar Pago <ArrowRight className="ml-2 h-4 w-4"/>
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
            
             <div className="grid gap-6 md:grid-cols-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Deudas Pendientes Recientes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Período</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Monto (USD)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingData ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin"/></TableCell></TableRow>
                                ) : pendingDebts.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">¡Felicidades! No tienes deudas pendientes.</TableCell></TableRow>
                                ) : (
                                    pendingDebts.map(debt => {
                                        const debtDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                        const isOverdue = isBefore(debtDate, startOfMonth(new Date()));
                                        return (
                                        <TableRow key={debt.id}>
                                            <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                            <TableCell>{debt.description}</TableCell>
                                            <TableCell>
                                                 <Badge variant={isOverdue ? 'destructive' : 'warning'}>
                                                    {isOverdue ? 'Vencida' : 'Pendiente'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">${debt.amountUSD.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )})
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                 {payments.length > 0 && (
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><AlertCircle className="text-destructive"/> Pagos con Observaciones</CardTitle>
                            <CardDescription>Tus reportes de pago más recientes que requieren atención o están pendientes por aprobar.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha del Reporte</TableHead>
                                        <TableHead>Referencia</TableHead>
                                        <TableHead>Monto (Bs.)</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {payments.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell>{format(p.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>{p.reference}</TableCell>
                                            <TableCell>{formatToTwoDecimals(p.totalAmount)}</TableCell>
                                            <TableCell>
                                                <Badge variant={p.status === 'rechazado' ? 'destructive' : 'warning'} className="capitalize">{p.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                 )}
            </div>
        </div>
    );
}

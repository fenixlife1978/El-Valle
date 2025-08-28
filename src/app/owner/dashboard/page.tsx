
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Megaphone, Loader2, Wallet, FileText, CalendarClock } from "lucide-react";
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
    amount: number;
    status: 'pending' | 'paid';
}

export default function OwnerDashboardPage() {
    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [dashboardStats, setDashboardStats] = useState({
        balanceInFavor: 0,
        totalDebt: 0,
        condoFeeBs: 0,
        exchangeRate: 0,
        dueDate: '',
        isOverdue: false,
    });
    const [communityUpdates, setCommunityUpdates] = useState<string[]>([]);
    
    // This is a placeholder for getting the current user's ID
    // In a real app, you'd get this from the auth state
    const userId = "088a5367-a75b-4355-b0b0-3162b2b64b1f"; // Hardcoded for demo until auth is real

    useEffect(() => {
        if (!userId) return;

        // Fetch User Data, Debts, and Settings
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch settings first to get fee and rate
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                let condoFeeUSD = 25; // default
                let activeRate = 36.5; // default
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    condoFeeUSD = settings.condoFee || 0;
                    const rate = settings.exchangeRates?.find((r: any) => r.active);
                    if (rate) {
                        activeRate = rate.rate;
                    }
                }

                // Calculate due date info
                const now = new Date();
                const dueDate = new Date(now.getFullYear(), now.getMonth(), 5);
                const isOverdue = now.getDate() > 5;
                
                // Fetch User Data
                const userDocRef = doc(db, "owners", userId);
                const userSnap = await getDoc(userDocRef);
                 if (userSnap.exists()) {
                    const ownerData = { id: userSnap.id, ...userSnap.data() } as UserData;
                    setUserData(ownerData);
                    
                    // Fetch Debts
                    const debtsQuery = query(collection(db, "debts"), where("ownerId", "==", userId), where("status", "==", "pending"));
                    const debtsSnapshot = await getDocs(debtsQuery);
                    const totalDebt = debtsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

                    setDashboardStats({
                        balanceInFavor: ownerData.balance || 0,
                        totalDebt: totalDebt,
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

        // Fetch User Payments (last 5)
        const paymentsQuery = query(
            collection(db, "payments"),
            where("reportedBy", "==", userId), // Assuming the user reports their own payments
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
        
        // AI Community Updates
        const fetchAndUpdate = async () => {
             const userProfile = "Role: Owner, Unit: A-101, Name: Juan Perez"; // Replace with real data
             const paymentHistory = "October: Paid, September: Paid, August: Paid"; // Replace with real data
             const allUpdates = [
                "Recordatorio: La cuota de mantenimiento de Noviembre vence el 15.",
                "El área de la piscina estará cerrada por mantenimiento el 10 de Noviembre.",
                "Asamblea general de propietarios el 20 de Noviembre.",
                "Nuevas normas de uso para el salón de fiestas.",
                "Fumigación general programada para el 5 de Noviembre."
            ].join('\n');

            const { updates } = await getCommunityUpdates({
                userProfile,
                paymentHistory,
                allUpdates,
            });
            setCommunityUpdates(updates);
        }
        fetchAndUpdate();

        return () => {
            paymentsUnsubscribe();
        };

    }, [userId]);
    
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Propietario</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo a Favor</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">Bs. {dashboardStats.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deuda Total Pendiente</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">Bs. {dashboardStats.totalDebt.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>}
          </CardContent>
        </Card>
        <Card className="md:col-span-2 lg:col-span-1">
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

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Mis Últimos Pagos</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : payments.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No tienes pagos registrados.</TableCell></TableRow>
                    ) : (
                    payments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                        <TableCell>Bs. {payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                        <TableCell>{payment.bank}</TableCell>
                        <TableCell>{payment.type}</TableCell>
                        <TableCell>{payment.ref}</TableCell>
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
                    )))}
                </TableBody>
                </Table>
            </Card>
        </div>
        <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Comunicados Importantes</h2>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Megaphone className="h-6 w-6 text-primary" />
                        <span>Actualizaciones para ti</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                     {loading || communityUpdates.length === 0 ? (
                        <div className="text-center text-muted-foreground py-4">
                            {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto"/> : "No hay comunicados importantes para ti."}
                        </div>
                     ) : (
                        <ul className="space-y-4">
                            {communityUpdates.map((update, index) => (
                                <li key={index} className="flex items-start gap-3">
                                    <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                                    <span>{update}</span>
                                </li>
                            ))}
                        </ul>
                     )}
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}


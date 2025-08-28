
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Megaphone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCommunityUpdates } from '@/ai/flows/community-updates';
import { auth, db } from '@/lib/firebase'; // Assuming auth is exported for user info
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';

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
    unit: string;
    name: string;
    // Add other fields as needed
};

export default function OwnerDashboardPage() {
    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [dashboardStats, setDashboardStats] = useState({ lastPayment: 0, nextPaymentDate: "N/A" });
    const [communityUpdates, setCommunityUpdates] = useState<string[]>([]);

    useEffect(() => {
        // This is a placeholder for getting the current user's ID
        // In a real app, you'd get this from the auth state
        const userId = "mock-user-id-for-now"; // Replace with real auth.currentUser.uid

        // Fetch User Data
        const userDocRef = doc(db, "owners", userId); // Assuming user's doc ID is their auth UID
        const userUnsubscribe = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
                setUserData(doc.data() as UserData);
            } else {
                console.log("No such user document!");
            }
        });

        // Fetch User Payments
        const paymentsQuery = query(
            collection(db, "payments"),
            where("userId", "==", userId), // This requires a userId field in payment docs
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
            if (paymentsData.length > 0) {
                 setDashboardStats(prev => ({...prev, lastPayment: paymentsData[0].amount}));
            }
            setLoading(false);
        });
        
        // AI Community Updates (remains the same but could be triggered after user data is loaded)
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
            userUnsubscribe();
            paymentsUnsubscribe();
        };

    }, []);
    
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Propietario</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Último Pago</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">Bs. {dashboardStats.lastPayment.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximo Pago</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">{dashboardStats.nextPaymentDate}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mi Unidad</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <div className="text-2xl font-bold">{userData?.unit || "Cargando..."}</div>}
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


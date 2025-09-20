
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collection, onSnapshot, query, where, limit, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
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

type Owner = {
    id: string;
    name: string;
    properties?: { street: string, house: string }[];
};

const formatToTwoDecimals = (num: number) => {
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const [ownersMap, setOwnersMap] = useState<Map<string, Owner>>(new Map());

  useEffect(() => {
    setLoading(true);

    const ownersQuery = query(collection(db, "owners"));
    const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
        const newOwnersMap = new Map<string, Owner>();
        let totalUnits = 0;
        snapshot.forEach(doc => {
            const ownerData = doc.data() as Omit<Owner, 'id'>;
            newOwnersMap.set(doc.id, { id: doc.id, ...ownerData });
            if (ownerData.properties && ownerData.properties.length > 0) {
                totalUnits += ownerData.properties.length;
            }
        });
        setOwnersMap(newOwnersMap);
        setStats(prev => ({ ...prev, totalUnits }));

        // === Start listening to payments ONLY after owners are loaded ===
        if (newOwnersMap.size > 0) {
            const paymentsQuery = query(collection(db, "payments"));
            const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
                let monthTotalBs = 0;
                let monthTotalUsd = 0;
                let pendingCount = 0;
                const now = new Date();
                snapshot.forEach(doc => {
                    const payment = doc.data();
                    const paymentDate = new Date(payment.paymentDate.seconds * 1000);
                    
                    const isIncomePayment = !['adelanto', 'conciliacion', 'pago-historico'].includes(payment.paymentMethod);

                    if (payment.status === 'aprobado' && isIncomePayment && paymentDate.getMonth() === now.getMonth() && paymentDate.getFullYear() === now.getFullYear()) {
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

            const recentPaymentsQuery = query(collection(db, "payments"), orderBy('reportedAt', 'desc'), limit(5));
            const recentPaymentsUnsubscribe = onSnapshot(recentPaymentsQuery, (snapshot) => {
                const paymentsData = snapshot.docs.map((paymentDoc) => {
                    const data = paymentDoc.data();
                    const firstBeneficiary = data.beneficiaries?.[0];
                    
                    let userName = 'Beneficiario no identificado';
                    let unit = 'Propiedad no especificada';

                    if (firstBeneficiary?.ownerId) {
                        const owner = newOwnersMap.get(firstBeneficiary.ownerId);
                        if(owner) {
                            userName = owner.name;
                            // Determine the unit string
                            if (data.beneficiaries?.length > 1) {
                                unit = "Múltiples Propiedades";
                            } else if (firstBeneficiary.street && firstBeneficiary.house) {
                                unit = `${firstBeneficiary.street} - ${firstBeneficiary.house}`;
                            } else if (owner.properties && owner.properties.length > 0) {
                                // Fallback to the first property of the owner from the map
                                unit = `${owner.properties[0].street} - ${owner.properties[0].house}`;
                            }
                        }
                    } else if (firstBeneficiary?.ownerName) {
                        userName = firstBeneficiary.ownerName;
                    }

                    return { 
                        id: paymentDoc.id,
                        user: userName,
                        unit: unit,
                        amount: data.totalAmount,
                        date: new Date(data.paymentDate.seconds * 1000).toISOString(),
                        bank: data.bank,
                        type: data.paymentMethod,
                        status: data.status,
                    };
                });
                setRecentPayments(paymentsData);
                setLoading(false);
            });

            // Return cleanup function for payment listeners
            return () => {
                paymentsUnsubscribe();
                recentPaymentsUnsubscribe();
            };
        } else {
             setLoading(false); // No owners found, stop loading
        }
    });

    // Return cleanup function for the main owner listener
    return () => {
        ownersUnsubscribe();
    };
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
                <div className="text-2xl font-bold">Bs. {formatToTwoDecimals(stats.paymentsThisMonthBs)}</div>
                <p className="text-xs text-muted-foreground">~ ${formatToTwoDecimals(stats.paymentsThisMonthUsd)}</p>
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
                    <TableCell>
                        {payment.type === 'adelanto' 
                            ? `$ ${formatToTwoDecimals(payment.amount)}`
                            : `Bs. ${formatToTwoDecimals(payment.amount)}`
                        }
                    </TableCell>
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

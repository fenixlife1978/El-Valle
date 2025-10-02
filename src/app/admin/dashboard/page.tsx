
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collection, onSnapshot, query, where, limit, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

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

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    property: { street: string, house: string };
};

const formatToTwoDecimals = (num: number) => {
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Custom Label for Bar Charts
const CustomBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (value === 0) return null;
    const formattedValue = `$${Math.round(value)}`;
    return (
        <text x={x + width / 2} y={y} fill="#fff" textAnchor="middle" dy={-6} fontSize="12" fontWeight="bold" angle={-90}>
            {formattedValue}
        </text>
    );
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
  const [debtsByStreetChartData, setDebtsByStreetChartData] = useState<any[]>([]);
  const [incomeByStreetChartData, setIncomeByStreetChartData] = useState<any[]>([]);
  const [allDebts, setAllDebts] = useState<Debt[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [activeRate, setActiveRate] = useState(0);

  useEffect(() => {
    const fetchSettings = async () => {
         try {
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
        } catch (error) {
            console.error("Error fetching settings:", error);
        }
    };
    fetchSettings();

    const debtsUnsubscribe = onSnapshot(query(collection(db, "debts")), (snapshot) => {
        const debtsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));
        setAllDebts(debtsData);
    });

    const allPaymentsUnsubscribe = onSnapshot(query(collection(db, "payments")), (snapshot) => {
        const paymentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllPayments(paymentsData);
    });

    return () => {
        debtsUnsubscribe();
        allPaymentsUnsubscribe();
    }
  }, []);

  useEffect(() => {
     const filteredDebts = allDebts.filter(debt => {
        if (debt.status !== 'pending') return false;
        const street = debt.property?.street;
        if (!street || !street.startsWith('Calle')) return false;
        const streetNumber = parseInt(street.replace('Calle ', ''));
        if (streetNumber > 8) return false;
        return true;
    });

    const debtsByStreet = filteredDebts.reduce((acc, debt) => {
        const street = debt.property.street;
        if (!acc[street]) acc[street] = 0;
        acc[street] += debt.amountUSD;
        return acc;
    }, {} as { [key: string]: number });
    
    setDebtsByStreetChartData(Object.entries(debtsByStreet).map(([name, TotalDeuda]) => ({ name, TotalDeuda: parseFloat(TotalDeuda.toFixed(2)) }))
        .sort((a, b) => {
            const streetNumA = parseInt(a.name.replace('Calle ', ''));
            const streetNumB = parseInt(b.name.replace('Calle ', ''));
            return streetNumA - streetNumB;
        }));

  }, [allDebts]);
  
  useEffect(() => {
     const filteredPayments = allPayments.filter(payment => {
        if (payment.status !== 'aprobado') return false;
        return true;
    });
    
    const incomeByStreet = filteredPayments.reduce((acc, payment) => {
        payment.beneficiaries.forEach((beneficiary: any) => {
            if (beneficiary.street && beneficiary.street.startsWith('Calle')) {
                const streetNumber = parseInt(beneficiary.street.replace('Calle ', ''));
                if (streetNumber > 8) return;

                if (!acc[beneficiary.street]) acc[beneficiary.street] = 0;
                const incomeUSD = beneficiary.amount / (payment.exchangeRate || activeRate || 1);
                acc[beneficiary.street] += incomeUSD;
            }
        });
        return acc;
    }, {} as { [key: string]: number });

    setIncomeByStreetChartData(Object.entries(incomeByStreet).map(([name, TotalIngresos]) => ({ name, TotalIngresos: parseFloat(TotalIngresos.toFixed(2)) }))
        .sort((a, b) => {
            const streetNumA = parseInt(a.name.replace('Calle ', ''));
            const streetNumB = parseInt(b.name.replace('Calle ', ''));
            return streetNumA - streetNumB;
        }));
  }, [allPayments, activeRate]);

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
                            if (data.beneficiaries?.length > 1) {
                                unit = "Múltiples Propiedades";
                            } else if (firstBeneficiary.street && firstBeneficiary.house) {
                                unit = `${firstBeneficiary.street} - ${firstBeneficiary.house}`;
                            } else if (owner.properties && owner.properties.length > 0) {
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
                        reference: data.reference,
                        status: data.status,
                    };
                });
                setRecentPayments(paymentsData);
                setLoading(false);
            });

            return () => {
                paymentsUnsubscribe();
                recentPaymentsUnsubscribe();
            };
        } else {
             setLoading(false);
        }
    });

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

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="p-4 bg-gray-800 text-white rounded-lg">
                <h3 className="font-semibold text-center mb-4">Gráfico de Deuda por Calle (USD)</h3>
                {debtsByStreetChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={debtsByStreetChartData} margin={{ top: 30, right: 20, left: -10, bottom: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={50} interval={0} />
                        <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{fill: 'rgba(255, 255, 255, 0.1)'}} contentStyle={{backgroundColor: '#334155', border: 'none', borderRadius: '0.5rem'}} />
                        <Bar dataKey="TotalDeuda" fill="#dc2626" name="Deuda Total (USD)" radius={[4, 4, 0, 0]}>
                            <LabelList dataKey="TotalDeuda" content={<CustomBarLabel />} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                ) : (
                    <p className="text-center text-gray-400 py-8">No hay datos de deuda para mostrar.</p>
                )}
            </div>
            <div className="p-4 bg-gray-800 text-white rounded-lg">
                <h3 className="font-semibold text-center mb-4">Gráfico de Ingresos por Calle (USD)</h3>
                {incomeByStreetChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={incomeByStreetChartData} margin={{ top: 30, right: 20, left: -10, bottom: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={50} interval={0} />
                        <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{fill: 'rgba(255, 255, 255, 0.1)'}} contentStyle={{backgroundColor: '#334155', border: 'none', borderRadius: '0.5rem'}} />
                        <Bar dataKey="TotalIngresos" fill="#2563eb" name="Ingreso Total (USD)" radius={[4, 4, 0, 0]}>
                            <LabelList dataKey="TotalIngresos" content={<CustomBarLabel />} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                ) : (
                    <p className="text-center text-gray-400 py-8">No hay datos de ingresos para mostrar.</p>
                )}
            </div>
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
                  <TableHead>Referencia</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : recentPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
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
                    <TableCell>{payment.reference}</TableCell>
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

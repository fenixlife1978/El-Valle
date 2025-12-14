

'use client';

// NOTA: Si el error persiste, la causa es una exportación incorrecta (export vs export default) 
// en uno de estos archivos de componentes de UI. Hemos verificado Card y Badge, el problema 
// probablemente está en Table, Progress, o Button.

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2, Users, Receipt, TrendingUp, CheckCircle, ThumbsUp, ThumbsDown, Smile, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, Timestamp, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Importación de la instancia de Firebase
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

/**
 * Función auxiliar para formatear números a dos decimales y usar separador de miles.
 * @param num - Número a formatear.
 * @returns Cadena de texto formateada (ej: "1.234,56").
 */
const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    // Se utiliza Math.trunc para evitar problemas de coma flotante en la multiplicación/división.
    const truncated = Math.trunc(num * 100) / 100;
    // Formato ES-VE para usar coma como separador decimal.
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Definiciones de tipos para los datos de Firebase
type Payment = {
    id: string;
    beneficiaries: { ownerName: string }[];
    totalAmount: number; // Monto en moneda local (Bs) o USD, dependiendo del método
    paymentDate: Timestamp;
    reference: string;
    // Otros campos necesarios para la lógica (ej: exchangeRate, paymentMethod)
    exchangeRate?: number;
    paymentMethod?: string;
};

type Feedback = {
    id: string;
    response: 'liked' | 'disliked';
};


export default function AdminDashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeRate, setActiveRate] = useState(0); // Tasa de cambio actual para conversión
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
    const [feedbackData, setFeedbackData] = useState<Feedback[]>([]);

    useEffect(() => {
        // Inicializa la fecha de inicio del mes para consultas
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthTimestamp = Timestamp.fromDate(startOfMonth);

        /**
         * Fetches the active exchange rate from Firebase configuration.
         */
        const fetchSettings = async () => {
             const settingsRef = doc(db, 'config', 'mainSettings');
             try {
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    const rates = (settings.exchangeRates || []);
                    const activeRateObj = rates.find((r: any) => r.active);
                    
                    if (activeRateObj) {
                        setActiveRate(activeRateObj.rate);
                    } else if (rates.length > 0) {
                        // Si no hay activa, usa la más reciente
                        const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        setActiveRate(sortedRates[0].rate);
                    }
                }
             } catch (error) {
                 console.error("Error fetching settings:", error);
                 // Opcional: manejar el estado de error de manera visible
             }
        };
        fetchSettings();

        // -------------------------------------------------------------------------
        // 1. Consultas a Firebase
        // -------------------------------------------------------------------------

        // Pagos aprobados este mes
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('status', '==', 'aprobado'),
            where('paymentDate', '>=', startOfMonthTimestamp)
        );

        // Pagos pendientes
        const pendingPaymentsQuery = query(collection(db, 'payments'), where('status', '==', 'pendiente'));
        
        // Conteo total de propietarios (unidades)
        const ownersQuery = query(collection(db, 'owners'));

        // Últimos pagos aprobados (para la tabla)
        const recentPaymentsQuery = query(
            collection(db, 'payments'), 
            where('status', '==', 'aprobado'),
            orderBy('paymentDate', 'desc'), // Ordenar por fecha descendente
            limit(5) // Limitar a 5 resultados
        );

        // Feedback de la aplicación
        const feedbackQuery = query(collection(db, 'app_feedback'));

        // -------------------------------------------------------------------------
        // 2. Suscripciones (onSnapshot)
        // -------------------------------------------------------------------------

        const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
            let totalBs = 0;
            let totalUsd = 0;
            snapshot.docs.forEach(doc => {
                const data = doc.data() as Payment;
                const amountBs = data.totalAmount || 0;
                totalBs += amountBs;

                // Lógica de conversión a USD
                if (data.paymentMethod === 'adelanto') {
                    totalUsd += amountBs; // Si es adelanto, el totalAmount ya es USD
                } else {
                    // Usa la tasa específica del pago si existe, si no usa la activa, si no, usa 1
                    const rate = data.exchangeRate || activeRate || 1; 
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
            // Se asume que uno de los documentos es el administrador y se excluye
            setStats(prev => ({ ...prev, totalOwners: snapshot.size > 0 ? snapshot.size - 1 : 0 })); 
        });

        const unsubRecent = onSnapshot(recentPaymentsQuery, (snapshot) => {
            const approvedPayments = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            })) as Payment[];
            // Ya que la consulta usa orderBy, no necesitamos ordenar aquí, solo tomar los 5.
            setRecentPayments(approvedPayments);
        });
        
        const unsubFeedback = onSnapshot(feedbackQuery, (snapshot) => {
            const feedbackList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Feedback));
            setFeedbackData(feedbackList);
        });

        setLoading(false);
        
        // -------------------------------------------------------------------------
        // 3. Cleanup (Desuscripción)
        // -------------------------------------------------------------------------
        
        return () => {
            unsubPayments();
            unsubPending();
            unsubOwners();
            unsubRecent();
            unsubFeedback();
        }

    }, [activeRate]); // Vuelve a ejecutar si la tasa de cambio cambia
    
    // Cálculo de estadísticas de feedback
    const likes = feedbackData.filter(f => f.response === 'liked').length;
    const dislikes = feedbackData.filter(f => f.response === 'disliked').length;
    const totalFeedback = likes + dislikes;
    const satisfactionRate = totalFeedback > 0 ? (likes / totalFeedback) * 100 : 0;

    // -------------------------------------------------------------------------
    // 4. Renderizado (JSX)
    // -------------------------------------------------------------------------

    return (
        <div className="space-y-8">
            
            <h1 className="text-3xl font-bold font-headline">Panel de Administrador</h1>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                 {/* Tarjeta de Pagos Recibidos */}
                <Card className="bg-primary text-primary-foreground">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pagos Recibidos este Mes</CardTitle>
                        <Receipt className="h-4 w-4 text-primary-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                            <>
                                <div className="text-2xl font-bold">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                                <p className="text-sm text-primary-foreground/80">~ ${formatToTwoDecimals(stats.monthlyIncomeUSD)}</p>
                            </>
                        }
                    </CardContent>
                </Card>
                
                {/* Tarjeta de Pagos Pendientes */}
                <Card className="bg-yellow-400 text-black">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pagos Pendientes</CardTitle>
                        <AlertCircle className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                         {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                             <div className="text-2xl font-bold">{stats.pendingPayments}</div>
                         }
                        <p className="text-xs text-black/80">Pagos reportados esperando verificación.</p>
                    </CardContent>
                </Card>
                
                {/* Tarjeta de Unidades Totales */}
                <Card className="bg-green-500 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Unidades Totales</CardTitle>
                        <Users className="h-4 w-4 text-white" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                            <div className="text-2xl font-bold">{stats.totalOwners}</div>
                        }
                        <p className="text-xs text-white/80">Número de propietarios registrados.</p>
                    </CardContent>
                </Card>
                
                {/* Tarjeta de Satisfacción */}
                 <Card className="bg-muted/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Recepción de la Aplicación</CardTitle>
                        <Smile className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                            <>
                                <div className="text-2xl font-bold">{satisfactionRate.toFixed(0)}% <span className="text-base font-normal text-muted-foreground">de satisfacción</span></div>
                                <p className="text-xs text-muted-foreground">
                                    <span className="text-green-500 font-semibold">{likes} les gusta</span> vs <span className="text-red-500 font-semibold">{dislikes} no les gusta</span> de {totalFeedback} respuestas.
                                </p>
                                <Progress value={satisfactionRate} className="mt-2 h-2" />
                            </>
                        }
                    </CardContent>
                </Card>
            </div>

            {/* Tabla de Últimos Pagos */}
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

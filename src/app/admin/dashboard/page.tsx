
'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Eye, Loader2, Users, Receipt, CheckCircle, Smile } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, Timestamp, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import CarteleraDigital from "@/components/CarteleraDigital";

type Anuncio = {
  id: string;
  urlImagen: string;
  titulo: string;
  descripcion?: string;
};

/**
 * Función auxiliar para formatear números a dos decimales y usar separador de miles.
 */
const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Definiciones de tipos
type Payment = {
    id: string;
    beneficiaries?: { ownerName: string }[];
    totalAmount: number;
    paymentDate: Timestamp;
    reference: string;
    exchangeRate?: number;
    paymentMethod?: string;
    status: string;
};

type Feedback = {
    id: string;
    response: 'liked' | 'disliked';
};

export default function AdminDashboardPage() {
    const [loading, setLoading] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
    const [feedbackData, setFeedbackData] = useState<Feedback[]>([]);
    const [anuncios, setAnuncios] = useState<Anuncio[]>([]);

    useEffect(() => {
        // Suscripción a anuncios
        const anunciosQuery = query(collection(db, "billboard_announcements"), orderBy("createdAt", "desc"));
        const unsubAnuncios = onSnapshot(anunciosQuery, (snapshot) => {
          setAnuncios(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Anuncio)));
        });

        // Inicializa la fecha de inicio del mes
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthTimestamp = Timestamp.fromDate(startOfMonth);

        // 1. Obtener Tasa de Cambio
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
                        const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        setActiveRate(sortedRates[0].rate);
                    }
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            }
        };
        fetchSettings();

        // 2. Suscripciones en tiempo real
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('status', '==', 'aprobado'),
            where('paymentDate', '>=', startOfMonthTimestamp)
        );

        const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
            let totalBs = 0;
            let totalUsd = 0;
            snapshot.docs.forEach(doc => {
                const data = doc.data() as Payment;
                const amountBs = data.totalAmount || 0;
                totalBs += amountBs;

                if (data.paymentMethod === 'adelanto') {
                    totalUsd += amountBs;
                } else {
                    const rate = data.exchangeRate || activeRate || 1; 
                    if (rate > 0) totalUsd += amountBs / rate;
                }
            });
            setStats(prev => ({ ...prev, monthlyIncome: totalBs, monthlyIncomeUSD: totalUsd }));
            setLoading(false); // Desactivar carga cuando lleguen los primeros datos críticos
        });

        const unsubPending = onSnapshot(query(collection(db, 'payments'), where('status', '==', 'pendiente')), (snapshot) => {
            setStats(prev => ({ ...prev, pendingPayments: snapshot.size }));
        });

        const unsubOwners = onSnapshot(collection(db, 'owners'), (snapshot) => {
            setStats(prev => ({ ...prev, totalOwners: snapshot.size > 0 ? snapshot.size - 1 : 0 })); 
        });

        const unsubRecent = onSnapshot(query(
            collection(db, 'payments'), 
            where('status', '==', 'aprobado'),
            orderBy('paymentDate', 'desc'),
            limit(5)
        ), (snapshot) => {
            const approvedPayments = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            })) as Payment[];
            setRecentPayments(approvedPayments);
        });
        
        const unsubFeedback = onSnapshot(collection(db, 'app_feedback'), (snapshot) => {
            const feedbackList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Feedback));
            setFeedbackData(feedbackList);
        });

        return () => {
            unsubAnuncios();
            unsubPayments();
            unsubPending();
            unsubOwners();
            unsubRecent();
            unsubFeedback();
        }
    }, [activeRate]);

    const likes = feedbackData.filter(f => f.response === 'liked').length;
    const dislikes = feedbackData.filter(f => f.response === 'disliked').length;
    const totalFeedback = likes + dislikes;
    const satisfactionRate = totalFeedback > 0 ? (likes / totalFeedback) * 100 : 0;

    return (
        <div className="space-y-8 p-4 md:p-8">
            <h1 className="text-3xl font-bold tracking-tight">Panel de Administrador</h1>
            
            <CarteleraDigital anuncios={anuncios} />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-primary text-primary-foreground">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pagos Recibidos (Mes)</CardTitle>
                        <Receipt className="h-4 w-4 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                            <>
                                <div className="text-2xl font-bold">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                                <p className="text-xs opacity-80">aprox. ${formatToTwoDecimals(stats.monthlyIncomeUSD)}</p>
                            </>
                        }
                    </CardContent>
                </Card>
                
                <Card className="bg-yellow-500 text-yellow-950">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pagos Pendientes</CardTitle>
                        <AlertCircle className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                            <div className="text-2xl font-bold">{stats.pendingPayments}</div>
                        }
                        <p className="text-xs opacity-80">Por verificar</p>
                    </CardContent>
                </Card>
                
                <Card className="bg-green-600 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Unidades Registradas</CardTitle>
                        <Users className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                            <div className="text-2xl font-bold">{stats.totalOwners}</div>
                        }
                        <p className="text-xs opacity-80">Propietarios activos</p>
                    </CardContent>
                </Card>
                
                <Card className="border-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Satisfacción App</CardTitle>
                        <Smile className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> :
                            <>
                                <div className="text-2xl font-bold">{satisfactionRate.toFixed(0)}%</div>
                                <Progress value={satisfactionRate} className="mt-2 h-2" />
                                <p className="text-[10px] mt-2 text-muted-foreground">
                                    {likes} 👍 / {dislikes} 👎 ({totalFeedback} votos)
                                </p>
                            </>
                        }
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <CheckCircle className="text-green-500 w-5 h-5" />
                        Últimos Pagos Aprobados
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Propietario</TableHead>
                                    <TableHead>Monto (Bs.)</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Referencia</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                                ) : recentPayments.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No hay pagos recientes.</TableCell></TableRow>
                                ) : (
                                    recentPayments.map(payment => (
                                        <TableRow key={payment.id}>
                                            <TableCell className="font-medium">
                                                {payment.beneficiaries?.[0]?.ownerName || 'Sin nombre'}
                                            </TableCell>
                                            <TableCell>Bs. {formatToTwoDecimals(payment.totalAmount)}</TableCell>
                                            <TableCell>
                                                {payment.paymentDate ? format(payment.paymentDate.toDate(), 'dd/MM/yyyy', { locale: es }) : '---'}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{payment.reference}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

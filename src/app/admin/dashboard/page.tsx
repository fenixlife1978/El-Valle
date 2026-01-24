'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Loader2, Users, Receipt, CheckCircle, Smile } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, Timestamp, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import CarteleraDigital from "@/components/CarteleraDigital";
import { useAuth } from "@/hooks/use-auth"; // IMPORTANTE: Para saber qué condominio filtrar

type Anuncio = {
    id: string;
    urlImagen: string;
    titulo: string;
    descripcion?: string;
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type Payment = {
    id: string;
    beneficiaries?: { ownerName: string }[];
    totalAmount: number;
    paymentDate: Timestamp;
    reference: string;
    exchangeRate?: number;
    paymentMethod?: string;
    status: string;
    condominioId: string;
};

type Feedback = {
    id: string;
    response: 'liked' | 'disliked';
    condominioId: string;
};

export default function AdminDashboardPage() {
    const { ownerData } = useAuth(); // Obtenemos el ID del condominio del admin
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
        if (!ownerData?.condominioId) return;

        const condoId = ownerData.condominioId;

        // 1. Suscripción a anuncios (Filtrado por Condominio)
        const anunciosQuery = query(
            collection(db, "billboard_announcements"), 
            where("condominioId", "==", condoId),
            orderBy("createdAt", "desc")
        );
        const unsubAnuncios = onSnapshot(anunciosQuery, (snapshot) => {
            setAnuncios(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Anuncio)));
        });

        // 2. Obtener Tasa de Cambio (Desde la nueva ubicación migrada)
        const fetchSettings = async () => {
            const settingsRef = doc(db, 'condominios', condoId, 'config', 'settings');
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

        // 3. Cálculos del Mes (Filtrado por Condominio)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthTimestamp = Timestamp.fromDate(startOfMonth);

        const paymentsQuery = query(
            collection(db, 'payments'),
            where('condominioId', '==', condoId),
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
                const rate = data.exchangeRate || activeRate || 1; 
                if (rate > 0) totalUsd += amountBs / rate;
            });
            setStats(prev => ({ ...prev, monthlyIncome: totalBs, monthlyIncomeUSD: totalUsd }));
            setLoading(false);
        });

        // 4. Pagos Pendientes (Filtrado por Condominio)
        const unsubPending = onSnapshot(query(
            collection(db, 'payments'), 
            where('condominioId', '==', condoId),
            where('status', '==', 'pendiente')
        ), (snapshot) => {
            setStats(prev => ({ ...prev, pendingPayments: snapshot.size }));
        });

        // 5. Unidades / Propietarios (Filtrado por Condominio)
        const unsubOwners = onSnapshot(query(
            collection(db, 'owners'),
            where('condominioId', '==', condoId)
        ), (snapshot) => {
            setStats(prev => ({ ...prev, totalOwners: snapshot.size })); 
        });

        // 6. Últimos Pagos (Filtrado por Condominio)
        const unsubRecent = onSnapshot(query(
            collection(db, 'payments'), 
            where('condominioId', '==', condoId),
            where('status', '==', 'aprobado'),
            orderBy('paymentDate', 'desc'),
            limit(5)
        ), (snapshot) => {
            const approvedPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Payment[];
            setRecentPayments(approvedPayments);
        });
        
        // 7. Feedback (Filtrado por Condominio si aplica)
        const unsubFeedback = onSnapshot(query(
            collection(db, 'app_feedback'),
            where('condominioId', '==', condoId)
        ), (snapshot) => {
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
    }, [ownerData, activeRate]);

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
                        <CardTitle className="text-sm font-medium">Cobrado este Mes</CardTitle>
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
                
                <Card className="bg-orange-500 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Por Validar</CardTitle>
                        <AlertCircle className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.pendingPayments}</div>
                        <p className="text-xs opacity-80">Pagos pendientes</p>
                    </CardContent>
                </Card>
                
                <Card className="bg-slate-900 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Censo Propietarios</CardTitle>
                        <Users className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalOwners}</div>
                        <p className="text-xs opacity-80">Unidades en este condominio</p>
                    </CardContent>
                </Card>
                
                <Card className="border-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Satisfacción</CardTitle>
                        <Smile className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{satisfactionRate.toFixed(0)}%</div>
                        <Progress value={satisfactionRate} className="mt-2 h-2" />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <CheckCircle className="text-primary w-5 h-5" />
                        Cobranza Reciente
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
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No hay pagos registrados aún.</TableCell></TableRow>
                                ) : (
                                    recentPayments.map(payment => (
                                        <TableRow key={payment.id}>
                                            <TableCell className="font-medium">
                                                {payment.beneficiaries?.[0]?.ownerName || 'Residente'}
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

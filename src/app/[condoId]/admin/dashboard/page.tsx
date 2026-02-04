'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Receipt, Building2, Users, TrendingUp } from "lucide-react"; 
import { useEffect, useState } from "react";
import { collection, query, onSnapshot, doc, orderBy, limit, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, startOfMonth, isAfter } from "date-fns";
import { es } from "date-fns/locale"; 
import CarteleraDigital from "@/components/CarteleraDigital";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, useParams } from "next/navigation";
import AdminCharts from '@/components/AdminCharts';


const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AdminDashboardPage() {
    const { user, role, loading: authLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const workingCondoId = params.condoId as string;

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    
    const [allPayments, setAllPayments] = useState<any[]>([]); // Para los gráficos
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [anuncios, setAnuncios] = useState<any[]>([]);
    const [condoName, setCondoName] = useState("");
    const [currentRate, setCurrentRate] = useState(1);

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.replace('/login?role=admin');
                return;
            }
            const isSuperAdmin = user.email === 'vallecondo@gmail.com';
            const isAdmin = role === 'administrador' || role === 'admin';
            if (!isSuperAdmin && !isAdmin) {
                router.replace('/welcome');
            }
        }
    }, [user, role, authLoading, router]);

    useEffect(() => {
        if (!workingCondoId || authLoading) return;

        setLoading(true);

        // 1. Configuración y Tasa de Cambio
        const unsubSettings = onSnapshot(doc(db, 'condominios', workingCondoId, 'config', 'mainSettings'), (settingsSnap) => {
            let rate = 1;
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCondoName(settings.companyInfo?.name || settings.name || workingCondoId);
                const rates = settings.exchangeRates || [];
                const active = rates.find((r: any) => r.active === true || r.status === 'active');
                rate = active?.rate || active?.value || 1;
                setCurrentRate(rate);
            }

            const inicioDeMes = startOfMonth(new Date());

            // 2. Suscripción a Pagos (Calculamos estadísticas y preparamos datos para gráficos)
            const unsubPayments = onSnapshot(collection(db, 'condominios', workingCondoId, 'payments'), (paymentSnap) => {
                let incomeBs = 0;
                let incomeUsd = 0;
                let pendingCount = 0;
                const paymentsList: any[] = [];

                paymentSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    const fechaPago = data.paymentDate?.toDate?.() || (data.paymentDate ? new Date(data.paymentDate) : null);
                    
                    const paymentObj = { id: docSnap.id, ...data };
                    paymentsList.push(paymentObj);

                    if (data.status === 'pendiente') {
                        pendingCount++;
                    } else if (data.status === 'aprobado') {
                        // Solo sumamos al ingreso del mes si la fecha es de este mes
                        if (fechaPago && isAfter(fechaPago, inicioDeMes)) {
                            const amount = data.totalAmount || 0;
                            incomeBs += amount;
                            incomeUsd += amount / (data.exchangeRate || rate);
                        }
                    }
                });
                
                setAllPayments(paymentsList); // Todos los pagos para los gráficos (históricos + calles)
                
                setStats(prev => ({ 
                    ...prev, 
                    monthlyIncome: incomeBs, 
                    monthlyIncomeUSD: incomeUsd, 
                    pendingPayments: pendingCount 
                }));
                
                // Filtramos los 5 más recientes aprobados para la tabla
                setRecentPayments(
                    paymentsList
                    .filter(p => p.status === 'aprobado')
                    .sort((a, b) => (b.paymentDate?.toMillis?.() || 0) - (a.paymentDate?.toMillis?.() || 0))
                    .slice(0, 5)
                );
            });

            return () => unsubPayments();
        });

        // 3. Suscripción a Anuncios
        const qAnuncios = query(collection(db, "condominios", workingCondoId, "billboard_announcements"), where("published", "==", true), orderBy("createdAt", "desc"), limit(5));
        const unsubAnuncios = onSnapshot(qAnuncios, (snap) => {
            setAnuncios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        // 4. Suscripción a Propietarios (Rooted in separate entries per condo)
        const ownersCol = workingCondoId === 'condo_01' ? 'owners' : 'propietarios';
        const unsubOwners = onSnapshot(collection(db, 'condominios', workingCondoId, ownersCol), (snap) => {
            setStats(prev => ({ ...prev, totalOwners: snap.size }));
        });

        return () => { unsubSettings(); unsubAnuncios(); unsubOwners(); };
    }, [workingCondoId, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
                <p className="text-muted-foreground font-black uppercase tracking-widest text-[10px]">Sincronizando EFAS CondoSys...</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto bg-slate-50/50 min-h-screen">
            {/* Header Profesional */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-5xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">
                        Panel de <span className="text-amber-500">Gestión</span>
                    </h2>
                    <div className="flex items-center gap-2 mt-4 bg-white w-fit px-4 py-1.5 rounded-full shadow-sm border border-slate-100">
                        <Building2 className="h-3.5 w-3.5 text-amber-500" />
                        <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em]">
                            {condoName || workingCondoId}
                        </p>
                    </div>
                </div>
                <div className="hidden md:block text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado del Sistema</p>
                    <p className="text-xs font-bold text-emerald-500 flex items-center justify-end gap-1 uppercase italic">
                        <TrendingUp className="h-3 w-3" /> En línea
                    </p>
                </div>
            </div>
            
            {/* Cartelera Digital */}
            <div className="bg-white border-none rounded-[2.5rem] p-2 shadow-xl shadow-slate-200/50">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            {/* Tarjetas de Estadísticas Rápidas */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-slate-900 border-none rounded-[2rem] shadow-xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                        <Receipt className="h-16 w-16 text-white" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400">Ingresos del Mes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-white">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                        <p className="text-xs font-bold text-sky-200/60 mt-2 italic uppercase">≈ ${formatToTwoDecimals(stats.monthlyIncomeUSD)} USD</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-500 border-none rounded-[2rem] shadow-xl overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-900">Pagos Pendientes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-slate-900">{stats.pendingPayments}</div>
                        <p className="text-xs font-bold text-amber-900/60 mt-2 uppercase">Requieren validación</p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-none rounded-[2rem] shadow-xl overflow-hidden border border-slate-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Población Total</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-slate-900">{stats.totalOwners}</div>
                        <p className="text-xs font-bold text-slate-400 mt-2 uppercase flex items-center gap-1">
                            <Users className="h-3 w-3" /> Unidades Registradas
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* MÓDULO DE GRÁFICOS ANALÍTICOS */}
            <AdminCharts payments={allPayments} currentRate={currentRate} />
            
            {/* Tabla de Movimientos Recientes */}
            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
                <CardHeader className="bg-slate-900 px-8 py-6">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500">
                        Últimas Conciliaciones Aprobadas
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50 border-none">
                                <TableHead className="text-[10px] uppercase font-black text-slate-400 px-8 py-4">Propietario / Residente</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-slate-400">Monto Transacción</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-slate-400">Fecha Registro</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentPayments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-16 text-slate-300 font-bold uppercase text-[10px] tracking-widest">
                                        Sin movimientos aprobados este periodo
                                    </TableCell>
                                </TableRow>
                            ) : (
                                recentPayments.map(p => (
                                    <TableRow key={p.id} className="hover:bg-amber-50/30 transition-colors border-slate-50">
                                        <TableCell className="font-bold text-xs uppercase text-slate-700 px-8 py-5">
                                            {p.beneficiaries?.[0]?.ownerName || p.ownerName || 'Residente sin nombre'}
                                        </TableCell>
                                        <TableCell className="text-sm font-black text-slate-900">
                                            <span className="text-emerald-600 mr-1">Bs.</span> {formatToTwoDecimals(p.totalAmount)}
                                        </TableCell>
                                        <TableCell className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                            {p.paymentDate ? format(p.paymentDate.toDate(), 'dd MMM yyyy', { locale: es }) : '---'}
                                        </TableCell>
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

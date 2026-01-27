'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Loader2, Users, Receipt, CheckCircle, Smile } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from "date-fns";
import { Progress } from "@/components/ui/progress";
import CarteleraDigital from "@/components/CarteleraDigital";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AdminDashboardPage() {
    const { user, role, ownerData, activeCondoId, loading: authLoading } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [anuncios, setAnuncios] = useState<any[]>([]);

    // 1. Verificación de Seguridad y Roles
    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.replace('/login?role=admin');
            } else {
                const isSuperAdmin = user.email === 'vallecondo@gmail.com';
                const isAdmin = role === 'administrador';

                if (!isSuperAdmin && !isAdmin) {
                    router.replace('/welcome');
                }
            }
        }
    }, [user, role, authLoading, router]);

    // 2. Carga de Datos Dinámica (Soporte o Real)
    useEffect(() => {
        // Detectar si estamos en modo soporte
        const sId = localStorage.getItem('support_mode_id');
        const condoId = (sId && user?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;

        if (!condoId) {
            if (!authLoading) setLoading(false);
            return;
        }

        // --- CARGA DE TASA BCV ---
        const fetchRate = async () => {
            try {
                const snap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
                if (snap.exists()) {
                    const rates = snap.data().exchangeRates || [];
                    const active = rates.find((r: any) => r.active === true || r.status === 'active');
                    if (active) setActiveRate(active.rate || active.value || 0);
                }
            } catch (e) { console.error("Error tasa dashboard:", e); }
        };
        fetchRate();

        // --- CARGA DE ANUNCIOS (RUTA CORREGIDA) ---
        const unsubAnuncios = onSnapshot(
            query(collection(db, "condominios", condoId, "billboard_announcements"), orderBy("createdAt", "desc"), limit(5)), 
            (snap) => setAnuncios(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (err) => console.warn("Error anuncios dashboard:", err)
        );

        // --- CARGA DE PAGOS (RUTA CORREGIDA) ---
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0,0,0,0);

        const unsubPayments = onSnapshot(
            collection(db, 'condominios', condoId, 'payments'), 
            (snap) => {
                let bs = 0; let usd = 0; let pending = 0;
                const paymentsList: any[] = [];

                snap.docs.forEach(d => {
                    const data = d.data();
                    const status = data.status?.toLowerCase();
                    const pDate = data.paymentDate?.toDate();

                    if (status === 'pendiente') pending++;
                    
                    if (status === 'aprobado' && pDate >= startOfMonth) {
                        const amount = data.totalAmount || 0;
                        bs += amount;
                        const rate = data.exchangeRate || activeRate || 1;
                        usd += amount / rate;
                        paymentsList.push({ id: d.id, ...data });
                    }
                });

                setStats(prev => ({ ...prev, monthlyIncome: bs, monthlyIncomeUSD: usd, pendingPayments: pending }));
                setRecentPayments(paymentsList.sort((a,b) => b.paymentDate - a.paymentDate).slice(0, 5));
                setLoading(false);
            },
            (err) => { console.error("Error pagos dashboard:", err); setLoading(false); }
        );

        // --- CARGA DE PROPIETARIOS (RUTA CORREGIDA) ---
        const unsubOwners = onSnapshot(
            collection(db, 'condominios', condoId, 'owners'), 
            (snap) => setStats(prev => ({ ...prev, totalOwners: snap.size }))
        );

        return () => { 
            unsubAnuncios(); 
            unsubPayments(); 
            unsubOwners(); 
        };
    }, [user, activeCondoId, activeRate, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[#0081c9] mb-4" />
                <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px]">Sincronizando Datos...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020617] text-white p-6 space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black uppercase tracking-tighter italic drop-shadow-sm text-white">
                    Panel de <span className="text-[#0081c9]">Control</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.4)]"></div>
                <p className="text-slate-400 font-bold mt-3 text-sm uppercase tracking-wide">
                    Resumen operativo y financiero en tiempo real.
                </p>
            </div>
            
            {/* CARTELERA DIGITAL */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] p-2 backdrop-blur-md">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            {/* ESTADÍSTICAS RÁPIDAS */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-sky-600 border-none text-white shadow-xl shadow-sky-900/20 rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80">Ingresos Aprobados (Mes)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">Ref: ${formatToTwoDecimals(stats.monthlyIncomeUSD)} USD</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-500 border-none text-white shadow-xl shadow-amber-900/20 rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80">Validaciones Pendientes</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.pendingPayments}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">Pagos por revisar</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-800 border-none text-white shadow-xl rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Propietarios</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.totalOwners}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">Unidades registradas</p>
                    </CardContent>
                </Card>
            </div>

            {/* TABLA DE PAGOS RECIENTES */}
            <Card className="bg-slate-900/50 border-slate-800 text-white rounded-[2rem] overflow-hidden backdrop-blur-sm">
                <CardHeader className="border-b border-slate-800 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-[#0081c9]">Últimos Pagos Verificados</CardTitle>
                    <Receipt className="w-4 h-4 text-slate-600" />
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-950/50">
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Propietario</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Monto</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Fecha Pago</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentPayments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-16 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                                        No se han detectado pagos aprobados recientemente
                                    </TableCell>
                                </TableRow>
                            ) : (
                                recentPayments.map(p => (
                                    <TableRow key={p.id} className="border-slate-800 hover:bg-slate-800/30 transition-colors">
                                        <TableCell className="font-bold text-xs uppercase tracking-tighter">
                                            {p.ownerName || p.beneficiaries?.[0]?.ownerName || 'Residente'}
                                        </TableCell>
                                        <TableCell className="text-[#0081c9] font-black italic">
                                            Bs. {formatToTwoDecimals(p.totalAmount)}
                                        </TableCell>
                                        <TableCell className="text-[10px] font-bold text-slate-400 uppercase">
                                            {p.paymentDate ? format(p.paymentDate.toDate(), 'dd MMM yyyy') : '---'}
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

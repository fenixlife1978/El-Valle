
'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Loader2, Users, Receipt, CheckCircle, Smile } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
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
    const { user, role, ownerData, loading: authLoading } = useAuth();
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

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.replace('/login?role=admin');
            } else {
                const isSuperAdmin = user.email === 'vallecondo@gmail.com';
                const isAdmin = role === 'administrador';

                if (!isSuperAdmin && !isAdmin) {
                    console.log("Acceso denegado: Rol incorrecto");
                    router.replace('/welcome');
                }
            }
        }
    }, [user, role, authLoading, router]);

    useEffect(() => {
        const condoId = ownerData?.condominioId;
        if (!condoId && user?.email !== 'vallecondo@gmail.com') return;

        const fetchRate = async () => {
            if (!condoId) return;
            try {
                const snap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
                if (snap.exists()) {
                    const rates = snap.data().exchangeRates || [];
                    const active = rates.find((r: any) => r.active);
                    if (active) setActiveRate(active.rate);
                }
            } catch (e) { console.error("Error tasa:", e); }
        };
        fetchRate();

        if (!condoId) {
            setLoading(false);
            return;
        }

        const unsubAnuncios = onSnapshot(query(collection(db, "billboard_announcements"), where("condominioId", "==", condoId)), 
            (snap) => setAnuncios(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (err) => console.warn(err)
        );

        const start = new Date();
        start.setDate(1);
        start.setHours(0,0,0,0);

        const unsubPayments = onSnapshot(query(collection(db, 'payments'), where('condominioId', '==', condoId)), 
            (snap) => {
                let bs = 0; let usd = 0; let pending = 0;
                const paymentsList: any[] = [];

                snap.docs.forEach(d => {
                    const data = d.data();
                    const status = data.status?.toLowerCase();
                    const date = data.paymentDate?.toDate();

                    if (status === 'pendiente') pending++;
                    
                    if (status === 'aprobado' && date >= start) {
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
            (err) => { console.error(err); setLoading(false); }
        );

        const unsubOwners = onSnapshot(query(collection(db, 'owners'), where('condominioId', '==', condoId)), 
            (snap) => setStats(prev => ({ ...prev, totalOwners: snap.size }))
        );

        return () => { unsubAnuncios(); unsubPayments(); unsubOwners(); };
    }, [ownerData, user, activeRate]);

    if (authLoading || (loading && ownerData)) {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[#0081c9] mb-4" />
                <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px]">Cargando Sistema...</p>
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
                    Vista general del condominio gestionado.
                </p>
            </div>
            
            <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] p-2">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-sky-600 border-none text-white shadow-xl shadow-sky-900/20 rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80">Cobrado (Mes)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">${formatToTwoDecimals(stats.monthlyIncomeUSD)} USD</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-500 border-none text-white shadow-xl shadow-amber-900/20 rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80">Por Validar</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.pendingPayments}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">Pagos pendientes</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-800 border-none text-white shadow-xl rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80">Residentes</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.totalOwners}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">Censo actualizado</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-slate-900/50 border-slate-800 text-white rounded-[2rem] overflow-hidden backdrop-blur-sm">
                <CardHeader className="border-b border-slate-800">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-[#0081c9]">Cobranza Reciente</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-950/50">
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Propietario</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Monto</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Fecha</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={3} className="text-center py-20"><Loader2 className="animate-spin mx-auto text-slate-700"/></TableCell></TableRow>
                            ) : recentPayments.length === 0 ? (
                                <TableRow><TableCell colSpan={3} className="text-center py-20 text-slate-500 font-bold uppercase text-[10px] tracking-widest">No hay pagos aprobados este mes</TableCell></TableRow>
                            ) : (
                                recentPayments.map(p => (
                                    <TableRow key={p.id} className="border-slate-800 hover:bg-slate-800/30 transition-colors">
                                        <TableCell className="font-bold text-xs uppercase tracking-tighter">{p.beneficiaries?.[0]?.ownerName || 'Residente'}</TableCell>
                                        <TableCell className="text-[#0081c9] font-black italic">Bs. {formatToTwoDecimals(p.totalAmount)}</TableCell>
                                        <TableCell className="text-[10px] font-bold text-slate-400">{p.paymentDate ? format(p.paymentDate.toDate(), 'dd/MM/yyyy') : '---'}</TableCell>
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

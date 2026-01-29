'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, onSnapshot, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from "date-fns";
import CarteleraDigital from "@/components/CarteleraDigital";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AdminDashboardPage() {
    const { user, role, activeCondoId, workingCondoId, loading: authLoading } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [anuncios, setAnuncios] = useState<any[]>([]);

    // LÓGICA DE DETECCIÓN DE CONDOMINIO (PRIORIDAD AL WORKING ID)
    const targetCondoId = workingCondoId || activeCondoId;

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

    // 2. Carga de Datos Consolidada
    useEffect(() => {
        // Si no hay ningún ID disponible, no intentamos cargar nada aún
        if (!targetCondoId) {
            if (!authLoading) setLoading(false);
            return;
        }

        setLoading(true);

        // --- CARGA DE ANUNCIOS (billboard_announcements) ---
        // Aplicamos el switch de publicado para mayor control
        const qAnuncios = query(
            collection(db, "condominios", targetCondoId, "billboard_announcements"),
            orderBy("createdAt", "desc"),
            limit(5)
        );

        const unsubAnuncios = onSnapshot(qAnuncios, (snap) => {
            const dataAnuncios = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                // Filtramos por si acaso el switch de publicado está en la data
                .filter((a: any) => a.published !== false); 
            
            setAnuncios(dataAnuncios);
        }, (err) => console.error("Error anuncios:", err));

        // --- CARGA DE PROPIETARIOS ---
        const unsubOwners = onSnapshot(
            collection(db, 'condominios', targetCondoId, 'owners'),
            (snap) => {
                setStats(prev => ({ ...prev, totalOwners: snap.size }));
            }
        );

        // --- CARGA DE TASA Y PAGOS ---
        let unsubPayments: () => void;
        const fetchAndSubscribe = async () => {
            let currentRate = 1;
            try {
                const snap = await getDoc(doc(db, 'condominios', targetCondoId, 'config', 'mainSettings'));
                if (snap.exists()) {
                    const rates = snap.data().exchangeRates || [];
                    const active = rates.find((r: any) => r.active === true || r.status === 'active');
                    currentRate = active?.rate || active?.value || 1;
                }
            } catch (e) { console.warn("Usando tasa por defecto (1)"); }

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            unsubPayments = onSnapshot(
                collection(db, 'condominios', targetCondoId, 'payments'),
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
                            const exchangeRate = data.exchangeRate || currentRate;
                            usd += amount / exchangeRate;
                            paymentsList.push({ id: d.id, ...data });
                        }
                    });

                    setStats(prev => ({ ...prev, monthlyIncome: bs, monthlyIncomeUSD: usd, pendingPayments: pending }));
                    setRecentPayments(
                        paymentsList
                        .sort((a, b) => (b.paymentDate?.toMillis() || 0) - (a.paymentDate?.toMillis() || 0))
                        .slice(0, 5)
                    );
                    setLoading(false);
                }
            );
        };

        fetchAndSubscribe();

        return () => {
            unsubAnuncios();
            unsubOwners();
            if (unsubPayments) unsubPayments();
        };
    }, [targetCondoId, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
                <p className="text-muted-foreground font-black uppercase tracking-[0.3em] text-[10px]">Sincronizando EFAS CondoSys...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black uppercase tracking-tighter italic drop-shadow-sm text-foreground">
                    Panel de <span className="text-amber-500">Control</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Sincronizado con: <span className="text-foreground">{targetCondoId}</span>
                </p>
            </div>
            
            <div className="bg-card border-border rounded-[2rem] p-4 shadow-sm overflow-hidden">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-blue-50 border-blue-200 text-slate-900 shadow-sm rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-600">Ingresos (Mes)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                        <p className="text-xs font-bold text-blue-500 mt-1">Ref: ${formatToTwoDecimals(stats.monthlyIncomeUSD)} USD</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-50 border-amber-200 text-slate-900 shadow-sm rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-600">Validaciones Pendientes</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.pendingPayments}</div>
                        <p className="text-xs font-bold text-amber-500 mt-1">Pagos por revisar</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50 border-slate-200 text-slate-900 shadow-sm rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Comunidad</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.totalOwners}</div>
                        <p className="text-xs font-bold text-slate-400 mt-1">Propietarios registrados</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-card border-border text-foreground rounded-[2rem] overflow-hidden shadow-sm">
                <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between bg-slate-50/30">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-amber-600">Últimos Movimientos Verificados</CardTitle>
                    <Receipt className="w-4 h-4 text-slate-400" />
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50/50">
                            <TableRow>
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Propietario</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Monto</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-slate-500">Fecha</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentPayments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-12 text-slate-400 font-bold uppercase text-[10px]">
                                        No hay actividad reciente en este periodo
                                    </TableCell>
                                </TableRow>
                            ) : (
                                recentPayments.map(p => (
                                    <TableRow key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="font-bold text-xs uppercase text-slate-700">
                                            {p.ownerName || 'Residente'}
                                        </TableCell>
                                        <TableCell className="text-emerald-600 font-black italic">
                                            Bs. {formatToTwoDecimals(p.totalAmount)}
                                        </TableCell>
                                        <TableCell className="text-[10px] font-bold text-slate-400 uppercase">
                                            {p.paymentDate ? format(p.paymentDate.toDate(), 'dd/MM/yy') : '---'}
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

'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Receipt, Building2 } from "lucide-react"; 
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

export default function AdminDashboardPage({ params }: { params: { condoId: string } }) {
    const { user, role, loading: authLoading } = useAuth();
    const router = useRouter();
    const workingCondoId = params.condoId;

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [anuncios, setAnuncios] = useState<any[]>([]);
    const [condoName, setCondoName] = useState("");

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

    // 2. Carga de Datos Consolidada usando workingCondoId de la URL
    useEffect(() => {
        if (!workingCondoId) return;

        setLoading(true);

        // --- INFO DEL CONDOMINIO ---
        getDoc(doc(db, 'condominios', workingCondoId)).then(snap => {
            if (snap.exists()) setCondoName(snap.data().nombre);
        });

        // --- CARGA DE ANUNCIOS ---
        const qAnuncios = query(
            collection(db, "condominios", workingCondoId, "billboard_announcements"),
            orderBy("createdAt", "desc"),
            limit(5)
        );

        const unsubAnuncios = onSnapshot(qAnuncios, (snap) => {
            const dataAnuncios = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter((a: any) => a.published !== false); 
            setAnuncios(dataAnuncios);
        });

        // --- CARGA DE PROPIETARIOS ---
        const ownersCollectionName = workingCondoId === 'condo_01' ? 'owners' : 'propietarios';
        const unsubOwners = onSnapshot(
            collection(db, 'condominios', workingCondoId, ownersCollectionName),
            (snap) => {
                setStats(prev => ({ ...prev, totalOwners: snap.size }));
            }
        );

        // --- CARGA DE TASA Y PAGOS ---
        let unsubPayments: () => void;
        const fetchAndSubscribe = async () => {
            let currentRate = 1;
            try {
                const snap = await getDoc(doc(db, 'condominios', workingCondoId, 'config', 'mainSettings'));
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
                collection(db, 'condominios', workingCondoId, 'payments'),
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
    }, [workingCondoId]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
                <p className="text-muted-foreground font-black uppercase tracking-[0.3em] text-[10px]">Sincronizando EFAS CondoSys...</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto font-montserrat">
            {/* Encabezado Dinámico */}
            <div className="mb-10">
                <h2 className="text-4xl font-black uppercase tracking-tighter italic drop-shadow-sm text-foreground">
                    Panel de <span className="text-amber-500">Control</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                <div className="flex items-center gap-2 mt-3">
                    <Building2 className="h-4 w-4 text-amber-500" />
                    <p className="text-muted-foreground font-bold text-sm uppercase tracking-wide">
                        Gestionando: <span className="text-foreground">{condoName || workingCondoId}</span>
                    </p>
                </div>
            </div>
            
            {/* Cartelera */}
            <div className="bg-card border-border rounded-[2rem] p-4 shadow-sm overflow-hidden border border-white/5">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            {/* Tarjetas de Estadísticas */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-blue-50/40 border-blue-200/50 text-slate-900 shadow-sm rounded-[1.5rem] backdrop-blur-sm border">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-600">Ingresos (Mes)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                        <p className="text-xs font-bold text-blue-500 mt-1">Ref: ${formatToTwoDecimals(stats.monthlyIncomeUSD)} USD</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-50/40 border-amber-200/50 text-slate-900 shadow-sm rounded-[1.5rem] backdrop-blur-sm border">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-600">Validaciones Pendientes</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.pendingPayments}</div>
                        <p className="text-xs font-bold text-amber-500 mt-1">Pagos por revisar</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50/40 border-slate-200/50 text-slate-900 shadow-sm rounded-[1.5rem] backdrop-blur-sm border">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Comunidad</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.totalOwners}</div>
                        <p className="text-xs font-bold text-slate-400 mt-1">Propietarios registrados</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabla de Movimientos */}
            <Card className="bg-card border-border text-foreground rounded-[2rem] overflow-hidden shadow-sm border border-white/5">
                <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between bg-muted/30">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-amber-600">Últimos Movimientos Verificados</CardTitle>
                    <Receipt className="w-4 h-4 text-slate-400" />
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/20">
                            <TableRow className="hover:bg-transparent border-b border-white/5">
                                <TableHead className="text-[10px] uppercase font-black text-slate-500 py-4">Propietario</TableHead>
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
                                    <TableRow key={p.id} className="hover:bg-muted/50 transition-colors border-b border-white/5">
                                        <TableCell className="font-bold text-xs uppercase text-foreground py-4">
                                            {p.beneficiaries?.map((b: any) => b.ownerName).join(', ') || 'RESIDENTE'}
                                        </TableCell>
                                        <TableCell className="text-emerald-500 font-black italic">
                                            Bs. {formatToTwoDecimals(p.totalAmount)}
                                        </TableCell>
                                        <TableCell className="text-[10px] font-bold text-muted-foreground uppercase">
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

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
    const [stats, setStats] = useState({
        monthlyIncome: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [anuncios, setAnuncios] = useState<any[]>([]);
    const [condoId, setCondoId] = useState<string | null>(null);

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

    // 2. Determinar el ID del condominio a usar
    useEffect(() => {
        const sId = localStorage.getItem('support_mode_id');
        const id = (sId && user?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;
        setCondoId(id);
    }, [user, activeCondoId]);


    // 3. Carga de Datos (un solo efecto que depende del condoId)
    useEffect(() => {
        if (!condoId) {
            if (!authLoading) setLoading(false);
            return;
        }

        setLoading(true);

        // --- CARGA DE ANUNCIOS ---
        const unsubAnuncios = onSnapshot(
            query(collection(db, "condominios", condoId, "billboard_announcements"), orderBy("createdAt", "desc"), limit(5)),
            (snap) => {
                setAnuncios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            },
            (err) => console.warn("Error anuncios dashboard:", err)
        );

        // --- CARGA DE PROPIETARIOS ---
        const unsubOwners = onSnapshot(
            collection(db, 'condominios', condoId, 'owners'),
            (snap) => {
                setStats(prev => ({ ...prev, totalOwners: snap.size }));
            }
        );

        // --- CARGA DE TASA Y PAGOS ---
        let unsubPayments: () => void;
        const fetchRateAndPayments = async () => {
            let rate = 0;
            try {
                const snap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
                if (snap.exists()) {
                    const rates = snap.data().exchangeRates || [];
                    const active = rates.find((r: any) => r.active === true || r.status === 'active');
                    if (active) {
                        rate = active.rate || active.value || 0;
                    }
                }
            } catch (e) {
                console.error("Error tasa dashboard:", e);
            }

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            unsubPayments = onSnapshot(
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
                            const exchangeRate = data.exchangeRate || rate || 1;
                            usd += amount / exchangeRate;
                            paymentsList.push({ id: d.id, ...data });
                        }
                    });

                    setStats(prev => ({ ...prev, monthlyIncome: bs, monthlyIncomeUSD: usd, pendingPayments: pending }));
                    setRecentPayments(paymentsList.sort((a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis()).slice(0, 5));
                    setLoading(false);
                },
                (err) => { console.error("Error pagos dashboard:", err); setLoading(false); }
            );
        };

        fetchRateAndPayments();

        return () => {
            unsubAnuncios();
            unsubOwners();
            if (unsubPayments) unsubPayments();
        };
    }, [condoId, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground font-black uppercase tracking-[0.3em] text-[10px]">Sincronizando Datos...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black uppercase tracking-tighter italic drop-shadow-sm text-foreground">
                    Panel de <span className="text-primary">Control</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Resumen operativo y financiero en tiempo real.
                </p>
            </div>
            
            <div className="bg-card border-border rounded-[2rem] p-4 shadow-sm">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-blue-900/20 border-blue-500/30 text-foreground shadow-md rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-400">Ingresos Aprobados (Mes)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">Ref: ${formatToTwoDecimals(stats.monthlyIncomeUSD)} USD</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-900/20 border-amber-500/30 text-foreground shadow-md rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-400">Validaciones Pendientes</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.pendingPayments}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">Pagos por revisar</p>
                    </CardContent>
                </Card>

                <Card className="bg-secondary/50 border-border text-foreground shadow-md rounded-[1.5rem]">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Propietarios</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">{stats.totalOwners}</div>
                        <p className="text-xs font-bold opacity-70 mt-1">Unidades registradas</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-card border-border text-foreground rounded-[2rem] overflow-hidden shadow-sm">
                <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-primary">Últimos Pagos Verificados</CardTitle>
                    <Receipt className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-secondary/30">
                            <TableRow className="border-border/50 hover:bg-transparent">
                                <TableHead className="text-[10px] uppercase font-black text-muted-foreground">Propietario</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-muted-foreground">Monto</TableHead>
                                <TableHead className="text-[10px] uppercase font-black text-muted-foreground">Fecha Pago</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentPayments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-16 text-muted-foreground font-bold uppercase text-[10px] tracking-widest">
                                        No se han detectado pagos aprobados recientemente
                                    </TableCell>
                                </TableRow>
                            ) : (
                                recentPayments.map(p => (
                                    <TableRow key={p.id} className="border-border/50 hover:bg-secondary/20 transition-colors">
                                        <TableCell className="font-bold text-xs uppercase tracking-tighter text-foreground">
                                            {p.ownerName || p.beneficiaries?.[0]?.ownerName || 'Residente'}
                                        </TableCell>
                                        <TableCell className="text-primary font-black italic">
                                            Bs. {formatToTwoDecimals(p.totalAmount)}
                                        </TableCell>
                                        <TableCell className="text-[10px] font-bold text-muted-foreground uppercase">
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
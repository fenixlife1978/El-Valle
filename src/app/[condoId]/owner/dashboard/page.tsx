'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, Receipt, CalendarCheck2, Download, Banknote } from "lucide-react";
import CarteleraDigital from "@/components/CarteleraDigital";

// Imports de Lógica y Librerías
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfMonth } from "date-fns";
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";
import Marquee from "@/components/ui/marquee";

// --- TIPOS ---
type Anuncio = { id: string; urlImagen: string; titulo: string; descripcion?: string; published?: boolean; };
type Debt = { id: string; year: number; month: number; amountUSD: number; description: string; status: 'pending' | 'paid' | 'vencida'; paidAmountUSD?: number; property: { street: string, house: string }; published?: boolean; };
type Payment = { id: string; status: 'pendiente' | 'aprobado' | 'rechazado'; totalAmount: number; paymentDate: any; reference: string; beneficiaryIds: string[]; beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[]; exchangeRate: number; };

const monthsLocale: { [key: number]: string } = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
const formatCurrency = (num: number) => num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OwnerDashboardPage() {
    const { user, ownerData, activeCondoId, companyInfo, loading: authLoading } = useAuth();
    const router = useRouter();
    
    const [loadingData, setLoadingData] = useState(true);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
    const [now, setNow] = useState<Date | null>(null);

    // --- EFECTO DE DATOS ---
    useEffect(() => {
        setNow(new Date());

        // Solo procedemos si auth ha terminado y tenemos los IDs necesarios
        if (authLoading) return;
        if (!user || !activeCondoId) {
            setLoadingData(false);
            return;
        }

        setLoadingData(true);

        // 1. Cargar Anuncios (Billboard)
        const unsubAnuncios = onSnapshot(
            query(collection(db, "condominios", activeCondoId, "billboard_announcements"), where("published", "==", true)), 
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Anuncio));
                setAnuncios(data);
            }
        );

        // 2. Cargar Deudas (Debts) - Filtrado por ownerId del usuario logueado
        const unsubDebts = onSnapshot(
            query(
                collection(db, 'condominios', activeCondoId, 'debts'), 
                where('ownerId', '==', user.uid),
                where('published', '==', true),
                orderBy('year', 'desc'), 
                orderBy('month', 'desc')
            ),
            (snap) => {
                const debtsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));
                setDebts(debtsData);
            }
        );

        // 3. Cargar Pagos (Payments)
        const unsubPayments = onSnapshot(
            query(collection(db, 'condominios', activeCondoId, 'payments'), where('beneficiaryIds', 'array-contains', user.uid)),
            (snap) => {
                const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
                setPayments(list.sort((a, b) => (b.paymentDate?.toMillis() || 0) - (a.paymentDate?.toMillis() || 0)));
                setLoadingData(false);
            },
            (error) => {
                console.error("Error cargando pagos:", error);
                setLoadingData(false);
            }
        );

        return () => { unsubAnuncios(); unsubDebts(); unsubPayments(); };
    }, [user, activeCondoId, authLoading]);

    // --- LÓGICA DE ESTADÍSTICAS ---
    const stats = useMemo(() => {
        const pendingDebts = debts.filter(d => d.status === 'pending' || d.status === 'vencida');
        const totalPendingUSD = pendingDebts.reduce((sum, d) => sum + d.amountUSD - (d.paidAmountUSD || 0), 0);
        const isSolvente = totalPendingUSD <= 0.01;
        let oldestDebtDate = 'N/A';
        let isVencida = false;

        if (pendingDebts.length > 0) {
            const sorted = [...pendingDebts].sort((a, b) => a.year - b.year || a.month - b.month);
            oldestDebtDate = `${monthsLocale[sorted[0].month]} ${sorted[0].year}`;
            if (now) {
                const dDate = new Date(sorted[0].year, sorted[0].month - 1);
                isVencida = isBefore(dDate, startOfMonth(now));
            }
        }
        return { totalPendingUSD, isSolvente, oldestDebtDate, isVencida };
    }, [debts, now]);
    
    // Pantalla de carga unificada
    if (authLoading || (loadingData && !ownerData)) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
                <Loader2 className="animate-spin text-[#F28705] h-12 w-12" />
                <p className="mt-4 font-black uppercase text-[10px] tracking-[0.3em] text-white/60">
                    Sincronizando EFAS CondoSys...
                </p>
            </div>
        );
    }
    
    // Si no hay datos tras la carga, redirigir
    if (!user || !ownerData) {
        router.replace('/welcome');
        return null;
    }

    const statusVariant = stats.isSolvente ? 'success' : stats.isVencida ? 'destructive' : 'warning';
    const primaryProperty = ownerData.properties?.[0] || { street: 'Sin asignar', house: '#' };

    return (
        <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-700 font-montserrat">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-white">
                    👋 ¡Hola, {ownerData.name?.split(' ')[0]}!
                </h1>
                <p className="text-slate-400 font-medium">
                    Panel de autogestión: <span className="text-[#F28705] font-bold">{companyInfo?.name || 'EFAS CondoSys'}</span>
                </p>
            </header>
            
            <div className="relative w-full overflow-hidden rounded-xl bg-[#F28705]/5 border border-[#F28705]/10 text-[#F28705] py-2">
                <Marquee pauseOnHover className="[--duration:30s]">
                    <span className="px-4 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                        <AlertCircle className="h-4 w-4"/> Pague antes del día 05 para evitar recargos • Reporte sus pagos en esta plataforma • EFAS CondoSys
                    </span>
                </Marquee>
            </div>
            
            <CarteleraDigital anuncios={anuncios} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className={cn("border-2 shadow-xl transition-all rounded-[2rem] bg-card/40 backdrop-blur-sm", 
                    stats.isSolvente ? 'border-emerald-500/20' : stats.isVencida ? 'border-red-500/20' : 'border-amber-500/20')}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-bold">Estado de Cuenta</CardTitle>
                            <CardDescription className="font-bold text-xs uppercase opacity-70">
                                {primaryProperty.street} - {primaryProperty.house}
                            </CardDescription>
                        </div>
                        <Badge variant={statusVariant} className="uppercase font-black px-3 rounded-lg tracking-widest text-[10px]">
                            {stats.isSolvente ? 'Solvente' : stats.isVencida ? 'Deuda Vencida' : 'Pendiente'}
                        </Badge>
                    </CardHeader>
                    <CardContent className="pt-4 flex flex-col items-center text-center">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-60">Total Deuda Pendiente</p>
                        <div className={cn("text-5xl font-black mb-3 tracking-tighter", stats.isSolvente ? 'text-emerald-500' : 'text-red-500')}>
                            ${formatCurrency(stats.totalPendingUSD)}
                        </div>
                        {!stats.isSolvente && (
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground bg-muted/50 px-4 py-1.5 rounded-full uppercase tracking-widest">
                                <CalendarCheck2 className="h-3 w-3" /> Deuda desde: {stats.oldestDebtDate}
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="pt-4 px-8 pb-8">
                        <Button 
                            onClick={() => router.push(`/${activeCondoId}/owner/payments/calculator`)} 
                            className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-lg bg-[#F28705] hover:bg-[#F28705]/90 text-white" 
                            disabled={stats.isSolvente}
                        >
                            Calcular y Reportar Pago
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="shadow-xl border-border bg-card/40 backdrop-blur-sm rounded-[2rem] flex flex-col justify-center">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Banknote className="h-5 w-5 text-[#F28705]"/> Saldo a Favor
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[140px]">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-60">Monto Disponible</p>
                        <p className="text-5xl font-black text-[#F28705] tracking-tighter">
                            Bs. {formatCurrency(ownerData.balance || 0)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-2xl overflow-hidden rounded-[2rem] bg-card/40 backdrop-blur-sm">
                <CardHeader className="bg-muted/30 border-b px-8 py-6">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <Receipt className="h-5 w-5 text-[#F28705]"/> Pagos Recientes
                        </CardTitle>
                        <Button onClick={() => router.push(`/${activeCondoId}/owner/payments`)} variant="outline" className="font-black text-[10px] uppercase tracking-widest rounded-xl">Ver Todos</Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/10">
                            <TableRow className="border-none">
                                <TableHead className="px-8 font-black uppercase text-[10px] tracking-widest">Fecha</TableHead>
                                <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Monto (Bs)</TableHead>
                                <TableHead className="text-center font-black uppercase text-[10px] tracking-widest">Estado</TableHead>
                                <TableHead className="text-right px-8 font-black uppercase text-[10px] tracking-widest">Acción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingData ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-10"><Loader2 className="animate-spin mx-auto text-[#F28705]"/></TableCell></TableRow>
                            ) : payments.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground font-bold italic">No se encontraron pagos registrados.</TableCell></TableRow>
                            ) : (
                                payments.slice(0, 5).map(p => {
                                    const ben = p.beneficiaries?.find(b => b.ownerId === user.uid);
                                    if(!ben) return null;
                                    return (
                                        <TableRow key={p.id} className="hover:bg-muted/20 border-muted/20 transition-colors">
                                            <TableCell className="px-8 font-bold text-sm">
                                                {p.paymentDate ? format(p.paymentDate.toDate(), 'dd/MM/yyyy') : '---'}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-[#F28705]">{formatCurrency(ben.amount)}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={p.status === 'aprobado' ? 'success' : p.status === 'rechazado' ? 'destructive' : 'warning'} className="text-[9px] font-black uppercase px-2">
                                                    {p.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right px-8">
                                                {p.status === 'aprobado' && (
                                                    <Button variant="ghost" size="sm" className="rounded-full hover:bg-[#F28705]/10">
                                                        <Download className="h-4 w-4 text-[#F28705]"/>
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
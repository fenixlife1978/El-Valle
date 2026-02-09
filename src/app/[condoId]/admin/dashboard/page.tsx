'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Receipt, Building2, Users } from "lucide-react"; 
import { collection, query, onSnapshot, doc, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, startOfMonth, isAfter } from "date-fns";
import { es } from "date-fns/locale";
import CarteleraDigital from "@/components/CarteleraDigital";
import { useAuth } from "@/hooks/use-auth";

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AdminDashboardPage({ params }: { params: Promise<{ condoId: string }> }) {
    const { loading: authLoading } = useAuth();
    const resolvedParams = React.use(params);
    const workingCondoId = resolvedParams.condoId;

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

    useEffect(() => {
        if (!workingCondoId || authLoading) return;

        setLoading(true);

        // 1. Configuración y Tasa de Cambio
        const unsubSettings = onSnapshot(doc(db, 'condominios', workingCondoId, 'config', 'mainSettings'), (settingsSnap) => {
            let currentRate = 1;
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCondoName(settings.companyInfo?.name || settings.name || workingCondoId);
                const rates = settings.exchangeRates || [];
                const active = rates.find((r: any) => r.active === true || r.status === 'active');
                currentRate = active?.rate || active?.value || 1;
            }

            const inicioDeMes = startOfMonth(new Date());

            // 2. Escucha de Pagos (Ingresos y Pendientes)
            const paymentsQuery = query(collection(db, 'condominios', workingCondoId, 'payments'));
            const unsubPayments = onSnapshot(paymentsQuery, (paymentSnap) => {
                let incomeBs = 0;
                let incomeUsd = 0;
                let pendingCount = 0;
                const recentApproved: any[] = [];

                paymentSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    const fechaPago = data.paymentDate?.toDate?.() || (data.paymentDate ? new Date(data.paymentDate) : null);

                    if (data.status === 'pendiente') {
                        pendingCount++;
                    } else if (data.status === 'aprobado') {
                        if (fechaPago && isAfter(fechaPago, inicioDeMes)) {
                            const amount = data.totalAmount || 0;
                            incomeBs += amount;
                            incomeUsd += amount / (data.exchangeRate || currentRate);
                        }
                        recentApproved.push({ id: docSnap.id, ...data });
                    }
                });
                
                setStats(prev => ({ 
                    ...prev, 
                    monthlyIncome: incomeBs, 
                    monthlyIncomeUSD: incomeUsd, 
                    pendingPayments: pendingCount 
                }));
                
                setRecentPayments(
                    recentApproved
                    .sort((a, b) => (b.paymentDate?.toMillis?.() || 0) - (a.paymentDate?.toMillis?.() || 0))
                    .slice(0, 5)
                );
            });

            return unsubPayments;
        });

        // 3. Cartelera Digital
        const qAnuncios = query(
            collection(db, "condominios", workingCondoId, "billboard_announcements"), 
            orderBy("createdAt", "desc"), 
            limit(5)
        );
        const unsubAnuncios = onSnapshot(qAnuncios, (snap) => {
            setAnuncios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 4. Conteo de Comunidad (Dual: Owners + Propietarios)
        // Escuchamos ambas colecciones para no perder datos en la transición
        const unsubOldOwners = onSnapshot(collection(db, 'condominios', workingCondoId, 'owners'), (oldSnap) => {
            const unsubNewPropietarios = onSnapshot(collection(db, 'condominios', workingCondoId, 'propietarios'), (newSnap) => {
                // Usamos un Set de IDs para evitar duplicados si un usuario existe en ambas
                const uniqueIds = new Set([
                    ...oldSnap.docs.map(d => d.id),
                    ...newSnap.docs.map(d => d.id)
                ]);
                setStats(prev => ({ ...prev, totalOwners: uniqueIds.size }));
                setLoading(false);
            });
            return () => unsubNewPropietarios();
        });

        return () => { 
            unsubSettings(); 
            unsubAnuncios(); 
            unsubOldOwners(); 
        };
    }, [workingCondoId, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center bg-transparent">
                <Loader2 className="h-10 w-10 animate-spin text-[#F28705] mb-4" />
                <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">
                    EFAS CONDOSYS: Actualizando Datos
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-500">
            {/* Header */}
            <div className="mb-8">
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter italic text-slate-900">
                    Panel de <span className="text-[#F28705]">Control</span>
                </h2>
                <div className="flex items-center gap-2 mt-2">
                    <Building2 className="h-4 w-4 text-[#F28705]" />
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">
                        {condoName || "Cargando condominio..."}
                    </p>
                </div>
            </div>
            
            {/* Cartelera */}
            <div className="bg-card border rounded-[2rem] p-4 shadow-sm overflow-hidden w-full max-w-lg mx-auto">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            {/* Stats Grid */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-slate-900 border-none rounded-[2rem] shadow-lg transition-transform hover:scale-[1.02]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 flex items-center gap-2">
                            <Receipt className="h-3 w-3" /> Ingresos (Mes)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-white">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                        <p className="text-xs font-bold text-sky-200/70 mt-1 italic">${formatToTwoDecimals(stats.monthlyIncomeUSD)} USD</p>
                    </CardContent>
                </Card>

                <Card className="bg-[#F28705] border-none rounded-[2rem] shadow-lg transition-transform hover:scale-[1.02]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-950/80">Por Validar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-white">{stats.pendingPayments}</div>
                        <p className="text-xs font-bold text-orange-900/70 mt-1 uppercase">Pagos Pendientes</p>
                    </CardContent>
                </Card>

                <Card className="bg-white border border-slate-100 rounded-[2rem] shadow-lg transition-transform hover:scale-[1.02]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                            <Users className="h-3 w-3" /> Comunidad
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-slate-900">{stats.totalOwners}</div>
                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase">Residentes Activos</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabla de Pagos */}
            <Card className="rounded-[2rem] shadow-sm border overflow-hidden bg-white">
                <CardHeader className="bg-slate-50 border-b p-6">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-700">Últimos Pagos Aprobados</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50">
                                    <TableHead className="text-[10px] uppercase font-black text-slate-500 py-4 px-6">Residente</TableHead>
                                    <TableHead className="text-[10px] uppercase font-black text-slate-500">Monto</TableHead>
                                    <TableHead className="text-[10px] uppercase font-black text-slate-500">Fecha Pago</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentPayments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-10 text-slate-400 font-bold uppercase text-[10px]">
                                            Sin movimientos este mes
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    recentPayments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b last:border-0">
                                            <TableCell className="font-bold text-xs uppercase text-slate-900 py-5 px-6">
                                                {p.beneficiaries?.[0]?.ownerName || p.ownerName || 'Usuario EFAS'}
                                            </TableCell>
                                            <TableCell className="text-emerald-700 font-black">
                                                Bs. {formatToTwoDecimals(p.totalAmount)}
                                            </TableCell>
                                            <TableCell className="text-[10px] font-bold text-slate-500 uppercase">
                                                {p.paymentDate ? format(p.paymentDate.toDate(), 'dd/MM/yy', { locale: es }) : '---'}
                                            </TableCell>
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
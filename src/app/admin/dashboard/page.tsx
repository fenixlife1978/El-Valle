
'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Loader2, Users, Receipt, CheckCircle, Smile } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, Timestamp, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import CarteleraDigital from "@/components/CarteleraDigital";
import { useAuth } from "@/hooks/use-auth";

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AdminDashboardPage() {
    const { ownerData } = useAuth();
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
        // ID Maestro para tu administración
        const condoId = ownerData?.condominioId || 'condo_01';

        // 1. Tasa de Cambio
        const fetchRate = async () => {
            try {
                const snap = await getDoc(doc(db, 'condominios', condoId, 'config', 'settings'));
                if (snap.exists()) {
                    const rates = snap.data().exchangeRates || [];
                    const active = rates.find((r: any) => r.active);
                    if (active) setActiveRate(active.rate);
                }
            } catch (e) { console.error("Error tasa:", e); }
        };
        fetchRate();

        // 2. Anuncios
        const unsubAnuncios = onSnapshot(query(collection(db, "billboard_announcements"), where("condominioId", "==", condoId)), 
            (snap) => setAnuncios(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (err) => console.warn(err)
        );

        // 3. Pagos y Estadísticas (Mes Actual)
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

        // 4. Censo
        const unsubOwners = onSnapshot(query(collection(db, 'owners'), where('condominioId', '==', condoId)), 
            (snap) => setStats(prev => ({ ...prev, totalOwners: snap.size }))
        );

        return () => { unsubAnuncios(); unsubPayments(); unsubOwners(); };
    }, [ownerData, activeRate]);

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight italic">Panel de <span className="text-[#0081c9]">Control</span></h1>
            
            <CarteleraDigital anuncios={anuncios} />

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-sky-600 text-white">
                    <CardHeader className="pb-2"><CardTitle className="text-xs uppercase">Cobrado (Mes)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Bs. {formatToTwoDecimals(stats.monthlyIncome)}</div>
                        <p className="text-xs opacity-70">${formatToTwoDecimals(stats.monthlyIncomeUSD)}</p>
                    </CardContent>
                </Card>
                <Card className="bg-amber-500 text-white">
                    <CardHeader className="pb-2"><CardTitle className="text-xs uppercase">Por Validar</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.pendingPayments}</div></CardContent>
                </Card>
                <Card className="bg-slate-800 text-white">
                    <CardHeader className="pb-2"><CardTitle className="text-xs uppercase">Residentes</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.totalOwners}</div></CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle className="text-sm font-bold">Cobranza Reciente</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Propietario</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>Fecha</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={3} className="text-center py-10"><Loader2 className="animate-spin mx-auto"/></TableCell></TableRow>
                            ) : recentPayments.length === 0 ? (
                                <TableRow><TableCell colSpan={3} className="text-center py-10 text-slate-400">No hay pagos aprobados este mes</TableCell></TableRow>
                            ) : (
                                recentPayments.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-medium">{p.beneficiaries?.[0]?.ownerName || 'Residente'}</TableCell>
                                        <TableCell className="text-sky-600 font-bold">Bs. {formatToTwoDecimals(p.totalAmount)}</TableCell>
                                        <TableCell>{p.paymentDate ? format(p.paymentDate.toDate(), 'dd/MM/yyyy') : '---'}</TableCell>
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

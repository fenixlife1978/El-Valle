
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, onSnapshot, orderBy, query, Timestamp, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Loader2, Eye, ArrowLeft, Landmark, Save, Calculator } from 'lucide-react';

export default function FinancialBalancePage() {
    const { activeCondoId } = useAuth();
    const { toast } = useToast();
    
    const [view, setView] = useState<'list' | 'form'>('list');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statements, setStatements] = useState<any[]>([]);
    
    // Estados para el cálculo del balance
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    const [allExpenses, setAllExpenses] = useState<any[]>([]);
    const [prevBalance, setPrevBalance] = useState(0);
    const [currentPayments, setCurrentPayments] = useState(0);

    // 1. Cargar balances históricos con "failsafe"
    useEffect(() => {
        if (!activeCondoId) {
            // Si después de 3 segundos no hay ID, dejamos de cargar para no bloquear la pantalla
            const timer = setTimeout(() => setLoading(false), 3000);
            return () => clearTimeout(timer);
        }

        const q = query(
            collection(db, "condominios", activeCondoId, "financial_statements"), 
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                setStatements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLoading(false);
            }, 
            (error) => {
                console.error("Error en Firebase:", error);
                toast({ 
                    variant: 'destructive', 
                    title: 'Error de Conexión', 
                    description: 'Revisa tus permisos en Firebase.' 
                });
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [activeCondoId, toast]);

    // 2. Función para buscar datos del periodo (Ingresos y Gastos reales)
    const fetchPeriodData = async () => {
        if (!activeCondoId) return;
        setLoading(true);
        const year = parseInt(selectedYear);
        const month = parseInt(selectedMonth);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        try {
            // Buscar pagos aprobados
            const pQuery = query(
                collection(db, "condominios", activeCondoId, "payments"),
                where("status", "==", "aprobado"),
                where("paymentDate", ">=", Timestamp.fromDate(startDate)),
                where("paymentDate", "<=", Timestamp.fromDate(endDate))
            );
            const pSnap = await getDocs(pQuery);
            setCurrentPayments(pSnap.docs.reduce((sum, d) => sum + (d.data().totalAmount || 0), 0));

            // Buscar gastos registrados
            const eQuery = query(
                collection(db, "condominios", activeCondoId, "gastos"),
                where("date", ">=", Timestamp.fromDate(startDate)),
                where("date", "<=", Timestamp.fromDate(endDate))
            );
            const eSnap = await getDocs(eQuery);
            setAllExpenses(eSnap.docs.map(d => ({
                id: d.id,
                concepto: d.data().description,
                monto: d.data().amount,
                fecha: d.data().date
            })));
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al obtener datos' });
        } finally {
            setLoading(false);
        }
    };

    const totals = useMemo(() => {
        const totalEgr = allExpenses.reduce((sum, i) => sum + Number(i.monto || 0), 0);
        return {
            ingresos: prevBalance + currentPayments,
            egresos: totalEgr,
            total: (prevBalance + currentPayments) - totalEgr
        };
    }, [prevBalance, currentPayments, allExpenses]);

    // 3. FUNCIÓN PARA GUARDAR (RESTAURADA)
    const handleSaveBalance = async () => {
        if (!activeCondoId) return;
        setSaving(true);
        const balanceId = `${selectedYear}-${selectedMonth}`;

        try {
            await setDoc(doc(db, "condominios", activeCondoId, "financial_statements", balanceId), {
                month: selectedMonth,
                year: selectedYear,
                resumen: {
                    saldoAnterior: prevBalance,
                    ingresosMes: currentPayments,
                    egresosMes: totals.egresos,
                    total: totals.total
                },
                detalles: {
                    gastos: allExpenses
                },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                status: 'publicado'
            });

            toast({ title: "¡Cierre Guardado!", description: `El balance de ${balanceId} ha sido publicado.` });
            setView('list');
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al guardar el balance' });
        } finally {
            setSaving(false);
        }
    };

    if (loading && view === 'list') {
        return <div className="flex h-screen items-center justify-center bg-slate-950"><Loader2 className="animate-spin text-blue-500 h-10 w-10" /></div>;
    }

    return (
        <div className="p-8 space-y-8">
            <header className="flex justify-between items-center">
                <div className="mb-10">
                    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                        Balance <span className="text-[#0081c9]">Financiero</span>
                    </h2>
                    <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                    <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
                        Gestión y publicación de cierres mensuales.
                    </p>
                </div>
                {view === 'list' && (
                    <Button onClick={() => { setView('form'); fetchPeriodData(); }} className="bg-blue-600 hover:bg-blue-500 font-bold h-12">
                        <PlusCircle className="mr-2 h-5 w-5" /> NUEVO CIERRE
                    </Button>
                )}
            </header>

            {view === 'list' ? (
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Periodo</TableHead>
                                    <TableHead className="text-right text-slate-400 font-bold uppercase text-[10px]">Liquidez Final</TableHead>
                                    <TableHead className="text-right text-slate-400 font-bold uppercase text-[10px]">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {statements.length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="text-center py-20 text-slate-600 font-bold italic">No hay balances publicados.</TableCell></TableRow>
                                ) : (
                                    statements.map(s => (
                                        <TableRow key={s.id} className="border-slate-800 hover:bg-slate-800/30">
                                            <TableCell className="text-white font-black">{s.id}</TableCell>
                                            <TableCell className="text-right text-green-400 font-mono font-bold">Bs. {s.estadoFinanciero?.saldoNeto?.toLocaleString('es-VE') || s.resumen?.total?.toLocaleString('es-VE')}</TableCell>
                                            <TableCell className="text-right"><Button variant="ghost" size="icon"><Eye className="h-5 w-5" /></Button></TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader className="border-b border-slate-800/50"><CardTitle className="text-white text-sm font-black uppercase flex items-center gap-2"><Landmark className="text-blue-500" /> Conciliación de Cierre</CardTitle></CardHeader>
                            <CardContent className="pt-6 space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saldo Anterior en Banco</label>
                                        <Input type="number" value={prevBalance} onChange={e => setPrevBalance(Number(e.target.value))} className="bg-slate-950 border-slate-800 text-white h-12" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ingresos por Cuotas (Sincronizado)</label>
                                        <div className="h-12 px-4 flex items-center bg-blue-500/10 border border-blue-500/30 rounded text-blue-400 font-black">Bs. {currentPayments.toLocaleString('es-VE')}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card className="bg-blue-600 border-none text-white shadow-2xl">
                            <CardHeader><CardTitle className="text-[10px] uppercase font-black opacity-80">Saldo de Liquidación Final</CardTitle></CardHeader>
                            <CardContent className="text-4xl font-black italic tracking-tighter">Bs. {totals.total.toLocaleString('es-VE')}</CardContent>
                            <CardFooter className="flex flex-col gap-3">
                                <Button onClick={handleSaveBalance} disabled={saving} className="w-full bg-white text-blue-600 hover:bg-slate-100 font-black uppercase text-xs h-12">
                                    {saving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />} PUBLICAR BALANCE
                                </Button>
                                <Button onClick={() => setView('list')} variant="ghost" className="w-full text-white font-bold hover:bg-white/10 uppercase text-[10px]"><ArrowLeft className="mr-2 h-4 w-4" /> Cancelar</Button>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, orderBy, doc, Timestamp, getDoc, where, getDocs, setDoc
} from 'firebase/firestore';
import { 
    Download, Loader2, FileText, RefreshCw, TrendingUp, TrendingDown, Wallet, Box, Coins, Landmark
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

export default function FinancialBalancePage() {
    const { toast } = useToast();
    // EFAS CondoSys: Usamos currentCondoId para blindar el acceso a los 5 meses de data
    const { activeCondoId, workingCondoId, loading: authLoading } = useAuth();
    const currentCondoId = activeCondoId || workingCondoId;

    const [dataLoading, setDataLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [companyInfo, setCompanyInfo] = useState<{name: string, rif: string, logo: string | null}>({
        name: "RESIDENCIAS",
        rif: "J-00000000-0",
        logo: null
    });

    const [ingresos, setIngresos] = useState([
        { concepto: 'Cobranza del Mes', real: 0, category: 'cuotas_ordinarias' }, 
        { concepto: 'Fondo de Reserva', real: 0, category: 'fondo_reserva' }, 
        { concepto: 'Otros Ingresos', real: 0, category: 'otros' }
    ]);
    const [egresos, setEgresos] = useState<any[]>([]);
    
    const [cajaChica, setCajaChica] = useState({
        saldoInicial: 0,
        reposiciones: 0,
        gastos: 0,
        saldoFinal: 0,
    });
    
    const [estadoFinal, setEstadoFinal] = useState({ 
        saldoAnterior: 0, totalIngresos: 0, totalEgresos: 0, saldoNeto: 0, saldoBancos: 0, disponibilidadTotal: 0
    });
    const [notas, setNotas] = useState('');

    const loadCondoConfig = useCallback(async () => {
        if (!currentCondoId) return;
        try {
            // Ruta exacta mainSettings (Case sensitive)
            const configRef = doc(db, 'condominios', currentCondoId, 'config', 'mainSettings');
            const snap = await getDoc(configRef);
            if (snap.exists()) {
                const data = snap.data();
                setCompanyInfo({
                    name: data.companyInfo?.name || data.name || "CONDOMINIO",
                    rif: data.companyInfo?.rif || data.rif || "N/A",
                    logo: data.companyInfo?.logo || data.logo || null
                });
            }
        } catch (error) {
            console.error("EFAS Error:", error);
        }
    }, [currentCondoId]);

    const handleSyncData = useCallback(async (showToast = true) => {
        if (!currentCondoId) return;
        setSyncing(true);
        if (showToast) toast({ title: `Sincronizando: ${currentCondoId}` });
    
        try {
            await loadCondoConfig();
            const currentPeriodStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const currentPeriodEnd = endOfMonth(currentPeriodStart);
            
            // --- Saldo Anterior ---
            const prevPeriodDate = subMonths(currentPeriodStart, 1);
            const prevPeriodId = format(prevPeriodDate, 'yyyy-MM');
            const prevSnap = await getDoc(doc(db, 'condominios', currentCondoId, 'financial_statements', prevPeriodId));
            const saldoAnterior = prevSnap.exists() ? (prevSnap.data() as any).estadoFinal?.saldoBancos || 0 : 0;
            
            // --- Ingresos ---
            const paymentsQuery = query(
                collection(db, 'condominios', currentCondoId, 'payments'),
                where('paymentDate', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('paymentDate', '<=', Timestamp.fromDate(currentPeriodEnd)),
                where('status', '==', 'aprobado')
            );
            const paymentsSnap = await getDocs(paymentsQuery);
            const totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
            
            setIngresos([
                { concepto: 'Cobranza del Mes', real: totalPayments, category: 'cuotas_ordinarias' },
                { concepto: 'Fondo de Reserva', real: 0, category: 'fondo_reserva' },
                { concepto: 'Otros Ingresos', real: 0, category: 'otros' }
            ]);
    
            // --- Egresos ---
            const expensesSnap = await getDocs(query(
                collection(db, 'condominios', currentCondoId, 'gastos'),
                where('date', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('date', '<=', Timestamp.fromDate(currentPeriodEnd)),
                orderBy('date', 'asc')
            ));
            
            setEgresos(expensesSnap.docs.map(d => ({
                id: d.id,
                descripcion: d.data().description || 'Sin descripción',
                monto: d.data().amount || 0,
                fecha: format(d.data().date.toDate(), 'dd/MM/yyyy')
            })));

            // --- Caja Chica ---
            const ccMovesQuery = query(
                collection(db, 'condominios', currentCondoId, 'cajaChica_movimientos'),
                where('date', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('date', '<=', Timestamp.fromDate(currentPeriodEnd))
            );
            const ccSnap = await getDocs(ccMovesQuery);
            let repos = 0, gCC = 0;
            ccSnap.docs.forEach(doc => {
                const m = doc.data();
                if (m.type === 'ingreso') repos += m.amount;
                else gCC += m.amount;
            });
            setCajaChica(prev => ({ ...prev, reposiciones: repos, gastos: gCC }));
            setEstadoFinal(prev => ({...prev, saldoAnterior}));
    
        } catch (e) {
            console.error(e);
            toast({variant: 'destructive', title: 'Error de Sincronización'});
        } finally {
            setSyncing(false);
            setDataLoading(false);
        }
    }, [currentCondoId, selectedMonth, selectedYear, toast, loadCondoConfig]);

    useEffect(() => {
        if (!authLoading && currentCondoId) {
             handleSyncData(false);
        } else if (!authLoading && !currentCondoId) {
            setDataLoading(false);
        }
    }, [currentCondoId, authLoading, selectedMonth, selectedYear, handleSyncData]);

    useEffect(() => {
        const totalI = ingresos.reduce((s, i) => s + i.real, 0);
        const totalE = egresos.reduce((s, e) => s + e.monto, 0);
        const saldoBancos = estadoFinal.saldoAnterior + totalI - totalE;
        
        setEstadoFinal(prev => ({
            ...prev,
            totalIngresos: totalI,
            totalEgresos: totalE,
            saldoNeto: saldoBancos,
            saldoBancos: saldoBancos,
            disponibilidadTotal: saldoBancos + cajaChica.saldoFinal
        }));
    }, [ingresos, egresos, estadoFinal.saldoAnterior, cajaChica.saldoFinal]);
    
    const generatePDF = async () => {
        if (!currentCondoId || !companyInfo) return;
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const headerHeight = 35;
        const margin = 14;

        docPDF.setFillColor(28, 43, 58); 
        docPDF.rect(0, 0, pageWidth, headerHeight, 'F');
        docPDF.setTextColor(255, 255, 255);
        if (companyInfo.logo) {
            try { docPDF.addImage(companyInfo.logo, 'PNG', margin, 7, 20, 20); } catch(e) {}
        }
        docPDF.setFontSize(14).text(companyInfo.name, margin + 25, 15);
        docPDF.setFontSize(9).text(`RIF: ${companyInfo.rif}`, margin + 25, 22);

        autoTable(docPDF, {
            head: [['INGRESOS', 'MONTO (Bs.)']],
            body: ingresos.map(i => [i.concepto, formatCurrency(i.real)]),
            startY: headerHeight + 20,
            theme: 'striped'
        });

        autoTable(docPDF, {
            head: [['FECHA', 'EGRESOS', 'MONTO']],
            body: egresos.map(e => [e.fecha, e.descripcion, formatCurrency(e.monto)]),
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            theme: 'striped'
        });

        docPDF.save(`Balance_${selectedYear}_${selectedMonth}.pdf`);
    };

    if (authLoading || dataLoading) return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-10 w-10 text-primary"/></div>;

    if (!currentCondoId) return <div className="p-20 text-center font-black uppercase italic text-slate-400">Seleccione un Condominio</div>;

    return (
        <div className="max-w-7xl mx-auto space-y-6">
             <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Balance <span className="text-primary">Financiero</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full"></div>
                {/* REEMPLAZO DE BADGE POR SPAN PARA EVITAR ERROR TS */}
                <span className="inline-block mt-3 px-3 py-1 bg-secondary text-secondary-foreground text-[10px] font-bold rounded-full tracking-widest uppercase">
                    ID: {currentCondoId}
                </span>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleSyncData(true)} disabled={syncing} className="rounded-2xl"><RefreshCw className={`mr-2 h-4 w-4 ${syncing && 'animate-spin'}`}/> Sincronizar</Button>
                    <Button className="bg-primary rounded-2xl" onClick={generatePDF}><Download className="mr-2 h-4 w-4"/> PDF</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="rounded-[2.5rem] bg-card shadow-sm border">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-bold text-muted-foreground">PERÍODO</CardTitle></CardHeader>
                    <CardContent className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="rounded-xl font-bold"><SelectValue/></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>)}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="rounded-xl font-bold"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    </CardContent>
                </Card>
                <div className="grid grid-cols-2 gap-6 md:col-span-2">
                    <Card className="rounded-[2.5rem] bg-emerald-500/10 text-emerald-600 border-none shadow-none"><CardContent className="p-6"><p className="text-sm font-bold uppercase">Ingresos</p><p className="text-4xl font-black">{formatCurrency(estadoFinal.totalIngresos)}</p></CardContent></Card>
                    <Card className="rounded-[2.5rem] bg-rose-500/10 text-rose-600 border-none shadow-none"><CardContent className="p-6"><p className="text-sm font-bold uppercase">Egresos</p><p className="text-4xl font-black">{formatCurrency(estadoFinal.totalEgresos)}</p></CardContent></Card>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-[2.5rem] p-2 bg-card border shadow-xl">
                    <CardHeader><CardTitle className="text-xl font-black uppercase">Gastos Detallados</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>FECHA</TableHead><TableHead>CONCEPTO</TableHead><TableHead className="text-right">MONTO</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {egresos.map(e => (
                                    <TableRow key={e.id}><TableCell className="text-xs font-bold">{e.fecha}</TableCell><TableCell className="uppercase font-bold text-sm">{e.descripcion}</TableCell><TableCell className="text-right font-black text-rose-500">-{formatCurrency(e.monto)}</TableCell></TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="rounded-[2.5rem] p-2 bg-card border shadow-xl">
                    <CardHeader><CardTitle className="text-xl font-black uppercase tracking-tighter">Caja Chica</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between font-bold"><span>Saldo Inicial</span><span>{formatCurrency(cajaChica.saldoInicial)}</span></div>
                        <div className="flex justify-between font-bold text-emerald-600"><span>(+) Reposiciones</span><span>+{formatCurrency(cajaChica.reposiciones)}</span></div>
                        <div className="flex justify-between font-bold text-rose-600"><span>(-) Gastos</span><span>-{formatCurrency(cajaChica.gastos)}</span></div>
                        <Separator />
                        <div className="flex justify-between font-black text-2xl"><span>Saldo Caja</span><span className="text-primary">{formatCurrency(cajaChica.saldoFinal)}</span></div>
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-[2.5rem] p-8 bg-card border-2 border-primary/20 shadow-2xl space-y-6">
                <CardHeader className="p-0"><CardTitle className="text-3xl font-black uppercase italic tracking-tighter">Cierre de Cuenta</CardTitle></CardHeader>
                <CardContent className="p-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase ml-2 text-muted-foreground">Saldo Anterior Banco (Bs.)</Label>
                            <Input type="number" value={estadoFinal.saldoAnterior} onChange={e => setEstadoFinal(prev => ({...prev, saldoAnterior: parseFloat(e.target.value) || 0}))} className="h-16 rounded-2xl text-3xl font-black px-6"/>
                        </div>
                        <div className="p-6 rounded-2xl bg-secondary/30 flex flex-col justify-center">
                            <span className="text-xs font-bold uppercase text-muted-foreground mb-1">Total en Bancos</span>
                            <span className="text-4xl font-black">{formatCurrency(estadoFinal.saldoBancos)}</span>
                        </div>
                    </div>
                     <div className="p-8 rounded-[2rem] bg-primary text-primary-foreground flex items-center justify-between shadow-lg shadow-primary/20">
                        <span className="font-black text-xl uppercase italic tracking-widest">Disponibilidad Real</span>
                        <span className="text-5xl font-black italic">{formatCurrency(estadoFinal.disponibilidadTotal)}</span>
                    </div>
                    <Textarea placeholder="Observaciones del cierre..." value={notas} onChange={e => setNotas(e.target.value)} className="rounded-[2rem] min-h-[120px] p-6 text-lg font-bold border-2 focus:border-primary"/>
                </CardContent>
                <CardFooter className="p-0 flex justify-end">
                    <Button className="rounded-full px-16 h-16 font-black text-xl shadow-xl hover:scale-105 transition-transform" onClick={async () => {
                        const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                        await setDoc(doc(db, 'condominios', currentCondoId, 'financial_statements', periodId), { id: periodId, estadoFinal, notas, fechaCierre: Timestamp.now() });
                        toast({ title: "BALANCE GUARDADO CORRECTAMENTE" });
                    }}>GUARDAR BALANCE</Button>
                </CardFooter>
            </Card>
        </div>
    );
}

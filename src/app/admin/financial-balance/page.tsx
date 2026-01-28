"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, orderBy, doc, Timestamp, getDoc, where, getDocs, setDoc
} from 'firebase/firestore';
import { 
    Download, Loader2, FileText, RefreshCw, TrendingUp, TrendingDown 
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

export default function FinancialBalancePage() {
    const { toast } = useToast();
    const auth = useAuth();
    
    const workingCondoId = (auth as any).workingCondoId;
    const authLoading = auth.loading;
    
    const [dataLoading, setDataLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [condoConfig, setCondoConfig] = useState<{name: string, rif: string, logo: string | null}>({
        name: "RESIDENCIAS",
        rif: "J-00000000-0",
        logo: null
    });

    const [ingresos, setIngresos] = useState([
        { concepto: 'Ingresos x Cuotas de Condominio', real: 0 }, 
        { concepto: 'Ingresos Extraordinarios', real: 0 }
    ]);
    const [egresos, setEgresos] = useState<any[]>([]);
    const [estadoFinal, setEstadoFinal] = useState({ 
        saldoAnterior: 0, totalIngresos: 0, totalEgresos: 0, disponibilidadTotal: 0 
    });
    const [notas, setNotas] = useState('');

    const loadCondoConfig = useCallback(async () => {
        if (!workingCondoId) return;
        try {
            // RUTA SOLICITADA: /condominios/ID/config/mainSettings
            const configRef = doc(db, 'condominios', workingCondoId, 'config', 'mainSettings');
            const snap = await getDoc(configRef);
            if (snap.exists()) {
                const data = snap.data();
                setCondoConfig({
                    name: data.nombre || "CONDOMINIO",
                    rif: data.rif || "N/A",
                    logo: data.logo || null
                });
            }
        } catch (error) {
            console.error("EFAS Error:", error);
        }
    }, [workingCondoId]);

    const handleSyncData = useCallback(async (showToast = true) => {
        if (!workingCondoId) return;
        setSyncing(true);
        if (showToast) toast({ title: "Sincronizando..." });

        try {
            await loadCondoConfig();
            const currentPeriodStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const currentPeriodEnd = endOfMonth(currentPeriodStart);
            
            // 1. Saldo Anterior
            const prevPeriodDate = subMonths(currentPeriodStart, 1);
            const prevPeriodId = format(prevPeriodDate, 'yyyy-MM');
            const prevSnap = await getDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', prevPeriodId));
            const saldoAnterior = prevSnap.exists() ? (prevSnap.data() as any).estadoFinal.disponibilidadTotal : 0;

            // 2. Ingresos
            const paymentsSnap = await getDocs(query(
                collection(db, 'condominios', workingCondoId, 'payments'),
                where('status', '==', 'aprobado'),
                where('paymentDate', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('paymentDate', '<=', Timestamp.fromDate(currentPeriodEnd))
            ));
            const totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
            
            setIngresos(prev => prev.map(item => 
                item.concepto.includes('Cuotas') ? { ...item, real: totalPayments } : item
            ));

            // 3. Egresos
            const expensesSnap = await getDocs(query(
                collection(db, 'condominios', workingCondoId, 'gastos'),
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

            setEstadoFinal(prev => ({ ...prev, saldoAnterior }));
        } catch (e) {
            console.error(e);
        } finally {
            setSyncing(false);
            setDataLoading(false);
        }
    }, [workingCondoId, selectedMonth, selectedYear, toast, loadCondoConfig]);

    useEffect(() => {
        if (!authLoading && workingCondoId) handleSyncData(false);
    }, [workingCondoId, authLoading, handleSyncData]);

    useEffect(() => {
        const totalI = ingresos.reduce((s, i) => s + i.real, 0);
        const totalE = egresos.reduce((s, e) => s + e.monto, 0);
        setEstadoFinal(prev => ({
            ...prev,
            totalIngresos: totalI,
            totalEgresos: totalE,
            disponibilidadTotal: prev.saldoAnterior + totalI - totalE
        }));
    }, [ingresos, egresos]);

    const generatePDF = () => {
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();

        // Header Oscuro
        docPDF.setFillColor(15, 23, 42); 
        docPDF.rect(0, 0, pageWidth, 45, 'F');

        // Logo Circular con clipping corregido para TS
        if (condoConfig.logo) {
            try {
                docPDF.setDrawColor(255);
                docPDF.circle(25, 22, 12, 'S');
                docPDF.clip();
                docPDF.addImage(condoConfig.logo, 'JPEG', 13, 10, 24, 24);
                (docPDF as any).internal.write('Q');
            } catch (e) {}
        }

        docPDF.setTextColor(255);
        docPDF.setFontSize(14).setFont('helvetica', 'bold').text(condoConfig.name.toUpperCase(), 45, 22);
        docPDF.setFontSize(9).text(`RIF: ${condoConfig.rif}`, 45, 28);
        docPDF.setFontSize(16).text("EFAS CondoSys", pageWidth - 14, 20, { align: 'right' });

        docPDF.setTextColor(40);
        docPDF.setFontSize(18).text('ESTADO DE RESULTADOS', 14, 60);
        docPDF.setFontSize(10).text(`PERÍODO: ${months[parseInt(selectedMonth)-1].label.toUpperCase()} ${selectedYear}`, 14, 68);

        autoTable(docPDF, {
            head: [['CONCEPTO', 'MONTO (Bs.)']],
            body: ingresos.map(i => [i.concepto.toUpperCase(), formatCurrency(i.real)]),
            startY: 75,
            headStyles: { fillColor: [22, 163, 74] }
        });

        autoTable(docPDF, {
            head: [['FECHA', 'DESCRIPCIÓN', 'MONTO (Bs.)']],
            body: egresos.map(e => [e.fecha, e.descripcion.toUpperCase(), formatCurrency(e.monto)]),
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            headStyles: { fillColor: [220, 38, 38] }
        });

        docPDF.setFontSize(14).text(`DISPONIBILIDAD: Bs. ${formatCurrency(estadoFinal.disponibilidadTotal)}`, pageWidth / 2, (docPDF as any).lastAutoTable.finalY + 20, { align: 'center' });
        docPDF.save(`Balance_${condoConfig.name}.pdf`);
    };

    if (authLoading) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin h-10 w-10 text-blue-600"/></div>;

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6 bg-slate-50 min-h-screen">
            <header className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm">
                <div>
                    <h1 className="text-3xl font-black italic text-slate-900 uppercase">EFAS <span className="text-blue-600">Balance</span></h1>
                    <p className="text-blue-600 font-bold text-xs uppercase tracking-tighter">{condoConfig.name}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleSyncData(true)} disabled={syncing} className="rounded-2xl"><RefreshCw className={`mr-2 h-4 w-4 ${syncing && 'animate-spin'}`}/> Sincronizar</Button>
                    <Button className="bg-blue-600 rounded-2xl" onClick={generatePDF}><Download className="mr-2 h-4 w-4"/> PDF</Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-slate-900 text-white md:col-span-2 rounded-[2.5rem] p-8 flex justify-around">
                    <div className="text-center"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Ingresos</p><p className="text-3xl font-black text-green-400">{formatCurrency(estadoFinal.totalIngresos)}</p></div>
                    <div className="text-center"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Egresos</p><p className="text-3xl font-black text-red-400">{formatCurrency(estadoFinal.totalEgresos)}</p></div>
                    <div className="bg-blue-600 p-6 rounded-3xl"><p className="text-[10px] text-white font-bold uppercase mb-1">Disponibilidad</p><p className="text-4xl font-black italic">Bs. {formatCurrency(estadoFinal.disponibilidadTotal)}</p></div>
                </Card>
                
                <Card className="rounded-[2.5rem] p-6 bg-white space-y-4">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Mes y Año</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent className="bg-white">{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>)}</SelectContent></Select>
                    <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent className="bg-white">{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                </Card>
            </div>

            <Card className="rounded-[2.5rem] p-8 bg-white border-2 border-slate-50 shadow-xl space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-2">Saldo Anterior en Bancos</Label>
                        <Input type="number" value={estadoFinal.saldoAnterior} onChange={e => setEstadoFinal(prev => ({...prev, saldoAnterior: parseFloat(e.target.value) || 0}))} className="h-14 rounded-2xl bg-slate-50 border-none text-2xl font-black text-blue-600 px-6"/>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-[2rem] flex flex-col justify-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Resumen de Cierre</span>
                        <span className="text-2xl font-black text-white italic">Bs. {formatCurrency(estadoFinal.disponibilidadTotal)}</span>
                    </div>
                </div>
                <Textarea placeholder="Observaciones..." value={notas} onChange={e => setNotas(e.target.value)} className="rounded-3xl bg-slate-50 border-none min-h-[100px] p-6 font-bold text-slate-600"/>
                <div className="flex justify-end">
                    <Button className="bg-green-600 hover:bg-green-700 rounded-full px-12 h-14 font-black text-white" onClick={async () => {
                        const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                        await setDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', periodId), { id: periodId, estadoFinal, notas, fechaCierre: Timestamp.now() });
                        toast({ title: "BALANCE GUARDADO" });
                    }}>GUARDAR CIERRE</Button>
                </div>
            </Card>
        </div>
    );
}

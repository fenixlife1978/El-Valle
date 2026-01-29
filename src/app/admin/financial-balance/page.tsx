"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, doc, Timestamp, getDoc, where, getDocs, setDoc, limit } from 'firebase/firestore';
import { Download, Loader2, RefreshCw, Wallet, Box, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// --- Types ---
type FinancialItem = {
    id: string;
    concepto: string;
    monto: number;
    dia: string;
};

type CajaChicaMovement = {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    type: 'ingreso' | 'egreso';
}

type CompanyInfo = {
    name: string;
    rif: string;
    logo: string | null;
};

type FinancialStatement = {
  id: string; // YYYY-MM
  ingresos: FinancialItem[];
  egresos: FinancialItem[];
  cajaChica: { saldoInicial: number; reposiciones: number; gastos: number; saldoFinal: number; };
  estadoFinanciero: { saldoAnterior: number, totalIngresos: number; totalEgresos: number, saldoBancos: number, disponibilidadTotal: number };
  notas: string;
  createdAt: string;
};


// --- Helpers ---
const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));


// --- Main Component ---
export default function FinancialBalancePage() {
    const { toast } = useToast();
    const { activeCondoId } = useAuth();
    const barcodeRef = useRef<SVGSVGElement>(null);

    // --- State ---
    const [dataLoading, setDataLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [statement, setStatement] = useState<FinancialStatement | null>(null);

    // --- Barcode Generation ---
    useEffect(() => {
        if (barcodeRef.current && activeCondoId) {
            const barcodeValue = `BF-${activeCondoId}-${selectedYear}${selectedMonth.padStart(2, '0')}`;
            JsBarcode(barcodeRef.current, barcodeValue, {
                format: "CODE128", width: 1.5, height: 40, displayValue: true, fontSize: 10
            });
        }
    }, [activeCondoId, selectedMonth, selectedYear]);

    // --- Data Loading Logic ---
    const loadData = useCallback(async () => {
        if (!activeCondoId) return;
        setSyncing(true);

        const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;

        try {
            // Check for existing saved statement
            const statementRef = doc(db, 'condominios', activeCondoId, 'financial_statements', periodId);
            const statementSnap = await getDoc(statementRef);

            if (statementSnap.exists()) {
                setStatement(statementSnap.data() as FinancialStatement);
            } else {
                // Generate a new one if not found
                const generatedStatement = await generateNewStatement(activeCondoId, selectedYear, selectedMonth);
                setStatement(generatedStatement);
            }

            const configRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                setCompanyInfo(configSnap.data().companyInfo as CompanyInfo);
            }

        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "No se pudo cargar o generar el balance." });
        } finally {
            setSyncing(false);
            setDataLoading(false);
        }
    }, [activeCondoId, selectedMonth, selectedYear, toast]);

    const generateNewStatement = async (condoId: string, year: string, month: string) => {
        const fromDate = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
        const toDate = endOfMonth(fromDate);
        const fromDateTimestamp = Timestamp.fromDate(fromDate);
        const toDateTimestamp = Timestamp.fromDate(toDate);

        // Fetching all data
        const paymentsQuery = query(collection(db, 'condominios', condoId, 'payments'), where('status', '==', 'aprobado'), where('paymentDate', '>=', fromDateTimestamp), where('paymentDate', '<=', toDateTimestamp));
        const expensesQuery = query(collection(db, 'condominios', condoId, 'gastos'), where('date', '>=', fromDateTimestamp), where('date', '<=', toDateTimestamp));
        const movementsQuery = query(collection(db, 'condominios', condoId, 'cajaChica_movimientos'), where('date', '<=', toDateTimestamp));
        const lastMonthStatementQuery = query(collection(db, 'condominios', condoId, 'financial_statements'), orderBy('createdAt', 'desc'), limit(1));

        const [paymentsSnap, expensesSnap, movementsSnap, lastStatementSnap] = await Promise.all([
            getDocs(paymentsQuery),
            getDocs(expensesQuery),
            getDocs(movementsQuery),
            getDocs(lastMonthStatementQuery)
        ]);
        
        // Processing Incomes
        const totalIngresos = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
        const ingresos: FinancialItem[] = [{
            id: 'cobranza', dia: format(new Date(), 'dd'), concepto: 'COBRANZA DEL MES', monto: totalIngresos
        }];

        // Processing Expenses
        const egresos: FinancialItem[] = expensesSnap.docs.map(doc => {
            const data = doc.data();
            return { id: doc.id, dia: format(data.date.toDate(), 'dd'), concepto: data.description, monto: data.amount };
        });
        const totalEgresos = egresos.reduce((sum, item) => sum + item.monto, 0);
        
        // Processing Petty Cash
        const allMovements = movementsSnap.docs.map(doc => doc.data() as CajaChicaMovement);
        const priorMovements = allMovements.filter(m => m.date.toDate() < fromDate);
        const periodMovements = allMovements.filter(m => m.date.toDate() >= fromDate);

        const saldoInicialCaja = priorMovements.reduce((acc, m) => m.type === 'ingreso' ? acc + m.amount : acc - m.amount, 0);
        const reposicionesCaja = periodMovements.filter(m => m.type === 'ingreso').reduce((acc, m) => acc + m.amount, 0);
        const gastosCaja = periodMovements.filter(m => m.type === 'egreso').reduce((acc, m) => acc + m.amount, 0);
        const saldoFinalCaja = saldoInicialCaja + reposicionesCaja - gastosCaja;
        
        // Processing Financial State
        let saldoAnterior = 0;
        if (!lastStatementSnap.empty) {
            const lastData = lastStatementSnap.docs[0].data();
            saldoAnterior = lastData.estadoFinanciero?.disponibilidadTotal || 0;
        }

        const saldoBancos = saldoAnterior + totalIngresos - totalEgresos;
        const disponibilidadTotal = saldoBancos + saldoFinalCaja;

        return {
            id: `${year}-${month.padStart(2, '0')}`,
            ingresos,
            egresos,
            cajaChica: { saldoInicial: saldoInicialCaja, reposiciones: reposicionesCaja, gastos: gastosCaja, saldoFinal: saldoFinalCaja },
            estadoFinanciero: { saldoAnterior, totalIngresos, totalEgresos, saldoBancos, disponibilidadTotal },
            notas: 'Generado automáticamente por el sistema.',
            createdAt: new Date().toISOString()
        };
    };

    const handleSaveStatement = async () => {
        if (!statement || !activeCondoId) return;
        setSyncing(true);
        try {
            const ref = doc(db, 'condominios', activeCondoId, 'financial_statements', statement.id);
            await setDoc(ref, { ...statement, createdAt: serverTimestamp() });
            toast({ title: "Guardado", description: "Balance guardado en la base de datos." });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el balance." });
        } finally {
            setSyncing(false);
        }
    };
    
    // --- PDF Generation ---
    const handleExportPDF = async () => {
        if (!statement || !companyInfo) return;
        
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const headerHeight = 35;
        const margin = 14;

        // --- HEADER ---
        doc.setFillColor(28, 43, 58); // #1C2B3A
        doc.rect(0, 0, pageWidth, headerHeight, 'F');
        doc.setTextColor(255, 255, 255);

        // --- LOGO (LEFT) ---
        if (companyInfo.logo) {
            try {
                const logoSize = 20;
                doc.saveGraphicsState();
                doc.circle(margin + logoSize / 2, 7 + logoSize / 2, logoSize / 2);
                doc.clip();
                doc.addImage(companyInfo.logo, 'PNG', margin, 7, logoSize, logoSize);
                doc.restoreGraphicsState();
            }
            catch(e) { console.error("Error adding logo to PDF", e); }
        }
        
        const infoX = companyInfo.logo ? margin + 25 : margin;
        doc.setFontSize(14).setFont('helvetica', 'bold');
        doc.text(companyInfo.name, infoX, 15);
        doc.setFontSize(9).setFont('helvetica', 'normal');
        doc.text(`RIF: ${companyInfo.rif}`, infoX, 22);

        // --- BRAND & BARCODE (RIGHT) ---
        const endX = pageWidth - margin;
        const efasColor = '#F97316';
        const condoSysColor = '#FFFFFF';
        
        doc.setFont('helvetica', 'bolditalic');
        doc.setFontSize(10);
        
        const efasText = "EFAS";
        const condoSysText = "CONDOSYS";
        const condoSysWidth = doc.getStringUnitWidth(condoSysText) * 10 / doc.internal.scaleFactor;
        
        const brandY = 12;
        doc.setTextColor(efasColor);
        doc.text(efasText, endX - condoSysWidth - 1, brandY, { align: 'right' });
        doc.setTextColor(condoSysColor);
        doc.text(condoSysText, endX, brandY, { align: 'right' });
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(200, 200, 200);
        doc.text('BALANCE FINANCIERO', endX, brandY + 5, { align: 'right' });

        // --- BARCODE (Inside Header) ---
        const canvas = document.createElement('canvas');
        const barcodeValue = `BF-${activeCondoId}-${selectedYear}${selectedMonth.padStart(2, '0')}`;
        try {
            JsBarcode(canvas, barcodeValue, {
                format: "CODE128", 
                height: 25,
                width: 1,
                displayValue: false, 
                margin: 0,
                background: "#1c2b3a",
                lineColor: "#ffffff"
            });
            const barcodeDataUrl = canvas.toDataURL("image/png");
            const barcodeWidth = 40;
            const barcodeHeight = 10;
            doc.addImage(barcodeDataUrl, 'PNG', endX - barcodeWidth, brandY + 8, barcodeWidth, barcodeHeight);
        } catch (e) {
            console.error("Barcode generation failed", e);
        }

        // --- MAIN CONTENT ---
        doc.setTextColor(0, 0, 0);
        let startY = headerHeight + 20;

        const period = `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;
        doc.setFontSize(16).setFont('helvetica', 'bold').text("ESTADO DE RESULTADOS", pageWidth / 2, startY, { align: 'center' });
        startY += 7;
        doc.setFontSize(12).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, startY, { align: 'center' });
        
        startY += 15;

        // Incomes Table
        autoTable(doc, {
            head: [['DÍA', 'INGRESOS', 'MONTO (Bs.)']],
            body: statement.ingresos.map(i => [i.dia, i.concepto, { content: formatCurrency(i.monto), styles: { halign: 'right' } }]),
            foot: [[{ content: 'TOTAL INGRESOS', colSpan: 2, styles: { halign: 'right' } }, { content: formatCurrency(statement.estadoFinanciero.totalIngresos), styles: { halign: 'right' } }]],
            startY,
            theme: 'striped',
            headStyles: { fillColor: [30, 80, 180], halign: 'center' },
            footStyles: { fillColor: [30, 80, 180], textColor: [255,255,255], fontStyle: 'bold' },
            bodyStyles: { textColor: [0, 0, 0] }
        });
        startY = (doc as any).lastAutoTable.finalY + 10;

        // Expenses Table
        autoTable(doc, {
            head: [['DÍA', 'EGRESOS', 'MONTO (Bs.)']],
            body: statement.egresos.map(e => [e.dia, e.concepto, { content: formatCurrency(e.monto), styles: { halign: 'right' } }]),
            foot: [[{ content: 'TOTAL EGRESOS', colSpan: 2, styles: { halign: 'right' } }, { content: formatCurrency(statement.estadoFinanciero.totalEgresos), styles: { halign: 'right' } }]],
            startY,
            theme: 'striped',
            headStyles: { fillColor: [220, 53, 69], halign: 'center' },
            footStyles: { fillColor: [220, 53, 69], textColor: [255,255,255], fontStyle: 'bold' },
            bodyStyles: { textColor: [0, 0, 0] }
        });
        startY = (doc as any).lastAutoTable.finalY + 15;
        
        // Final State Section
        const finalStateX = 130;
        doc.setFontSize(10).setFont('helvetica', 'bold');
        doc.text('SALDO EN BANCOS MES ANTERIOR', finalStateX, startY, { align: 'right' });
        doc.setFont('helvetica', 'normal').text(formatCurrency(statement.estadoFinanciero.saldoAnterior), finalStateX + 5, startY, { align: 'left' });
        startY += 7;

        doc.setFont('helvetica', 'bold').text('(+) INGRESOS DEL MES', finalStateX, startY, { align: 'right' });
        doc.setFont('helvetica', 'normal').text(formatCurrency(statement.estadoFinanciero.totalIngresos), finalStateX + 5, startY, { align: 'left' });
        startY += 7;

        doc.setFont('helvetica', 'bold').text('(-) EGRESOS DEL MES', finalStateX, startY, { align: 'right' });
        doc.setFont('helvetica', 'normal').text(formatCurrency(statement.estadoFinanciero.totalEgresos), finalStateX + 5, startY, { align: 'left' });
        startY += 7;
        
        doc.setLineWidth(0.5);
        doc.line(finalStateX - 80, startY - 2, finalStateX + 40, startY - 2);

        doc.setFont('helvetica', 'bold').text('SALDO EN BANCOS', finalStateX, startY, { align: 'right' });
        doc.setFont('helvetica', 'bold').text(formatCurrency(statement.estadoFinanciero.saldoBancos), finalStateX + 5, startY, { align: 'left' });
        startY += 7;

        doc.setFont('helvetica', 'bold').text('(+) SALDO EN CAJA CHICA', finalStateX, startY, { align: 'right' });
        doc.setFont('helvetica', 'bold').text(formatCurrency(statement.cajaChica.saldoFinal), finalStateX + 5, startY, { align: 'left' });
        startY += 7;

        doc.setLineWidth(0.5);
        doc.line(finalStateX - 80, startY - 2, finalStateX + 40, startY - 2);

        doc.setFontSize(12).setFont('helvetica', 'bold');
        doc.setFillColor(230, 240, 255);
        doc.rect(finalStateX - 85, startY - 1, 125, 10, 'F');
        doc.text('DISPONIBILIDAD TOTAL', finalStateX, startY + 5, { align: 'right' });
        doc.text(formatCurrency(statement.estadoFinanciero.disponibilidadTotal), finalStateX + 5, startY + 5, { align: 'left' });

        doc.save(`Balance_Financiero_${statement.id}.pdf`);
    };

    // --- Side Effects ---
    useEffect(() => { loadData(); }, [loadData]);


    // --- Render ---
    if (dataLoading) {
        return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
    }

    if (!statement) {
        return <div className="text-center p-8">No se encontraron datos para el período seleccionado.</div>;
    }

    const { ingresos, egresos, cajaChica, estadoFinanciero, notas } = statement;

    return (
        <div className="max-w-6xl mx-auto pb-20 space-y-8 bg-slate-50/50 min-h-screen p-4 md:p-8 rounded-[3rem]">
            {/* Header with brand */}
            <header className="bg-[#1e293b] rounded-[2.5rem] p-6 md:p-10 text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="h-24 w-24 rounded-full border-4 border-amber-500 overflow-hidden bg-white flex-shrink-0 flex items-center justify-center shadow-inner">
                        {companyInfo?.logo ? <img src={companyInfo.logo} alt="logo" className="h-full w-full object-cover" /> : <Box className="h-12 w-12 text-slate-300" />}
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter uppercase italic">{companyInfo?.name}</h1>
                        <p className="text-slate-400 font-bold tracking-widest text-sm">RIF: {companyInfo?.rif}</p>
                    </div>
                </div>
                <div className="text-center md:text-right">
                    <div className="flex items-center justify-center md:justify-end gap-2 mb-1">
                        <span className="text-amber-500 font-black text-2xl tracking-tighter italic">EFAS</span><span className="text-white font-black text-2xl tracking-tighter italic">CONDOSYS</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Sistema de Autogestión de Condominios</p>
                </div>
                <div className="bg-white p-3 rounded-2xl shadow-lg border-2 border-slate-700">
                    <svg ref={barcodeRef}></svg>
                </div>
            </header>

            {/* Controls */}
            <div className="flex flex-wrap gap-4 px-4 items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 uppercase text-sm">Periodo:</span>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-[140px] rounded-xl font-bold bg-white border-none shadow-sm capitalize"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value} className="capitalize">{m.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="w-[100px] rounded-xl font-bold bg-white border-none shadow-sm"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    <Button variant="ghost" onClick={loadData} className="rounded-full hover:bg-amber-100 text-amber-600"><RefreshCw className={syncing ? 'animate-spin' : ''} /></Button>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleSaveStatement} variant="outline" disabled={syncing}><Save className="mr-2 h-4 w-4"/> Guardar en DB</Button>
                    <Button onClick={handleExportPDF} disabled={syncing}><Download className="mr-2 h-4 w-4" /> Exportar PDF</Button>
                </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-2">
                <Card className="rounded-[2.5rem] border-2 border-emerald-500/20 shadow-xl overflow-hidden group"><div className="bg-emerald-500/5 p-8 text-center group-hover:bg-emerald-500/10 transition-colors"><p className="text-emerald-600 font-black uppercase tracking-widest text-sm mb-2">Total Ingresos</p><p className="text-5xl font-black text-emerald-700 tracking-tighter">{formatCurrency(estadoFinanciero.totalIngresos)}</p></div></Card>
                <Card className="rounded-[2.5rem] border-2 border-rose-500/20 shadow-xl overflow-hidden group"><div className="bg-rose-500/5 p-8 text-center group-hover:bg-rose-500/10 transition-colors"><p className="text-rose-600 font-black uppercase tracking-widest text-sm mb-2">Total Egresos</p><p className="text-5xl font-black text-rose-700 tracking-tighter">{formatCurrency(estadoFinanciero.totalEgresos)}</p></div></Card>
            </div>

            {/* Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">
                <Card className="rounded-[2.5rem] bg-white border-none shadow-xl overflow-hidden">
                    <CardHeader className="bg-slate-100/50 border-b"><CardTitle className="text-lg text-primary">Ingresos del Mes</CardTitle></CardHeader>
                    <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Día</TableHead><TableHead>Concepto</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader><TableBody>{ingresos.map((i, idx) => (<TableRow key={idx}><TableCell className="font-bold">{i.dia}</TableCell><TableCell>{i.concepto}</TableCell><TableCell className="text-right font-bold">{formatCurrency(i.monto)}</TableCell></TableRow>))}</TableBody></Table></CardContent>
                </Card>
                <Card className="rounded-[2.5rem] bg-white border-none shadow-xl overflow-hidden">
                    <CardHeader className="bg-slate-100/50 border-b"><CardTitle className="text-lg text-destructive">Egresos del Mes</CardTitle></CardHeader>
                    <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Día</TableHead><TableHead>Concepto</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader><TableBody>{egresos.map(e => (<TableRow key={e.id}><TableCell className="font-bold">{e.dia}</TableCell><TableCell>{e.concepto}</TableCell><TableCell className="text-right font-bold">{formatCurrency(e.monto)}</TableCell></TableRow>))}</TableBody></Table></CardContent>
                </Card>
            </div>

            {/* Final State */}
            <Card className="rounded-[3rem] border-4 border-amber-500 bg-white shadow-2xl overflow-hidden">
                <CardContent className="p-0">
                    <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-center border-b-2 border-slate-100">
                        <div className="md:col-span-2 space-y-2">
                            <Label className="text-xs font-black uppercase text-slate-400">Estado de Cuenta Final</Label>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <span className="font-bold text-slate-500">Saldo Mes Anterior:</span><span className="font-mono text-right">{formatCurrency(estadoFinanciero.saldoAnterior)}</span>
                                <span className="font-bold text-slate-500">(+) Ingresos:</span><span className="font-mono text-right text-emerald-600">{formatCurrency(estadoFinanciero.totalIngresos)}</span>
                                <span className="font-bold text-slate-500">(-) Egresos:</span><span className="font-mono text-right text-rose-600">{formatCurrency(estadoFinanciero.totalEgresos)}</span>
                                <Separator className="col-span-2 my-1" />
                                <span className="font-black text-slate-800">SALDO EN BANCOS:</span><span className="font-black text-slate-800 text-right">{formatCurrency(estadoFinanciero.saldoBancos)}</span>
                                <span className="font-black text-slate-800">(+) SALDO CAJA CHICA:</span><span className="font-black text-slate-800 text-right">{formatCurrency(cajaChica.saldoFinal)}</span>
                            </div>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl flex flex-col justify-center text-center">
                            <span className="font-black uppercase text-slate-500 text-sm">Disponibilidad Real</span>
                            <span className="text-4xl font-black text-slate-800 tracking-tighter">{formatCurrency(estadoFinanciero.disponibilidadTotal)} Bs.</span>
                        </div>
                    </div>
                    <div className="p-8 bg-slate-50">
                        <Label className="text-xs font-black uppercase text-slate-400">Observaciones</Label>
                        <Textarea placeholder="Observaciones de este balance..." value={notas} onChange={e => setStatement(s => s ? {...s, notas: e.target.value} : null)} className="flex-1 rounded-2xl border-none shadow-inner bg-white min-h-[100px] p-4 font-medium mt-2"/>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

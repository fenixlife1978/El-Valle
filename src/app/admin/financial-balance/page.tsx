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

// Librerías instaladas
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

// --- Type Definitions ---
interface IncomeItem {
    concepto: string;
    estimado: number;
    real: number;
}

interface ExpenseItem {
    id: string;
    categoria: string;
    descripcion: string;
    pago: string;
    monto: number;
    fecha: string;
}

interface PettyCashSummary {
    saldoInicial: number;
    reposiciones: number;
    gastos: number;
    saldoFinal: number;
}

interface FinalStatement {
    saldoAnterior: number;
    totalIngresos: number;
    totalEgresos: number;
    saldoBancos: number;
    saldoCajaChica: number;
    disponibilidadTotal: number;
}

interface FinancialStatementDoc {
    id: string;
    ingresos: IncomeItem[];
    egresos: ExpenseItem[];
    cajaChica: PettyCashSummary;
    estadoFinal: FinalStatement;
    notas: string;
    fechaCierre?: Timestamp;
    companyInfo?: any;
}

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function FinancialBalancePage() {
    const { toast } = useToast();
    const { activeCondoId, companyInfo, loading: authLoading } = useAuth();
    
    const [dataLoading, setDataLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [ingresos, setIngresos] = useState<IncomeItem[]>([
        { concepto: 'Ingresos x Cuotas de Condominio', estimado: 0, real: 0 },
        { concepto: 'Ingresos Extraordinarios', estimado: 0, real: 0 },
    ]);
    const [egresos, setEgresos] = useState<ExpenseItem[]>([]);
    const [cajaChica, setCajaChica] = useState<PettyCashSummary>({ saldoInicial: 0, reposiciones: 0, gastos: 0, saldoFinal: 0 });
    const [estadoFinal, setEstadoFinal] = useState<FinalStatement>({ 
        saldoAnterior: 0, totalIngresos: 0, totalEgresos: 0, saldoBancos: 0, saldoCajaChica: 0, disponibilidadTotal: 0 
    });
    const [notas, setNotas] = useState('');

    const handleSyncData = useCallback(async (showToast = true) => {
        // CORRECCIÓN: Si no hay ID de condominio, no podemos consultar
        if (!activeCondoId) {
            setDataLoading(false);
            return;
        }

        setSyncing(true);
        if (showToast) toast({ title: "Sincronizando...", description: "Extrayendo movimientos detallados." });

        try {
            const currentPeriodStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const currentPeriodEnd = endOfMonth(currentPeriodStart);
            
            const prevPeriodDate = subMonths(currentPeriodStart, 1);
            const prevPeriodId = format(prevPeriodDate, 'yyyy-MM');
            const prevSnap = await getDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', prevPeriodId));
            const saldoAnterior = prevSnap.exists() ? (prevSnap.data() as FinancialStatementDoc).estadoFinal.disponibilidadTotal : 0;

            // CORRECCIÓN: Uso de Timestamp para mayor fiabilidad en la consulta
            const paymentsSnap = await getDocs(query(
                collection(db, 'condominios', activeCondoId, 'payments'),
                where('status', '==', 'aprobado'),
                where('paymentDate', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('paymentDate', '<=', Timestamp.fromDate(currentPeriodEnd))
            ));
            const totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
            setIngresos(prev => prev.map(item => item.concepto.includes('Condominio') ? { ...item, real: totalPayments } : item));

            const expensesSnap = await getDocs(query(
                collection(db, 'condominios', activeCondoId, 'gastos'),
                where('date', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('date', '<=', Timestamp.fromDate(currentPeriodEnd)),
                orderBy('date', 'asc')
            ));
            
            const detailedEgresos = expensesSnap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    categoria: data.category || 'General',
                    descripcion: data.description || 'Sin descripción',
                    pago: data.paymentMethod || 'Transferencia',
                    monto: data.amount || 0,
                    fecha: format(data.date.toDate(), 'dd/MM/yyyy')
                };
            }).filter(e => e.categoria !== 'Caja Chica');
            setEgresos(detailedEgresos);

            const ccSnap = await getDocs(collection(db, 'condominios', activeCondoId, 'cajaChica_movimientos'));
            const ccMovements = ccSnap.docs.map(d => ({
                amount: d.data().amount || 0,
                type: d.data().type as 'ingreso' | 'egreso',
                date: d.data().date.toDate()
            }));

            const ccSaldoIni = ccMovements.filter(m => m.date < currentPeriodStart).reduce((acc, m) => m.type === 'ingreso' ? acc + m.amount : acc - m.amount, 0);
            const ccRepos = ccMovements.filter(m => m.date >= currentPeriodStart && m.date <= currentPeriodEnd && m.type === 'ingreso').reduce((s, m) => s + m.amount, 0);
            const ccGastos = ccMovements.filter(m => m.date >= currentPeriodStart && m.date <= currentPeriodEnd && m.type === 'egreso').reduce((s, m) => s + m.amount, 0);
            
            setCajaChica({ saldoInicial: ccSaldoIni, reposiciones: ccRepos, gastos: ccGastos, saldoFinal: ccSaldoIni + ccRepos - ccGastos });
            setEstadoFinal(prev => ({ ...prev, saldoAnterior }));

            if (showToast) toast({ title: "Datos actualizados" });
        } catch (error) {
            console.error("Error al sincronizar EFAS:", error);
            toast({ variant: "destructive", title: "Error de carga", description: "Verifique la conexión a la base de datos." });
        } finally {
            setSyncing(false);
            setDataLoading(false);
        }
    }, [activeCondoId, selectedMonth, selectedYear, toast]);

    useEffect(() => {
        if (!authLoading) {
            if (activeCondoId) {
                handleSyncData(false);
            } else {
                setDataLoading(false);
            }
        }
    }, [activeCondoId, authLoading, handleSyncData]);

    useEffect(() => {
        const totalI = ingresos.reduce((s, i) => s + i.real, 0);
        const totalE = egresos.reduce((s, e) => s + e.monto, 0) + cajaChica.reposiciones;
        const saldoB = estadoFinal.saldoAnterior + totalI - totalE;
        setEstadoFinal(prev => ({
            ...prev,
            totalIngresos: totalI,
            totalEgresos: totalE,
            saldoBancos: saldoB,
            saldoCajaChica: cajaChica.saldoFinal,
            disponibilidadTotal: saldoB + cajaChica.saldoFinal
        }));
    }, [ingresos, egresos, cajaChica, estadoFinal.saldoAnterior]);

    const generatePDF = () => {
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const periodId = `${selectedYear}-${selectedMonth}`;

        docPDF.setFillColor(0, 129, 201);
        docPDF.rect(0, 0, pageWidth, 40, 'F');

        if (companyInfo?.logo) {
            try { docPDF.addImage(companyInfo.logo, 'PNG', 14, 5, 20, 20); } catch (e) {}
        }
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(14).setFont('helvetica', 'bold').text(companyInfo?.name || "CONDOMINIO", 14, 30);
        docPDF.setFontSize(9).setFont('helvetica', 'normal').text(`RIF: ${companyInfo?.rif || "N/A"}`, 14, 35);

        docPDF.setFontSize(16).text("EFAS CondoSys", pageWidth - 14, 20, { align: 'right' });
        docPDF.setFontSize(8).text("SISTEMA DE GESTIÓN FINANCIERA", pageWidth - 14, 25, { align: 'right' });

        const titleY = 55;
        docPDF.setTextColor(40, 40, 40);
        docPDF.setFontSize(18).setFont('helvetica', 'bold').text('ESTADO DE RESULTADOS', 14, titleY);
        
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, `BAL-${activeCondoId?.slice(0,4)}-${periodId}`, { 
            format: "CODE128", 
            height: 40, 
            displayValue: true,
            fontSize: 12
        });
        docPDF.addImage(canvas.toDataURL('image/png'), 'PNG', pageWidth - 70, titleY - 12, 55, 18);

        docPDF.setFontSize(11).setFont('helvetica', 'italic').text(`PERÍODO: ${months[parseInt(selectedMonth)-1].label} ${selectedYear}`.toUpperCase(), 14, titleY + 10);

        autoTable(docPDF, {
            head: [['CONCEPTO DE INGRESO', 'ESTIMADO', 'REAL', 'DIFERENCIA']],
            body: ingresos.map(i => [i.concepto.toUpperCase(), formatCurrency(i.estimado), formatCurrency(i.real), formatCurrency(i.real - i.estimado)]),
            startY: titleY + 20,
            headStyles: { fillColor: [34, 197, 94] },
        });

        autoTable(docPDF, {
            head: [['FECHA', 'CATEGORÍA', 'DESCRIPCIÓN', 'MONTO (Bs.)']],
            body: egresos.map(e => [e.fecha, e.categoria.toUpperCase(), e.descripcion.toUpperCase(), formatCurrency(e.monto)]),
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            headStyles: { fillColor: [239, 68, 68] },
        });

        const finalY = (docPDF as any).lastAutoTable.finalY + 15;
        docPDF.setFontSize(12).setFont('helvetica', 'bold').text("ESTADO DE CUENTA FINAL", 14, finalY);
        docPDF.setFontSize(10).setFont('helvetica', 'normal');
        docPDF.text(`Saldo Anterior Bancos: Bs. ${formatCurrency(estadoFinal.saldoAnterior)}`, 14, finalY + 10);
        docPDF.text(`(+) Total Ingresos: Bs. ${formatCurrency(estadoFinal.totalIngresos)}`, 14, finalY + 17);
        docPDF.text(`(-) Total Gastos/Reposiciones: Bs. ${formatCurrency(estadoFinal.totalEgresos)}`, 14, finalY + 24);
        
        docPDF.setFillColor(240, 240, 240);
        docPDF.roundedRect(14, finalY + 30, pageWidth - 28, 15, 2, 2, 'F');
        docPDF.setFontSize(13).setFont('helvetica', 'bold').text(`DISPONIBILIDAD TOTAL: Bs. ${formatCurrency(estadoFinal.disponibilidadTotal)}`, pageWidth / 2, finalY + 40, { align: 'center' });

        docPDF.save(`Balance_${periodId}.pdf`);
    };

    if (authLoading || dataLoading) {
        return (
            <div className="flex flex-col h-[80vh] items-center justify-center gap-4">
                <Loader2 className="animate-spin text-blue-600 h-16 w-16" />
                <p className="text-slate-500 font-medium text-center">
                    Sincronizando registros financieros... <br/>
                    <span className="text-xs text-slate-400 uppercase">Condominio: {activeCondoId || "Esperando selección..."}</span>
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 max-w-7xl mx-auto">
            <header className="flex justify-between items-end border-b pb-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase italic">
                        Balance <span className="text-blue-600">Financiero</span>
                    </h2>
                    <p className="text-slate-500 font-bold text-sm uppercase">{companyInfo?.name || "Cargando Condominio..."}</p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={() => handleSyncData(true)} variant="outline" disabled={syncing}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${syncing && 'animate-spin'}`} /> Actualizar Datos
                    </Button>
                    <Button onClick={generatePDF} className="bg-blue-600 hover:bg-blue-700">
                        <Download className="mr-2 h-4 w-4" /> Generar Reporte
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="md:col-span-1 border-blue-200">
                    <CardHeader className="text-xs font-bold uppercase text-slate-400">Ejercicio Fiscal</CardHeader>
                    <CardContent className="space-y-4">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                <Card className="md:col-span-3 bg-slate-900 text-white shadow-xl">
                    <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                            <p className="text-slate-400 text-xs uppercase font-bold">Ingresos Totales</p>
                            <p className="text-2xl font-bold text-green-400">{formatCurrency(estadoFinal.totalIngresos)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-slate-400 text-xs uppercase font-bold">Egresos Totales</p>
                            <p className="text-2xl font-bold text-red-400">{formatCurrency(estadoFinal.totalEgresos)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-blue-400 text-xs uppercase font-black">Disponibilidad Total</p>
                            <p className="text-3xl font-black">Bs. {formatCurrency(estadoFinal.disponibilidadTotal)}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="shadow-sm">
                    <CardHeader className="bg-green-50/50 py-3"><CardTitle className="text-sm flex items-center gap-2 text-green-700"><TrendingUp className="h-4 w-4"/>RESUMEN DE INGRESOS</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {ingresos.map((item, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="text-sm font-medium">{item.concepto}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-green-600">{formatCurrency(item.real)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="bg-red-50/50 py-3"><CardTitle className="text-sm flex items-center gap-2 text-red-700"><TrendingDown className="h-4 w-4"/>DETALLE DE EGRESOS</CardTitle></CardHeader>
                    <CardContent className="max-h-[400px] overflow-auto">
                        <Table>
                            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {egresos.length > 0 ? egresos.map((e) => (
                                    <TableRow key={e.id}>
                                        <TableCell className="text-[10px] text-slate-500">{e.fecha}</TableCell>
                                        <TableCell className="text-xs uppercase font-medium">{e.descripcion}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-red-600">{formatCurrency(e.monto)}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-6 text-slate-400 italic">No hay gastos en este período</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-2 border-blue-100 shadow-md">
                <CardHeader className="py-3 bg-slate-50/50"><CardTitle className="text-sm uppercase font-bold text-slate-600">Ajustes y Observaciones</CardTitle></CardHeader>
                <CardContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        <div className="space-y-2">
                             <Label className="text-xs text-slate-500 uppercase font-bold">Saldo Inicial de Bancos (Ajuste Manual)</Label>
                             <Input 
                                type="number" 
                                value={estadoFinal.saldoAnterior} 
                                onChange={(e) => setEstadoFinal(prev => ({...prev, saldoAnterior: parseFloat(e.target.value) || 0}))}
                                className="font-bold text-blue-600 border-blue-200"
                             />
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex justify-between items-center">
                             <span className="text-xs text-slate-500 uppercase font-bold">Estado Caja Chica:</span>
                             <span className="text-xl font-black text-slate-700">{formatCurrency(cajaChica.saldoFinal)}</span>
                        </div>
                    </div>
                    <Textarea 
                        placeholder="Escriba notas importantes para la asamblea de copropietarios..." 
                        value={notas} 
                        onChange={e => setNotas(e.target.value)}
                        className="min-h-[100px]"
                    />
                </CardContent>
                <CardFooter className="bg-slate-50 flex justify-end py-4 gap-3">
                    <Button onClick={async () => {
                        if(!activeCondoId) return;
                        setDataLoading(true);
                        const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                        try {
                            await setDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', periodId), {
                                id: periodId, ingresos, egresos, cajaChica, estadoFinal, notas, fechaCierre: Timestamp.now()
                            });
                            toast({ title: "Cierre de Mes Exitoso", description: `El balance de ${periodId} ha sido guardado.` });
                        } catch (e) {
                            toast({ variant: "destructive", title: "Error al guardar" });
                        } finally {
                            setDataLoading(false);
                        }
                    }} disabled={dataLoading} className="bg-green-600 hover:bg-green-700">
                        <FileText className="mr-2 h-4 w-4" /> Guardar Balance Final
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

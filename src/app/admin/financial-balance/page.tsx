
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, orderBy, onSnapshot, addDoc, 
    deleteDoc, doc, updateDoc, Timestamp, getDoc, where, getDocs, writeBatch, setDoc
} from 'firebase/firestore';
import { 
    Trash2, Eye, EyeOff, History, Download, Loader2, FileText, FilePlus, Info, 
    RefreshCw, Edit, DollarSign, TrendingUp, TrendingDown, Wallet, Scale 
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
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
    categoria?: string; // Add this for PDF generation if needed
    dia?: string; // Add this
    monto?: number; // Add this
}

interface ExpenseItem {
    categoria: string;
    descripcion: string;
    pago: string;
    monto: number;
    dia?: string; // Add this
    concepto?: string; // Add this
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

// --- Helper ---
const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// --- Main Component ---
export default function FinancialBalancePage() {
    const { user, activeCondoId, companyInfo } = useAuth();
    const { toast } = useToast();

    // State
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [ingresos, setIngresos] = useState<IncomeItem[]>([
        { concepto: 'Ingresos x Cuotas de Condominio', estimado: 0, real: 0 },
        { concepto: 'Ingresos Extraordinarios', estimado: 0, real: 0 },
    ]);
    const [egresos, setEgresos] = useState<ExpenseItem[]>([]);
    const [cajaChica, setCajaChica] = useState<PettyCashSummary>({ saldoInicial: 0, reposiciones: 0, gastos: 0, saldoFinal: 0 });
    const [estadoFinal, setEstadoFinal] = useState<FinalStatement>({ saldoAnterior: 0, totalIngresos: 0, totalEgresos: 0, saldoBancos: 0, saldoCajaChica: 0, disponibilidadTotal: 0 });
    const [notas, setNotas] = useState('');
    
    const handleIncomeChange = (index: number, value: string) => {
        const newIngresos = [...ingresos];
        newIngresos[index].real = parseFloat(value) || 0;
        setIngresos(newIngresos);
    };

    const handleSyncData = useCallback(async (showToast = true) => {
        if (!activeCondoId) return;
        setSyncing(true);
        if(showToast) toast({ title: "Sincronizando...", description: "Cargando datos del período." });

        try {
            const currentPeriodStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const currentPeriodEnd = endOfMonth(currentPeriodStart);
            
            const prevPeriodDate = subMonths(currentPeriodStart, 1);
            const prevPeriodId = format(prevPeriodDate, 'yyyy-MM');
            const prevStatementSnap = await getDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', prevPeriodId));
            const saldoAnterior = prevStatementSnap.exists() ? (prevStatementSnap.data() as FinancialStatementDoc).estadoFinal.disponibilidadTotal : 0;
            
            // 1. Sincronizar Pagos (Ingresos)
            const paymentsQuery = query(collection(db, 'condominios', activeCondoId, 'payments'), 
                where('status', '==', 'aprobado'), 
                where('paymentDate', '>=', currentPeriodStart), 
                where('paymentDate', '<=', currentPeriodEnd)
            );
            const paymentsSnap = await getDocs(paymentsQuery);
            const totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
            
            setIngresos(prev => prev.map(item => item.concepto === 'Ingresos x Cuotas de Condominio' ? {...item, real: totalPayments} : item));

            // 2. Sincronizar Gastos (Egresos)
            const expensesQuery = query(collection(db, 'condominios', activeCondoId, 'gastos'),
                where('date', '>=', currentPeriodStart),
                where('date', '<=', currentPeriodEnd)
            );
            const expensesSnap = await getDocs(expensesQuery);
            const syncedEgresos = expensesSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    categoria: data.category,
                    descripcion: data.description,
                    pago: 'Transferencia',
                    monto: data.amount,
                    dia: format(data.date.toDate(), 'dd/MM/yyyy'),
                    concepto: data.description,
                };
            });
            setEgresos(syncedEgresos);
            
            // 3. Sincronizar Caja Chica (CON CORRECCIÓN DE TIPOS)
            const allMovementsSnap = await getDocs(query(collection(db, 'condominios', activeCondoId, 'cajaChica_movimientos')));
            
            const movements = allMovementsSnap.docs.map(d => {
                const data = d.data();
                return {
                    amount: data.amount || 0,
                    type: data.type as 'ingreso' | 'egreso',
                    date: data.date.toDate() as Date
                };
            });
            
            const saldoInicialCaja = movements
                .filter(m => m.date < currentPeriodStart)
                .reduce((acc, m) => m.type === 'ingreso' ? acc + m.amount : acc - m.amount, 0);
            
            const reposiciones = movements
                .filter(m => m.date >= currentPeriodStart && m.date <= currentPeriodEnd && m.type === 'ingreso')
                .reduce((sum, m) => sum + m.amount, 0);
            
            const gastos = movements
                .filter(m => m.date >= currentPeriodStart && m.date <= currentPeriodEnd && m.type === 'egreso')
                .reduce((sum, m) => sum + m.amount, 0);
            
            const saldoFinalCaja = saldoInicialCaja + reposiciones - gastos;

            setCajaChica({ saldoInicial: saldoInicialCaja, reposiciones, gastos, saldoFinal: saldoFinalCaja });
            setEstadoFinal(prev => ({ ...prev, saldoAnterior, saldoCajaChica: saldoFinalCaja }));

            if(showToast) toast({ title: "Sincronización Completa" });
        } catch (error) {
            console.error("Error en sincronización:", error);
            if(showToast) toast({ variant: "destructive", title: "Error al Sincronizar", description: "Verifique la consola para más detalles." });
        } finally {
            setSyncing(false);
        }
    }, [selectedYear, selectedMonth, activeCondoId, toast]);

    useEffect(() => {
        if(activeCondoId) {
            setLoading(true);
            handleSyncData(false).finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [selectedMonth, selectedYear, activeCondoId, handleSyncData]);
    
    useEffect(() => {
        const totalIngresos = ingresos.reduce((sum, item) => sum + item.real, 0);
        const totalEgresos = egresos.reduce((sum, item) => sum + item.monto, 0);
        const saldoBancos = estadoFinal.saldoAnterior + totalIngresos - totalEgresos;
        const disponibilidadTotal = saldoBancos + cajaChica.saldoFinal;

        setEstadoFinal(prev => ({
            ...prev,
            totalIngresos,
            totalEgresos,
            saldoBancos,
            disponibilidadTotal
        }));
    }, [ingresos, egresos, cajaChica.saldoFinal, estadoFinal.saldoAnterior]);

    const handleSaveStatement = async () => {
        if (!activeCondoId) return;
        setLoading(true);
        const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
        
        // Ensure ingresos has all needed fields for PDF
        const finalIngresos = ingresos.map(i => ({
            ...i,
            dia: format(new Date(), 'dd/MM/yyyy'),
            categoria: 'Ingresos',
            monto: i.real
        }));

        const statementData: FinancialStatementDoc = {
            id: periodId, 
            ingresos: finalIngresos, 
            egresos, 
            cajaChica, 
            estadoFinal, 
            notas,
            fechaCierre: Timestamp.now(), 
            companyInfo,
        };
        try {
            await setDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', periodId), statementData);
            toast({ title: "Balance Guardado", description: "El cierre del período se ha guardado exitosamente." });
        } catch(e) {
            toast({ variant: "destructive", title: "Error al guardar." });
        } finally {
            setLoading(false);
        }
    };
    
    const generatePDF = async () => {
        const info = companyInfo || {
            name: "EFAS CondoSys", rif: "J-00000000-0", address: "Administración", phone: "Soporte", logo: ""
        };

        const docPDF = new jsPDF();
        const pageWidth = (docPDF as any).internal.pageSize.getWidth();
        const margin = 14;

        docPDF.setFillColor(0, 129, 201);
        docPDF.rect(0, 0, pageWidth, 40, 'F');
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(22).setFont('helvetica', 'bold').text("EFAS CondoSys", margin, 20);
        docPDF.setFontSize(10).setFont('helvetica', 'normal').text("SISTEMA DE GESTIÓN FINANCIERA", margin, 28);
        docPDF.setFontSize(9);
        docPDF.text(info.name, pageWidth - margin, 15, { align: 'right' });
        docPDF.text(info.rif, pageWidth - margin, 20, { align: 'right' });
        docPDF.text(info.address, pageWidth - margin, 25, { align: 'right' });
        docPDF.text(`Tel: ${info.phone}`, pageWidth - margin, 30, { align: 'right' });

        docPDF.setTextColor(40, 40, 40);
        const monthLabel = months.find(m => m.value === selectedMonth)?.label || '';
        const periodText = `${monthLabel} ${selectedYear}`.toUpperCase();

        docPDF.setFontSize(18).setFont('helvetica', 'bold').text('ESTADO DE RESULTADOS', pageWidth / 2, 55, { align: 'center' });
        docPDF.setFontSize(12).setFont('helvetica', 'italic').text(`PERÍODO: ${periodText}`, pageWidth / 2, 63, { align: 'center' });

        try {
            if (activeCondoId) {
                const qrCodeUrl = await QRCode.toDataURL(`https://efas-condosys.com/verify/balance/${activeCondoId}/${selectedYear}-${selectedMonth}`);
                docPDF.addImage(qrCodeUrl, 'PNG', pageWidth - margin - 25, 45, 25, 25);
                docPDF.setFontSize(7).text("VALIDACIÓN DIGITAL", pageWidth - margin - 12.5, 72, { align: 'center' });
            }
        } catch (e) { console.error("QR Error", e); }

        let startY = 80;

        autoTable(docPDF, {
            head: [['CONCEPTO DE INGRESO', 'MONTO ESTIMADO', 'MONTO REAL', 'DIFERENCIA']],
            body: ingresos.map(i => [i.concepto.toUpperCase(), formatCurrency(i.estimado), formatCurrency(i.real), formatCurrency(i.real - i.estimado)]),
            startY,
            theme: 'striped',
            headStyles: { fillColor: [34, 197, 94], fontStyle: 'bold' },
            foot: [[ { content: 'TOTAL INGRESOS', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(estadoFinal.totalIngresos), styles: { halign: 'right', fontStyle: 'bold' } }, '']],
        });
        startY = (docPDF as any).lastAutoTable.finalY + 10;
        
        autoTable(docPDF, {
            head: [['CATEGORÍA', 'DESCRIPCIÓN', 'FORMA DE PAGO', 'MONTO (Bs.)']],
            body: egresos.map(e => [e.categoria, e.descripcion.toUpperCase(), e.pago, { content: formatCurrency(e.monto), styles: { halign: 'right' } }]),
            startY,
            theme: 'striped',
            headStyles: { fillColor: [239, 68, 68], fontStyle: 'bold' },
            foot: [[ { content: 'TOTAL GASTOS OPERATIVOS', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(estadoFinal.totalEgresos), styles: { halign: 'right', fontStyle: 'bold' } }]],
        });
        startY = (docPDF as any).lastAutoTable.finalY + 15;

        const summaryData = [
            { label: 'Saldo Inicial de Caja Chica', value: formatCurrency(cajaChica.saldoInicial) },
            { label: 'Reposiciones del Mes', value: formatCurrency(cajaChica.reposiciones) },
            { label: 'Gastos Efectuados', value: formatCurrency(cajaChica.gastos) },
            { label: 'Saldo Actual en Caja Chica', value: formatCurrency(cajaChica.saldoFinal), bold: true },
        ];
        docPDF.setFontSize(11).setFont('helvetica', 'bold').text("3. Control de Caja Chica", margin, startY);
        startY += 8;
        summaryData.forEach(item => {
            docPDF.setFontSize(10).setFont('helvetica', item.bold ? 'bold' : 'normal').text(item.label, margin + 5, startY);
            docPDF.text(item.value, pageWidth / 2, startY, { align: 'right' });
            startY += 6;
        });
        startY += 5;
        
        const finalStatementData = [
            { label: 'Saldo Inicial (Mes Anterior)', value: formatCurrency(estadoFinal.saldoAnterior) },
            { label: '(+) Total Ingresos del Mes', value: formatCurrency(estadoFinal.totalIngresos), color: [34,197,94] },
            { label: '(-) Total Gastos del Mes', value: formatCurrency(estadoFinal.totalEgresos), color: [239,68,68] },
            { label: 'Saldo Total en Bancos', value: formatCurrency(estadoFinal.saldoBancos), bold: true },
            { label: 'Saldo en Caja Chica (Efectivo)', value: formatCurrency(cajaChica.saldoFinal) },
            { label: 'DISPONIBILIDAD TOTAL', value: `Bs. ${formatCurrency(estadoFinal.disponibilidadTotal)}`, bold: true, highlight: true },
        ];
        docPDF.setFontSize(11).setFont('helvetica', 'bold').text("4. Estado de Cuenta Final", margin, startY);
        startY += 8;
        finalStatementData.forEach(item => {
            if(item.highlight) {
                docPDF.setFillColor(245, 245, 245);
                docPDF.roundedRect(margin, startY - 4, pageWidth - (margin * 2), 9, 3, 3, 'F');
            }
            if(item.color) {
                const [r, g, b] = item.color;
                docPDF.setTextColor(r, g, b);
            }
            docPDF.setFontSize(10).setFont('helvetica', item.bold ? 'bold' : 'normal').text(item.label, margin + 5, startY);
            docPDF.text(item.value, pageWidth - margin - 5, startY, { align: 'right' });
            docPDF.setTextColor(0,0,0);
            startY += 7;
        });

        if (notas) {
            startY += 5;
            docPDF.setFontSize(9).setTextColor(100, 100, 100).setFont('helvetica', 'italic');
            docPDF.text("OBSERVACIONES:", margin, startY);
            docPDF.setFontSize(9).text(notas, margin, startY + 5, { maxWidth: pageWidth - (margin * 2) });
        }

        docPDF.setFontSize(8).setTextColor(150, 150, 150);
        docPDF.text(`EFAS CondoSys - Reporte Generado Automáticamente - ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 285, { align: 'center' });
        
        docPDF.save(`Balance_EFAS_${selectedYear}-${selectedMonth}.pdf`);
    };

    if (loading && !syncing) return <div className="flex h-[80vh] items-center justify-center"><Loader2 className="animate-spin text-blue-500 h-12 w-12" /></div>;

    return (
        <div className="space-y-6 pb-20">
             <header className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                    Balance <span className="text-blue-600">Financiero Mensual</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full" />
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">{companyInfo?.name}</p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Período de Ejercicio Fiscal</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    <div className="col-span-2 flex gap-2">
                        <Button onClick={() => handleSyncData(true)} className="w-full" disabled={syncing}>
                            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>} Cargar y Sincronizar Datos
                        </Button>
                         <Button onClick={generatePDF} variant="outline" className="w-full">
                            <Download className="mr-2 h-4 w-4" /> Exportar a PDF
                        </Button>
                    </div>
                </CardContent>
            </Card>
            
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="text-green-500"/>1. Resumen de Ingresos (Entradas)</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Monto Real</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {ingresos.map((item, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{item.concepto}</TableCell>
                                        <TableCell className="text-right">
                                             <Input type="number" value={item.real} onChange={e => handleIncomeChange(index, e.target.value)} className="text-right bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter><TableRow><TableCell className="text-right font-bold">Total Ingresos del Mes</TableCell><TableCell className="text-right font-bold">{formatCurrency(estadoFinal.totalIngresos)}</TableCell></TableRow></TableFooter>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><TrendingDown className="text-red-500"/>2. Detalle de Gastos (Salidas)</CardTitle></CardHeader>
                    <CardContent>
                         <Table>
                            <TableHeader><TableRow><TableHead>Categoría</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {egresos.map((item, index) => (
                                    <TableRow key={index}><TableCell>{item.categoria}</TableCell><TableCell>{item.descripcion}</TableCell><TableCell className="text-right">{formatCurrency(item.monto)}</TableCell></TableRow>
                                ))}
                                {egresos.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No hay gastos sincronizados.</TableCell></TableRow>}
                            </TableBody>
                             <TableFooter><TableRow><TableCell colSpan={2} className="text-right font-bold">Total Gastos Operativos</TableCell><TableCell className="text-right font-bold">{formatCurrency(estadoFinal.totalEgresos)}</TableCell></TableRow></TableFooter>
                        </Table>
                    </CardContent>
                </Card>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="text-amber-500"/>3. Control de Caja Chica</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between p-2 rounded-md"><span className="text-muted-foreground">Saldo Inicial de Caja Chica:</span> <span className="font-semibold">{formatCurrency(cajaChica.saldoInicial)}</span></div>
                        <div className="flex justify-between p-2 rounded-md"><span className="text-muted-foreground">Reposiciones del Mes:</span> <span className="font-semibold text-green-600">{formatCurrency(cajaChica.reposiciones)}</span></div>
                        <div className="flex justify-between p-2 rounded-md"><span className="text-muted-foreground">Gastos Efectuados:</span> <span className="font-semibold text-red-600">{formatCurrency(cajaChica.gastos)}</span></div>
                        <hr className="my-2"/>
                        <div className="flex justify-between p-2 rounded-md bg-muted font-bold text-base"><span className="">Saldo Actual en Caja Chica:</span> <span>{formatCurrency(cajaChica.saldoFinal)}</span></div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Scale className="text-blue-500"/>4. Estado de Cuenta Final</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between p-2 rounded-md"><span className="text-muted-foreground">Saldo Inicial (Mes Anterior):</span> <span className="font-semibold">{formatCurrency(estadoFinal.saldoAnterior)}</span></div>
                        <div className="flex justify-between p-2 rounded-md"><span className="text-muted-foreground">(+) Total Ingresos del Mes:</span> <span className="font-semibold text-green-600">{formatCurrency(estadoFinal.totalIngresos)}</span></div>
                        <div className="flex justify-between p-2 rounded-md"><span className="text-muted-foreground">(-) Total Gastos del Mes:</span> <span className="font-semibold text-red-600">{formatCurrency(estadoFinal.totalEgresos)}</span></div>
                        <div className="flex justify-between p-2 rounded-md font-bold text-base"><span className="">Saldo Total en Bancos:</span> <span>{formatCurrency(estadoFinal.saldoBancos)}</span></div>
                        <div className="flex justify-between p-2 rounded-md font-bold text-base"><span className="">Saldo en Caja Chica (Efectivo):</span> <span>{formatCurrency(cajaChica.saldoFinal)}</span></div>
                         <hr className="my-2"/>
                        <div className="flex justify-between p-3 rounded-md bg-blue-500 text-white font-black text-lg"><span className="">DISPONIBILIDAD TOTAL:</span> <span>{formatCurrency(estadoFinal.disponibilidadTotal)}</span></div>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader><CardTitle>5. Notas y Observaciones del Período</CardTitle></CardHeader>
                <CardContent>
                    <Textarea placeholder="Añada cualquier nota aclaratoria o información relevante sobre este cierre de mes..." value={notas} onChange={e => setNotas(e.target.value)} rows={4}/>
                </CardContent>
                <CardFooter className="justify-end">
                    <Button onClick={handleSaveStatement} disabled={loading} size="lg">
                        {loading ? <Loader2 className="animate-spin mr-2"/> : <FileText className="mr-2"/>}
                        Guardar Cierre Mensual Definitivo
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

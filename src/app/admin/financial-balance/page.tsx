"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, orderBy, doc, Timestamp, getDoc, where, getDocs, setDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
    Download, Loader2, RefreshCw, TrendingUp, TrendingDown, Wallet, Box, Save, FileText 
} from 'lucide-react';
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
    category?: string;
};

type CajaChicaMovement = {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    type: 'ingreso' | 'egreso';
}

const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

export default function FinancialBalancePage() {
    const { toast } = useToast();
    const { activeCondoId, workingCondoId, loading: authLoading } = useAuth();
    const currentCondoId = activeCondoId || workingCondoId;

    const [dataLoading, setDataLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [companyInfo, setCompanyInfo] = useState({ name: "RESIDENCIAS", rif: "J-00000000-0", logo: null as string | null });
    const [ingresos, setIngresos] = useState<FinancialItem[]>([]);
    const [egresos, setEgresos] = useState<FinancialItem[]>([]);
    const [cajaChica, setCajaChica] = useState({ saldoInicial: 0, reposiciones: 0, gastos: 0, saldoFinal: 0 });
    const [estadoFinal, setEstadoFinal] = useState({ saldoAnterior: 0, totalIngresos: 0, totalEgresos: 0, saldoBancos: 0, disponibilidadTotal: 0 });
    const [notas, setNotas] = useState('');

    const loadData = useCallback(async () => {
        if (!currentCondoId) return;
        setSyncing(true);
        try {
            const configRef = doc(db, 'condominios', currentCondoId, 'config', 'mainSettings');
            const snap = await getDoc(configRef);
            if (snap.exists()) {
                const d = snap.data();
                setCompanyInfo({
                    name: d.companyInfo?.name || d.name || "CONDOMINIO",
                    rif: d.companyInfo?.rif || d.rif || "N/A",
                    logo: d.companyInfo?.logo || d.logo || null
                });
            }

            const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const toDate = endOfMonth(fromDate);
            const fromDateTimestamp = Timestamp.fromDate(fromDate);
            const toDateTimestamp = Timestamp.fromDate(toDate);

            const paymentsQuery = query(collection(db, 'condominios', currentCondoId, 'payments'), where('status', '==', 'aprobado'), where('paymentDate', '>=', fromDateTimestamp), where('paymentDate', '<=', toDateTimestamp));
            const expensesQuery = query(collection(db, 'condominios', currentCondoId, 'gastos'), where('date', '>=', fromDateTimestamp), where('date', '<=', toDateTimestamp));
            
            const lastMonth = subMonths(fromDate, 1);
            const lastMonthId = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
            const lastMonthStatementRef = doc(db, 'condominios', currentCondoId, 'financial_statements', lastMonthId);
            const movementsQuery = query(collection(db, 'condominios', currentCondoId, 'cajaChica_movimientos'));

            const [paymentsSnap, expensesSnap, movementsSnap, lastStatementSnap] = await Promise.all([
                getDocs(paymentsQuery),
                getDocs(expensesQuery),
                getDocs(movementsQuery),
                getDoc(lastMonthStatementRef)
            ]);

            const totalIngresos = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
            const newIngresos = [{ id: 'cobranza-mes', concepto: 'Cobranza del Mes', monto: totalIngresos, dia: format(new Date(), 'dd'), category: 'cuotas' }];
            setIngresos(newIngresos);
            
            const newEgresos = expensesSnap.docs.map(doc => {
                const data = doc.data();
                return { id: doc.id, dia: format(data.date.toDate(), 'dd'), concepto: data.description, monto: data.amount };
            });
            setEgresos(newEgresos);
            const totalEgresos = newEgresos.reduce((sum, item) => sum + item.monto, 0);
            
            const allMovements = movementsSnap.docs.map(doc => doc.data() as CajaChicaMovement);
            const priorMovements = allMovements.filter(m => m.date.toDate() < fromDate);
            const periodMovements = allMovements.filter(m => {
                const moveDate = m.date.toDate();
                return moveDate >= fromDate && moveDate <= toDate;
            });

            const saldoInicialCaja = priorMovements.reduce((acc, m) => m.type === 'ingreso' ? acc + m.amount : acc - m.amount, 0);
            const reposicionesCaja = periodMovements.filter(m => m.type === 'ingreso').reduce((acc, m) => acc + m.amount, 0);
            const gastosCaja = periodMovements.filter(m => m.type === 'egreso').reduce((acc, m) => acc + m.amount, 0);
            const saldoFinalCaja = saldoInicialCaja + reposicionesCaja - gastosCaja;
            setCajaChica({ saldoInicial: saldoInicialCaja, reposiciones: reposicionesCaja, gastos: gastosCaja, saldoFinal: saldoFinalCaja });
            
            let saldoAnterior = 0;
            if (lastStatementSnap.exists()) {
                const lastData = lastStatementSnap.data();
                saldoAnterior = lastData.estadoFinanciero?.disponibilidadTotal || 0;
            }

            const saldoBancos = saldoAnterior + totalIngresos - totalEgresos;
            const disponibilidadTotal = saldoBancos + saldoFinalCaja;
            setEstadoFinal({ saldoAnterior, totalIngresos, totalEgresos, saldoBancos, disponibilidadTotal });
            setNotas('Generado automáticamente por el sistema.');

        } catch (e) {
            console.error("EFAS Error:", e);
            toast({ variant: 'destructive', title: "Error de Sincronización", description: "No se pudieron cargar los datos del balance." });
        } finally {
            setSyncing(false);
            setDataLoading(false);
        }
    }, [currentCondoId, selectedMonth, selectedYear, toast]);

    useEffect(() => { if (!authLoading && currentCondoId) loadData(); }, [authLoading, currentCondoId, loadData, selectedMonth, selectedYear]);

    const generatePDF = async () => {
        if (!currentCondoId || !companyInfo) return;
    
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const margin = 14;
    
        // 1. ENCABEZADO OSCURO (Fondo Slate-900)
        docPDF.setFillColor(30, 41, 59); 
        docPDF.rect(0, 0, pageWidth, 45, 'F');
    
        // 2. LOGO REDONDO (Si existe)
        if (companyInfo.logo) {
            try {
                // Coordenadas para el logo circular
                const centerX = 26;
                const centerY = 22.5;
                const radius = 12;
    
                // 1. Dibujamos el círculo que servirá de máscara
                // Usamos 'S' (stroke) pero lo importante es el clipping posterior
                docPDF.setDrawColor(245, 158, 11); // Color Ámbar
                docPDF.setLineWidth(0.8);
                docPDF.circle(centerX, centerY, radius, 'S'); 
    
                // 2. Aplicamos el recorte (clipping)
                // Accedemos al contexto de dibujo interno de jsPDF para mayor compatibilidad
                (docPDF as any).saveGraphicsState();
                (docPDF as any).circle(centerX, centerY, radius, 'f'); // 'f' para fill (necesario para clip)
                (docPDF as any).clip();
    
                // 3. Insertamos la imagen (quedará recortada por el círculo)
                docPDF.addImage(companyInfo.logo, 'PNG', centerX - radius, centerY - radius, radius * 2, radius * 2);
    
                // 4. Restauramos el estado para que el resto del PDF no salga circular
                (docPDF as any).restoreGraphicsState();
                
            } catch (e) {
                console.error("Error al procesar el logo circular en el PDF:", e);
            }
        }
    
        // 3. TEXTOS DEL ENCABEZADO (Blanco)
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFont('helvetica', 'bold');
        docPDF.setFontSize(16);
        docPDF.text(companyInfo.name.toUpperCase(), 42, 22);
        
        docPDF.setFontSize(10);
        docPDF.setFont('helvetica', 'normal');
        docPDF.setTextColor(203, 213, 225); // Slate-300
        docPDF.text(`RIF: ${companyInfo.rif}`, 42, 28);
    
        // BRANDING EFAS CONDOSYS (Derecha)
        docPDF.setTextColor(245, 158, 11); // Amber
        docPDF.setFont('helvetica', 'bold');
        docPDF.setFontSize(14);
        docPDF.text("EFAS", pageWidth - 55, 20);
        docPDF.setTextColor(255, 255, 255);
        docPDF.text("CONDOSYS", pageWidth - 41, 20);
        docPDF.setFont('helvetica', 'normal');
        docPDF.setFontSize(7);
        docPDF.text("SISTEMA DE AUTOGESTIÓN", pageWidth - 55, 24);
    
        // 4. CÓDIGO DE BARRAS (Pequeño en el encabezado)
        const canvas = document.createElement('canvas');
        const barcodeValue = `BF-${currentCondoId}-${selectedYear}${selectedMonth.padStart(2, '0')}`;
        JsBarcode(canvas, barcodeValue, {
            format: "CODE128",
            displayValue: true,
            fontSize: 18,
            background: "#ffffff",
            marginTop: 5
        });
        const barcodeData = canvas.toDataURL("image/png");
        docPDF.addImage(barcodeData, 'PNG', pageWidth - 45, 28, 35, 12);
        
        // Reset text color
        docPDF.setTextColor(0, 0, 0);

        // 5. CUERPO DEL REPORTE
        let startY = 60;
        docPDF.setFontSize(22);
        docPDF.text("BALANCE", margin, startY);
        docPDF.setTextColor(245, 158, 11);
        docPDF.text("FINANCIERO", 58, startY);
    
        docPDF.setFontSize(10);
        docPDF.setTextColor(100, 116, 139);
        docPDF.text(`PERIODO: ${months.find(m => m.value === selectedMonth)?.label.toUpperCase()} ${selectedYear}`, margin, startY + 8);
    
        // TABLA DE INGRESOS
        autoTable(docPDF, {
            head: [['DÍA', 'CONCEPTO DE INGRESO', 'MONTO (Bs.)']],
            body: ingresos.map(i => [i.dia, i.concepto.toUpperCase(), formatCurrency(i.monto)]),
            startY: startY + 15,
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129], fontStyle: 'bold' },
            bodyStyles: { textColor: [0, 0, 0] },
            columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }
        });
    
        // TABLA DE EGRESOS
        autoTable(docPDF, {
            head: [['DÍA', 'CONCEPTO DE GASTO / EGRESO', 'MONTO (Bs.)']],
            body: egresos.map(e => [e.dia, e.concepto.toUpperCase(), formatCurrency(e.monto)]),
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            theme: 'grid',
            headStyles: { fillColor: [225, 29, 72], fontStyle: 'bold' },
            bodyStyles: { textColor: [0, 0, 0] },
            columnStyles: { 2: { halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] } }
        });
    
        // TOTALES Y DISPONIBILIDAD (Cuadro destacado al final)
        const finalY = (docPDF as any).lastAutoTable.finalY + 15;
        
        // Caja de Disponibilidad Real
        docPDF.setFillColor(245, 158, 11);
        docPDF.roundedRect(margin, finalY, pageWidth - (margin * 2), 25, 3, 3, 'F');
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(10);
        docPDF.text("DISPONIBILIDAD TOTAL REAL (BANCO + CAJA CHICA)", margin + 5, finalY + 8);
        docPDF.setFontSize(18);
        docPDF.text(`${formatCurrency(estadoFinal.disponibilidadTotal)} Bs.`, margin + 5, finalY + 18);
    
        // Notas al pie
        if (notas) {
            docPDF.setTextColor(100, 116, 139);
            docPDF.setFontSize(8);
            docPDF.text("OBSERVACIONES:", margin, finalY + 35);
            docPDF.text(notas, margin, finalY + 40, { maxWidth: pageWidth - 30 });
        }
    
        // Guardar
        docPDF.save(`EFAS_Balance_${currentCondoId}_${selectedYear}_${selectedMonth}.pdf`);
    };

    if (authLoading || dataLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic">
                    Balance <span className="text-primary">Financiero</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full"></div>
                <span className="inline-block mt-3 px-3 py-1 bg-secondary text-xs font-bold rounded-full uppercase tracking-tighter">
                    ID: {currentCondoId || "Cargando..."}
                </span>
            </div>

            <div className="flex gap-2">
                <Button variant="outline" onClick={loadData} disabled={syncing} className="rounded-2xl">
                    <RefreshCw className={`mr-2 h-4 w-4 ${syncing && 'animate-spin'}`}/> Sincronizar
                </Button>
                <Button className="bg-primary rounded-2xl" onClick={generatePDF}>
                    <Download className="mr-2 h-4 w-4"/> Generar PDF Premium
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <CardHeader className="p-0 mb-4"><CardTitle className="text-sm font-bold text-muted-foreground uppercase">Periodo</CardTitle></CardHeader>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>)}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    </div>
                </Card>
                <Card className="rounded-[2.5rem] bg-emerald-50 text-emerald-700 p-6 border-none"><p className="font-bold">Total Ingresos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.totalIngresos)}</p></Card>
                <Card className="rounded-[2.5rem] bg-rose-50 text-rose-700 p-6 border-none"><p className="font-bold">Total Egresos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.totalEgresos)}</p></Card>
            </div>

            <Card className="rounded-[2.5rem] p-8 bg-card border-2 shadow-2xl">
                <CardHeader className="p-0 mb-6"><CardTitle className="text-2xl font-black uppercase italic">Cierre de Cuenta</CardTitle></CardHeader>
                <div className="space-y-4">
                    <div className="p-6 rounded-2xl bg-primary text-primary-foreground flex justify-between items-center">
                        <span className="font-bold uppercase tracking-widest">Disponibilidad Real</span>
                        <span className="text-4xl font-black">{formatCurrency(estadoFinal.disponibilidadTotal)} Bs.</span>
                    </div>
                    <Textarea 
                        placeholder="Notas para el PDF..." 
                        value={notas} 
                        onChange={e => setNotas(e.target.value)} 
                        className="rounded-2xl min-h-[100px]"
                    />
                    <div className="flex justify-end">
                        <Button className="rounded-full h-14 px-10 font-black uppercase italic" onClick={async () => {
                            if(!currentCondoId) return;
                            const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                            
                            const statementDataToSave = {
                                id: periodId,
                                ingresos: ingresos,
                                egresos: egresos,
                                cajaChica: cajaChica,
                                estadoFinanciero: estadoFinal,
                                notas,
                                createdAt: serverTimestamp()
                            };

                            await setDoc(doc(db, 'condominios', currentCondoId, 'financial_statements', periodId), statementDataToSave);
                            toast({ title: "BALANCE GUARDADO" });
                        }}>
                            <Save className="mr-2 h-5 w-5" /> Guardar Balance
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}

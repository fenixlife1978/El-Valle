"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, doc, Timestamp, getDoc, where, getDocs, setDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
    Download, Loader2, RefreshCw, Save
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

// --- Tipos ---
type FinancialItem = {
    id: string;
    concepto: string;
    monto: number;
    dia: string;
};

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
    const [egresos, setEgresos] = useState<any[]>([]);
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
            
            const [paymentsSnap, expensesSnap] = await Promise.all([
                getDocs(paymentsQuery),
                getDocs(expensesQuery)
            ]);

            const totalIngresos = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
            setIngresos([{ id: 'cobranza-mes', concepto: 'Cobranza del Mes', monto: totalIngresos, dia: format(new Date(), 'dd') }]);
            
            const newEgresos = expensesSnap.docs.map(doc => ({
                id: doc.id,
                fecha: format(doc.data().date.toDate(), 'dd/MM/yyyy'),
                descripcion: doc.data().description,
                monto: doc.data().amount
            }));
            setEgresos(newEgresos);

            const totalEgresos = newEgresos.reduce((sum, item) => sum + item.monto, 0);
            
            const disponibilidadTotal = totalIngresos - totalEgresos; 
            setEstadoFinal(prev => ({ ...prev, totalIngresos, totalEgresos, disponibilidadTotal }));
            setNotas('Generado automáticamente por EFAS CondoSys.');

        } catch (e) {
            console.error("Error EFAS:", e);
            toast({ variant: 'destructive', title: "Error", description: "No se pudieron sincronizar los datos." });
        } finally {
            setSyncing(false);
            setDataLoading(false);
        }
    }, [currentCondoId, selectedMonth, selectedYear, toast]);

    useEffect(() => {
        const fetchData = async () => {
            if (!authLoading && currentCondoId) {
                await loadData();
            }
        };
        fetchData();
    }, [authLoading, currentCondoId, loadData]);

    const generatePDF = async () => {
        if (!currentCondoId || !companyInfo) return;
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const margin = 14;

        // ENCABEZADO OSCURO (Diseño Premium solicitado)
        docPDF.setFillColor(30, 41, 59);
        docPDF.rect(0, 0, pageWidth, 45, 'F');

        // LOGO REDONDO
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

        // TEXTOS DEL ENCABEZADO (Blanco)
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
        docPDF.setFontSize(7);
        docPDF.text("SISTEMA DE AUTOGESTIÓN", pageWidth - 55, 24);

        // CÓDIGO DE BARRAS (Pequeño en el encabezado)
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

        // CUERPO DEL REPORTE
        let startY = 60;
        docPDF.setTextColor(30, 41, 59);
        docPDF.setFontSize(22);
        docPDF.text("BALANCE", margin, startY);
        docPDF.setTextColor(245, 158, 11);
        docPDF.text("FINANCIERO", 58, startY);

        docPDF.setFontSize(10);
        docPDF.setTextColor(100, 116, 139);
        docPDF.text(`PERIODO: ${months.find(m => m.value === selectedMonth)?.label.toUpperCase()} ${selectedYear}`, margin, startY + 8);

        // TABLA DE INGRESOS
        autoTable(docPDF, {
            head: [['CONCEPTO DE INGRESO', 'MONTO (Bs.)']],
            body: ingresos.map(i => [i.concepto.toUpperCase(), formatCurrency(i.monto)]),
            startY: startY + 15,
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129], fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
        });

        // TABLA DE EGRESOS
        autoTable(docPDF, {
            head: [['FECHA', 'CONCEPTO DE GASTO / EGRESO', 'MONTO (Bs.)']],
            body: egresos.map(e => [e.fecha, e.descripcion.toUpperCase(), formatCurrency(e.monto)]),
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            theme: 'grid',
            headStyles: { fillColor: [225, 29, 72], fontStyle: 'bold' },
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
            </div>

            <div className="flex gap-2">
                <Button variant="outline" onClick={loadData} disabled={syncing} className="rounded-2xl">
                    <RefreshCw className={syncing ? 'animate-spin' : ''} />
                </Button>
                <Button className="bg-primary rounded-2xl" onClick={generatePDF}>
                    <Download className="mr-2 h-4 w-4"/> Descargar
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>)}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    </div>
                </Card>
                <Card className="rounded-[2.5rem] bg-emerald-50 text-emerald-700 p-6 border-none shadow-lg"><p className="font-bold uppercase text-xs">Ingresos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.totalIngresos)}</p></Card>
                <Card className="rounded-[2.5rem] bg-rose-50 text-rose-700 p-6 border-none shadow-lg"><p className="font-bold uppercase text-xs">Egresos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.totalEgresos)}</p></Card>
            </div>

            <Card className="rounded-[2.5rem] p-8 border-2 shadow-2xl bg-card">
                <CardHeader className="p-0 mb-6"><CardTitle className="text-2xl font-black uppercase italic">Cierre y Notas</CardTitle></CardHeader>
                <div className="space-y-4">
                    <div className="p-8 rounded-[2rem] bg-slate-900 text-white flex justify-between items-center border-b-4 border-amber-500">
                        <span className="font-bold uppercase tracking-widest text-slate-400">Disponibilidad Real</span>
                        <span className="text-4xl font-black text-amber-500">{formatCurrency(estadoFinal.disponibilidadTotal)} Bs.</span>
                    </div>
                    <Textarea 
                        placeholder="Observaciones para el reporte..." 
                        value={notas} 
                        onChange={e => setNotas(e.target.value)} 
                        className="rounded-2xl min-h-[100px] border-2 focus:ring-amber-500"
                    />
                    <div className="flex justify-end">
                        <Button className="rounded-full h-14 px-10 font-black uppercase italic gap-2" onClick={async () => {
                            if (!currentCondoId) return;
                            const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                            await setDoc(doc(db, 'condominios', currentCondoId, 'financial_statements', periodId), {
                                id: periodId, ingresos, egresos, estadoFinanciero: estadoFinal, notas, createdAt: serverTimestamp()
                            });
                            toast({ title: "BALANCE GUARDADO" });
                        }}>
                            <Save className="h-5 w-5" /> Guardar en Historial
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}


"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, doc, Timestamp, getDoc, where, getDocs, setDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
    Download, Loader2, RefreshCw, TrendingUp, TrendingDown, Wallet, Box, Save, FileText 
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    const { activeCondoId, workingCondoId, loading: authLoading } = useAuth();
    const currentCondoId = activeCondoId || workingCondoId;

    const [dataLoading, setDataLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [companyInfo, setCompanyInfo] = useState<{ name: string; rif: string; logo: string | null }>({ name: "RESIDENCIAS", rif: "J-00000000-0", logo: null });
    
    const [ingresos, setIngresos] = useState<{ concepto: string, real: number, category: string }[]>([]);
    const [egresos, setEgresos] = useState<any[]>([]);
    const [cajaChica, setCajaChica] = useState({ saldoInicial: 0, reposiciones: 0, gastos: 0, saldoFinal: 0 });
    const [estadoFinal, setEstadoFinal] = useState({ saldoAnteriorBancos: 0, totalIngresos: 0, totalEgresos: 0, saldoBancos: 0, disponibilidadTotal: 0 });
    const [notas, setNotas] = useState('');

    const loadData = useCallback(async () => {
        if (!currentCondoId) return;
        setSyncing(true);
        try {
            const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const toDate = endOfMonth(fromDate);

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

            const prevPaymentsSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'payments'), where('paymentDate', '<', fromDate), where('status', '==', 'aprobado')));
            const prevExpensesSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'gastos'), where('date', '<', fromDate)));
            const saldoAnteriorBancos = prevPaymentsSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0) - prevExpensesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

            const paymentsSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'payments'), where('paymentDate', '>=', fromDate), where('paymentDate', '<=', toDate), where('status', '==', 'aprobado')));
            const totalIngresos = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
            
            const expensesSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'gastos'), where('date', '>=', fromDate), where('date', '<=', toDate)));
            const listaEgresos = expensesSnap.docs.map(d => ({ fecha: format(d.data().date.toDate(), 'dd/MM/yyyy'), descripcion: d.data().description, monto: d.data().amount }));
            const totalEgresos = listaEgresos.reduce((sum, item) => sum + item.monto, 0);

            const prevPettyCashSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'cajaChica_movimientos'), where('date', '<', fromDate)));
            const saldoInicialCajaChica = prevPettyCashSnap.docs.reduce((sum, doc) => sum + (doc.data().type === 'ingreso' ? doc.data().amount : -doc.data().amount), 0);
            
            const currentPettyCashSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'cajaChica_movimientos'), where('date', '>=', fromDate), where('date', '<=', toDate)));
            const reposicionesCajaChica = currentPettyCashSnap.docs.filter(d => d.data().type === 'ingreso').reduce((sum, doc) => sum + doc.data().amount, 0);
            const gastosCajaChica = currentPettyCashSnap.docs.filter(d => d.data().type === 'egreso').reduce((sum, doc) => sum + doc.data().amount, 0);
            const saldoFinalCajaChica = saldoInicialCajaChica + reposicionesCajaChica - gastosCajaChica;

            setIngresos([{ concepto: 'Cobranza del Mes', real: totalIngresos, category: 'cuotas' }]);
            setEgresos(listaEgresos);
            setCajaChica({ saldoInicial: saldoInicialCajaChica, reposiciones: reposicionesCajaChica, gastos: gastosCajaChica, saldoFinal: saldoFinalCajaChica });

            const saldoBancos = saldoAnteriorBancos + totalIngresos - totalEgresos;
            setEstadoFinal({
                saldoAnteriorBancos,
                totalIngresos,
                totalEgresos,
                saldoBancos,
                disponibilidadTotal: saldoBancos + saldoFinalCajaChica
            });

            setDataLoading(false);
        } catch (e) {
            console.error("Error EFAS:", e);
        } finally {
            setSyncing(false);
        }
    }, [currentCondoId, selectedMonth, selectedYear]);

    useEffect(() => {
        if (!authLoading && currentCondoId) {
            loadData();
        }
    }, [authLoading, currentCondoId, loadData]);

    const generatePDF = async () => {
        if (!currentCondoId || !companyInfo) return;
    
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const margin = 14;

        docPDF.setFillColor(30, 41, 59); 
        docPDF.rect(0, 0, pageWidth, 45, 'F');

        if (companyInfo.logo) {
            try {
                const centerX = 26;
                const centerY = 22.5;
                const radius = 12;
    
                docPDF.setDrawColor(245, 158, 11);
                docPDF.setLineWidth(0.8);
                docPDF.circle(centerX, centerY, radius, 'S'); 
    
                (docPDF as any).saveGraphicsState();
                (docPDF as any).circle(centerX, centerY, radius, 'f');
                (docPDF as any).clip();
    
                docPDF.addImage(companyInfo.logo, 'PNG', centerX - radius, centerY - radius, radius * 2, radius * 2);
    
                (docPDF as any).restoreGraphicsState();
                
            } catch (e) {
                console.error("Error al procesar el logo circular en el PDF:", e);
            }
        }

        docPDF.setTextColor(255, 255, 255);
        docPDF.setFont('helvetica', 'bold').setFontSize(16);
        docPDF.text(companyInfo.name.toUpperCase(), 42, 22);
        docPDF.setFontSize(10).setTextColor(203, 213, 225);
        docPDF.text(`RIF: ${companyInfo.rif}`, 42, 28);

        docPDF.setTextColor(245, 158, 11);
        docPDF.setFont('helvetica', 'bold').setFontSize(14);
        docPDF.text("EFAS", pageWidth - 55, 20);
        docPDF.setTextColor(255, 255, 255);
        docPDF.text("CONDOSYS", pageWidth - 41, 20);

        const canvas = document.createElement('canvas');
        const barcodeVal = `BF-${currentCondoId}-${selectedYear}${selectedMonth}`;
        JsBarcode(canvas, barcodeVal, { format: "CODE128", displayValue: true, fontSize: 14 });
        docPDF.addImage(canvas.toDataURL("image/png"), 'PNG', pageWidth - 45, 28, 35, 12);
        
        let startY = 60;
        docPDF.setTextColor(30, 41, 59);
        docPDF.setFontSize(22);
        docPDF.text("BALANCE", margin, startY);
        docPDF.setTextColor(245, 158, 11);
        docPDF.text("FINANCIERO", 58, startY);

        const monthLabel = months.find(m => m.value === selectedMonth)?.label || '';
        docPDF.setFontSize(10).setTextColor(100, 116, 139);
        docPDF.text(`PERIODO: ${monthLabel.toUpperCase()} ${selectedYear}`, margin, startY + 8);

        autoTable(docPDF, {
            head: [['INGRESOS', 'MONTO (Bs.)']],
            body: ingresos.map(i => [i.concepto.toUpperCase(), formatCurrency(i.real)]),
            startY: startY + 15,
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129] },
            columnStyles: { 1: { halign: 'right' } }
        });

        autoTable(docPDF, {
            head: [['FECHA', 'EGRESOS', 'MONTO (Bs.)']],
            body: egresos.map(e => [e.fecha, e.descripcion.toUpperCase(), formatCurrency(e.monto)]),
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            theme: 'grid',
            headStyles: { fillColor: [225, 29, 72] },
            columnStyles: { 2: { halign: 'right' } }
        });
        
        const finalY = (docPDF as any).lastAutoTable.finalY + 10;
        
        autoTable(docPDF, {
            head: [['CAJA CHICA', 'MONTO (Bs.)']],
            body: [
                ['Saldo Inicial de Caja Chica', formatCurrency(cajaChica.saldoInicial)],
                ['(+) Reposiciones del Mes', formatCurrency(cajaChica.reposiciones)],
                ['(-) Gastos del Mes', `-${formatCurrency(cajaChica.gastos)}`],
            ],
            foot: [['SALDO FINAL EN CAJA CHICA', formatCurrency(cajaChica.saldoFinal)]],
            startY: finalY,
            theme: 'grid',
            headStyles: { fillColor: [100, 116, 139] },
            footStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' } }
        });

        const finalTableY = (docPDF as any).lastAutoTable.finalY + 15;
        
        docPDF.setFillColor(245, 158, 11);
        docPDF.roundedRect(margin, finalTableY, pageWidth - (margin * 2), 25, 3, 3, 'F');
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(10);
        docPDF.text("DISPONIBILIDAD TOTAL REAL (BANCO + CAJA CHICA)", margin + 5, finalTableY + 8);
        docPDF.setFontSize(18);
        docPDF.text(`${formatCurrency(estadoFinal.disponibilidadTotal)} Bs.`, margin + 5, finalTableY + 18);

        if (notas) {
            docPDF.setTextColor(100, 116, 139);
            docPDF.setFontSize(8);
            docPDF.text("OBSERVACIONES:", margin, finalTableY + 35);
            docPDF.text(notas, margin, finalTableY + 40, { maxWidth: pageWidth - 30 });
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
                <span className="inline-block mt-3 px-3 py-1 bg-secondary text-xs font-bold rounded-full uppercase tracking-tighter">
                    ID: {currentCondoId}
                </span>
            </div>

            <div className="flex gap-2">
                <Button variant="outline" onClick={loadData} disabled={syncing} className="rounded-2xl">
                    <RefreshCw className={`mr-2 h-4 w-4 ${syncing && 'animate-spin'}`}/> Sincronizar Datos
                </Button>
                <Button className="bg-primary rounded-2xl" onClick={generatePDF}>
                    <Download className="mr-2 h-4 w-4"/> Generar PDF
                </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <CardHeader className="p-0 mb-4"><CardTitle className="text-sm font-bold text-muted-foreground uppercase">Periodo</CardTitle></CardHeader>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>)}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    </div>
                </Card>
                <Card className="rounded-[2.5rem] bg-emerald-50 text-emerald-700 p-6 border-none"><p className="font-bold">Total Ingresos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.totalIngresos)}</p></Card>
                <Card className="rounded-[2.5rem] bg-rose-50 text-rose-700 p-6 border-none"><p className="font-bold">Total Egresos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.totalEgresos)}</p></Card>
                <Card className="rounded-[2.5rem] bg-blue-50 text-blue-700 p-6 border-none"><p className="font-bold">Saldo en Bancos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.saldoBancos)}</p></Card>
            </div>
            
             <Card className="rounded-[2.5rem] bg-card border-2">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-xl font-black uppercase italic flex items-center gap-2">
                        <Box className="text-primary"/>
                        Movimientos de Caja Chica
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                    <div className="p-4 bg-muted/50 rounded-2xl">
                        <p className="text-xs font-bold text-muted-foreground">Saldo Anterior</p>
                        <p className="text-xl font-bold">{formatCurrency(cajaChica.saldoInicial)}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-2xl">
                        <p className="text-xs font-bold text-emerald-700">(+) Reposiciones</p>
                        <p className="text-xl font-bold text-emerald-700">{formatCurrency(cajaChica.reposiciones)}</p>
                    </div>
                     <div className="p-4 bg-rose-50 rounded-2xl">
                        <p className="text-xs font-bold text-rose-700">(-) Gastos</p>
                        <p className="text-xl font-bold text-rose-700">{formatCurrency(cajaChica.gastos)}</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-2xl">
                        <p className="text-xs font-bold text-blue-700">Saldo Final</p>
                        <p className="text-xl font-bold text-blue-700">{formatCurrency(cajaChica.saldoFinal)}</p>
                    </div>
                </CardContent>
            </Card>

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
                            if (!currentCondoId) return;
                            const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                            await setDoc(doc(db, 'condominios', currentCondoId, 'financial_statements', periodId), {
                                id: periodId,
                                ingresos,
                                egresos,
                                cajaChica,
                                estadoFinanciero: estadoFinal,
                                notas,
                                createdAt: serverTimestamp()
                            });
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

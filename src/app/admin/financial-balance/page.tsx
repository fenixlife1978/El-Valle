
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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';


const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

export default function FinancialBalancePage() {
    const { toast } = useToast();
    const { activeCondoId, loading } = useAuth();

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
        if (!activeCondoId) return;
        try {
            const configRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
            const snap = await getDoc(configRef);
            if (snap.exists()) {
                const data = snap.data();
                setCompanyInfo({
                    name: data.companyInfo?.name || "CONDOMINIO",
                    rif: data.companyInfo?.rif || "N/A",
                    logo: data.companyInfo?.logo || null
                });
            }
        } catch (error) {
            console.error("EFAS Error:", error);
        }
    }, [activeCondoId]);

    const handleSyncData = useCallback(async (showToast = true) => {
        if (!activeCondoId) return;
        setSyncing(true);
        if (showToast) toast({ title: "Sincronizando..." });

        try {
            await loadCondoConfig();
            const currentPeriodStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const currentPeriodEnd = endOfMonth(currentPeriodStart);
            
            const prevPeriodDate = subMonths(currentPeriodStart, 1);
            const prevPeriodId = format(prevPeriodDate, 'yyyy-MM');
            const prevSnap = await getDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', prevPeriodId));
            const saldoAnterior = prevSnap.exists() ? (prevSnap.data() as any).estadoFinal.saldoBancos : 0;
            
            const paymentsSnap = await getDocs(query(
                collection(db, 'condominios', activeCondoId, 'payments'),
                where('status', '==', 'aprobado'),
                where('paymentDate', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('paymentDate', '<=', Timestamp.fromDate(currentPeriodEnd))
            ));
            const totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
            
            const newIngresos = [
                { concepto: 'Cobranza del Mes', real: totalPayments, category: 'cuotas_ordinarias' },
                { concepto: 'Fondo de Reserva', real: 0, category: 'fondo_reserva' },
                { concepto: 'Otros Ingresos', real: 0, category: 'otros' }
            ];
            setIngresos(newIngresos);


            const expensesSnap = await getDocs(query(
                collection(db, 'condominios', activeCondoId, 'gastos'),
                where('date', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('date', '<=', Timestamp.fromDate(currentPeriodEnd)),
                orderBy('date', 'asc')
            ));
            
            const ccMovesQuery = query(collection(db, 'condominios', activeCondoId, 'cajaChica_movimientos'));
            const ccMovesSnap = await getDocs(ccMovesQuery);
            
            let saldoInicialCC = 0;
            ccMovesSnap.docs.forEach(d => {
                const move = d.data();
                if (move.date.toDate() < currentPeriodStart) {
                    saldoInicialCC += move.type === 'ingreso' ? move.amount : -move.amount;
                }
            });

            let reposicionesCC = 0;
            let gastosCC = 0;
            ccMovesSnap.docs.forEach(d => {
                const move = d.data();
                if (move.date.toDate() >= currentPeriodStart && move.date.toDate() <= currentPeriodEnd) {
                    if (move.type === 'ingreso') reposicionesCC += move.amount;
                    if (move.type === 'egreso') gastosCC += move.amount;
                }
            });
            const saldoFinalCC = saldoInicialCC + reposicionesCC - gastosCC;

            setEstadoFinal(prev => ({...prev, saldoAnterior}));
            setEgresos(expensesSnap.docs.map(d => ({
                id: d.id,
                descripcion: d.data().description || 'Sin descripción',
                monto: d.data().amount || 0,
                fecha: format(d.data().date.toDate(), 'dd/MM/yyyy')
            })));
            setCajaChica({ saldoInicial: saldoInicialCC, reposiciones: reposicionesCC, gastos: gastosCC, saldoFinal: saldoFinalCC });

        } catch (e) {
            console.error(e);
            toast({variant: 'destructive', title: 'Error de Sincronización', description: "No se pudieron cargar todos los datos."});
        } finally {
            setSyncing(false);
            setDataLoading(false);
        }
    }, [activeCondoId, selectedMonth, selectedYear, toast, loadCondoConfig]);

    useEffect(() => {
        if (!loading && activeCondoId) {
             handleSyncData(false);
        }
    }, [activeCondoId, loading, selectedMonth, selectedYear, handleSyncData]);

    useEffect(() => {
        const totalI = ingresos.reduce((s, i) => s + i.real, 0);
        const totalE = egresos.reduce((s, e) => s + e.monto, 0);
        const saldoBancos = estadoFinal.saldoAnterior + totalI - totalE;
        const saldoNeto = saldoBancos;
        const disponibilidadTotal = saldoBancos + cajaChica.saldoFinal;
        
        setEstadoFinal(prev => ({
            ...prev,
            totalIngresos: totalI,
            totalEgresos: totalE,
            saldoNeto: saldoNeto,
            saldoBancos: saldoBancos,
            disponibilidadTotal: disponibilidadTotal
        }));
    }, [ingresos, egresos, estadoFinal.saldoAnterior, cajaChica]);
    
    if (loading || dataLoading) return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-10 w-10 text-primary"/></div>;

    const generatePDF = async () => {
        if (!activeCondoId || !companyInfo) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información del condominio.' });
            return;
        };
        
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const headerHeight = 35;
        const margin = 14;

        // --- HEADER ---
        docPDF.setFillColor(28, 43, 58); // #1C2B3A
        docPDF.rect(0, 0, pageWidth, headerHeight, 'F');
        docPDF.setTextColor(255, 255, 255);

        let textX = margin;
        if (companyInfo.logo) {
            try {
                // Circular logo logic
                const logoSize = 20;
                const logoX = margin + logoSize / 2;
                const logoY = 7 + logoSize / 2;
                docPDF.saveGraphicsState();
                docPDF.circle(logoX, logoY, logoSize / 2);
                docPDF.clip();
                docPDF.addImage(companyInfo.logo, 'PNG', margin, 7, logoSize, logoSize);
                docPDF.restoreGraphicsState();
                textX += logoSize + 5;
            } catch(e) { console.error("Error adding logo to PDF", e); }
        }

        docPDF.setFontSize(14).setFont('helvetica', 'bold');
        docPDF.text(companyInfo.name, textX, 15);
        docPDF.setFontSize(9).setFont('helvetica', 'normal');
        docPDF.text(`RIF: ${companyInfo.rif}`, textX, 22);

        // --- Brand Identity (right side) ---
        const endX = pageWidth - margin;
        const efasColor = '#F97316'; // orange-500
        const condoSysColor = '#FFFFFF'; // White for dark background
        const efasText = "EFAS";
        const condoSysText = "CONDOSYS";
        const subtitleText = "SISTEMA DE AUTOGESTIÓN DE CONDOMINIOS";
        
        docPDF.setFont('helvetica', 'bolditalic');
        docPDF.setFontSize(12);

        const condoSysWidth = docPDF.getStringUnitWidth(condoSysText) * 12 / docPDF.internal.scaleFactor;
        
        // Draw CONDOSYS in white
        docPDF.setTextColor(condoSysColor);
        docPDF.text(condoSysText, endX, 15, { align: 'right' });
        
        // Draw EFAS in orange
        docPDF.setTextColor(efasColor);
        docPDF.text(efasText, endX - condoSysWidth - 2, 15, { align: 'right' });
        
        // Draw Subtitle
        docPDF.setFont('helvetica', 'normal');
        docPDF.setFontSize(7);
        docPDF.setTextColor(200, 200, 200); // Lighter gray
        docPDF.text(subtitleText, endX, 22, { align: 'right' });
        
        docPDF.setTextColor(0, 0, 0); 
        
        let startY = headerHeight + 5;

        // --- BARCODE (Centered, smaller) ---
        const canvas = document.createElement('canvas');
        const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
        const barcodeValue = `BF-${periodId}`;
        try {
            JsBarcode(canvas, barcodeValue, {
                format: "CODE128", height: 30, width: 1.2, displayValue: true, margin: 0, fontSize: 8
            });
            const barcodeDataUrl = canvas.toDataURL("image/png");
            const barcodeWidth = 50;
            const barcodeHeight = 20;
            docPDF.addImage(barcodeDataUrl, 'PNG', (pageWidth / 2) - (barcodeWidth / 2), startY, barcodeWidth, barcodeHeight);
        } catch (e) {
            console.error("Barcode generation failed", e);
        }
        startY += 25;
        
        const period = `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;
        docPDF.setFontSize(16).setFont('helvetica', 'bold').text('ESTADO DE RESULTADOS', pageWidth / 2, startY, { align: 'center' });
        docPDF.setFontSize(12).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, startY + 7, { align: 'center' });
        
        startY += 25;
        
        autoTable(docPDF, {
            head: [['INGRESOS', 'MONTO (Bs.)']],
            body: ingresos.map(i => [
                i.concepto,
                { content: formatCurrency(i.real), styles: { halign: 'right' } },
            ]),
            foot: [[
                { content: 'TOTAL INGRESOS', styles: { halign: 'right' } },
                { content: formatCurrency(estadoFinal.totalIngresos), styles: { halign: 'right' } },
            ]],
            startY,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246], halign: 'center' },
            footStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { textColor: [0, 0, 0] }
        });
        
        startY = (docPDF as any).lastAutoTable.finalY + 10;
        
        autoTable(docPDF, {
            head: [['FECHA', 'EGRESOS (GASTOS)', 'MONTO Bs.']],
            body: egresos.map(e => [
                e.fecha,
                e.descripcion,
                { content: formatCurrency(e.monto), styles: { halign: 'right' } },
            ]),
            foot: [[
                { content: '', styles: { halign: 'right' } },
                { content: 'TOTAL EGRESOS', styles: { halign: 'right' } },
                { content: formatCurrency(estadoFinal.totalEgresos), styles: { halign: 'right' } },
            ]],
            startY: startY,
            theme: 'striped',
            headStyles: { fillColor: [239, 68, 68], halign: 'center' },
            footStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { textColor: [0, 0, 0] }
        });

        startY = (docPDF as any).lastAutoTable.finalY + 10;
        
        docPDF.setFontSize(11).setFont('helvetica', 'bold');
        const totalEfectivoY = startY + 10;
        docPDF.setFillColor(239, 246, 255);
        docPDF.rect(margin, totalEfectivoY - 5, pageWidth - margin * 2, 10, 'F');
        docPDF.setTextColor(30, 64, 175);
        docPDF.text('SALDO NETO O SALDO FINAL DEL MES EN BANCO (Ingresos - Egresos)', margin + 2, totalEfectivoY);
        docPDF.text(formatCurrency(estadoFinal.saldoNeto), pageWidth - margin - 2, totalEfectivoY, { align: 'right' });
        startY = totalEfectivoY + 10;
        docPDF.setTextColor(0, 0, 0);

        startY += 10;
        docPDF.setFontSize(10).text('Notas:', margin, startY);
        docPDF.setFontSize(10).setFont('helvetica', 'normal').text(notas, margin, startY + 5, { maxWidth: 180 });

        docPDF.save(`Balance_Financiero_${companyInfo?.name}_${period}.pdf`);
    };
    
    return (
        <div className="max-w-7xl mx-auto space-y-6">
             <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Balance <span className="text-primary">Financiero</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Revisión de estado de resultados y flujos de caja.
                </p>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleSyncData(true)} disabled={syncing} className="rounded-2xl"><RefreshCw className={`mr-2 h-4 w-4 ${syncing && 'animate-spin'}`}/> Sincronizar</Button>
                    <Button className="bg-primary rounded-2xl" onClick={generatePDF}><Download className="mr-2 h-4 w-4"/> PDF</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="rounded-[2.5rem] bg-card shadow-sm border">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-bold text-muted-foreground">PERÍODO DE REPORTE</CardTitle></CardHeader>
                    <CardContent className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="rounded-xl font-bold"><SelectValue/></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>)}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="rounded-xl font-bold"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    </CardContent>
                </Card>
                <div className="grid grid-cols-2 gap-6 md:col-span-2">
                    <Card className="rounded-[2.5rem] bg-success/10 text-success-foreground"><CardContent className="p-6"><p className="text-sm font-bold text-success">Total Ingresos</p><p className="text-4xl font-black text-success-foreground">{formatCurrency(estadoFinal.totalIngresos)}</p></CardContent></Card>
                    <Card className="rounded-[2.5rem] bg-destructive/10 text-destructive-foreground"><CardContent className="p-6"><p className="text-sm font-bold text-destructive">Total Egresos</p><p className="text-4xl font-black text-destructive-foreground">{formatCurrency(estadoFinal.totalEgresos)}</p></CardContent></Card>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-[2.5rem] p-2 bg-card border-2 border-border shadow-xl space-y-6">
                    <CardHeader className="bg-secondary/20 rounded-2xl">
                        <CardTitle>Detalle de Gastos (Salidas)</CardTitle>
                        <CardDescription>Movimientos de egreso desde las cuentas principales.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {egresos.length > 0 ? (
                        <Table><TableHeader><TableRow><TableHead>FECHA</TableHead><TableHead>CONCEPTO</TableHead><TableHead className="text-right">MONTO Bs.</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {egresos.map(e => (
                                <TableRow key={e.id}><TableCell className="font-bold text-muted-foreground">{e.fecha}</TableCell><TableCell className="font-bold uppercase text-foreground">{e.descripcion}</TableCell><TableCell className="text-right font-bold text-destructive">-{formatCurrency(e.monto)}</TableCell></TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        ) : (<p className="text-center text-muted-foreground font-bold p-8">No hay egresos en este período.</p>)}
                    </CardContent>
                </Card>

                <Card className="rounded-[2.5rem] p-2 bg-card border-2 border-border shadow-xl space-y-6">
                    <CardHeader className="bg-secondary/20 rounded-2xl">
                        <CardTitle>Control de Caja Chica</CardTitle>
                        <CardDescription>Movimiento de efectivo para gastos menores.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center"><span className="font-bold text-muted-foreground">Saldo Inicial</span><span className="font-bold text-foreground">{formatCurrency(cajaChica.saldoInicial)}</span></div>
                        <div className="flex justify-between items-center"><span className="font-bold text-success">(+) Reposiciones del Mes</span><span className="font-bold text-success">+{formatCurrency(cajaChica.reposiciones)}</span></div>
                        <div className="flex justify-between items-center"><span className="font-bold text-destructive">(-) Gastos del Mes</span><span className="font-bold text-destructive">-{formatCurrency(cajaChica.gastos)}</span></div>
                        <Separator />
                        <div className="flex justify-between items-center"><span className="font-black text-foreground">Saldo Final en Caja</span><span className="font-black text-xl text-primary">{formatCurrency(cajaChica.saldoFinal)}</span></div>
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-[2.5rem] p-8 bg-card border-2 border-border shadow-xl space-y-6">
                <CardHeader className="p-0 mb-4">
                    <CardTitle className="text-foreground text-2xl font-black uppercase">Estado de Cuenta Final</CardTitle>
                </CardHeader>
                <CardContent className="p-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-2">Saldo Anterior en Bancos</Label>
                            <Input type="number" value={estadoFinal.saldoAnterior} onChange={e => setEstadoFinal(prev => ({...prev, saldoAnterior: parseFloat(e.target.value) || 0}))} className="h-14 rounded-2xl bg-input border-border text-2xl font-black text-foreground px-6"/>
                        </div>
                        <div className="p-4 rounded-2xl bg-secondary/30 flex items-center justify-between">
                            <span className="font-bold text-muted-foreground">Saldo Total en Bancos</span>
                            <span className="text-3xl font-black text-foreground">{formatCurrency(estadoFinal.saldoBancos)}</span>
                        </div>
                    </div>
                     <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between">
                        <span className="font-black text-primary/80 uppercase tracking-wider">Disponibilidad Total (Bancos + Caja)</span>
                        <span className="text-4xl font-black text-primary italic">{formatCurrency(estadoFinal.disponibilidadTotal)}</span>
                    </div>
                    <Textarea placeholder="Observaciones..." value={notas} onChange={e => setNotas(e.target.value)} className="rounded-3xl bg-input border-border min-h-[100px] p-6 font-bold text-foreground"/>
                </CardContent>
                <CardFooter className="p-0 flex justify-end">
                    <Button className="bg-primary hover:bg-primary/90 rounded-full px-12 h-14 font-black text-primary-foreground" onClick={async () => {
                        if (!activeCondoId) {
                            toast({ variant: 'destructive', title: 'Error', description: 'No se ha seleccionado un condominio activo.' });
                            return;
                        }
                        const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                        await setDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', periodId), { id: periodId, estadoFinal, notas, fechaCierre: Timestamp.now() });
                        toast({ title: "BALANCE GUARDADO" });
                    }}>GUARDAR CIERRE</Button>
                </CardFooter>
            </Card>
        </div>
    );
}

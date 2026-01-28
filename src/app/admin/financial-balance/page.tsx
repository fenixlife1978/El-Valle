
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
            setEstadoFinal(prev => ({...prev, saldoAnterior}));
            
            const paymentsSnap = await getDocs(query(
                collection(db, 'condominios', activeCondoId, 'payments'),
                where('status', '==', 'aprobado'),
                where('paymentDate', '>=', Timestamp.fromDate(currentPeriodStart)),
                where('paymentDate', '<=', Timestamp.fromDate(currentPeriodEnd))
            ));
            const totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
            
            setIngresos(prev => prev.map(item => 
                item.category.includes('cuotas_ordinarias') ? { ...item, real: totalPayments } : item
            ));

            const expensesSnap = await getDocs(query(
                collection(db, 'condominios', activeCondoId, 'gastos'),
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
            
            // --- CÁLCULOS DE CAJA CHICA ---
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
        if (!activeCondoId) return;
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) {
            try {
                docPDF.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
            } catch(e) {
                console.error("Error al agregar el logo al PDF:", e);
            }
        }
        
        docPDF.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo?.name || '', margin + 30, margin + 8);
        docPDF.setFontSize(9).setFont('helvetica', 'normal');
        docPDF.text(companyInfo?.rif || '', margin + 30, margin + 14);
        
        docPDF.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
        
        const period = `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;
        docPDF.setFontSize(16).setFont('helvetica', 'bold').text('ESTADO DE RESULTADOS', pageWidth / 2, margin + 45, { align: 'center' });
        docPDF.setFontSize(12).setFont('helvetica', 'normal').text(`Período: ${period}`, pageWidth / 2, margin + 52, { align: 'center' });
        
        autoTable(docPDF, {
            head: [['INGRESOS', 'MONTO Bs.']],
            body: ingresos.map(i => [i.concepto.toUpperCase(), formatCurrency(i.real)]),
            foot: [['TOTAL INGRESOS', formatCurrency(estadoFinal.totalIngresos)]],
            startY: margin + 65,
            headStyles: { fillColor: [22, 163, 74] },
            footStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' }
        });
        
        autoTable(docPDF, {
            head: [['FECHA', 'EGRESOS (GASTOS)', 'MONTO Bs.']],
            body: egresos.map(e => [e.fecha, e.descripcion, formatCurrency(e.monto)]),
            foot: [['', 'TOTAL EGRESOS', formatCurrency(estadoFinal.totalEgresos)]],
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            headStyles: { fillColor: [220, 38, 38] },
            footStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' }
        });

        const finalTableY = (docPDF as any).lastAutoTable.finalY;

        docPDF.setFontSize(11).setFont('helvetica', 'bold');
        docPDF.text(`SALDO DISPONIBLE FINAL: Bs. ${formatCurrency(estadoFinal.disponibilidadTotal)}`, pageWidth / 2, finalTableY + 20, { align: 'center' });

        docPDF.save(`Balance_${companyInfo?.name}_${period}.pdf`);
    };
    
    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-10">
                <div>
                    <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                        Balance <span className="text-primary">Financiero</span>
                    </h2>
                    <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                    <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                        Revisión de estado de resultados y flujos de caja.
                    </p>
                </div>
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

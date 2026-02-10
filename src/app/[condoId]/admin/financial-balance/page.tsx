"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, 
    query, 
    doc, 
    Timestamp, 
    getDoc, 
    where, 
    getDocs, 
    setDoc, 
    serverTimestamp, 
    onSnapshot, 
    orderBy, 
    deleteDoc
} from 'firebase/firestore';
import { 
    Download, 
    Loader2, 
    RefreshCw, 
    Box, 
    Save, 
    MoreHorizontal, 
    Barcode as BarcodeIcon,
    ShieldCheck
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parse } from 'date-fns';
import { es } from 'date-fns/locale';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useAuthorization } from '@/hooks/use-authorization';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';

// --- TIPOS ---
interface PettyCashMovement {
    id: string;
    type: 'ingreso' | 'egreso';
    amount: number;
    description: string;
    date: Timestamp;
}

const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = [
    { value: '1', label: 'Enero' }, { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' }, { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' }, { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' }, { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' }, { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' }
];

const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

export default function FinancialBalancePage({ params }: { params: { condoId: string } }) {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const { user: currentUser, activeCondoId: authActiveCondoId } = useAuth();
    
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const isSuperAdmin = currentUser?.email === 'vallecondo@gmail.com';
    const workingCondoId = params.condoId || (isSuperAdmin ? sId : authActiveCondoId);

    const [dataLoading, setDataLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [companyInfo, setCompanyInfo] = useState({
        name: "EFAS CondoSys",
        rif: "J-00000000-0",
        address: ""
    });
    
    const [ingresos, setIngresos] = useState<{ concepto: string, real: number, category: string }[]>([]);
    const [egresos, setEgresos] = useState<any[]>([]);
    const [cajaChicaMovs, setCajaChicaMovs] = useState<PettyCashMovement[]>([]);
    const [cajaChica, setCajaChica] = useState({ saldoInicial: 0, reposiciones: 0, gastos: 0, saldoFinal: 0 });
    const [estadoFinal, setEstadoFinal] = useState({ saldoAnterior: 0, totalIngresos: 0, totalEgresos: 0, saldoBancos: 0, disponibilidadTotal: 0 });
    const [notas, setNotas] = useState('');
    const [savedStatements, setSavedStatements] = useState<any[]>([]);
    const [publishedReports, setPublishedReports] = useState<any[]>([]);

    const loadData = useCallback(async () => {
        if (!workingCondoId) return;
        setSyncing(true);
        try {
            const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const toDate = endOfMonth(fromDate);
    
            const [
                configSnap,
                paymentsSnap,
                expensesSnap,
                prevPettySnap,
                currentPettySnap
            ] = await Promise.all([
                getDoc(doc(db, 'condominios', workingCondoId, 'config', 'mainSettings')),
                getDocs(query(
                    collection(db, 'condominios', workingCondoId, 'payments'),
                    where('paymentDate', '>=', fromDate),
                    where('paymentDate', '<=', toDate),
                    where('status', '==', 'aprobado')
                )),
                getDocs(query(
                    collection(db, 'condominios', workingCondoId, 'gastos'),
                    where('date', '>=', fromDate),
                    where('date', '<=', toDate)
                )),
                getDocs(query(
                    collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'),
                    where('date', '<', fromDate)
                )),
                getDocs(query(
                    collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'),
                    where('date', '>=', fromDate),
                    where('date', '<=', toDate),
                    orderBy('date', 'asc')
                ))
            ]);
    
            if (configSnap.exists()) {
                const d = configSnap.data();
                setCompanyInfo({
                    name: d.companyInfo?.name || "EFAS CondoSys",
                    rif: d.companyInfo?.rif || "J-00000000-0",
                    address: d.companyInfo?.address || ""
                });
            }
    
            const totalIngresos = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
            
            const listaEgresos = expensesSnap.docs.map(d => ({
                id: d.id,
                fecha: format(d.data().date.toDate(), 'dd/MM/yyyy'),
                descripcion: d.data().description,
                monto: d.data().amount,
                category: d.data().category || 'General',
                paymentSource: d.data().paymentSource || 'banco'
            }));

            const totalEgresosBanco = listaEgresos
                .filter(e => e.paymentSource === 'banco')
                .reduce((sum, item) => sum + item.monto, 0);

            const egresosEfectivo = listaEgresos
                .filter(e => e.paymentSource === 'efectivo_bs' || e.paymentSource === 'efectivo_usd');

            const sInicialCC = prevPettySnap.docs.reduce((sum, doc) => {
                const data = doc.data();
                return sum + (data.type === 'ingreso' ? data.amount : -data.amount);
            }, 0);
    
            const movsCC = currentPettySnap.docs.map(d => ({ id: d.id, ...d.data() })) as PettyCashMovement[];
            const reposCC = movsCC.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0);
            
            const gastosFromMovs = movsCC.filter(m => m.type === 'egreso').reduce((sum, m) => sum + m.amount, 0);
            const gastosFromGastosCollection = egresosEfectivo.reduce((sum, item) => sum + item.monto, 0);
            const gastosTotalesCC = gastosFromMovs + gastosFromGastosCollection;

            const sFinalCC = sInicialCC + reposCC - gastosTotalesCC;
    
            const egresosEfectivoAsMovs: PettyCashMovement[] = egresosEfectivo.map(e => ({
                id: e.id,
                date: Timestamp.fromDate(parse(e.fecha, 'dd/MM/yyyy', new Date())),
                description: e.descripcion,
                amount: e.monto,
                type: 'egreso'
            }));

            const combinedMovs = [...movsCC, ...egresosEfectivoAsMovs].sort((a,b) => a.date.toMillis() - b.date.toMillis());

            setIngresos([{ concepto: 'Recaudación por Cobranza', real: totalIngresos, category: 'Ingresos Ordinarios' }]);
            setEgresos(listaEgresos);
            setCajaChicaMovs(combinedMovs);
            setCajaChica({ saldoInicial: sInicialCC, reposiciones: reposCC, gastos: gastosTotalesCC, saldoFinal: sFinalCC });
            
            setEstadoFinal(prev => {
                const saldoBancos = prev.saldoAnterior + totalIngresos - totalEgresosBanco;
                const totalEgresosGeneral = totalEgresosBanco + gastosTotalesCC;
                return {
                    ...prev,
                    totalIngresos,
                    totalEgresos: totalEgresosGeneral,
                    saldoBancos,
                    disponibilidadTotal: saldoBancos + sFinalCC
                };
            });
            
        } catch (error) { 
            console.error("Error loadData:", error);
            toast({ variant: "destructive", title: "Error al cargar datos", description: "No se pudieron obtener los datos financieros." }); 
        } finally { 
            setSyncing(false); 
            setDataLoading(false); 
        }
    }, [workingCondoId, selectedMonth, selectedYear, toast]);

    useEffect(() => {
        if (workingCondoId) {
            loadData();
            
            const unsubHistorial = onSnapshot(query(
                collection(db, 'condominios', workingCondoId, 'financial_statements'),
                orderBy('createdAt', 'desc')
            ), (snap) => {
                setSavedStatements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });

            const unsubPublicados = onSnapshot(query(
                collection(db, 'condominios', workingCondoId, 'published_reports')
            ), (snap) => {
                setPublishedReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });

            return () => { unsubHistorial(); unsubPublicados(); };
        }
    }, [workingCondoId, loadData]);

    const generatePDF = (data: any) => {
        const docPDF = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const margin = 15;
        const primaryColor = [15, 23, 42]; 
        const accentColor = [245, 158, 11];

        docPDF.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        docPDF.rect(0, 0, pageWidth, 40, 'F');

        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(14);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text(companyInfo.name.toUpperCase(), margin, 20);
        docPDF.setFontSize(9);
        docPDF.setFont('helvetica', 'normal');
        docPDF.text(`RIF: ${companyInfo.rif}`, margin, 26);
        docPDF.text(companyInfo.address.substring(0, 80) || "Administración General", margin, 31);

        const periodLabel = `${months.find(m => m.value === (data.month || selectedMonth))?.label.toUpperCase()} ${data.year || selectedYear}`;
        docPDF.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        docPDF.roundedRect(pageWidth - 65, 12, 50, 10, 1, 1, 'F');
        docPDF.setTextColor(0, 0, 0);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text(periodLabel, pageWidth - 40, 18.5, { align: 'center' });

        docPDF.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        docPDF.setFontSize(16);
        docPDF.text("ESTADO DE RESULTADOS MENSUAL", margin, 55);
        
        try {
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, `BAL-${selectedMonth}${selectedYear}`, { format: "CODE128", displayValue: false });
            docPDF.addImage(canvas.toDataURL("image/png"), 'PNG', pageWidth - 55, 47, 40, 10);
        } catch (e) {}

        docPDF.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
        docPDF.setLineWidth(1);
        docPDF.line(margin, 58, 30, 58);

        autoTable(docPDF, {
            startY: 65,
            head: [['CONCEPTOS DE INGRESOS', 'CATEGORÍA', 'MONTO Bs.']],
            body: data.ingresos.map((i: any) => [i.concepto.toUpperCase(), (i.category || 'ORDINARIOS').toUpperCase(), formatCurrency(i.monto || i.real)]),
            theme: 'striped', headStyles: { fillColor: [16, 185, 129] },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }
        });

        autoTable(docPDF, {
            startY: (docPDF as any).lastAutoTable.finalY + 8,
            head: [['DETALLES DE GASTOS Y EGRESOS', 'FECHA', 'FUENTE', 'MONTO Bs.']],
            body: data.egresos.length > 0 ? data.egresos.map((e: any) => [e.descripcion.toUpperCase(), e.fecha, (e.paymentSource || 'banco').replace('_', ' ').toUpperCase(), formatCurrency(e.monto)]) : [['NO SE REPORTARON GASTOS', '-', '-', '0,00']],
            theme: 'striped', headStyles: { fillColor: [225, 29, 72] },
            styles: { fontSize: 8 },
            columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
        });

        const fY = (docPDF as any).lastAutoTable.finalY + 10;
        const colWidth = (pageWidth - (margin * 2) - 5) / 2;

        docPDF.setDrawColor(220, 220, 220);
        docPDF.setLineWidth(0.2);
        docPDF.roundedRect(margin, fY, colWidth, 22, 1, 1, 'S');
        
        docPDF.setTextColor(100);
        docPDF.setFontSize(7);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text("RESUMEN DE CAJA CHICA", margin + 4, fY + 6);
        
        docPDF.setFont('helvetica', 'normal');
        docPDF.setTextColor(0);
        docPDF.text(`Saldo Anterior: Bs. ${formatCurrency(data.cajaChica?.saldoInicial || 0)}`, margin + 4, fY + 11);
        docPDF.text(`Movimientos: Bs. ${formatCurrency((data.cajaChica?.reposiciones || 0) - (data.cajaChica?.gastos || 0))}`, margin + 4, fY + 15);
        
        docPDF.setFont('helvetica', 'bold');
        docPDF.text(`DISPONIBILIDAD CAJA: Bs. ${formatCurrency(data.cajaChica?.saldoFinal || 0)}`, margin + 4, fY + 19);

        docPDF.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        docPDF.roundedRect(margin + colWidth + 5, fY, colWidth, 22, 1, 1, 'F');
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(8);
        docPDF.text("DISPONIBILIDAD TOTAL (BANCOS + CAJA)", margin + colWidth + 9, fY + 8);
        docPDF.setFontSize(13);
        docPDF.text(`Bs. ${formatCurrency(data.disponibilidad)}`, margin + colWidth + 9, fY + 17);

        docPDF.setFontSize(7);
        docPDF.setTextColor(150);
        docPDF.text(`Documento contable generado por sistema EFAS CondoSys - ${new Date().toLocaleString()}`, margin, 285);

        docPDF.save(`Balance_${periodLabel.replace(' ', '_')}.pdf`);
    };

    if (dataLoading) return <div className="h-screen flex flex-col items-center justify-center space-y-4"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="font-black uppercase text-xs">Cargando EFAS...</p></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-24 px-4">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic">Balance <span className="text-primary">Financiero</span></h2>
                    <div className="h-1.5 w-32 bg-amber-500 rounded-full"></div>
                    <p className="text-muted-foreground font-black uppercase text-[10px] flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> EFAS CondoSys - {workingCondoId}</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={loadData} className="rounded-2xl border-2 h-12 font-bold"><RefreshCw className={`mr-2 h-4 w-4 ${syncing && 'animate-spin'}`} /> Sincronizar</Button>
                    <Button className="bg-primary rounded-2xl h-12 px-8 font-black uppercase italic" onClick={() => generatePDF({ ingresos: ingresos.map(i => ({...i, monto: i.real})), egresos, cajaChica, disponibilidad: estadoFinal.disponibilidadTotal, id: 'LIVE' })}>
                        <Download className="mr-2 h-4 w-4" /> Exportar PDF
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <Label className="text-[10px] font-bold uppercase mb-2 block opacity-60">Selección de Período</Label>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="rounded-xl h-12 font-bold"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => (<SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>))}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="rounded-xl h-12 w-28 font-bold"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent></Select>
                    </div>
                </Card>
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <Label className="text-[10px] font-bold uppercase mb-2 block opacity-60">Saldo Anterior de Bancos</Label>
                    <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">Bs.</span><Input type="number" className="h-12 pl-12 text-xl font-black rounded-xl border-2" value={estadoFinal.saldoAnterior} onChange={(e) => setEstadoFinal(prev => ({...prev, saldoAnterior: parseFloat(e.target.value) || 0}))} /></div>
                </Card>
                <Card className="rounded-[2.5rem] p-6 bg-slate-900 text-white shadow-2xl relative overflow-hidden">
                    <div className="relative z-10"><p className="text-[10px] font-bold uppercase text-amber-500 mb-1">Total Disponible</p><p className="text-3xl font-black italic tracking-tighter">{formatCurrency(estadoFinal.disponibilidadTotal)} Bs.</p></div>
                    <div className="absolute -right-4 -bottom-4 opacity-10"><BarcodeIcon size={100} /></div>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="rounded-[2.5rem] border-2 shadow-lg overflow-hidden bg-white">
                    <CardHeader className="bg-emerald-50 p-6 flex flex-row justify-between items-center border-b"><CardTitle className="text-lg font-black uppercase italic text-emerald-900">Ingresos Registrados</CardTitle><Badge className="bg-emerald-500 font-black">{formatCurrency(estadoFinal.totalIngresos)} Bs.</Badge></CardHeader>
                    <Table><TableBody>{ingresos.map((ing, i) => (<TableRow key={i}><TableCell className="font-bold text-xs uppercase p-4 text-slate-700">{ing.concepto}</TableCell><TableCell className="text-right font-black text-emerald-600 p-4">{formatCurrency(ing.real)}</TableCell></TableRow>))}</TableBody></Table>
                </Card>
                <Card className="rounded-[2.5rem] border-2 shadow-lg overflow-hidden bg-white">
                    <CardHeader className="bg-rose-50 p-6 flex flex-row justify-between items-center border-b"><CardTitle className="text-lg font-black uppercase italic text-rose-900">Egresos Registrados</CardTitle><Badge className="bg-rose-500 font-black">{formatCurrency(estadoFinal.totalEgresos)} Bs.</Badge></CardHeader>
                    <div className="max-h-[250px] overflow-auto"><Table><TableBody>{egresos.map((egr) => (<TableRow key={egr.id}><TableCell className="p-4"><p className="font-bold text-[10px] uppercase text-slate-800">{egr.descripcion}</p><p className="text-[8px] opacity-50 text-slate-500">{egr.fecha} - <span className="font-black">{(egr.paymentSource || 'banco').replace('_', ' ').toUpperCase()}</span></p></TableCell><TableCell className="text-right font-black text-rose-600 p-4">{formatCurrency(egr.monto)}</TableCell></TableRow>))}</TableBody></Table></div>
                </Card>
            </div>

            <Card className="rounded-[2.5rem] border-2 shadow-xl overflow-hidden bg-white">
                <CardHeader className="bg-slate-100 p-6 flex flex-row justify-between items-center border-b">
                    <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2 text-slate-800">
                        <Box className="h-5 w-5 text-primary" /> 
                        Flujo de Caja Chica
                    </CardTitle>
                    <Badge variant="outline" className="font-black border-primary text-primary bg-white shadow-sm">
                        DISPONIBLE: {formatCurrency(cajaChica.saldoFinal)} Bs.
                    </Badge>
                </CardHeader>
                <div className="grid grid-cols-2 md:grid-cols-4 border-b bg-slate-50/50">
                    <div className="p-5 text-center border-r"><p className="text-[10px] font-bold text-slate-500 uppercase">Anterior</p><p className="font-black text-slate-900 text-lg">{formatCurrency(cajaChica.saldoInicial)}</p></div>
                    <div className="p-5 text-center border-r"><p className="text-[10px] font-bold text-emerald-600 uppercase">Entradas</p><p className="font-black text-emerald-600 text-lg">+{formatCurrency(cajaChica.reposiciones)}</p></div>
                    <div className="p-5 text-center border-r"><p className="text-[10px] font-bold text-rose-600 uppercase">Salidas</p><p className="font-black text-rose-600 text-lg">-{formatCurrency(cajaChica.gastos)}</p></div>
                    <div className="p-5 text-center bg-slate-100/50"><p className="text-[10px] font-bold text-primary uppercase">Cierre</p><p className="font-black text-primary text-lg">{formatCurrency(cajaChica.saldoFinal)}</p></div>
                </div>
                <Table>
                    <TableHeader className="bg-slate-50"><TableRow><TableHead className="text-[10px] uppercase font-black text-slate-800">Fecha</TableHead><TableHead className="text-[10px] uppercase font-black text-slate-800">Descripción</TableHead><TableHead className="text-right text-[10px] uppercase font-black text-slate-800">Monto</TableHead></TableRow></TableHeader>
                    <TableBody>{cajaChicaMovs.map((m) => (<TableRow key={m.id} className="h-10 text-[11px] border-b hover:bg-slate-50 transition-colors"><TableCell className="font-bold text-slate-600 p-4">{format(m.date.toDate(), 'dd/MM')}</TableCell><TableCell className="uppercase text-slate-700 font-semibold p-4">{m.description}</TableCell><TableCell className={`text-right font-black p-4 ${m.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.type === 'ingreso' ? '+' : '-'}{formatCurrency(m.amount)}</TableCell></TableRow>))}</TableBody>
                </Table>
            </Card>

            <Card className="rounded-[3rem] p-8 border-2 shadow-2xl bg-white">
                <div className="space-y-4">
                    <Label className="text-xs font-black uppercase text-slate-500 ml-1">Observaciones</Label>
                    <Textarea placeholder="Notas para el PDF..." className="rounded-2xl min-h-[100px] border-2 bg-slate-50/30" value={notas} onChange={e => setNotas(e.target.value)} />
                    <div className="flex justify-end"><Button className="rounded-full h-12 px-10 font-black uppercase italic shadow-xl bg-slate-900" onClick={async () => {
                        if (!workingCondoId) return;
                        const pId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                        await setDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', pId), { 
                            id: pId, 
                            ingresos: ingresos.map(i => ({...i, monto: i.real})), 
                            egresos, 
                            cajaChica, 
                            estadoFinanciero: estadoFinal, 
                            notas, 
                            createdAt: serverTimestamp() 
                        });
                        toast({ title: "BALANCE GUARDADO" });
                    }}><Save className="mr-2 h-5 w-5" /> Guardar Período</Button></div>
                </div>
            </Card>

            <Card className="rounded-[3rem] border-2 shadow-2xl overflow-hidden bg-white">
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center"><CardTitle className="text-xl font-black uppercase italic">Historial</CardTitle><Badge className="bg-amber-500 font-black text-slate-900">{savedStatements.length} REGISTROS</Badge></div>
                <Table><TableHeader className="bg-slate-50 h-14"><TableRow><TableHead className="font-black text-[10px] pl-8 uppercase text-slate-700">Período</TableHead><TableHead className="font-black text-[10px] uppercase text-slate-700">Total</TableHead><TableHead className="font-black text-[10px] uppercase text-slate-700">Visibilidad</TableHead><TableHead className="text-right font-black text-[10px] pr-8 uppercase text-slate-700">Acciones</TableHead></TableRow></TableHeader>
                    <TableBody>{savedStatements.map((s) => {
                        const isPub = publishedReports.some(p => p.sourceId === s.id);
                        return (<TableRow key={s.id} className="h-20 hover:bg-slate-50"><TableCell className="pl-8 font-black uppercase text-sm italic text-primary">{format(parse(s.id, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: es })}</TableCell><TableCell className="font-black text-slate-700">{formatCurrency(s.estadoFinanciero?.disponibilidadTotal)} Bs.</TableCell>
                            <TableCell><div className="flex items-center gap-2"><Switch checked={isPub} onCheckedChange={() => {
                                requestAuthorization(async () => {
                                    if (!workingCondoId) return;
                                    const rRef = doc(db, 'condominios', workingCondoId, 'published_reports', `balance-${s.id}`);
                                    if(isPub) await deleteDoc(rRef); 
                                    else await setDoc(rRef, { type: 'balance', sourceId: s.id, createdAt: serverTimestamp() });
                                    toast({ title: isPub ? "DESPUBLICADO" : "PUBLICADO" });
                                });
                            }} /><span className="text-[9px] font-black uppercase text-slate-500">{isPub ? 'Público' : 'Privado'}</span></div></TableCell>
                            <TableCell className="text-right pr-8"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="rounded-full h-10 w-10 border-2 border-slate-200"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-xl border-2 w-52"><DropdownMenuItem className="font-bold text-xs" onClick={() => generatePDF({...s, disponibilidad: s.estadoFinanciero?.disponibilidadTotal, month: s.id.split('-')[1], year: s.id.split('-')[0]})}>DESCARGAR PDF</DropdownMenuItem><DropdownMenuItem className="text-rose-600 font-bold text-xs" onClick={async () => {
                                    requestAuthorization(async () => {
                                        if (!workingCondoId) return;
                                        await deleteDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', s.id));
                                        toast({ title: "BALANCE ELIMINADO" });
                                    });
                                }}>ELIMINAR</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>);
                    })}</TableBody>
                </Table>
            </Card>
        </div>
    );
}

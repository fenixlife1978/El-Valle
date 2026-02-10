
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
    ShieldCheck,
    Banknote,
    Landmark,
    DollarSign,
    Wallet
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parse } from 'date-fns';
import { es } from 'date-fns/locale';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

// --- TYPES ---
interface PettyCashMovement {
    id: string;
    type: 'ingreso' | 'egreso';
    amount: number;
    description: string;
    date: Timestamp;
}

interface Saldos {
  anterior: { banco: number; efectivoBs: number; efectivoUsd: number; };
  ingresos: { banco: number; efectivoBs: number; efectivoUsd: number; };
  egresos: { banco: number; efectivoBs: number; efectivoUsd: number; };
  cajaChica: { saldoInicial: number; reposiciones: number; gastos: number; saldoFinal: number; };
  final: { banco: number; efectivoBs: number; efectivoUsd: number; cajaChica: number; };
  disponibilidadTotal: number;
}

const emptySaldos: Saldos = {
    anterior: { banco: 0, efectivoBs: 0, efectivoUsd: 0 },
    ingresos: { banco: 0, efectivoBs: 0, efectivoUsd: 0 },
    egresos: { banco: 0, efectivoBs: 0, efectivoUsd: 0 },
    cajaChica: { saldoInicial: 0, reposiciones: 0, gastos: 0, saldoFinal: 0 },
    final: { banco: 0, efectivoBs: 0, efectivoUsd: 0, cajaChica: 0 },
    disponibilidadTotal: 0
};

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

    const [companyInfo, setCompanyInfo] = useState({ name: "EFAS CondoSys", rif: "J-00000000-0", address: "" });
    const [saldos, setSaldos] = useState<Saldos>(emptySaldos);
    const [allEgresosPeriodo, setAllEgresosPeriodo] = useState<any[]>([]);
    const [cajaChicaMovs, setCajaChicaMovs] = useState<PettyCashMovement[]>([]);
    const [notas, setNotas] = useState('');
    const [savedStatements, setSavedStatements] = useState<any[]>([]);
    const [publishedReports, setPublishedReports] = useState<any[]>([]);
    

    const loadData = useCallback(async () => {
        if (!workingCondoId) return;
        setSyncing(true);
        try {
            const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const toDate = endOfMonth(fromDate);
    
            const [configSnap, paymentsSnap, expensesSnap, prevPettySnap, currentPettySnap] = await Promise.all([
                getDoc(doc(db, 'condominios', workingCondoId, 'config', 'mainSettings')),
                getDocs(query(collection(db, 'condominios', workingCondoId, 'payments'), where('paymentDate', '>=', fromDate), where('paymentDate', '<=', toDate), where('status', '==', 'aprobado'))),
                getDocs(query(collection(db, 'condominios', workingCondoId, 'gastos'), where('date', '>=', fromDate), where('date', '<=', toDate))),
                getDocs(query(collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'), where('date', '<', fromDate))),
                getDocs(query(collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'), where('date', '>=', fromDate), where('date', '<=', toDate), orderBy('date', 'asc')))
            ]);
    
            if (configSnap.exists()) setCompanyInfo({ name: configSnap.data().companyInfo?.name || "EFAS CondoSys", rif: configSnap.data().companyInfo?.rif || "J-00000000-0", address: configSnap.data().companyInfo?.address || "" });

            const ingresos = paymentsSnap.docs.reduce((acc, doc) => {
                const p = doc.data();
                if (p.paymentMethod === 'efectivo_bs') acc.efectivoBs += p.totalAmount;
                else if (p.paymentMethod === 'efectivo_usd') acc.efectivoUsd += p.totalAmount;
                else acc.banco += p.totalAmount;
                return acc;
            }, { banco: 0, efectivoBs: 0, efectivoUsd: 0 });

            const egresosList = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const egresos = egresosList.reduce((acc, e) => {
                if (e.paymentSource === 'efectivo_bs') acc.efectivoBs += e.amount;
                else if (e.paymentSource === 'efectivo_usd') acc.efectivoUsd += e.amount;
                else acc.banco += e.amount; // Default to banco
                return acc;
            }, { banco: 0, efectivoBs: 0, efectivoUsd: 0 });
            
            setAllEgresosPeriodo(egresosList);

            const saldoInicialCC = prevPettySnap.docs.reduce((sum, doc) => sum + (doc.data().type === 'ingreso' ? doc.data().amount : -doc.data().amount), 0);
            const movsCC = currentPettySnap.docs.map(d => ({ id: d.id, ...d.data() })) as PettyCashMovement[];
            const reposicionesCC = movsCC.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0);
            const gastosCC = movsCC.filter(m => m.type === 'egreso').reduce((sum, m) => sum + m.amount, 0);
            const saldoFinalCC = saldoInicialCC + reposicionesCC - gastosCC;

            setSaldos(prev => {
                const finalBanco = prev.anterior.banco + ingresos.banco - egresos.banco;
                const finalEfectivoBs = prev.anterior.efectivoBs + ingresos.efectivoBs - egresos.efectivoBs;
                const finalEfectivoUsd = prev.anterior.efectivoUsd + ingresos.efectivoUsd - egresos.efectivoUsd;
                
                return {
                    ...prev,
                    ingresos,
                    egresos,
                    cajaChica: { saldoInicial: saldoInicialCC, reposiciones: reposicionesCC, gastos: gastosCC, saldoFinal: saldoFinalCC },
                    final: { banco: finalBanco, efectivoBs: finalEfectivoBs, efectivoUsd: finalEfectivoUsd, cajaChica: saldoFinalCC },
                    disponibilidadTotal: finalBanco + finalEfectivoBs + finalEfectivoUsd + saldoFinalCC
                };
            });
            setCajaChicaMovs(movsCC);

        } catch (error) { 
            console.error("Error loadData:", error);
            toast({ variant: "destructive", title: "Error al cargar datos" }); 
        } finally { 
            setSyncing(false); 
            setDataLoading(false); 
        }
    }, [workingCondoId, selectedMonth, selectedYear, toast]);

    useEffect(() => {
        if (workingCondoId) {
            loadData();
            const unsubHistorial = onSnapshot(query(collection(db, 'condominios', workingCondoId, 'financial_statements'), orderBy('createdAt', 'desc')), (snap) => setSavedStatements(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
            const unsubPublicados = onSnapshot(query(collection(db, 'condominios', workingCondoId, 'published_reports')), (snap) => setPublishedReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
            return () => { unsubHistorial(); unsubPublicados(); };
        }
    }, [workingCondoId, loadData]);

    const generatePDF = (data: any) => {
        // PDF generation logic here, using the passed 'data' object.
        // This needs to be refactored to use the new 'saldos' structure.
        toast({ title: "Función PDF en desarrollo", description: "La exportación a PDF se adaptará a la nueva estructura." });
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
                    <Button className="bg-primary rounded-2xl h-12 px-8 font-black uppercase italic" onClick={() => generatePDF({ ...saldos, id: 'LIVE' })}>
                        <Download className="mr-2 h-4 w-4" /> Exportar PDF
                    </Button>
                </div>
            </header>

            {/* Saldos Anteriores y Período */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-2 rounded-[2.5rem] p-6 shadow-xl border-2">
                    <Label className="text-[10px] font-bold uppercase mb-2 block opacity-60">Selección de Período</Label>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="rounded-xl h-12 font-bold"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => (<SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>))}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="rounded-xl h-12 w-28 font-bold"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent></Select>
                    </div>
                </Card>
                 <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <Label className="text-[10px] font-bold uppercase mb-2 block opacity-60">Saldo Anterior Banco</Label>
                    <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">Bs.</span><Input type="number" className="h-12 pl-12 text-lg font-black rounded-xl border-2" value={saldos.anterior.banco} onChange={(e) => setSaldos(prev => ({...prev, anterior: {...prev.anterior, banco: parseFloat(e.target.value) || 0}}))} /></div>
                </Card>
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <Label className="text-[10px] font-bold uppercase mb-2 block opacity-60">S. Ant. Efec. Bs.</Label>
                    <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">Bs.</span><Input type="number" className="h-12 pl-12 text-lg font-black rounded-xl border-2" value={saldos.anterior.efectivoBs} onChange={(e) => setSaldos(prev => ({...prev, anterior: {...prev.anterior, efectivoBs: parseFloat(e.target.value) || 0}}))} /></div>
                </Card>
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <Label className="text-[10px] font-bold uppercase mb-2 block opacity-60">S. Ant. Efec. USD</Label>
                    <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">Bs.</span><Input type="number" className="h-12 pl-12 text-lg font-black rounded-xl border-2" value={saldos.anterior.efectivoUsd} onChange={(e) => setSaldos(prev => ({...prev, anterior: {...prev.anterior, efectivoUsd: parseFloat(e.target.value) || 0}}))} /></div>
                </Card>
            </div>
            
            {/* Resumen de Cuentas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <Card className="rounded-[2.5rem] p-5 shadow-lg border-2 bg-gradient-to-br from-blue-50 to-white">
                    <CardHeader className="p-0 flex flex-row items-center justify-between"><CardTitle className="text-sm font-black uppercase text-blue-900">Banco</CardTitle><Landmark className="w-4 h-4 text-blue-400"/></CardHeader>
                    <CardContent className="p-0 pt-2"><p className="text-2xl font-black text-blue-900">{formatCurrency(saldos.final.banco)}</p><p className="text-[10px] font-bold text-blue-500">Saldo Final</p></CardContent>
                </Card>
                <Card className="rounded-[2.5rem] p-5 shadow-lg border-2 bg-gradient-to-br from-emerald-50 to-white">
                    <CardHeader className="p-0 flex flex-row items-center justify-between"><CardTitle className="text-sm font-black uppercase text-emerald-900">Efectivo Bs.</CardTitle><Banknote className="w-4 h-4 text-emerald-400"/></CardHeader>
                    <CardContent className="p-0 pt-2"><p className="text-2xl font-black text-emerald-900">{formatCurrency(saldos.final.efectivoBs)}</p><p className="text-[10px] font-bold text-emerald-500">Saldo Final</p></CardContent>
                </Card>
                <Card className="rounded-[2.5rem] p-5 shadow-lg border-2 bg-gradient-to-br from-amber-50 to-white">
                    <CardHeader className="p-0 flex flex-row items-center justify-between"><CardTitle className="text-sm font-black uppercase text-amber-900">Efectivo USD</CardTitle><DollarSign className="w-4 h-4 text-amber-500"/></CardHeader>
                    <CardContent className="p-0 pt-2"><p className="text-2xl font-black text-amber-900">{formatCurrency(saldos.final.efectivoUsd)}</p><p className="text-[10px] font-bold text-amber-600">Saldo Final (Eq. Bs.)</p></CardContent>
                </Card>
                <Card className="rounded-[2.5rem] p-5 shadow-lg border-2 bg-gradient-to-br from-slate-100 to-white">
                    <CardHeader className="p-0 flex flex-row items-center justify-between"><CardTitle className="text-sm font-black uppercase text-slate-900">Caja Chica</CardTitle><Wallet className="w-4 h-4 text-slate-400"/></CardHeader>
                    <CardContent className="p-0 pt-2"><p className="text-2xl font-black text-slate-900">{formatCurrency(saldos.cajaChica.saldoFinal)}</p><p className="text-[10px] font-bold text-slate-500">Saldo Final</p></CardContent>
                </Card>
            </div>
             <Card className="rounded-[2.5rem] p-6 bg-slate-900 text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10"><p className="text-[10px] font-bold uppercase text-amber-500 mb-1">Total Disponible (Suma de todas las cuentas)</p><p className="text-3xl font-black italic tracking-tighter">{formatCurrency(saldos.disponibilidadTotal)} Bs.</p></div>
                <div className="absolute -right-4 -bottom-4 opacity-10"><BarcodeIcon size={100} /></div>
            </Card>

            {/* Detalles de Ingresos y Egresos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-[2.5rem] border-2 shadow-lg overflow-hidden bg-white">
                    <CardHeader className="bg-emerald-50 p-6 border-b"><CardTitle className="text-lg font-black uppercase italic text-emerald-900">Ingresos del Período</CardTitle></CardHeader>
                    <Table>
                        <TableBody>
                            <TableRow><TableCell className="font-bold uppercase text-xs text-slate-700">Recaudación Bancaria</TableCell><TableCell className="text-right font-black text-emerald-600">{formatCurrency(saldos.ingresos.banco)}</TableCell></TableRow>
                            <TableRow><TableCell className="font-bold uppercase text-xs text-slate-700">Recaudación Efectivo Bs.</TableCell><TableCell className="text-right font-black text-emerald-600">{formatCurrency(saldos.ingresos.efectivoBs)}</TableCell></TableRow>
                            <TableRow><TableCell className="font-bold uppercase text-xs text-slate-700">Recaudación Efectivo USD</TableCell><TableCell className="text-right font-black text-emerald-600">{formatCurrency(saldos.ingresos.efectivoUsd)}</TableCell></TableRow>
                        </TableBody>
                         <TableFooter className="bg-emerald-100/50"><TableRow><TableCell className="font-black uppercase text-sm">Total Ingresos</TableCell><TableCell className="text-right font-black text-emerald-800 text-lg">{formatCurrency(saldos.ingresos.banco + saldos.ingresos.efectivoBs + saldos.ingresos.efectivoUsd)}</TableCell></TableRow></TableFooter>
                    </Table>
                </Card>
                <Card className="rounded-[2.5rem] border-2 shadow-lg overflow-hidden bg-white">
                    <CardHeader className="bg-rose-50 p-6 border-b"><CardTitle className="text-lg font-black uppercase italic text-rose-900">Egresos del Período</CardTitle></CardHeader>
                    <Table>
                        <TableBody>
                            <TableRow><TableCell className="font-bold uppercase text-xs text-slate-700">Salidas de Banco</TableCell><TableCell className="text-right font-black text-rose-600">{formatCurrency(saldos.egresos.banco)}</TableCell></TableRow>
                            <TableRow><TableCell className="font-bold uppercase text-xs text-slate-700">Salidas de Efectivo Bs.</TableCell><TableCell className="text-right font-black text-rose-600">{formatCurrency(saldos.egresos.efectivoBs)}</TableCell></TableRow>
                            <TableRow><TableCell className="font-bold uppercase text-xs text-slate-700">Salidas de Efectivo USD</TableCell><TableCell className="text-right font-black text-rose-600">{formatCurrency(saldos.egresos.efectivoUsd)}</TableCell></TableRow>
                        </TableBody>
                        <TableFooter className="bg-rose-100/50"><TableRow><TableCell className="font-black uppercase text-sm">Total Egresos</TableCell><TableCell className="text-right font-black text-rose-800 text-lg">{formatCurrency(saldos.egresos.banco + saldos.egresos.efectivoBs + saldos.egresos.efectivoUsd)}</TableCell></TableRow></TableFooter>
                    </Table>
                </Card>
            </div>
            
             <Card className="rounded-[2.5rem] border-2 shadow-xl overflow-hidden bg-white">
                <CardHeader className="bg-slate-100 p-6 flex flex-row justify-between items-center border-b">
                    <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2 text-slate-800">
                        <Box className="h-5 w-5 text-primary" /> 
                        Flujo de Caja Chica
                    </CardTitle>
                </CardHeader>
                <div className="grid grid-cols-2 md:grid-cols-4 border-b bg-slate-50/50">
                    <div className="p-5 text-center border-r"><p className="text-[10px] font-bold text-slate-500 uppercase">Anterior</p><p className="font-black text-slate-900 text-lg">{formatCurrency(saldos.cajaChica.saldoInicial)}</p></div>
                    <div className="p-5 text-center border-r"><p className="text-[10px] font-bold text-emerald-600 uppercase">Entradas</p><p className="font-black text-emerald-600 text-lg">+{formatCurrency(saldos.cajaChica.reposiciones)}</p></div>
                    <div className="p-5 text-center border-r"><p className="text-[10px] font-bold text-rose-600 uppercase">Salidas</p><p className="font-black text-rose-600 text-lg">-{formatCurrency(saldos.cajaChica.gastos)}</p></div>
                    <div className="p-5 text-center bg-slate-100/50"><p className="text-[10px] font-bold text-primary uppercase">Cierre</p><p className="font-black text-primary text-lg">{formatCurrency(saldos.cajaChica.saldoFinal)}</p></div>
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
                            ingresos: [{c:'Recaudación Bancaria',m:saldos.ingresos.banco},{c:'Recaudación Efectivo Bs.',m:saldos.ingresos.efectivoBs},{c:'Recaudación Efectivo USD',m:saldos.ingresos.efectivoUsd}], 
                            egresos: allEgresosPeriodo.map(e => ({id: e.id, dia: format(e.date.toDate(), 'dd'), concepto: e.description, monto: e.amount})), 
                            saldos: saldos,
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
                        return (<TableRow key={s.id} className="h-20 hover:bg-slate-50"><TableCell className="pl-8 font-black uppercase text-sm italic text-primary">{format(parse(s.id, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: es })}</TableCell><TableCell className="font-black text-slate-700">{formatCurrency(s.saldos?.disponibilidadTotal)} Bs.</TableCell>
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
                                <DropdownMenuContent align="end" className="rounded-xl border-2 w-52"><DropdownMenuItem className="font-bold text-xs" onClick={() => generatePDF({...s, disponibilidad: s.saldos?.disponibilidadTotal, month: s.id.split('-')[1], year: s.id.split('-')[0]})}>DESCARGAR PDF</DropdownMenuItem><DropdownMenuItem className="text-rose-600 font-bold text-xs" onClick={async () => {
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

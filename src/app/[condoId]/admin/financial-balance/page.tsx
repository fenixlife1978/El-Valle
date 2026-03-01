'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Download, Landmark, Coins, Wallet, Share2, FileText } from "lucide-react";
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Label } from '@/components/ui/label';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: format(new Date(2000, i), 'MMMM', { locale: es }),
}));

// RUTA MAESTRA ACTUALIZADA (ID MAESTRO BDV)
const BDV_ACCOUNT_ID = "Hlc0ky0QdnaXIsuf19Od";

export default function FinancialBalancePage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const { condoId: urlCondoId } = resolvedParams;
    const { userProfile, companyInfo: authCompanyInfo } = useAuth();
    const { toast } = useToast();

    const workingCondoId = userProfile?.workingCondoId || userProfile?.condominioId || urlCondoId;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [saldoAnteriorBanco, setSaldoAnteriorBanco] = useState(0);
    const [egresosTesorería, setEgresosTesorería] = useState<{ concepto: string, monto: number, cuenta: string }[]>([]);
    
    const [realBalances, setRealBalances] = useState({ banco: 0, cajaPrincipal: 0, cajaChica: 0 });
    const [notas, setNotas] = useState("");

    // ESCUCHA DE SALDOS REALES DE CUENTAS (Sincronización Atómica)
    useEffect(() => {
        if (!workingCondoId) return;
        return onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), (snap) => {
            const accounts = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const bdv = accounts.find(a => a.id === BDV_ACCOUNT_ID);
            const cp = accounts.find(a => a.id === 'CAJA_PRINCIPAL_ID' || a.nombre?.toUpperCase().includes('CAJA PRINCIPAL'));
            const cc = accounts.find(a => a.nombre?.toUpperCase().includes('CAJA CHICA'));
            setRealBalances({ 
                banco: bdv?.saldoActual || 0, 
                cajaPrincipal: cp?.saldoActual || 0, 
                cajaChica: cc?.saldoActual || 0 
            });
        });
    }, [workingCondoId]);

    useEffect(() => {
        if (!workingCondoId) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                const year = parseInt(selectedYear), month = parseInt(selectedMonth) - 1;
                const from = startOfMonth(new Date(year, month, 1)), to = endOfMonth(from);
                
                // Obtenemos los egresos reales de las transacciones para el periodo
                const tSnap = await getDocs(query(
                    collection(db, 'condominios', workingCondoId, 'transacciones'), 
                    where('fecha', '>=', from), 
                    where('fecha', '<=', to), 
                    where('tipo', '==', 'egreso'), 
                    orderBy('fecha', 'desc')
                ));
                setEgresosTesorería(tSnap.docs.map(d => ({ 
                    concepto: d.data().descripcion, 
                    monto: d.data().monto, 
                    cuenta: d.data().nombreCuenta 
                })));
            } catch (e) { console.error(e); } finally { setLoading(false); }
        };
        fetchData();
    }, [selectedMonth, selectedYear, workingCondoId]);

    const totalEgresosMes = useMemo(() => egresosTesorería.reduce((sum, e) => sum + e.monto, 0), [egresosTesorería]);

    const handleSave = async () => {
        if (!workingCondoId) return;
        setSaving(true);
        try {
            const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
            await setDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', docId), {
                periodo: docId, 
                saldoAnteriorBanco, 
                ingresos: [
                    { concepto: 'BANCO (DISPONIBILIDAD REAL)', monto: realBalances.banco }, 
                    { concepto: 'CAJA (DISPONIBILIDAD REAL)', monto: realBalances.cajaPrincipal }
                ],
                egresos: egresosTesorería, 
                estadoFinanciero: { 
                    saldoNetoBanco: realBalances.banco, 
                    saldoCajaPrincipal: realBalances.cajaPrincipal,
                    saldoCajaChica: realBalances.cajaChica
                },
                notas, 
                updatedAt: serverTimestamp()
            });
            toast({ title: "Balance Guardado", description: "Los saldos reales han sido sincronizados en el reporte." });
        } catch (e) { toast({ variant: 'destructive', title: "Error" }); } finally { setSaving(false); }
    };

    const generatePdfBlob = async () => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF();
        const info = authCompanyInfo || { name: 'EFAS CondoSys', rif: 'J-00000000-0' };
        const monthLabel = months.find(m => m.value === selectedMonth)?.label.toUpperCase();
        
        // Header Estilo Premium
        doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14).setFont('helvetica', 'bold').text(info.name.toUpperCase(), 14, 15);
        doc.setFontSize(8).text(`RIF: ${info.rif}`, 14, 22);
        doc.setFontSize(10).text("BALANCE FINANCIERO", 196, 18, { align: 'right' });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12).text(`Período: ${monthLabel} ${selectedYear}`, 14, 45);

        // Tabla de Disponibilidad Real
        autoTable(doc, {
            startY: 55,
            head: [['CONCEPTO DE TESORERÍA', 'MONTO DISPONIBLE (BS.)']],
            body: [
                ['BANCO (DISPONIBILIDAD REAL)', formatCurrency(realBalances.banco)],
                ['CAJA PRINCIPAL (DISPONIBILIDAD REAL)', formatCurrency(realBalances.cajaPrincipal)],
                ['CAJA CHICA', formatCurrency(realBalances.cajaChica)]
            ],
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 9, cellPadding: 4 }
        });

        // Tabla de Egresos Detallados
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['CONCEPTO / DESCRIPCIÓN', 'CUENTA DE PAGO', 'MONTO (BS.)']],
            body: egresosTesorería.map(e => [e.concepto.toUpperCase(), e.cuenta.toUpperCase(), formatCurrency(e.monto)]),
            headStyles: { fillColor: [220, 38, 38] },
            styles: { fontSize: 8, cellPadding: 3 },
            foot: [['TOTAL EGRESOS DEL PERIODO', '', formatCurrency(totalEgresosMes)]],
            footStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' }
        });

        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(9).setFont('helvetica', 'bold').text("NOTAS Y OBSERVACIONES:", 14, finalY);
        doc.setFont('helvetica', 'normal').text(notas || 'Sin notas adicionales.', 14, finalY + 5, { maxWidth: 180 });

        return { doc, filename: `Balance_${selectedYear}_${selectedMonth}.pdf` };
    };

    const handleExportPdf = async () => {
        setExporting(true);
        try {
            const { doc, filename } = await generatePdfBlob();
            doc.save(filename);
            toast({ title: "Descarga Iniciada", description: "El reporte se está guardando en su dispositivo." });
        } catch (e) {
            toast({ variant: 'destructive', title: "Error en exportación" });
        } finally { setExporting(false); }
    };

    const handleSharePdf = async () => {
        setSharing(true);
        try {
            const { doc, filename } = await generatePdfBlob();
            const blob = doc.output('blob');
            if (navigator.share) {
                const file = new File([blob], filename, { type: 'application/pdf' });
                await navigator.share({
                    files: [file],
                    title: 'Balance Financiero',
                    text: `Reporte de balance correspondiente a ${months.find(m=>m.value === selectedMonth)?.label} ${selectedYear}`
                });
            } else {
                toast({ title: "No compatible", description: "Su navegador no soporta la función de compartir archivos directamente." });
            }
        } catch (e) {
            console.error(e);
        } finally { setSharing(false); }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8 bg-[#1A1D23] min-h-screen font-montserrat text-white italic">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-10">
                <div>
                    <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">Balance <span className="text-primary">Financiero</span></h1>
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.3em] mt-2 italic">Integridad Contable EFAS</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-36 bg-slate-900 border-white/5 font-black uppercase text-[10px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white">{months.map(m => (<SelectItem key={m.value} value={m.value} className="font-black uppercase text-[10px]">{m.label}</SelectItem>))}</SelectContent></Select>
                    <Input className="w-24 bg-slate-900 border-white/5 font-black rounded-xl" type="number" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} />
                    <Button onClick={handleExportPdf} disabled={exporting} variant="outline" className="rounded-xl border-white/10 text-white h-10 font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic">
                        {exporting ? <Loader2 className="animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF
                    </Button>
                    <Button onClick={handleSharePdf} disabled={sharing} variant="outline" className="rounded-xl border-white/10 text-white h-10 font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic">
                        {sharing ? <Loader2 className="animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />} Compartir
                    </Button>
                </div>
            </div>

            {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div> : <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-8 border border-white/5 relative overflow-hidden italic"><div className="relative z-10"><p className="text-[10px] font-black uppercase text-primary italic">Saldo Real Banco</p><p className="text-3xl font-black italic mt-1">Bs. {formatCurrency(realBalances.banco)}</p></div><Landmark className="absolute top-6 right-6 h-12 w-12 text-white/5"/></Card>
                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-8 border border-white/5 relative overflow-hidden italic"><div className="relative z-10"><p className="text-[10px] font-black uppercase text-emerald-500 italic">Saldo Real Caja</p><p className="text-3xl font-black italic mt-1">Bs. {formatCurrency(realBalances.cajaPrincipal)}</p></div><Coins className="absolute top-6 right-6 h-12 w-12 text-white/5"/></Card>
                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-8 border border-white/5 relative overflow-hidden italic"><div className="relative z-10"><p className="text-[10px] font-black uppercase text-slate-500 italic">Caja Chica</p><p className="text-3xl font-black italic mt-1">Bs. {formatCurrency(realBalances.cajaChica)}</p></div><Wallet className="absolute top-6 right-6 h-12 w-12 text-white/5"/></Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                    <Card className="rounded-[2.5rem] bg-slate-900 border-none shadow-2xl overflow-hidden border border-white/5"><CardHeader className="bg-slate-950 p-6 border-b border-white/5"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">Resumen de Ingresos (Sincronizado)</CardTitle></CardHeader>
                    <CardContent className="p-0"><Table><TableBody>
                        <TableRow className="bg-white/5 border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic">Saldo Anterior Banco (Ajuste)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoAnteriorBanco} onChange={e=>setSaldoAnteriorBanco(Number(e.target.value))}/></TableCell></TableRow>
                        <TableRow className="border-b border-white/5"><TableCell className="text-white/60 text-[10px] font-black uppercase italic">Disponibilidad en Banco (Real)</TableCell><TableCell className="text-right font-black italic">Bs. {formatCurrency(realBalances.banco)}</TableCell></TableRow>
                        <TableRow className="border-none"><TableCell className="text-white/60 text-[10px] font-black uppercase italic">Disponibilidad en Caja (Real)</TableCell><TableCell className="text-right font-black text-emerald-500 italic">Bs. {formatCurrency(realBalances.cajaPrincipal)}</TableCell></TableRow>
                    </TableBody></Table></CardContent></Card>

                    <Card className="rounded-[2.5rem] bg-slate-900 border-none shadow-2xl overflow-hidden border border-white/5"><CardHeader className="bg-slate-950 p-6 border-b border-white/5"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">Egresos de Tesorería</CardTitle></CardHeader>
                    <CardContent className="p-0"><Table><TableHeader><TableRow className="bg-slate-950/50 border-white/5"><TableHead className="text-white/40 font-black text-[10px] uppercase">Concepto</TableHead><TableHead className="text-right text-white/40 font-black text-[10px] pr-8">Monto</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {egresosTesorería.map((e, i) => (
                            <TableRow key={i} className="border-white/5 hover:bg-white/5">
                                <TableCell className="py-4">
                                    <div className="text-white font-black uppercase text-[10px] italic">{e.concepto}</div>
                                    <div className="text-[8px] font-black text-white/20 uppercase">ORIGEN: {e.cuenta}</div>
                                </TableCell>
                                <TableCell className="text-right font-black text-red-500 italic pr-8">Bs. {formatCurrency(e.monto)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter className="bg-red-500/10 border-none"><TableRow className="border-none"><TableCell className="font-black text-red-400 text-[10px] uppercase italic">Total Egresos</TableCell><TableCell className="text-right font-black text-red-500 text-lg italic pr-8">Bs. {formatCurrency(totalEgresosMes)}</TableCell></TableRow></TableFooter></Table></CardContent></Card>
                </div>

                <div className="pt-10"><Label className="text-[10px] font-black uppercase text-white/40 ml-4 italic">Notas del Periodo</Label><Textarea className="rounded-[2rem] bg-slate-900 border-white/5 text-white font-bold p-6 min-h-[120px] shadow-2xl italic mt-2 uppercase text-xs" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." /></div>
                <div className="flex justify-end pt-6"><Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 h-14 rounded-2xl font-black uppercase px-12 shadow-2xl shadow-primary/20 italic">{saving ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-5 w-5" />} Guardar Balance</Button></div>
            </> }
        </div>
    );
}

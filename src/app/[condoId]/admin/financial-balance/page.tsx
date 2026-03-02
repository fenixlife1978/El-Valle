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
import { Loader2, Save, Download, Landmark, Coins, Wallet, Share2, FileText, Scale } from "lucide-react";
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
    const [selectedMonth, setSelectedMonth] = useState("2"); // Febrero por defecto
    const [selectedYear, setSelectedYear] = useState("2026");

    // Saldos Iniciales Estrictos (Instrucción experta)
    const [saldoInicBDV, setSaldoInicBDV] = useState(44294.13);
    const [saldoInicCaja, setSaldoInicCaja] = useState(0.00);
    const [saldoInicChica, setSaldoInicChica] = useState(0.00);

    const [egresosTesorería, setEgresosTesorería] = useState<{ concepto: string, monto: number, cuenta: string }[]>([]);
    const [ingresosMesBDV, setIngresosMesBDV] = useState(0);
    const [ingresosMesCaja, setIngresosMesCaja] = useState(0);
    const [notas, setNotas] = useState("");

    const [realBalances, setRealBalances] = useState({ banco: 0, cajaPrincipal: 0, cajaChica: 0 });

    // ESCUCHA DE SALDOS REALES DE TESORERÍA (Fuente de Verdad)
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
                
                const tSnap = await getDocs(query(
                    collection(db, 'condominios', workingCondoId, 'transacciones'), 
                    where('fecha', '>=', from), 
                    where('fecha', '<=', to), 
                    orderBy('fecha', 'desc')
                ));
                
                const txs = tSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

                // 1. Egresos del Mes (Sección III)
                const egresos = txs.filter(t => t.tipo === 'egreso').map(t => ({ 
                    concepto: t.descripcion, 
                    monto: t.monto, 
                    cuenta: t.nombreCuenta 
                }));
                setEgresosTesorería(egresos);

                // 2. Ingresos Ordinarios (BDV - Excluyendo Efectivo)
                const ordBDV = txs.filter(t => 
                    t.tipo === 'ingreso' && 
                    t.cuentaId === BDV_ACCOUNT_ID && 
                    t.referencia?.toUpperCase() !== 'EFECTIVO'
                ).reduce((sum, t) => sum + t.monto, 0);
                setIngresosMesBDV(ordBDV);

                // 3. Ingresos en Efectivo (Caja Principal)
                const cashCaja = txs.filter(t => 
                    t.tipo === 'ingreso' && 
                    (t.cuentaId === 'CAJA_PRINCIPAL_ID' || t.referencia?.toUpperCase() === 'EFECTIVO')
                ).reduce((sum, t) => sum + t.monto, 0);
                setIngresosMesCaja(cashCaja);

            } catch (e) { 
                console.error("Error fetching data:", e); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchData();
    }, [selectedMonth, selectedYear, workingCondoId]);

    const totalIngresos = useMemo(() => saldoInicBDV + saldoInicCaja + saldoInicChica + ingresosMesBDV + ingresosMesCaja, [saldoInicBDV, saldoInicCaja, saldoInicChica, ingresosMesBDV, ingresosMesCaja]);
    const totalEgresos = useMemo(() => egresosTesorería.reduce((sum, e) => sum + e.monto, 0), [egresosTesorería]);
    
    // Sincronización Total: El Disponible ahora es la suma de los saldos reales de tesorería
    const totalDisponible = useMemo(() => realBalances.banco + realBalances.cajaPrincipal + realBalances.cajaChica, [realBalances]);

    // Desglose Final de Tesorería SINCRONIZADO con Saldos Reales
    const finalBreakdown = useMemo(() => {
        return {
            bdv: realBalances.banco,
            caja: realBalances.cajaPrincipal,
            chica: realBalances.cajaChica
        };
    }, [realBalances]);

    const generatePdfBlob = async (output: 'download' | 'share' = 'download') => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF();
        const info = authCompanyInfo || { name: 'CONJUNTO RESIDENCIAL EL VALLE', rif: 'J-00000000-0', logo: '' };
        const period = `FEBRERO 2026`;
        const margin = 14;
        const pageWidth = doc.internal.pageSize.getWidth();

        // Branding Superior
        doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        if (info.logo) {
            try { doc.addImage(info.logo, 'PNG', margin, 5, 15, 15); } catch(e){}
        }
        doc.setFontSize(14).setFont('helvetica', 'bold').text(info.name.toUpperCase(), info.logo ? 35 : margin, 15);
        doc.setFontSize(8).text(`SISTEMA DE GESTIÓN EFAS CONDOSYS | RIF: ${info.rif}`, info.logo ? 35 : margin, 22);
        doc.setFontSize(10).text("BALANCE GENERAL", 196, 18, { align: 'right' });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12).text(`PERÍODO: ${period}`, margin, 45);

        // I. SALDOS INICIALES
        autoTable(doc, {
            startY: 55,
            head: [['I. SALDOS INICIALES', 'MONTO (BS.)']],
            body: [
                ['Banco de Venezuela', formatCurrency(saldoInicBDV)],
                ['Caja Principal', formatCurrency(saldoInicCaja)],
                ['Caja Chica (Fondo Fijo)', formatCurrency(saldoInicChica)]
            ],
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 9, cellPadding: 2.5 }
        });

        // II. INGRESOS DEL MES
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 5,
            head: [['II. INGRESOS DEL MES', 'MONTO (BS.)']],
            body: [
                ['Banco de Venezuela (Ingresos Ordinarios)', formatCurrency(ingresosMesBDV)],
                ['Caja Principal (Efectivo)', formatCurrency(ingresosMesCaja)]
            ],
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 9, cellPadding: 2.5 },
            foot: [['TOTAL INGRESOS (SALDOS + MES)', formatCurrency(totalIngresos)]],
            footStyles: { fillColor: [15, 23, 42], textColor: 255 }
        });

        // III. EGRESOS DEL MES
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['III. EGRESOS DEL MES', 'CUENTA', 'MONTO (BS.)']],
            body: egresosTesorería.map(e => [e.concepto.toUpperCase(), e.cuenta.toUpperCase(), formatCurrency(e.monto)]),
            headStyles: { fillColor: [220, 38, 38] },
            styles: { fontSize: 8, cellPadding: 2 },
            foot: [['TOTAL EGRESOS DEL PERIODO', '', formatCurrency(totalEgresos)]],
            footStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' }
        });

        // RESULTADOS Y DISPONIBILIDAD
        let finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(10).setFont('helvetica', 'bold');
        doc.text('TOTAL INGRESOS:', 140, finalY); doc.text(formatCurrency(totalIngresos), 196, finalY, { align: 'right' });
        doc.text('(-) TOTAL EGRESOS:', 140, finalY + 6); doc.text(formatCurrency(totalEgresos), 196, finalY + 6, { align: 'right' });
        doc.setFillColor(241, 245, 249); doc.rect(135, finalY + 8, 65, 10, 'F');
        doc.setTextColor(30, 80, 180).setFontSize(11);
        doc.text('TOTAL DISPONIBLE:', 140, finalY + 15); doc.text(formatCurrency(totalDisponible), 196, finalY + 15, { align: 'right' });

        // SALDOS FINALES DE TESORERÍA (Sincronizados con Real)
        doc.setTextColor(0, 0, 0).setFontSize(10).text('SALDOS FINALES DE TESORERÍA (CONCILIADOS):', margin, finalY + 25);
        autoTable(doc, {
            startY: finalY + 28,
            head: [['CUENTA', 'SALDO FINAL (BS.)']],
            body: [
                ['BANCO DE VENEZUELA', formatCurrency(finalBreakdown.bdv)],
                ['CAJA PRINCIPAL', formatCurrency(finalBreakdown.caja)],
                ['CAJA CHICA', formatCurrency(finalBreakdown.chica)]
            ],
            theme: 'grid',
            headStyles: { fillColor: [51, 65, 85] },
            styles: { fontSize: 9 }
        });

        if (output === 'share') {
            const blob = doc.output('blob');
            const file = new File([blob], `Balance_General_ElValle_Feb2026.pdf`, { type: 'application/pdf' });
            if (navigator.share) {
                await navigator.share({
                    files: [file],
                    title: 'Balance General - El Valle',
                    text: 'Balance Financiero correspondiente a Febrero 2026'
                });
            } else {
                toast({ title: "Compartir no disponible", description: "Su navegador no soporta la función de compartir archivos." });
            }
        } else {
            doc.save(`Balance_General_ElValle_Feb2026.pdf`);
        }
    };

    const handleSave = async () => {
        if (!workingCondoId) return;
        setSaving(true);
        try {
            const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
            await setDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', docId), {
                periodo: docId, 
                saldoInicBDV, saldoInicCaja, saldoInicChica,
                ingresosMesBDV, ingresosMesCaja,
                egresos: egresosTesorería, 
                totalIngresos, totalEgresos, totalDisponible,
                finalBreakdown, // Guardamos la disponibilidad real sincronizada
                notas, 
                updatedAt: serverTimestamp()
            });
            toast({ title: "Balance Guardado" });
        } catch (e) { toast({ variant: 'destructive', title: "Error" }); } finally { setSaving(false); }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8 bg-[#1A1D23] min-h-screen font-montserrat text-white italic">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-10 border-b border-white/5 pb-6">
                <div>
                    <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">Balance <span className="text-primary">General</span></h1>
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.3em] mt-2 italic">Contabilidad EFAS - {authCompanyInfo?.name?.toUpperCase() || "EL VALLE"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-36 bg-slate-900 border-white/5 font-black uppercase text-[10px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white">{months.map(m => (<SelectItem key={m.value} value={m.value} className="font-black uppercase text-[10px]">{m.label}</SelectItem>))}</SelectContent></Select>
                    <Input className="w-24 bg-slate-900 border-white/5 font-black rounded-xl" type="number" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} />
                    <Button onClick={() => generatePdfBlob('download')} variant="outline" className="rounded-xl border-white/10 text-white h-10 font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic">
                        <Download className="mr-2 h-4 w-4" /> Exportar PDF
                    </Button>
                    <Button onClick={() => generatePdfBlob('share')} variant="secondary" className="rounded-xl bg-primary text-slate-900 h-10 font-black uppercase text-[10px] italic">
                        <Share2 className="mr-2 h-4 w-4" /> Compartir
                    </Button>
                </div>
            </div>

            {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div> : <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-6 border border-white/5 relative overflow-hidden italic transition-transform hover:scale-105"><div className="relative z-10"><p className="text-[10px] font-black uppercase text-primary italic">Banco BDV (Real)</p><p className="text-2xl font-black italic mt-1">Bs. {formatCurrency(realBalances.banco)}</p></div><Landmark className="absolute top-4 right-4 h-10 w-10 text-white/5"/></Card>
                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-6 border border-white/5 relative overflow-hidden italic transition-transform hover:scale-105"><div className="relative z-10"><p className="text-[10px] font-black uppercase text-emerald-500 italic">Caja Principal (Real)</p><p className="text-2xl font-black italic mt-1">Bs. {formatCurrency(realBalances.cajaPrincipal)}</p></div><Coins className="absolute top-4 right-4 h-10 w-10 text-white/5"/></Card>
                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-6 border border-white/5 relative overflow-hidden italic transition-transform hover:scale-105"><div className="relative z-10"><p className="text-[10px] font-black uppercase text-[#F28705] italic">Caja Chica (Real)</p><p className="text-2xl font-black italic mt-1">Bs. {formatCurrency(realBalances.cajaChica)}</p></div><Wallet className="absolute top-4 right-4 h-10 w-10 text-white/5"/></Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                    <Card className="rounded-[2.5rem] bg-slate-900 border-none shadow-2xl overflow-hidden border border-white/5"><CardHeader className="bg-slate-950 p-6 border-b border-white/5"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">I. Saldos Iniciales y II. Ingresos</CardTitle></CardHeader>
                    <CardContent className="p-0"><Table><TableBody>
                        <TableRow className="bg-white/5 border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic">Banco de Venezuela (Saldo Inicial)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoInicBDV} onChange={e=>setSaldoInicBDV(Number(e.target.value))}/></TableCell></TableRow>
                        <TableRow className="border-b border-white/5"><TableCell className="text-white/60 text-[10px] font-black uppercase italic">Ingresos Ordinarios BDV (Mes)</TableCell><TableCell className="text-right font-black italic">Bs. {formatCurrency(ingresosMesBDV)}</TableCell></TableRow>
                        <TableRow className="border-b border-white/5"><TableCell className="text-white/60 text-[10px] font-black uppercase italic">Ingresos Efectivo Caja (Mes)</TableCell><TableCell className="text-right font-black text-emerald-500 italic">Bs. {formatCurrency(ingresosMesCaja)}</TableCell></TableRow>
                        <TableRow className="border-none bg-primary/10"><TableCell className="font-black text-primary text-[10px] uppercase italic">TOTAL DISPONIBILIDAD BRUTA</TableCell><TableCell className="text-right font-black text-white italic">Bs. {formatCurrency(totalIngresos)}</TableCell></TableRow>
                    </TableBody></Table></CardContent></Card>

                    <Card className="rounded-[2.5rem] bg-slate-900 border-none shadow-2xl overflow-hidden border border-white/5"><CardHeader className="bg-slate-950 p-6 border-b border-white/5"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">III. Detalle de Egresos de Tesorería</CardTitle></CardHeader>
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
                    <TableFooter className="bg-red-500/10 border-none"><TableRow className="border-none"><TableCell className="font-black text-red-400 text-[10px] uppercase italic">Total Egresos</TableCell><TableCell className="text-right font-black text-red-500 text-lg italic pr-8">Bs. {formatCurrency(totalEgresos)}</TableCell></TableRow></TableFooter></Table></CardContent></Card>
                </div>

                <Card className="rounded-[2rem] bg-slate-950 border border-primary/20 mt-8 shadow-xl">
                    <CardContent className="p-8 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div>
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Resultado de Gestión (Disponibilidad Real)</p>
                            <h3 className="text-4xl font-black italic text-white tracking-tighter">Bs. {formatCurrency(totalDisponible)}</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="text-right border-r border-white/10 pr-4"><p className="text-[8px] text-white/40 uppercase">Final BDV</p><p className="font-black text-xs text-white">Bs. {formatCurrency(finalBreakdown.bdv)}</p></div>
                            <div className="text-right border-r border-white/10 pr-4"><p className="text-[8px] text-white/40 uppercase">Final Caja</p><p className="font-black text-xs text-white">Bs. {formatCurrency(finalBreakdown.caja)}</p></div>
                            <div className="text-right"><p className="text-[8px] text-white/40 uppercase">Final Chica</p><p className="font-black text-xs text-white">Bs. {formatCurrency(finalBreakdown.chica)}</p></div>
                        </div>
                    </CardContent>
                </Card>

                <div className="pt-10"><Label className="text-[10px] font-black uppercase text-white/40 ml-4 italic">Notas y Observaciones del Balance</Label><Textarea className="rounded-[2rem] bg-slate-900 border-white/5 text-white font-bold p-6 min-h-[120px] shadow-2xl italic mt-2 uppercase text-xs focus-visible:ring-primary" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Escriba aquí los detalles relevantes..." /></div>
                <div className="flex justify-end pt-6"><Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 h-14 rounded-2xl font-black uppercase px-12 shadow-2xl shadow-primary/20 italic">{saving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-5 w-5" />} Guardar Balance Oficial</Button></div>
            </> }
        </div>
    );
}
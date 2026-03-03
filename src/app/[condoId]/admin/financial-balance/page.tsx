
'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Download, Landmark, Coins, Wallet, Share2, FileText, Scale, CalendarClock } from "lucide-react";
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import JsBarcode from 'jsbarcode';

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
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1)); 
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    // Saldos Iniciales Editables
    const [saldoInicBDV, setSaldoInicBDV] = useState(0.00);
    const [saldoInicCaja, setSaldoInicCaja] = useState(0.00);
    const [saldoInicChica, setSaldoInicChica] = useState(0.00);

    // Saldos Finales Editables
    const [saldoFinBDV, setSaldoFinBDV] = useState(0.00);
    const [saldoFinCaja, setSaldoFinCaja] = useState(0.00);
    const [saldoFinChica, setSaldoFinChica] = useState(0.00);

    const [egresosTesorería, setEgresosTesorería] = useState<{ concepto: string, monto: number, cuenta: string }[]>([]);
    const [ingresosMesBDV, setIngresosMesBDV] = useState(0);
    const [ingresosMesCaja, setIngresosMesCaja] = useState(0);
    const [notas, setNotas] = useState("");

    // Saldos Reales de las Cuentas
    const [cuentasReales, setCuentasReales] = useState<any[]>([]);

    useEffect(() => {
        if (!workingCondoId) return;
        
        const unsubCuentas = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), (snap) => {
            const data = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as { id: string, nombre: string, saldoActual: number }))
                .filter(a => !a.nombre?.toUpperCase().includes('MERCANTIL'));
            
            setCuentasReales(data);
            
            const bdv = data.find(a => a.id === BDV_ACCOUNT_ID || a.nombre?.toUpperCase().includes('BANCO'));
            const caja = data.find(a => a.nombre?.toUpperCase().includes('CAJA PRINCIPAL'));
            const chica = data.find(a => a.nombre?.toUpperCase().includes('CAJA CHICA'));
            
            if (bdv) setSaldoFinBDV(bdv.saldoActual || 0);
            if (caja) setSaldoFinCaja(caja.saldoActual || 0);
            if (chica) setSaldoFinChica(chica.saldoActual || 0);
        });

        const fetchData = async () => {
            setLoading(true);
            try {
                const year = parseInt(selectedYear), month = parseInt(selectedMonth) - 1;
                const from = startOfMonth(new Date(year, month, 1)), to = endOfMonth(from);
                
                const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                const savedRef = doc(db, 'condominios', workingCondoId, 'financial_statements', docId);
                const savedSnap = await getDoc(savedRef);
                
                if (savedSnap.exists()) {
                    const d = savedSnap.data();
                    setSaldoInicBDV(d.saldoInicBDV || 0);
                    setSaldoInicCaja(d.saldoInicCaja || 0);
                    setSaldoInicChica(d.saldoInicChica || 0);
                    setSaldoFinBDV(d.saldoFinBDV || 0);
                    setSaldoFinCaja(d.saldoFinCaja || 0);
                    setSaldoFinChica(d.saldoFinChica || 0);
                    setNotas(d.notas || "");
                }

                const tSnap = await getDocs(query(
                    collection(db, 'condominios', workingCondoId, 'transacciones'), 
                    where('fecha', '>=', from), 
                    where('fecha', '<=', to), 
                    orderBy('fecha', 'desc')
                ));
                
                const txs = tSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(t => {
                    const desc = (t.descripcion || "").toUpperCase();
                    const accName = (t.nombreCuenta || "").toUpperCase();
                    return !accName.includes('MERCANTIL') &&
                           !desc.includes('TRASLADO') && 
                           !desc.includes('RECEPCIÓN') && 
                           !desc.includes('TRANSFERENCIA ENTRE CUENTAS') &&
                           !desc.includes('INGRESO DESDE');
                });

                const egresos = txs.filter(t => t.tipo === 'egreso').map(t => ({ 
                    concepto: t.descripcion, 
                    monto: t.monto, 
                    cuenta: t.nombreCuenta 
                }));
                setEgresosTesorería(egresos);

                const ordBDV = txs.filter(t => 
                    t.tipo === 'ingreso' && 
                    (t.cuentaId === BDV_ACCOUNT_ID || t.nombreCuenta?.toUpperCase().includes('BANCO')) && 
                    t.referencia?.toUpperCase() !== 'EFECTIVO'
                ).reduce((sum, t) => sum + t.monto, 0);
                setIngresosMesBDV(ordBDV);

                const cashCaja = txs.filter(t => 
                    t.tipo === 'ingreso' && 
                    (t.referencia?.toUpperCase() === 'EFECTIVO' || t.nombreCuenta?.toUpperCase().includes('CAJA PRINCIPAL'))
                ).reduce((sum, t) => sum + t.monto, 0);
                setIngresosMesCaja(cashCaja);

            } catch (e) { 
                console.error("Error fetching data:", e); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchData();
        return () => unsubCuentas();
    }, [selectedMonth, selectedYear, workingCondoId]);

    const totalIngresos = useMemo(() => saldoInicBDV + saldoInicCaja + saldoInicChica + ingresosMesBDV + ingresosMesCaja, [saldoInicBDV, saldoInicCaja, saldoInicChica, ingresosMesBDV, ingresosMesCaja]);
    const totalEgresos = useMemo(() => egresosTesorería.reduce((sum, e) => sum + e.monto, 0), [egresosTesorería]);
    const totalDisponible = useMemo(() => totalIngresos - totalEgresos, [totalIngresos, totalEgresos]);

    const lastDayOfMonthStr = useMemo(() => {
        return format(endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth)-1)), 'dd/MM/yyyy');
    }, [selectedMonth, selectedYear]);

    const generatePdfBlob = async (output: 'download' | 'share' = 'download') => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF();
        const info = authCompanyInfo || { name: 'CONJUNTO RESIDENCIAL EL VALLE', rif: 'J-40587208-0', logo: '' };
        const period = `${months.find(m => m.value === selectedMonth)?.label.toUpperCase()} ${selectedYear}`;
        const margin = 14;
        const pageWidth = doc.internal.pageSize.getWidth();

        const canvas = document.createElement('canvas');
        const barcodeValue = `BAL-${selectedYear}${selectedMonth.padStart(2, '0')}-${workingCondoId.substring(0, 6).toUpperCase()}`;
        try {
            JsBarcode(canvas, barcodeValue, { format: "CODE128", height: 40, width: 2, displayValue: false, margin: 0 });
        } catch (e) { console.error("Error barcode:", e); }
        const barcodeData = canvas.toDataURL("image/png");

        doc.setFillColor(15, 23, 42); 
        doc.rect(0, 0, 210, 30, 'F');
        
        if (info.logo) {
            try { 
                doc.setFillColor(255, 255, 255);
                doc.roundedRect(margin, 5, 20, 20, 2, 2, 'F');
                doc.addImage(info.logo, 'JPEG', margin + 1, 6, 18, 18); 
            } catch(e){}
        }
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12).setFont('helvetica', 'bold').text(info.name.toUpperCase(), info.logo ? 38 : margin, 14);
        doc.setFontSize(9).setFont('helvetica', 'normal').text(`RIF: J-40587208-0`, info.logo ? 38 : margin, 20);
        
        doc.setFillColor(255, 255, 255);
        doc.rect(pageWidth - margin - 45, 7, 45, 10, 'F');
        doc.addImage(barcodeData, 'PNG', pageWidth - margin - 44, 8, 43, 8);
        doc.setFontSize(7).setTextColor(255, 255, 255).text(barcodeValue, pageWidth - margin, 21, { align: 'right' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14).setFont('helvetica', 'bold').text(`BALANCE GENERAL: ${period}`, margin, 45);

        autoTable(doc, {
            startY: 55,
            head: [['I. SALDOS INICIALES', 'MONTO (BS.)']],
            body: [
                ['Banco de Venezuela', formatCurrency(saldoInicBDV)],
                ['Caja Principal', formatCurrency(saldoInicCaja)],
                ['Caja Chica (Fondo Fijo Inicial)', formatCurrency(saldoInicChica)]
            ],
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 9, cellPadding: 2 }
        });

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 4,
            head: [['II. INGRESOS DEL MES', 'MONTO (BS.)']],
            body: [
                ['Banco de Venezuela (Ingresos Ordinarios)', formatCurrency(ingresosMesBDV)],
                ['Caja Principal (Efectivo)', formatCurrency(ingresosMesCaja)]
            ],
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 9, cellPadding: 2 },
            foot: [['TOTAL INGRESOS (SALDOS + MES)', formatCurrency(totalIngresos)]],
            footStyles: { fillColor: [15, 23, 42], textColor: 255 }
        });

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 8,
            head: [['III. EGRESOS DEL MES', 'CUENTA', 'MONTO (BS.)']],
            body: egresosTesorería.map(e => [e.concepto.toUpperCase(), e.cuenta.toUpperCase(), formatCurrency(e.monto)]),
            headStyles: { fillColor: [220, 38, 38] },
            styles: { fontSize: 8, cellPadding: 2 },
            foot: [['TOTAL EGRESOS DEL PERIODO', '', formatCurrency(totalEgresos)]],
            footStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' }
        });

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 8,
            head: [[`IV. SALDOS FINALES AL ${lastDayOfMonthStr}`, 'MONTO (BS.)']],
            body: [
                ['Banco de Venezuela (Cierre)', formatCurrency(saldoFinBDV)],
                ['Caja Principal (Cierre)', formatCurrency(saldoFinCaja)],
                ['Caja Chica (Cierre)', formatCurrency(saldoFinChica)]
            ],
            headStyles: { fillColor: [30, 80, 180] },
            styles: { fontSize: 9, cellPadding: 2 },
            foot: [['VALIDACIÓN DE TESORERÍA (DISPONIBILIDAD)', formatCurrency(totalDisponible)]],
            footStyles: { fillColor: [30, 80, 180], textColor: 255, fontStyle: 'bold' }
        });

        let finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(10).setFont('helvetica', 'bold');
        doc.text('TOTAL INGRESOS:', 130, finalY); doc.text(`Bs. ${formatCurrency(totalIngresos)}`, 196, finalY, { align: 'right' });
        doc.text('(-) TOTAL EGRESOS:', 130, finalY + 6); doc.text(`Bs. ${formatCurrency(totalEgresos)}`, 196, finalY + 6, { align: 'right' });
        doc.setFillColor(241, 245, 249); doc.rect(125, finalY + 8, 75, 10, 'F');
        doc.setTextColor(30, 80, 180).setFontSize(11);
        doc.text('TOTAL DISPONIBLE:', 130, finalY + 15); doc.text(`Bs. ${formatCurrency(totalDisponible)}`, 196, finalY + 15, { align: 'right' });

        if (output === 'share') {
            const blob = doc.output('blob');
            const file = new File([blob], `Balance_General_${info.name.replace(/ /g, '_')}.pdf`, { type: 'application/pdf' });
            if (navigator.share) {
                await navigator.share({ files: [file], title: `Balance General - ${info.name}`, text: `Balance Financiero correspondiente a ${period}` });
            } else {
                toast({ title: "Compartir no disponible", description: "Su navegador no soporta la función de compartir archivos." });
            }
        } else {
            doc.save(`Balance_General_${info.name.replace(/ /g, '_')}.pdf`);
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
                saldoFinBDV, saldoFinCaja, saldoFinChica,
                ingresosMesBDV, ingresosMesCaja,
                egresos: egresosTesorería, 
                totalIngresos, totalEgresos, totalDisponible,
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
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.3em] mt-2 italic">{authCompanyInfo?.name?.toUpperCase() || "EL VALLE"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-36 bg-slate-900 border-white/5 font-black uppercase text-[10px] rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white">
                            {months.map(m => (<SelectItem key={m.value} value={m.value} className="font-black uppercase text-[10px]">{m.label}</SelectItem>))}
                        </SelectContent>
                    </Select>
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
                    {cuentasReales.map(acc => (
                        <Card key={acc.id} className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-6 border border-white/5 relative overflow-hidden italic transition-transform hover:scale-105">
                            <div className="relative z-10">
                                <p className="text-[10px] font-black uppercase text-primary italic">{acc.nombre}</p>
                                <p className="text-2xl font-black italic mt-1">Bs. {formatCurrency(acc.saldoActual)}</p>
                            </div>
                            {acc.nombre?.includes('BANCO') ? <Landmark className="absolute top-4 right-4 h-10 w-10 text-white/5"/> : acc.nombre?.includes('CAJA PRINCIPAL') ? <Coins className="absolute top-4 right-4 h-10 w-10 text-white/5"/> : <Wallet className="absolute top-4 right-4 h-10 w-10 text-white/5"/>}
                        </Card>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                    <Card className="rounded-[2.5rem] bg-slate-900 border-none shadow-2xl overflow-hidden border border-white/5">
                        <CardHeader className="bg-slate-950 p-6 border-b border-white/5">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">I. Saldos Iniciales y II. Ingresos</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableBody>
                                    <TableRow className="bg-white/5 border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Banco de Venezuela (Saldo Inicial)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoInicBDV} onChange={e=>setSaldoInicBDV(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="bg-white/5 border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Caja Principal (Saldo Inicial)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoInicCaja} onChange={e=>setSaldoInicCaja(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="bg-white/5 border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Caja Chica (Fondo Inicial)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoInicChica} onChange={e=>setSaldoInicChica(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="border-b border-white/5"><TableCell className="text-white/60 text-[10px] font-black uppercase italic px-8 py-4">Ingresos Ordinarios BDV (Mes)</TableCell><TableCell className="text-right font-black italic pr-8">Bs. {formatCurrency(ingresosMesBDV)}</TableCell></TableRow>
                                    <TableRow className="border-b border-white/5"><TableCell className="text-white/60 text-[10px] font-black uppercase italic px-8 py-4">Ingresos Efectivo Caja (Mes)</TableCell><TableCell className="text-right font-black text-emerald-500 italic pr-8">Bs. {formatCurrency(ingresosMesCaja)}</TableCell></TableRow>
                                    <TableRow className="border-none bg-primary/10"><TableCell className="font-black text-primary text-[10px] uppercase italic px-8 py-6">TOTAL DISPONIBILIDAD BRUTA</TableCell><TableCell className="text-right font-black text-white italic pr-8">Bs. {formatCurrency(totalIngresos)}</TableCell></TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[2.5rem] bg-slate-900 border-none shadow-2xl overflow-hidden border border-white/5">
                        <CardHeader className="bg-slate-950 p-6 border-b border-white/5">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">III. Detalle de Egresos del Mes</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader><TableRow className="bg-slate-950/50 border-white/5"><TableHead className="text-white/40 font-black text-[10px] uppercase px-8 py-4">Concepto</TableHead><TableHead className="text-right text-white/40 font-black text-[10px] pr-8">Monto</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {egresosTesorería.map((e, i) => (
                                        <TableRow key={i} className="border-white/5 hover:bg-white/5">
                                            <TableCell className="py-4 px-8">
                                                <div className="text-white font-black uppercase text-[10px] italic">{e.concepto}</div>
                                                <div className="text-[8px] font-black text-white/20 uppercase">ORIGEN: {e.cuenta}</div>
                                            </TableCell>
                                            <TableCell className="text-right font-black text-red-500 italic pr-8">Bs. {formatCurrency(e.monto)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter className="bg-red-50/10 border-none">
                                    <TableRow className="border-none">
                                        <TableCell className="font-black text-red-400 text-[10px] uppercase italic px-8 py-6">Total Egresos</TableCell>
                                        <TableCell className="text-right font-black text-red-500 text-lg italic pr-8">Bs. {formatCurrency(totalEgresos)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                    <Card className="rounded-[2.5rem] bg-slate-950 border border-primary/20 shadow-xl overflow-hidden">
                        <CardHeader className="bg-primary/10 p-6 border-b border-white/5">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary italic">IV. Saldos Finales al {lastDayOfMonthStr}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableBody>
                                    <TableRow className="border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Saldo Final Banco de Venezuela</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoFinBDV} onChange={e=>setSaldoFinBDV(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Saldo Final Caja Principal</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoFinCaja} onChange={e=>setSaldoFinCaja(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Saldo Final Caja Chica</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoFinChica} onChange={e=>setSaldoFinChica(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="bg-primary/20 border-none"><TableCell className="font-black text-primary text-[10px] uppercase italic px-8 py-6">DISPONIBILIDAD DE TESORERÍA</TableCell><TableCell className="text-right font-black text-white text-xl italic pr-8">Bs. {formatCurrency(totalDisponible)}</TableCell></TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[2rem] bg-slate-950 border border-emerald-500/20 shadow-xl flex items-center justify-center">
                        <CardContent className="p-8 flex flex-col items-center text-center gap-4">
                            <div className="p-4 bg-emerald-500/10 rounded-2xl"><CalendarClock className="h-10 w-10 text-emerald-500" /></div>
                            <div>
                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Total Disponible de Gestión ({selectedMonth}/{selectedYear})</p>
                                <h3 className="text-4xl font-black italic text-white tracking-tighter mt-1">Bs. {formatCurrency(totalDisponible)}</h3>
                                <p className="text-[9px] font-bold text-slate-500 uppercase mt-2 italic">Diferencia neta entre ingresos totales y egresos totales</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="pt-10"><Label className="text-[10px] font-black uppercase text-white/40 ml-4 italic">Notas y Observaciones del Balance</Label><Textarea className="rounded-[2rem] bg-slate-900 border-white/5 text-white font-bold p-6 min-h-[120px] shadow-2xl italic mt-2 uppercase text-xs focus-visible:ring-primary" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Escriba aquí los detalles relevantes..." /></div>
                <div className="flex justify-end pt-6"><Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 h-14 rounded-2xl font-black uppercase px-12 shadow-2xl shadow-primary/20 italic">{saving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-5 w-5" />} Guardar Balance Oficial</Button></div>
            </> }
        </div>
    );
}

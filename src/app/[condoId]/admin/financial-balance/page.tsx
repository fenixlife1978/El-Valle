
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
import { Loader2, Save, Download, Landmark, Coins, Wallet, FileText } from "lucide-react";
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

export default function FinancialBalancePage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const { condoId: urlCondoId } = resolvedParams;
    const { userProfile, user, companyInfo: authCompanyInfo } = useAuth();
    const { toast } = useToast();

    const workingCondoId = userProfile?.workingCondoId || userProfile?.condominioId || urlCondoId;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [saldoAnteriorBanco, setSaldoAnteriorBanco] = useState(0);
    const [ingresosOrdinariosBanco, setIngresosOrdinariosBanco] = useState(0);
    const [ingresosOrdinariosEfectivo, setIngresosOrdinariosEfectivo] = useState(0);
    const [egresosTesorería, setEgresosTesorería] = useState<{ concepto: string, monto: number, cuenta: string }[]>([]);
    
    const [realBalances, setRealBalances] = useState({
        banco: 0,
        cajaPrincipal: 0,
        cajaChica: 0
    });
    
    const [notas, setNotas] = useState("");
    const [companyData, setCompanyData] = useState<any>(null);

    useEffect(() => {
        if (!workingCondoId) return;
        const configRef = doc(db, 'condominios', workingCondoId, 'config', 'mainSettings');
        getDoc(configRef).then(snap => { if (snap.exists()) setCompanyData(snap.data().companyInfo); });
    }, [workingCondoId]);

    useEffect(() => {
        if (!workingCondoId) return;

        // ESCUCHA DE SALDOS REALES ATÓMICOS POR ID FIJO
        const unsubCuentas = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), (snap) => {
            const accounts = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            
            // BANCO DE VENEZUELA (RdiTtY9ojCuYPRNvB7C3)
            const bdv = accounts.find(a => a.id === 'RdiTtY9ojCuYPRNvB7C3');
            const cp = accounts.find(a => a.id === 'CAJA_PRINCIPAL_ID' || a.nombre?.toUpperCase().trim() === 'CAJA PRINCIPAL');
            const cc = accounts.find(a => a.nombre?.toUpperCase().trim() === 'CAJA CHICA');
            
            setRealBalances({
                banco: bdv?.saldoActual || 0,
                cajaPrincipal: cp?.saldoActual || 0,
                cajaChica: cc?.saldoActual || 0
            });
        });

        return () => unsubCuentas();
    }, [workingCondoId]);

    useEffect(() => {
        if (!workingCondoId) return;

        const fetchAutomaticData = async () => {
            setLoading(true);
            try {
                const year = parseInt(selectedYear);
                const month = parseInt(selectedMonth) - 1;
                const fromDate = startOfMonth(new Date(year, month, 1));
                const toDate = endOfMonth(fromDate);
                const monthId = format(fromDate, 'yyyy-MM');

                const statsRef = doc(db, 'condominios', workingCondoId, 'financial_stats', monthId);
                const statsSnap = await getDoc(statsRef);
                if (statsSnap.exists()) {
                    const s = statsSnap.data();
                    setIngresosOrdinariosBanco(s.saldoBancarioReal || 0);
                    setIngresosOrdinariosEfectivo(s.saldoCajaReal || 0);
                } else {
                    const pQuery = query(
                        collection(db, 'condominios', workingCondoId, 'payments'),
                        where('paymentDate', '>=', fromDate),
                        where('paymentDate', '<=', toDate),
                        where('status', '==', 'aprobado')
                    );
                    const pSnap = await getDocs(pQuery);
                    let totalBancario = 0;
                    let totalEfectivo = 0;
                    pSnap.forEach(doc => {
                        const data = doc.data();
                        const method = (data.paymentMethod || "").toLowerCase().trim();
                        if (['transferencia', 'movil', 'pagomovil', 'transferencias'].includes(method)) totalBancario += data.totalAmount;
                        else if (['efectivo_bs', 'efectivo'].includes(method)) totalEfectivo += data.totalAmount;
                    });
                    setIngresosOrdinariosBanco(totalBancario);
                    setIngresosOrdinariosEfectivo(totalEfectivo);
                }

                const tQuery = query(
                    collection(db, 'condominios', workingCondoId, 'transacciones'), 
                    where('fecha', '>=', fromDate), 
                    where('fecha', '<=', toDate), 
                    where('tipo', '==', 'egreso'),
                    orderBy('fecha', 'desc')
                );
                const tSnap = await getDocs(tQuery);
                setEgresosTesorería(tSnap.docs.map(d => ({ 
                    concepto: d.data().descripcion || "SIN CONCEPTO", 
                    monto: d.data().monto,
                    cuenta: d.data().nombreCuenta || "S/D"
                })));

            } catch (error) { 
                console.error("Error balance:", error); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchAutomaticData();
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
                    { concepto: 'BANCO (PAGO MÓVIL / TRANSF.)', monto: ingresosOrdinariosBanco },
                    { concepto: 'CAJA PRINCIPAL (EFECTIVO BS)', monto: ingresosOrdinariosEfectivo }
                ],
                egresos: egresosTesorería,
                estadoFinanciero: { 
                    saldoNetoBanco: realBalances.banco, 
                    saldoCajaPrincipal: realBalances.cajaPrincipal, 
                    saldoCajaChica: realBalances.cajaChica 
                },
                notas, updatedAt: serverTimestamp()
            });
            toast({ title: "Balance Guardado" });
        } catch (e) { toast({ variant: 'destructive', title: "Error" }); } finally { setSaving(false); }
    };

    const handleExportPDF = async () => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        
        const docPDF = new jsPDF();
        const info = authCompanyInfo || companyData || { name: 'EFAS CondoSys', rif: 'J-00000000-0' };
        const monthName = months.find(m => m.value === selectedMonth)?.label || '';

        docPDF.setFillColor(15, 23, 42);
        docPDF.rect(0, 0, 210, 30, 'F');
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(14).setFont('helvetica', 'bold').text(info.name.toUpperCase(), 14, 15);
        docPDF.setFontSize(8).text(`RIF: ${info.rif}`, 14, 22);
        docPDF.setFontSize(10).text("BALANCE FINANCIERO MENSUAL", 196, 18, { align: 'right' });

        docPDF.setTextColor(0, 0, 0);
        docPDF.setFontSize(12).text(`Período: ${monthName.toUpperCase()} ${selectedYear}`, 14, 45);

        autoTable(docPDF, {
            startY: 55,
            head: [['CONCEPTO DE INGRESO', 'MONTO (BS.)']],
            body: [
                ['SALDO ANTERIOR BANCO', formatCurrency(saldoAnteriorBanco)],
                ['INGRESOS BANCO (DIGITAL)', formatCurrency(ingresosOrdinariosBanco)],
                ['INGRESOS EFECTIVO (CAJA)', formatCurrency(ingresosOrdinariosEfectivo)]
            ],
            headStyles: { fillColor: [0, 129, 201] },
            styles: { textColor: [0, 0, 0], fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' } }
        });

        autoTable(docPDF, {
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            head: [['FECHA/CONCEPTO', 'CUENTA ORIGEN', 'MONTO (BS.)']],
            body: egresosTesorería.map(e => [e.concepto, e.cuenta, formatCurrency(e.monto)]),
            foot: [['TOTAL EGRESOS DEL PERIODO', '', formatCurrency(totalEgresosMes)]],
            headStyles: { fillColor: [239, 68, 68] },
            footStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold' },
            styles: { textColor: [0, 0, 0] },
            columnStyles: { 2: { halign: 'right' } }
        });

        docPDF.save(`Balance_${selectedYear}_${selectedMonth}_${info.name.replace(/ /g, '_')}.pdf`);
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6 bg-[#1A1D23] min-h-screen font-montserrat text-white">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-4">
                <div>
                    <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white leading-none">
                        Balance <span className="text-primary">Financiero</span>
                    </h1>
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.3em] mt-2 italic">Integridad Contable Digital</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleExportPDF} variant="outline" className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] h-10 px-4 bg-white/5 hover:bg-white/10 italic">
                        <Download className="mr-2 h-4 w-4 text-primary" /> Exportar PDF
                    </Button>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-36 bg-slate-900 text-white border-white/5 font-black uppercase text-[10px] h-10 rounded-xl italic"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white">{Array.from({length:12}, (_,i)=>(<SelectItem key={i+1} value={String(i+1)} className="font-black uppercase text-[10px]">{format(new Date(2000,i), 'MMMM', {locale:es})}</SelectItem>))}</SelectContent>
                    </Select>
                    <Input className="w-24 bg-slate-900 text-white border-white/5 font-black h-10 rounded-xl italic" type="number" value={selectedYear} onChange={(e)=>setSelectedYear(e.target.value)} />
                </div>
            </div>

            {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div> : <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-6 flex flex-col justify-between relative overflow-hidden border border-white/5">
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary italic">Saldo Real en Banco</p>
                            <p className="text-3xl font-black italic mt-1">Bs. {formatCurrency(realBalances.banco)}</p>
                        </div>
                        <Landmark className="absolute top-6 right-6 h-12 w-12 text-white/5" />
                    </Card>

                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 p-6 flex flex-col justify-between border border-white/5 relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 italic">Saldo Real Caja Principal</p>
                            <p className="text-3xl font-black italic mt-1 text-white">Bs. {formatCurrency(realBalances.cajaPrincipal)}</p>
                        </div>
                        <Coins className="absolute top-6 right-6 h-12 w-12 text-white/5" />
                    </Card>

                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 p-6 flex flex-col justify-center border border-white/5 relative overflow-hidden">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">Fondo de Caja Chica</p>
                        <p className="text-3xl font-black italic mt-1 text-white">Bs. {formatCurrency(realBalances.cajaChica)}</p>
                        <Wallet className="absolute top-6 right-6 h-12 w-12 text-white/5" />
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-slate-900 border border-white/5 h-fit">
                        <CardHeader className="bg-slate-950 border-b border-white/5"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">Ingresos del Período</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableBody>
                                    <TableRow className="bg-white/5 border-b border-white/5">
                                        <TableCell className="font-black text-white text-[10px] uppercase italic">SALDO ANTERIOR BANCO</TableCell>
                                        <TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 rounded-xl text-white border-none italic" value={saldoAnteriorBanco} onChange={e=>setSaldoAnteriorBanco(Number(e.target.value))}/></TableCell>
                                    </TableRow>
                                    <TableRow className="border-b border-white/5">
                                        <TableCell className="text-white/60 text-[10px] font-black uppercase italic">Ingresos Banco (Digital)</TableCell>
                                        <TableCell className="text-right font-black text-white italic">Bs. {formatCurrency(ingresosOrdinariosBanco)}</TableCell>
                                    </TableRow>
                                    <TableRow className="border-none">
                                        <TableCell className="text-white/60 text-[10px] font-black uppercase italic">Ingresos Efectivo (Caja)</TableCell>
                                        <TableCell className="text-right font-black text-emerald-500 italic">Bs. {formatCurrency(ingresosOrdinariosEfectivo)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-slate-900 border border-white/5">
                        <CardHeader className="bg-slate-950 border-b border-white/5"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">Egresos Registrados (Tesorería)</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-950/50 border-b border-white/5">
                                        <TableHead className="text-white/40 font-black text-[10px] uppercase italic">CONCEPTO / CUENTA</TableHead>
                                        <TableHead className="text-right text-white/40 font-black text-[10px] uppercase italic">MONTO (BS.)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {egresosTesorería.length === 0 ? (
                                        <TableRow className="border-none"><TableCell colSpan={2} className="text-center py-10 text-white/20 italic text-[10px] font-black uppercase">Sin egresos en este período.</TableCell></TableRow>
                                    ) : egresosTesorería.map((egreso, i) => (
                                        <TableRow key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <TableCell className="py-3">
                                                <div className="text-white font-black uppercase text-[10px] italic">{egreso.concepto}</div>
                                                <div className="text-[8px] font-black text-white/20 uppercase tracking-tighter">ORIGEN: {egreso.cuenta}</div>
                                            </TableCell>
                                            <TableCell className="text-right font-black text-red-500 italic">Bs. {formatCurrency(egreso.monto)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter className="bg-red-500/10">
                                    <TableRow className="border-none">
                                        <TableCell className="font-black text-red-400 text-[10px] uppercase italic">Total Egresos</TableCell>
                                        <TableCell className="text-right font-black text-red-500 text-lg italic">Bs. {formatCurrency(totalEgresosMes)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-2 mt-6">
                    <Label className="text-[10px] font-black uppercase text-white/40 ml-4 italic">Observaciones del Balance</Label>
                    <Textarea 
                        className="rounded-[2.5rem] bg-slate-900 border-white/5 text-white font-black p-6 min-h-[120px] shadow-2xl italic placeholder:text-white/10 focus-visible:ring-primary uppercase text-xs" 
                        value={notas} 
                        onChange={e => setNotas(e.target.value)} 
                        placeholder="Escriba notas relevantes..."
                    />
                </div>

                <CardFooter className="flex justify-end p-0 pt-6">
                    <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 h-14 rounded-2xl font-black uppercase px-10 text-primary-foreground shadow-2xl shadow-primary/20 italic transition-all active:scale-95">
                        {saving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-5 w-5" />} Guardar Balance
                    </Button>
                </CardFooter>
            </> }
        </div>
    );
}

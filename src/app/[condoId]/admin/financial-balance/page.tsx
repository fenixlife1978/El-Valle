
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

        const unsubCuentas = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), (snap) => {
            const accounts = snap.docs.map(d => d.data());
            const bdv = accounts.find(a => a.nombre?.toUpperCase().trim() === 'BANCO DE VENEZUELA');
            const cp = accounts.find(a => a.nombre?.toUpperCase().trim() === 'CAJA PRINCIPAL');
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

                // INGRESOS
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
                    if (['transferencia', 'movil'].includes(data.paymentMethod)) totalBancario += data.totalAmount;
                    else if (['efectivo_bs', 'efectivo'].includes(data.paymentMethod)) totalEfectivo += data.totalAmount;
                });
                setIngresosOrdinariosBanco(totalBancario);
                setIngresosOrdinariosEfectivo(totalEfectivo);

                // EGRESOS
                const tQuery = query(
                    collection(db, 'condominios', workingCondoId, 'transacciones'), 
                    where('fecha', '>=', fromDate), 
                    where('fecha', '<=', toDate), 
                    where('tipo', '==', 'egreso'),
                    orderBy('fecha', 'desc')
                );
                const tSnap = await getDocs(tQuery);
                setEgresosTesorería(tSnap.docs.map(d => ({ 
                    concepto: d.data().descripcion, 
                    monto: d.data().monto,
                    cuenta: d.data().nombreCuenta || "S/D"
                })));

            } catch (error) { 
                console.error("Error cargando datos del balance:", error); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchAutomaticData();
    }, [selectedMonth, selectedYear, workingCondoId]);

    const totalEgresosBanco = useMemo(() => 
        egresosTesorería
            .filter(e => e.cuenta.toUpperCase().includes("BANCO"))
            .reduce((sum, e) => sum + e.monto, 0), 
    [egresosTesorería]);

    const totalEgresosMes = useMemo(() => egresosTesorería.reduce((sum, e) => sum + e.monto, 0), [egresosTesorería]);
    const disponibilidadBancariaEstimada = (saldoAnteriorBanco + ingresosOrdinariosBanco) - totalEgresosBanco;

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
                ['INGRESOS BANCO (PAGO MÓVIL / TRANSF.)', formatCurrency(ingresosOrdinariosBanco)],
                ['INGRESOS EFECTIVO (CAJA PRINCIPAL)', formatCurrency(ingresosOrdinariosEfectivo)]
            ],
            headStyles: { fillColor: [0, 129, 201] },
            styles: { textColor: [0, 0, 0] },
            columnStyles: { 1: { halign: 'right' } }
        });

        autoTable(docPDF, {
            startY: (docPDF as any).lastAutoTable.finalY + 10,
            head: [['FECHA/CONCEPTO', 'CUENTA ORIGEN', 'MONTO (BS.)']],
            body: egresosTesorería.map(e => [e.concepto, e.cuenta, formatCurrency(e.monto)]),
            foot: [['TOTAL EGRESOS', '', formatCurrency(totalEgresosMes)]],
            headStyles: { fillColor: [239, 68, 68] },
            footStyles: { fillColor: [185, 28, 28], textColor: 255 },
            styles: { textColor: [0, 0, 0] },
            columnStyles: { 2: { halign: 'right' } }
        });

        const finalY = (docPDF as any).lastAutoTable.finalY + 15;
        docPDF.setFont('helvetica', 'bold').setFontSize(11);
        docPDF.text("SALDOS REALES EN TESORERÍA AL CIERRE:", 14, finalY);
        docPDF.setFont('helvetica', 'normal').setFontSize(10);
        docPDF.text(`BANCO DE VENEZUELA: Bs. ${formatCurrency(realBalances.banco)}`, 14, finalY + 7);
        docPDF.text(`CAJA PRINCIPAL (EFECTIVO): Bs. ${formatCurrency(realBalances.cajaPrincipal)}`, 14, finalY + 14);
        docPDF.text(`CAJA CHICA: Bs. ${formatCurrency(realBalances.cajaChica)}`, 14, finalY + 21);

        if (notas) {
            docPDF.setFont('helvetica', 'bold').text("NOTAS:", 14, finalY + 35);
            docPDF.setFont('helvetica', 'normal').setFontSize(9).text(notas, 14, finalY + 40, { maxWidth: 180 });
        }

        docPDF.save(`Balance_${selectedYear}_${selectedMonth}_${info.name.replace(/ /g, '_')}.pdf`);
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6 bg-slate-50 min-h-screen font-montserrat">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-4">
                <div>
                    <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900 leading-none">
                        Balance <span className="text-[#0081c9]">Financiero</span>
                    </h1>
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] mt-2">Resumen Operativo Mensual</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleExportPDF} variant="outline" className="rounded-xl border-slate-200 text-slate-700 font-bold h-10 px-4 bg-white hover:bg-slate-50">
                        <Download className="mr-2 h-4 w-4" /> Exportar PDF
                    </Button>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-36 bg-white text-slate-900 border-slate-200 font-bold h-10 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-white">{Array.from({length:12}, (_,i)=>(<SelectItem key={i+1} value={String(i+1)} className="text-slate-900">{format(new Date(2000,i), 'MMMM', {locale:es})}</SelectItem>))}</SelectContent>
                    </Select>
                    <Input className="w-24 bg-white text-slate-900 border-slate-200 font-bold h-10 rounded-xl" type="number" value={selectedYear} onChange={(e)=>setSelectedYear(e.target.value)} />
                </div>
            </div>

            {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-[#0081c9]" /></div> : <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="rounded-[2rem] border-none shadow-xl bg-slate-900 text-white p-6 flex flex-col justify-between relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#f59e0b]">Saldo Real en Banco</p>
                            <p className="text-3xl font-black italic mt-1">Bs. {formatCurrency(realBalances.banco)}</p>
                        </div>
                        <Landmark className="absolute top-6 right-6 h-12 w-12 text-white/10" />
                        <div className="mt-4 pt-4 border-t border-white/10 relative z-10">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Estimado Contable Banco:</p>
                            <p className="text-sm font-bold text-sky-400">Bs. {formatCurrency(disponibilidadBancariaEstimada)}</p>
                        </div>
                    </Card>

                    <Card className="rounded-[2rem] border-none shadow-xl bg-white p-6 flex flex-col justify-between border border-slate-100 relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Saldo Real Caja Principal</p>
                            <p className="text-3xl font-black italic mt-1 text-slate-900">Bs. {formatCurrency(realBalances.cajaPrincipal)}</p>
                        </div>
                        <Coins className="absolute top-6 right-6 h-12 w-12 text-slate-100" />
                        <div className="mt-4 pt-4 border-t border-slate-50 relative z-10">
                            <p className="text-[9px] font-bold text-slate-400 uppercase italic">Ingresos Efectivo Mes:</p>
                            <p className="text-sm font-bold text-emerald-600">Bs. {formatCurrency(ingresosOrdinariosEfectivo)}</p>
                        </div>
                    </Card>

                    <Card className="rounded-[2rem] border-none shadow-xl bg-white p-6 flex flex-col justify-center border border-slate-100 relative overflow-hidden">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Fondo de Caja Chica</p>
                        <p className="text-3xl font-black italic mt-1 text-slate-900">Bs. {formatCurrency(realBalances.cajaChica)}</p>
                        <Wallet className="absolute top-6 right-6 h-12 w-12 text-slate-100" />
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <Card className="rounded-[2rem] border-none shadow-sm overflow-hidden bg-white h-fit border border-slate-100">
                        <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-600">Ingresos del Período</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableBody>
                                    <TableRow className="bg-blue-50/30">
                                        <TableCell className="font-bold text-slate-900 text-xs">SALDO ANTERIOR BANCO</TableCell>
                                        <TableCell className="p-2"><Input type="number" className="text-right bg-white font-bold h-8 rounded-lg text-slate-900 border-slate-200" value={saldoAnteriorBanco} onChange={e=>setSaldoAnteriorBanco(Number(e.target.value))}/></TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="text-slate-700 text-xs font-medium uppercase">Ingresos Banco (Digital)</TableCell>
                                        <TableCell className="text-right font-black text-slate-900">Bs. {formatCurrency(ingresosOrdinariosBanco)}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="text-slate-700 text-xs font-medium uppercase">Ingresos Efectivo (Caja)</TableCell>
                                        <TableCell className="text-right font-black text-emerald-600">Bs. {formatCurrency(ingresosOrdinariosEfectivo)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[2.5rem] border-none shadow-sm overflow-hidden bg-white border border-slate-100">
                        <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-600">Egresos Registrados (Tesorería)</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-100/20 border-b border-slate-100">
                                        <TableHead className="text-slate-700 font-black text-[10px] uppercase">CONCEPTO / CUENTA</TableHead>
                                        <TableHead className="text-right text-slate-700 font-black text-[10px] uppercase">MONTO (BS.)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {egresosTesorería.length === 0 ? (
                                        <TableRow><TableCell colSpan={2} className="text-center py-10 text-slate-400 italic text-xs">No se registraron egresos en este período.</TableCell></TableRow>
                                    ) : egresosTesorería.map((egreso, i) => (
                                        <TableRow key={i} className="border-b border-slate-50">
                                            <TableCell className="py-3">
                                                <div className="text-slate-900 font-bold uppercase text-[10px]">{egreso.concepto}</div>
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">ORIGEN: {egreso.cuenta}</div>
                                            </TableCell>
                                            <TableCell className="text-right font-black text-red-600">Bs. {formatCurrency(egreso.monto)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow className="bg-red-50/50">
                                        <TableCell className="font-black text-red-900 text-[10px] uppercase">Total Egresos del Mes</TableCell>
                                        <TableCell className="text-right font-black text-red-700 text-lg">Bs. {formatCurrency(totalEgresosMes)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-2 mt-6">
                    <Label className="text-[10px] font-black uppercase text-slate-500 ml-4">Observaciones y Notas del Balance</Label>
                    <Textarea 
                        className="rounded-[2rem] bg-white border-slate-200 text-slate-900 font-bold p-6 min-h-[120px] shadow-sm placeholder:text-slate-300 focus-visible:ring-[#0081c9]" 
                        value={notas} 
                        onChange={e => setNotas(e.target.value)} 
                        placeholder="Escriba notas relevantes sobre el balance aquí..."
                    />
                </div>

                <CardFooter className="flex justify-end p-0 pt-6">
                    <Button onClick={handleSave} disabled={saving} className="bg-[#0081c9] hover:bg-[#006ba8] h-14 rounded-2xl font-black uppercase px-10 text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95">
                        {saving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-5 w-5" />} Guardar Balance del Período
                    </Button>
                </CardFooter>
            </> }
        </div>
    );
}

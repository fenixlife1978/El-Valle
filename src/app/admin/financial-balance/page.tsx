

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Loader2, Save, FileDown, Trash2, Eye, ChevronLeft, X, TrendingUp, BarChartHorizontalBig } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const inputStyle = "bg-slate-100 border-none h-12 text-md font-bold text-slate-900 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500 placeholder:text-slate-400";

type FinancialItem = {
    id: string;
    dia: string;
    concepto: string;
    monto: number;
    categoria: string;
};

type FinancialStatement = {
  id: string;
  ingresos: FinancialItem[];
  egresos: FinancialItem[];
  estadoFinanciero: { 
    saldoNeto: number;
    saldoAnterior: number;
    totalIngresos: number;
    totalEgresos: number;
   };
  notas: string;
  createdAt: Timestamp;
};

const emptyItem = { id: '', dia: '', concepto: '', monto: 0, categoria: 'N/A' };


const formatToTwoDecimals = (num: number): string => {
  if (typeof num !== 'number' || isNaN(num)) return '0,00';
  const truncated = Math.trunc(num * 100) / 100;
  return truncated.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};


export default function FinancialBalancePage() {
    const { activeCondoId } = useAuth();
    const { toast } = useToast();
    const [view, setView] = useState<'list' | 'form'>('list');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statements, setStatements] = useState<FinancialStatement[]>([]);
    const [activeSettings, setActiveSettings] = useState<any>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    
    // State for the form
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    const [prevBalance, setPrevBalance] = useState(0); 
    const [ingresos, setIngresos] = useState<FinancialItem[]>([{ ...emptyItem, id: Date.now().toString() }]);
    const [egresos, setEgresos] = useState<FinancialItem[]>([{ ...emptyItem, id: Date.now().toString() }]);
    const [notas, setNotas] = useState('');

    const condoId = activeCondoId || "condo_01";

    useEffect(() => {
        if (!activeCondoId) {
            const timer = setTimeout(() => setLoading(false), 3000);
            return () => clearTimeout(timer);
        }

        const q = query(collection(db, "condominios", activeCondoId, "financial_statements"), orderBy("createdAt", "desc"));
        const unsubStatements = onSnapshot(q, 
            (snap) => {
                setStatements(snap.docs.map(d => ({ id: d.id, ...d.data() } as FinancialStatement)));
                setLoading(false);
            },
            (error) => {
                 console.error("Error en Firebase:", error);
                 toast({ variant: 'destructive', title: 'Error de Conexión', description: 'Revisa tus permisos en Firebase.' });
                 setLoading(false);
            }
        );

        const unsubSettings = onSnapshot(doc(db, "condominios", activeCondoId, "config", "mainSettings"), (snap) => {
            if (snap.exists()) setActiveSettings(snap.data());
        });
        
        return () => { unsubStatements(); unsubSettings(); };
    }, [activeCondoId, toast]);

    const totalIngresos = useMemo(() => ingresos.reduce((acc, item) => acc + Number(item.monto || 0), 0), [ingresos]);
    const totalEgresos = useMemo(() => egresos.reduce((acc, item) => acc + Number(item.monto || 0), 0), [egresos]);
    const saldoNeto = useMemo(() => prevBalance + totalIngresos - totalEgresos, [prevBalance, totalIngresos, totalEgresos]);

    const handleItemChange = (type: 'ingresos' | 'egresos', id: string, field: keyof FinancialItem, value: string | number) => {
        const setter = type === 'ingresos' ? setIngresos : setEgresos;
        setter(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const addItem = (type: 'ingresos' | 'egresos') => {
        const setter = type === 'ingresos' ? setIngresos : setEgresos;
        setter(prev => [...prev, { ...emptyItem, id: Date.now().toString() }]);
    };

    const removeItem = (type: 'ingresos' | 'egresos', id: string) => {
        const setter = type === 'ingresos' ? setIngresos : setEgresos;
        setter(prev => prev.length > 1 ? prev.filter(item => item.id !== id) : prev);
    };

    const generatePDF = async (s: FinancialStatement, action: 'download' | 'view' = 'download') => {
        if (!activeSettings?.companyInfo) {
            toast({ variant: "destructive", title: "Faltan datos", description: "No se encontró la información de la empresa." });
            return;
        }

        const info = activeSettings.companyInfo;
        const pdf = new jsPDF();
        const pageWidth = (pdf as any).internal.pageSize.getWidth();
        const margin = 14;

        // 1. ENCABEZADO
        if (info.logo) {
            try { pdf.addImage(info.logo, 'PNG', 14, 15, 25, 25); } catch(e) {}
        }
        pdf.setFont("helvetica", "bold").setFontSize(10).text(info.name?.toUpperCase() || "", 45, 20);
        pdf.setFont("helvetica", "normal").setFontSize(8);
        pdf.text(info.rif || "", 45, 25);
        const addressLines = pdf.splitTextToSize(info.address || "", 100);
        pdf.text(addressLines, 45, 30);
        const addressHeight = addressLines.length * 3.5;
        pdf.text(`Teléfono: ${info.phone || ""}`, 45, 30 + addressHeight);
        pdf.text(`Emitido: ${format(new Date(), 'dd/MM/yyyy')}`, 200, 20, { align: 'right' });

        // 2. TÍTULO Y QR
        const periodMonth = s.id.split('-')[1];
        const periodYear = s.id.split('-')[0];
        const monthLabel = es.localize?.month((parseInt(periodMonth) - 1) as any, { width: 'wide' }) || '';
        const periodText = `Correspondiente al período de ${monthLabel} ${periodYear}`;
        
        pdf.setFont("helvetica", "bold").setFontSize(14).text("Balance Financiero", 105, 55, { align: 'center' });
        pdf.setFont("helvetica", "normal").setFontSize(10).text(periodText, 105, 61, { align: 'center' });
        
        const qrDataUrl = await QRCode.toDataURL(`${window.location.origin}/report-viewer/${s.id}`);
        pdf.addImage(qrDataUrl, 'PNG', 170, 50, 25, 25);
        let startY = 75;

        // 3. TABLA DE INGRESOS
        const ingresosBody = [
            ["01", "saldo inicial (Mes Anterior)", "N/A", formatToTwoDecimals(s.estadoFinanciero.saldoAnterior)],
            ...s.ingresos.map(item => [item.dia, item.concepto, item.categoria, formatToTwoDecimals(item.monto)])
        ];
        autoTable(pdf, {
            startY: startY,
            head: [['DÍA', 'INGRESOS', 'CATEGORÍA', 'MONTO (Bs.)']],
            body: ingresosBody,
            foot: [['', '', 'TOTAL INGRESOS', formatToTwoDecimals(s.estadoFinanciero.totalIngresos + s.estadoFinanciero.saldoAnterior)]],
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', halign: 'center' },
            footStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', halign: 'right' },
            columnStyles: { 3: { halign: 'right' } }
        });
        startY = (pdf as any).lastAutoTable.finalY + 10;

        // 4. TABLA DE EGRESOS
        autoTable(pdf, {
            startY: startY,
            head: [['DÍA', 'EGRESOS', 'CATEGORÍA', 'MONTO (Bs.)']],
            body: s.egresos.map(item => [item.dia, item.concepto, item.categoria, formatToTwoDecimals(item.monto)]),
            foot: [['', '', 'TOTAL EGRESOS', formatToTwoDecimals(s.estadoFinanciero.totalEgresos)]],
            theme: 'grid',
            headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', halign: 'center' },
            footStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', halign: 'right' },
            columnStyles: { 3: { halign: 'right' } }
        });
        startY = (pdf as any).lastAutoTable.finalY + 10;
        
        // 5. RESUMEN DE EGRESOS POR CATEGORÍA
        const egresosByCategory = s.egresos.reduce((acc, item) => {
            const cat = item.categoria || 'Sin Categoría';
            acc[cat] = (acc[cat] || 0) + Number(item.monto);
            return acc;
        }, {} as Record<string, number>);

        autoTable(pdf, {
            startY: startY,
            head: [['Resumen de Egresos por Categoría', 'Monto Total (Bs.)']],
            body: Object.entries(egresosByCategory).map(([cat, total]) => [cat, formatToTwoDecimals(total)]),
            theme: 'grid',
            headStyles: { fillColor: [75, 85, 99], textColor: 255, fontStyle: 'bold' },
            columnStyles: { 1: { halign: 'right' } }
        });
        startY = (pdf as any).lastAutoTable.finalY + 10;

        // 6. NOTAS
        if (s.notas) {
            pdf.setFont("helvetica", "bold").setFontSize(10).text("Notas:", margin, startY);
            startY += 5;
            pdf.setFont("helvetica", "normal").setFontSize(9);
            const notesLines = pdf.splitTextToSize(s.notas, pageWidth - margin * 2);
            pdf.text(notesLines, margin, startY);
            startY += (notesLines.length * 4) + 10;
        }
        
        // 7. LIQUIDEZ
        const finalY = 250;
        pdf.setFontSize(9).setFont("helvetica", "normal");
        pdf.text('Saldo del Mes en Banco:', 130, finalY);
        pdf.text(`Bs. ${formatToTwoDecimals(s.estadoFinanciero.saldoNeto)}`, 200, finalY, { align: 'right' });
        
        pdf.text('Saldo en Caja Chica:', 130, finalY + 5);
        pdf.text('Bs. 0,00', 200, finalY + 5, { align: 'right' });
        
        pdf.text('Saldo en Efectivo:', 130, finalY + 10);
        pdf.text('Bs. 0,00', 200, finalY + 10, { align: 'right' });

        const totalY = finalY + 18;
        pdf.setFillColor(230, 245, 208); // Un verde claro
        pdf.rect(128, totalY - 5, 74, 7, 'F');
        pdf.setFontSize(10).setFont("helvetica", "bold");
        pdf.text('TOTAL LIQUIDEZ', 130, totalY);
        pdf.text(`Bs. ${formatToTwoDecimals(s.estadoFinanciero.saldoNeto)}`, 200, totalY, { align: 'right' });


        if (action === 'download') {
            pdf.save(`Balance_${s.id}.pdf`);
        } else {
            setPreviewUrl(pdf.output('bloburl').toString());
        }
    };
    
    const handleSave = async () => {
        setSaving(true);
        const id = `${selectedYear}-${selectedMonth}`;
        const finalIngresos = ingresos.filter(i => i.concepto && i.monto > 0);
        const finalEgresos = egresos.filter(e => e.concepto && e.monto > 0);
        try {
            await setDoc(doc(db, "condominios", condoId, "financial_statements", id), {
                id,
                ingresos: finalIngresos,
                egresos: finalEgresos,
                notas,
                estadoFinanciero: {
                    saldoAnterior: prevBalance,
                    totalIngresos: totalIngresos,
                    totalEgresos: totalEgresos,
                    saldoNeto: saldoNeto,
                },
                createdAt: serverTimestamp(),
            });
            setView('list');
            toast({ title: "Balance Guardado con Éxito" });
        } catch (e) { toast({ variant: 'destructive', title: "Error al guardar" }); }
        finally { setSaving(false); }
    };
    
    const resetForm = () => {
        setView('list');
        setIngresos([{ ...emptyItem, id: Date.now().toString() }]);
        setEgresos([{ ...emptyItem, id: Date.now().toString() }]);
        setNotas('');
        setPrevBalance(0);
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 h-10 w-10" /></div>;

    const renderItemTable = (type: 'ingresos' | 'egresos') => {
        const items = type === 'ingresos' ? ingresos : egresos;
        return (
            <Card className="rounded-2xl overflow-hidden">
                <CardHeader className="bg-slate-100 p-4">
                    <CardTitle className="text-md font-black uppercase text-slate-600">{type}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-24">Día</TableHead>
                                <TableHead>Concepto</TableHead>
                                <TableHead className="w-40">Categoría</TableHead>
                                <TableHead className="w-40 text-right">Monto (Bs.)</TableHead>
                                <TableHead className="w-12"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell><Input className={inputStyle} value={item.dia} onChange={(e) => handleItemChange(type, item.id, 'dia', e.target.value)} /></TableCell>
                                    <TableCell><Input className={inputStyle} value={item.concepto} onChange={(e) => handleItemChange(type, item.id, 'concepto', e.target.value)} /></TableCell>
                                    <TableCell><Input className={inputStyle} value={item.categoria} onChange={(e) => handleItemChange(type, item.id, 'categoria', e.target.value)} /></TableCell>
                                    <TableCell><Input type="number" className={`${inputStyle} text-right`} value={item.monto} onChange={(e) => handleItemChange(type, item.id, 'monto', parseFloat(e.target.value) || 0)} /></TableCell>
                                    <TableCell><Button variant="ghost" size="icon" onClick={() => removeItem(type, item.id)}><Trash2 className="h-4 w-4 text-red-400"/></Button></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                <CardContent className="p-4 bg-slate-50">
                    <Button type="button" variant="outline" size="sm" onClick={() => addItem(type)}><PlusCircle className="mr-2 h-4 w-4"/>Añadir Fila</Button>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
             <header className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div className="mb-10">
                    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                        Balance <span className="text-[#0081c9]">Financiero</span>
                    </h2>
                    <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                    <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
                        Creación y gestión de los cierres contables mensuales.
                    </p>
                </div>
                {view === 'list' && (
                    <Button onClick={() => setView('form')} className="bg-blue-600 hover:bg-blue-700 text-white font-black px-8 h-12 rounded-full shadow-lg transition-all hover:scale-105">
                        <PlusCircle className="mr-2 h-5 w-5" /> NUEVO CIERRE MENSUAL
                    </Button>
                )}
            </header>

            {view === 'list' ? (
                <Card className="rounded-[2.5rem] shadow-xl overflow-hidden border-none bg-white">
                    <Table>
                        <TableHeader className="bg-slate-900"><TableRow className="h-16"><TableHead className="px-8 text-white font-bold uppercase text-xs">Periodo Contable</TableHead><TableHead className="text-right px-8 text-white font-bold uppercase text-xs">Cierre de Caja</TableHead><TableHead className="text-right px-8 text-white font-bold uppercase text-xs">Acción</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {statements.map(s => (
                                <TableRow key={s.id} className="h-20 hover:bg-slate-50 transition-all border-b border-slate-100">
                                    <TableCell className="px-8 font-black text-slate-800 text-lg italic capitalize">{es.localize?.month((parseInt(s.id.split('-')[1]) - 1) as any, { width: 'wide' })} {s.id.split('-')[0]}</TableCell>
                                    <TableCell className="text-right px-8 font-black text-emerald-600 text-xl tracking-tighter italic">Bs. {s.estadoFinanciero.saldoNeto.toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-right px-8 space-x-2">
                                        <Button onClick={() => generatePDF(s, 'view')} variant="outline" className="rounded-xl font-bold border-slate-200"><Eye className="mr-2 h-4 w-4" /> Ver</Button>
                                        <Button onClick={() => generatePDF(s)} className="bg-slate-900 text-white rounded-xl font-bold"><FileDown className="mr-2 h-4 w-4" /> PDF</Button>
                                        <Button onClick={() => { if(confirm("¿Eliminar permanente?")) deleteDoc(doc(db, "condominios", condoId, "financial_statements", s.id)) }} variant="ghost" className="text-red-400"><Trash2 className="h-5 w-5" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            ) : (
                <div className="space-y-6">
                    <Card className="rounded-2xl shadow-lg border-none bg-white">
                        <CardHeader><CardTitle className="flex items-center gap-2"><BarChartHorizontalBig/> Editor del Cierre Contable</CardTitle></CardHeader>
                        <CardContent className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            <div className="space-y-2"><label className="text-[10px] font-bold text-slate-500">Año</label><Input value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className={inputStyle} /></div>
                            <div className="space-y-2"><label className="text-[10px] font-bold text-slate-500">Mes</label><Input value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className={inputStyle} /></div>
                            <div className="lg:col-span-2 space-y-2"><label className="text-[10px] font-bold text-slate-500">Saldo del Mes Anterior</label><Input type="number" value={prevBalance} onChange={e => setPrevBalance(Number(e.target.value))} className={inputStyle} /></div>
                        </CardContent>
                    </Card>

                    {renderItemTable('ingresos')}
                    {renderItemTable('egresos')}

                     <Card className="rounded-2xl shadow-lg border-none bg-white">
                        <CardHeader><CardTitle>Notas Adicionales</CardTitle></CardHeader>
                        <CardContent><Textarea placeholder="Añadir notas o aclaratorias para este balance..." value={notas} onChange={(e) => setNotas(e.target.value)} className="min-h-[100px] bg-slate-50 border-slate-200 rounded-xl" /></CardContent>
                    </Card>

                    <Card className="bg-slate-900 text-white rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between text-sm"><span className="text-slate-400">Saldo Anterior:</span><span className="font-mono">{formatToTwoDecimals(prevBalance)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-400">(+) Total Ingresos:</span><span className="font-mono text-green-400">{formatToTwoDecimals(totalIngresos)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-400">(-) Total Egresos:</span><span className="font-mono text-red-400">{formatToTwoDecimals(totalEgresos)}</span></div>
                        <hr className="border-slate-700"/>
                        <div className="flex justify-between items-center text-2xl font-black"><span className="text-blue-400">SALDO NETO:</span><span className="font-mono">Bs. {formatToTwoDecimals(saldoNeto)}</span></div>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <Button onClick={resetForm} variant="ghost" className="text-slate-500">Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full text-md shadow-lg">
                            {saving ? <Loader2 className="animate-spin" /> : "PUBLICAR Y ARCHIVAR BALANCE"}
                        </Button>
                    </div>
                </div>
            )}

            {previewUrl && (
                <div className="fixed inset-0 bg-slate-900/95 z-[100] flex items-center justify-center p-4 md:p-8 backdrop-blur-md">
                    <div className="bg-white w-full max-w-6xl h-full rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                        <div className="p-4 flex justify-between items-center border-b"><h3 className="font-bold text-slate-800">Consulta de Balance Oficial</h3><Button onClick={() => setPreviewUrl(null)} variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-red-50 text-red-500"><X size={24} /></Button></div>
                        <iframe src={previewUrl} className="flex-1 w-full border-none" />
                    </div>
                </div>
            )}
        </div>
    );
}

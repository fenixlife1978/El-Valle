'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Save, Plus, Trash2 } from "lucide-react";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function FinancialBalancePage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const { condoId: urlCondoId } = resolvedParams;
    const { userProfile, user } = useAuth();
    const { toast } = useToast();

    const workingCondoId = userProfile?.workingCondoId || userProfile?.condominioId || urlCondoId;
    const activeId = userProfile?.activeId || user?.uid;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [saldoAnteriorBanco, setSaldoAnteriorBanco] = useState(0);
    const [ingresosOrdinariosBanco, setIngresosOrdinariosBanco] = useState(0);
    const [ingresosOrdinariosEfectivo, setIngresosOrdinariosEfectivo] = useState(0);
    const [otrosIngresos, setOtrosIngresos] = useState<{ concepto: string, monto: number }[]>([]);
    const [egresosBanco, setEgresosBanco] = useState<{ concepto: string, monto: number }[]>([]);
    
    const [cajaChicaBS, setCajaChicaBS] = useState(0);
    const [cajaChicaUSD, setCajaChicaUSD] = useState(0);
    const [notas, setNotas] = useState("");
    
    const [companyData, setCompanyData] = useState<any>(null);

    useEffect(() => {
        if (!workingCondoId) return;

        const fetchConfig = async () => {
            try {
                const configRef = doc(db, 'condominios', workingCondoId, 'config', 'mainSettings');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    setCompanyData(configSnap.data().companyInfo);
                }
            } catch (error) {
                console.error("Error al cargar mainSettings:", error);
            }
        };
        fetchConfig();
    }, [workingCondoId]);

    useEffect(() => {
        if (!workingCondoId) return;

        const fetchAutomaticData = async () => {
            setLoading(true);
            try {
                const year = parseInt(selectedYear);
                const month = parseInt(selectedMonth) - 1;
                const fromDate = new Date(year, month, 1);
                const toDate = new Date(year, month + 1, 0, 23, 59, 59);

                // 1. Obtener todos los pagos aprobados del mes
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
                    const amount = data.totalAmount || 0;
                    if (['transferencia', 'movil'].includes(data.paymentMethod)) {
                        totalBancario += amount;
                    } else if (['efectivo_bs', 'efectivo_usd'].includes(data.paymentMethod)) {
                        totalEfectivo += amount;
                    }
                });

                setIngresosOrdinariosBanco(totalBancario);
                setIngresosOrdinariosEfectivo(totalEfectivo);

                // 2. Obtener gastos del mes (Solo Banco)
                const eQuery = query(
                    collection(db, 'condominios', workingCondoId, 'gastos'),
                    where('date', '>=', fromDate),
                    where('date', '<=', toDate),
                    where('paymentSource', '==', 'banco')
                );
                const eSnap = await getDocs(eQuery);
                setEgresosBanco(eSnap.docs.map(d => ({ 
                    concepto: d.data().description, 
                    monto: d.data().amount 
                })));

                // 3. Obtener saldo actual de Caja Chica
                const ccQuery = query(
                    collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos')
                );
                const ccSnap = await getDocs(ccQuery);
                const saldoCajaChica = ccSnap.docs.reduce((acc, doc) => {
                    const data = doc.data();
                    return data.type === 'ingreso' ? acc + data.amount : acc - data.amount;
                }, 0);
                setCajaChicaBS(saldoCajaChica);

            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Error al cargar montos automáticos' });
            } finally {
                setLoading(false);
            }
        };

        fetchAutomaticData();
    }, [selectedMonth, selectedYear, workingCondoId, toast]);

    const totalIngresosMes = useMemo(() => 
        ingresosOrdinariosBanco + ingresosOrdinariosEfectivo + otrosIngresos.reduce((sum, i) => sum + i.monto, 0), 
    [ingresosOrdinariosBanco, ingresosOrdinariosEfectivo, otrosIngresos]);
    
    const totalEgresosMes = useMemo(() => 
        egresosBanco.reduce((sum, e) => sum + e.monto, 0), 
    [egresosBanco]);

    const disponibilidadBancaria = (saldoAnteriorBanco + totalIngresosMes) - totalEgresosMes;

    const agregarLineaIngreso = () => setOtrosIngresos([...otrosIngresos, { concepto: '', monto: 0 }]);
    const eliminarLineaIngreso = (index: number) => setOtrosIngresos(otrosIngresos.filter((_, i) => i !== index));
    const agregarLineaEgreso = () => setEgresosBanco([...egresosBanco, { concepto: '', monto: 0 }]);
    const eliminarLineaEgreso = (index: number) => setEgresosBanco(egresosBanco.filter((_, i) => i !== index));

    const handleSave = async () => {
        if (!workingCondoId) return;
        setSaving(true);
        try {
            const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
            await setDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', docId), {
                periodo: docId,
                saldoAnteriorBanco,
                ingresos: [
                    { dia: '01', concepto: 'INGRESOS ORDINARIOS (PAGO MÓVIL / TRANSF.)', monto: ingresosOrdinariosBanco },
                    { dia: '01', concepto: 'INGRESOS ORDINARIOS (EFECTIVO)', monto: ingresosOrdinariosEfectivo },
                    ...otrosIngresos.map(i => ({ dia: 'VAR', concepto: i.concepto, monto: i.monto }))
                ],
                egresos: egresosBanco.map(e => ({ dia: 'VAR', concepto: e.concepto, monto: e.monto })),
                estadoFinanciero: {
                    saldoNeto: disponibilidadBancaria,
                    saldoEfectivoBS: cajaChicaBS,
                    saldoEfectivoUSD: cajaChicaUSD
                },
                notas,
                updatedBy: activeId,
                updatedAt: serverTimestamp()
            });
            toast({ title: "Balance Guardado Exitosamente" });
        } catch (e) {
            toast({ variant: 'destructive', title: "Error al guardar" });
        } finally {
            setSaving(false);
        }
    };
    
    const handleExportPDF = async () => {
        const info = companyData || userProfile?.companyInfo; 
        
        if (!info) {
            return toast({ variant: 'destructive', title: 'Error', description: 'No se encontró información del condominio.' });
        }
    
        const docPDF = new jsPDF();
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const margin = 14;

        if (info.logo) {
             try { docPDF.addImage(info.logo, 'PNG', margin, margin, 20, 20); } catch (e) { console.error(e); }
        }
        docPDF.setFontSize(12).setFont('helvetica', 'bold').text(info.name, margin + 25, margin + 8);
        docPDF.setFontSize(9).setFont('helvetica', 'normal').text(`RIF: ${info.rif || 'N/A'}`, margin + 25, margin + 14);

        const period = `${format(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1), 'MMMM', {locale: es})} ${selectedYear}`;
        docPDF.setFontSize(16).setFont('helvetica', 'bold').text('ESTADO DE RESULTADOS', pageWidth / 2, margin + 30, { align: 'center'});
        docPDF.setFontSize(10).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, margin + 37, { align: 'center'});
    
        let startY = 60;
    
        autoTable(docPDF, {
            head: [['CONCEPTO DE INGRESO', 'MONTO (Bs.)']],
            body: [
                ['SALDO ANTERIOR EN BANCO', formatCurrency(saldoAnteriorBanco)],
                ['INGRESOS ORDINARIOS (PAGO MÓVIL / TRANSF.)', formatCurrency(ingresosOrdinariosBanco)],
                ['INGRESOS ORDINARIOS (EFECTIVO)', formatCurrency(ingresosOrdinariosEfectivo)],
                ...otrosIngresos.map(i => [i.concepto.toUpperCase(), formatCurrency(i.monto)])
            ],
            foot: [[
                { content: 'TOTAL INGRESOS', styles: { halign: 'right' } },
                { content: formatCurrency(saldoAnteriorBanco + totalIngresosMes), styles: { halign: 'right' } },
            ]],
            startY,
            theme: 'grid',
            headStyles: { fillColor: [30, 80, 180] },
            footStyles: { fillColor: [30, 80, 180], textColor: [255,255,255] },
            columnStyles: { 1: { halign: 'right' } }
        });
    
        startY = (docPDF as any).lastAutoTable.finalY + 10;
    
        autoTable(docPDF, {
            head: [['EGRESOS DE BANCO / PAGOS', 'MONTO (Bs.)']],
            body: egresosBanco.map(e => [e.concepto.toUpperCase(), formatCurrency(e.monto)]),
            foot: [[
                { content: 'TOTAL EGRESOS DEL MES', styles: { halign: 'right' } },
                { content: formatCurrency(totalEgresosMes), styles: { halign: 'right' } },
            ]],
            startY,
            theme: 'striped',
            headStyles: { fillColor: [200, 0, 0] },
            footStyles: { fillColor: [200, 0, 0], textColor: [255,255,255] },
            columnStyles: { 1: { halign: 'right' } }
        });
    
        startY = (docPDF as any).lastAutoTable.finalY + 15;
    
        docPDF.setFontSize(12).setFont('helvetica', 'bold');
        docPDF.text(`DISPONIBILIDAD EN BANCO: Bs. ${formatCurrency(disponibilidadBancaria)}`, 14, startY);
        
        startY += 10;
        docPDF.setFillColor(245, 245, 245);
        docPDF.rect(14, startY, pageWidth - (margin * 2), 25, 'F');
        docPDF.setFontSize(10).text('FONDO DE CAJA CHICA AL CIERRE:', 18, startY + 8);
        docPDF.setFontSize(11).text(`TOTAL EFECTIVO BOLÍVARES (Bs.): ${formatCurrency(cajaChicaBS)}`, 18, startY + 16);
        docPDF.text(`TOTAL EFECTIVO DÓLARES (USD): $ ${cajaChicaUSD.toLocaleString()}`, 18, startY + 22);
    
        docPDF.save(`Balance_${selectedMonth}_${selectedYear}.pdf`);
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Balance <span className="text-primary">Financiero</span></h1>
                    <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">EFAS GuardianPro - {workingCondoId}</p>
                </div>
                <div className="flex gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {Array.from({length:12}, (_,i)=> (
                                <SelectItem key={i+1} value={String(i+1)}>{format(new Date(2000, i), 'MMMM', {locale:es})}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input className="w-24" type="number" value={selectedYear} onChange={(e)=>setSelectedYear(e.target.value)} />
                </div>
            </div>

            {loading ? <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div> : <>
            
            <Card className="border-2">
                <CardHeader className="bg-slate-50 border-b">
                    <CardTitle className="text-sm uppercase tracking-widest">INGRESOS DEL PERÍODO</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-100/50">
                                <TableHead className="w-[70%]">CONCEPTO / DESCRIPCIÓN</TableHead>
                                <TableHead className="text-right">MONTO (BS.)</TableHead>
                                <TableHead className="w-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow className="bg-blue-50/30">
                                <TableCell className="font-bold text-blue-700">SALDO ANTERIOR EN BANCO</TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        className="text-right font-bold" 
                                        value={saldoAnteriorBanco} 
                                        onChange={(e) => setSaldoAnteriorBanco(Number(e.target.value))}
                                    />
                                </TableCell>
                                <TableCell />
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">INGRESOS ORDINARIOS (PAGO MÓVIL / TRANSF. - BANCO)</TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        className="text-right" 
                                        value={ingresosOrdinariosBanco} 
                                        onChange={(e) => setIngresosOrdinariosBanco(Number(e.target.value))}
                                    />
                                </TableCell>
                                <TableCell />
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">INGRESOS ORDINARIOS (EFECTIVO - CAJA)</TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        className="text-right" 
                                        value={ingresosOrdinariosEfectivo} 
                                        onChange={(e) => setIngresosOrdinariosEfectivo(Number(e.target.value))}
                                    />
                                </TableCell>
                                <TableCell />
                            </TableRow>
                            {otrosIngresos.map((linea, idx) => (
                                <TableRow key={`in-${idx}`}>
                                    <TableCell>
                                        <Input 
                                            placeholder="Concepto de ingreso manual..." 
                                            value={linea.concepto}
                                            onChange={(e) => {
                                                const newArr = [...otrosIngresos];
                                                newArr[idx].concepto = e.target.value;
                                                setOtrosIngresos(newArr);
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="number" 
                                            className="text-right"
                                            value={linea.monto}
                                            onChange={(e) => {
                                                const newArr = [...otrosIngresos];
                                                newArr[idx].monto = Number(e.target.value);
                                                setOtrosIngresos(newArr);
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => eliminarLineaIngreso(idx)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                             <TableRow>
                                <TableCell>
                                    <Button variant="outline" size="sm" onClick={agregarLineaIngreso}>
                                        <Plus className="h-4 w-4 mr-2" /> Otros Ingresos
                                    </Button>
                                </TableCell>
                                <TableCell className="text-right font-black text-green-600 text-lg">
                                    TOTAL INGRESOS: Bs. {formatCurrency(saldoAnteriorBanco + totalIngresosMes)}
                                </TableCell>
                                <TableCell />
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>

            <Card className="border-2">
                <CardHeader className="bg-slate-50 border-b">
                    <CardTitle className="text-sm uppercase tracking-widest text-destructive">EGRESOS DEL PERÍODO</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                         <TableHeader>
                            <TableRow className="bg-slate-100/50">
                                <TableHead className="w-[70%]">CONCEPTO / DESCRIPCIÓN</TableHead>
                                <TableHead className="text-right">MONTO (BS.)</TableHead>
                                <TableHead className="w-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                         <TableBody>
                             {egresosBanco.map((linea, idx) => (
                                <TableRow key={`out-${idx}`}>
                                    <TableCell>
                                        <Input 
                                            placeholder="Concepto de egreso manual..." 
                                            value={linea.concepto}
                                            onChange={(e) => {
                                                const newArr = [...egresosBanco];
                                                newArr[idx].concepto = e.target.value;
                                                setEgresosBanco(newArr);
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="number" 
                                            className="text-right"
                                            value={linea.monto}
                                            onChange={(e) => {
                                                const newArr = [...egresosBanco];
                                                newArr[idx].monto = Number(e.target.value);
                                                setEgresosBanco(newArr);
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => eliminarLineaEgreso(idx)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                         </TableBody>
                         <TableFooter>
                            <TableRow>
                                <TableCell>
                                    <Button variant="outline" size="sm" onClick={agregarLineaEgreso}>
                                        <Plus className="h-4 w-4 mr-2" /> Otros Egresos
                                    </Button>
                                </TableCell>
                                <TableCell className="text-right font-black text-destructive text-lg">
                                    TOTAL EGRESOS: Bs. {formatCurrency(totalEgresosMes)}
                                </TableCell>
                                <TableCell />
                            </TableRow>
                         </TableFooter>
                    </Table>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-orange-200 bg-orange-50/20">
                    <CardHeader><CardTitle className="text-sm text-orange-700 uppercase">Caja Chica (Cierre Mensual)</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase">Disponible Efectivo Bs.</span>
                            <Input 
                                type="number" 
                                className="w-40 text-right bg-white" 
                                value={cajaChicaBS} 
                                readOnly
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase">Disponible Efectivo USD</span>
                            <Input 
                                type="number" 
                                className="w-40 text-right bg-white" 
                                value={cajaChicaUSD} 
                                onChange={(e)=>setCajaChicaUSD(Number(e.target.value))}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader><CardTitle className="text-sm uppercase">Resumen de Disponibilidad</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                         <div className="flex justify-between text-sm"><span>Total Ingresos + Saldo Ant:</span> <b>Bs. {formatCurrency(saldoAnteriorBanco + totalIngresosMes)}</b></div>
                         <div className="flex justify-between text-sm"><span>Total Egresos (Banco):</span> <b className="text-red-600">- Bs. {formatCurrency(totalEgresosMes)}</b></div>
                         <div className="flex justify-between text-lg border-t pt-2 mt-2"><span>DISPONIBLE BANCO:</span> <b className="text-primary">Bs. {formatCurrency(disponibilidadBancaria)}</b></div>
                    </CardContent>
                </Card>
            </div>

            <CardFooter className="flex justify-between bg-slate-900 p-6 rounded-xl text-white">
                <Textarea 
                    placeholder="Notas y observaciones del balance..." 
                    className="w-2/3 bg-slate-800 border-slate-700" 
                    value={notas} 
                    onChange={(e)=>setNotas(e.target.value)}
                />
                <div className="flex flex-col gap-2">
                    <Button variant="secondary" className="w-full" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Save className="h-4 w-4 mr-2"/>} 
                        Guardar Balance
                    </Button>
                    <Button variant="default" className="w-full bg-primary text-white" onClick={handleExportPDF}>
                        <Download className="h-4 w-4 mr-2"/> Generar PDF Oficial
                    </Button>
                </div>
            </CardFooter>
            </>
            }
        </div>
    );
}

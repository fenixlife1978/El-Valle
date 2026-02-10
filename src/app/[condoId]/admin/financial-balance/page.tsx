
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Download, Save, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

// Types
type FinancialItem = {
    dia: string;
    concepto: string;
    monto: number;
    categoria: string;
};

type Payment = { paymentDate: Timestamp; totalAmount: number; beneficiaries: { ownerName: string }[]; };
type Expense = { date: Timestamp; amount: number; description: string; category: string; };

const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const yearOptions = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

const formatCurrency = (amount: number): string => {
    if (typeof amount !== 'number' || isNaN(amount)) return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function FinancialBalancePage({ params }: { params: { condoId: string }}) {
    const { companyInfo } = useAuth();
    const { toast } = useToast();
    const workingCondoId = params.condoId;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [ingresos, setIngresos] = useState<FinancialItem[]>([]);
    const [egresos, setEgresos] = useState<FinancialItem[]>([]);
    const [notas, setNotas] = useState("");

    useEffect(() => {
        if (!workingCondoId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const year = parseInt(selectedYear);
                const month = parseInt(selectedMonth) - 1;
                const fromDate = new Date(year, month, 1);
                const toDate = new Date(year, month + 1, 0, 23, 59, 59);

                const paymentsQuery = query(
                    collection(db, 'condominios', workingCondoId, 'payments'),
                    where('paymentDate', '>=', fromDate),
                    where('paymentDate', '<=', toDate),
                    where('status', '==', 'aprobado')
                );
                const paymentsSnap = await getDocs(paymentsQuery);
                const incomeData: FinancialItem[] = paymentsSnap.docs.map(doc => {
                    const data = doc.data() as Payment;
                    return {
                        dia: format(data.paymentDate.toDate(), 'dd'),
                        concepto: `PAGO DE ${data.beneficiaries.map(b => b.ownerName).join(', ')}`,
                        monto: data.totalAmount,
                        categoria: 'cuotas_ordinarias'
                    };
                });
                setIngresos(incomeData);

                const expensesQuery = query(
                    collection(db, 'condominios', workingCondoId, 'gastos'),
                    where('date', '>=', fromDate),
                    where('date', '<=', toDate)
                );
                const expensesSnap = await getDocs(expensesQuery);
                const expenseData: FinancialItem[] = expensesSnap.docs.map(doc => {
                    const data = doc.data() as Expense;
                    return {
                        dia: format(data.date.toDate(), 'dd'),
                        concepto: data.description,
                        monto: data.amount,
                        categoria: data.category
                    };
                });
                setEgresos(expenseData);

            } catch (error) {
                console.error("Error fetching financial data:", error);
                toast({ variant: 'destructive', title: 'Error al cargar datos' });
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedMonth, selectedYear, workingCondoId, toast]);

    const totalIngresos = useMemo(() => ingresos.reduce((sum, item) => sum + item.monto, 0), [ingresos]);
    const totalEgresos = useMemo(() => egresos.reduce((sum, item) => sum + item.monto, 0), [egresos]);
    const saldoNeto = totalIngresos - totalEgresos;

    const handleSaveAndPublish = async () => {
        if (!workingCondoId) return;
        setSaving(true);
        try {
            const statementId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
            const statementRef = doc(db, 'condominios', workingCondoId, 'financial_statements', statementId);
            
            await setDoc(statementRef, {
                id: statementId,
                ingresos,
                egresos,
                estadoFinanciero: { saldoNeto },
                notas,
                createdAt: serverTimestamp()
            });

            const publicationId = `balance-${statementId}`;
            const publishedRef = doc(db, 'condominios', workingCondoId, 'published_reports', publicationId);
            await setDoc(publishedRef, {
                type: 'balance',
                sourceId: statementId,
                createdAt: serverTimestamp()
            });

            toast({ title: "Publicado", description: "El balance financiero es ahora visible para los propietarios." });
        } catch (error) {
            console.error("Error saving/publishing:", error);
            toast({ variant: 'destructive', title: 'Error al publicar' });
        } finally {
            setSaving(false);
        }
    };

    const handleExportPDF = () => {
        if (!companyInfo) return toast({ variant: 'destructive', title: 'Error', description: 'Información del condominio no cargada.' });
        
        const period = `${monthOptions.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;
        const docPDF = new jsPDF();
        
        const pageWidth = docPDF.internal.pageSize.getWidth();
        const headerHeight = 35;
        const margin = 14;

        docPDF.setFillColor(28, 43, 58);
        docPDF.rect(0, 0, pageWidth, headerHeight, 'F');
        docPDF.setTextColor(255, 255, 255);
        if (companyInfo.logo) {
            try {
                docPDF.addImage(companyInfo.logo, 'PNG', 14, 6.5, 12, 12);
            } catch (e) {
                console.error("PDF Logo Error:", e);
            }
        }
        docPDF.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 35, 12);
        docPDF.setFontSize(8).setFont('helvetica', 'normal').text(`RIF: ${companyInfo.rif}`, 35, 17);
        docPDF.setFontSize(12).setFont('helvetica', 'bold').text('EFAS CondoSys', pageWidth - margin, 15, { align: 'right' });
        docPDF.setFontSize(8).setFont('helvetica', 'normal').text('BALANCE FINANCIERO OFICIAL', pageWidth - margin, 20, { align: 'right' });
        docPDF.setTextColor(0, 0, 0);

        let startY = headerHeight + 30;

        const canvas = document.createElement('canvas');
        const barcodeValue = `BF-${selectedYear}-${selectedMonth}`;
        try {
            JsBarcode(canvas, barcodeValue, { format: "CODE128", height: 30, width: 1.5, displayValue: false, margin: 0 });
            docPDF.addImage(canvas.toDataURL("image/png"), 'PNG', pageWidth - margin - 55, headerHeight + 5, 50, 15);
            docPDF.setFontSize(8).text(barcodeValue, pageWidth - margin - 55, headerHeight + 23);
        } catch (e) {}

        docPDF.setFontSize(16).setFont('helvetica', 'bold').text('ESTADO DE RESULTADOS', pageWidth / 2, startY, { align: 'center' });
        docPDF.setFontSize(12).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, startY + 7, { align: 'center' });

        startY += 25;

        autoTable(docPDF, {
            head: [['DÍA', 'INGRESOS', 'MONTO (Bs.)']],
            body: ingresos.map(i => [i.dia, i.concepto, { content: formatCurrency(i.monto), styles: { halign: 'right' } }]),
            foot: [[{ content: 'TOTAL INGRESOS', colSpan: 2, styles: { halign: 'right' } }, { content: formatCurrency(totalIngresos), styles: { halign: 'right' } }]],
            startY,
            theme: 'striped',
            headStyles: { fillColor: [30, 80, 180], halign: 'center' },
            footStyles: { fillColor: [30, 80, 180], textColor: 255, fontStyle: 'bold' }
        });
        
        startY = (docPDF as any).lastAutoTable.finalY + 10;
        
        autoTable(docPDF, {
            head: [['DÍA', 'EGRESOS', 'MONTO (Bs.)']],
            body: egresos.map(e => [e.dia, e.concepto, { content: formatCurrency(e.monto), styles: { halign: 'right' } }]),
            foot: [[{ content: 'TOTAL EGRESOS', colSpan: 2, styles: { halign: 'right' } }, { content: formatCurrency(totalEgresos), styles: { halign: 'right' } }]],
            startY,
            theme: 'striped',
            headStyles: { fillColor: [220, 53, 69], halign: 'center' },
            footStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold' }
        });
        
        startY = (docPDF as any).lastAutoTable.finalY + 10;
        
        docPDF.setFontSize(11).setFont('helvetica', 'bold');
        docPDF.setFillColor(230, 240, 255).rect(margin, startY - 5, pageWidth - margin * 2, 10, 'F');
        docPDF.setTextColor(30, 80, 180).text('SALDO NETO (Ingresos - Egresos)', margin + 2, startY);
        docPDF.text(formatCurrency(saldoNeto), pageWidth - margin - 2, startY, { align: 'right' });
        
        startY += 20;
        docPDF.setTextColor(0, 0, 0);
        docPDF.setFontSize(10).text('Notas:', margin, startY);
        docPDF.setFontSize(10).setFont('helvetica', 'normal').text(notas, margin, startY + 5, { maxWidth: 180 });

        docPDF.save(`Balance_Financiero_${selectedYear}_${selectedMonth}.pdf`);
    };

    return (
        <div className="space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                    Balance <span className="text-primary">Financiero Mensual</span>
                </h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
                    Genere, guarde y publique el estado de resultados del mes.
                </p>
            </div>

            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Selector de Período</CardTitle>
                        <CardDescription>Filtre los movimientos por mes y año.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </CardHeader>
            </Card>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><TrendingUp className="text-green-500"/> Ingresos</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Día</TableHead>
                                            <TableHead>Concepto</TableHead>
                                            <TableHead className="text-right">Monto</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {ingresos.map((item, idx) => (
                                            <TableRow key={`in-${idx}`}><TableCell>{item.dia}</TableCell><TableCell>{item.concepto}</TableCell><TableCell className="text-right">{formatCurrency(item.monto)}</TableCell></TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow className="font-bold"><TableCell colSpan={2}>Total Ingresos</TableCell><TableCell className="text-right">{formatCurrency(totalIngresos)}</TableCell></TableRow>
                                    </TableFooter>
                                </Table>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><TrendingDown className="text-red-500"/> Egresos</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Día</TableHead>
                                            <TableHead>Concepto</TableHead>
                                            <TableHead className="text-right">Monto</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {egresos.map((item, idx) => (
                                            <TableRow key={`out-${idx}`}><TableCell>{item.dia}</TableCell><TableCell>{item.concepto}</TableCell><TableCell className="text-right">{formatCurrency(item.monto)}</TableCell></TableRow>
                                        ))}
                                    </TableBody>
                                     <TableFooter>
                                        <TableRow className="font-bold"><TableCell colSpan={2}>Total Egresos</TableCell><TableCell className="text-right">{formatCurrency(totalEgresos)}</TableCell></TableRow>
                                    </TableFooter>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>

                     <div className="space-y-6 lg:sticky lg:top-24">
                        <Card>
                            <CardHeader><CardTitle>Resumen del Mes</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between items-center text-lg"><span className="text-muted-foreground">Total Ingresos:</span> <span className="font-bold text-green-600">Bs. {formatCurrency(totalIngresos)}</span></div>
                                <div className="flex justify-between items-center text-lg"><span className="text-muted-foreground">Total Egresos:</span> <span className="font-bold text-red-600">Bs. {formatCurrency(totalEgresos)}</span></div>
                                <div className="flex justify-between items-center text-xl font-bold border-t pt-4 mt-4"><span className="text-foreground">SALDO NETO:</span> <span className="text-primary">Bs. {formatCurrency(saldoNeto)}</span></div>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle>Notas Adicionales</CardTitle></CardHeader>
                            <CardContent>
                                <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Añada observaciones, aclaratorias o información relevante para este período..." className="min-h-[120px]" />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Acciones</CardTitle></CardHeader>
                            <CardFooter className="flex-col gap-2">
                                <Button onClick={handleExportPDF} variant="outline" className="w-full">
                                    <Download className="mr-2 h-4 w-4"/> Exportar a PDF
                                </Button>
                                <Button onClick={handleSaveAndPublish} disabled={saving} className="w-full">
                                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                    Guardar y Publicar
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}


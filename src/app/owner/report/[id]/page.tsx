

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Loader2, FileText, Download, ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { Label } from '@/components/ui/label';


type FinancialItem = {
    id: string;
    concepto: string;
    monto: number;
};

type FinancialStatement = {
    id: string; // YYYY-MM
    ingresos: FinancialItem[];
    egresos: FinancialItem[];
    estadoFinanciero: { saldoNeto: number };
    notas: string;
    createdAt: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));

export default function ReportViewerPage() {
    const { toast } = useToast();
    const params = useParams();
    const router = useRouter();
    const reportId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<FinancialStatement | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    useEffect(() => {
        if (!reportId) return;

        const fetchReport = async () => {
            setLoading(true);
            try {
                // Determine the correct collection and document ID from the passed ID
                const docRef = doc(db, "financial_statements", reportId.replace('balance-', ''));
                const reportSnap = await getDoc(docRef);

                if (reportSnap.exists()) {
                    setReportData({ id: reportSnap.id, ...reportSnap.data() } as FinancialStatement);
                } else {
                    toast({ variant: 'destructive', title: 'Error', description: 'No se encontró el reporte solicitado.' });
                }

                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    setCompanyInfo(settingsSnap.data().companyInfo as CompanyInfo);
                }

            } catch (error) {
                console.error("Error fetching report:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar el reporte.' });
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [reportId, toast]);

    const handleGeneratePdf = async () => {
        if (!reportData || !companyInfo) return;
        const statement = reportData;

        const qrCodeUrl = await QRCode.toDataURL(`${window.location.href}`, { errorCorrectionLevel: 'M', margin: 2, scale: 4 });
        
        const totalIngresos = statement.ingresos.reduce((sum, item) => sum + item.monto, 0);
        const totalEgresos = statement.egresos.reduce((sum, item) => sum + item.monto, 0);
        const saldoNeto = totalIngresos - totalEgresos;


        const monthLabel = months.find(m => m.value === statement.id.split('-')[1])?.label;
        const yearLabel = statement.id.split('-')[0];
        const period = `${monthLabel} ${yearLabel}`;

        const doc = new jsPDF();
        autoTable(doc); // Apply autoTable plugin
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        
        if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo?.name || '', margin + 30, margin + 8);
        doc.setFontSize(9).setFont('helvetica', 'normal');
        doc.text(companyInfo?.rif || '', margin + 30, margin + 14);
        doc.text(companyInfo?.address || '', margin + 30, margin + 19);
        doc.text(`Teléfono: ${companyInfo?.phone || ''}`, margin + 30, margin + 24);

        doc.text(`Emitido: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
        if (qrCodeUrl) {
            const qrSize = 25;
            doc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - qrSize, margin + 12, qrSize, qrSize);
        }
        
        doc.setFontSize(16).setFont('helvetica', 'bold').text('Balance Financiero', pageWidth / 2, margin + 45, { align: 'center'});
        doc.setFontSize(12).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, margin + 52, { align: 'center'});
        
        let startY = margin + 70;
        
        // Ingresos
        (doc as any).autoTable({
            head: [['INGRESOS', 'MONTO (Bs.)']],
            body: statement.ingresos.map(i => [i.concepto, { content: formatToTwoDecimals(i.monto), styles: { halign: 'right' } }]),
            foot: [[{ content: 'TOTAL INGRESOS', styles: { halign: 'right' } }, { content: formatToTwoDecimals(totalIngresos), styles: { halign: 'right' } }]],
            startY: startY, theme: 'striped', headStyles: { fillColor: [22, 163, 74], halign: 'center' }, footStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
        });
        startY = (doc as any).lastAutoTable.finalY + 10;
        
        // Egresos
        (doc as any).autoTable({
            head: [['EGRESOS', 'MONTO (Bs.)']],
            body: statement.egresos.map(e => [e.concepto, { content: formatToTwoDecimals(e.monto), styles: { halign: 'right' } }]),
            foot: [[{ content: 'TOTAL EGRESOS', styles: { halign: 'right' } }, { content: formatToTwoDecimals(totalEgresos), styles: { halign: 'right' } }]],
            startY: startY, theme: 'striped', headStyles: { fillColor: [220, 53, 69], halign: 'center' }, footStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold' },
        });
        startY = (doc as any).lastAutoTable.finalY + 10;

        doc.setFontSize(11).setFont('helvetica', 'bold');
        const totalEfectivoY = startY + 10;
        doc.setFillColor(232, 255, 236);
        doc.rect(margin, totalEfectivoY - 5, pageWidth - margin * 2, 10, 'F');
        doc.setTextColor(34, 139, 34);
        doc.text('SALDO NETO O SALDO FINAL DEL MES EN BANCO (Ingresos - Egresos)', margin + 2, totalEfectivoY);
        doc.text(formatToTwoDecimals(saldoNeto), pageWidth - margin - 2, totalEfectivoY, { align: 'right' });
        startY = totalEfectivoY + 10;
        doc.setTextColor(0, 0, 0);

        startY += 10;
        doc.setFontSize(10).text('Notas:', margin, startY);
        doc.setFontSize(10).setFont('helvetica', 'normal').text(statement.notas, margin, startY + 5, { maxWidth: 180 });

        doc.save(`Balance_Financiero_${statement.id}.pdf`);
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    if (!reportData) {
         return (
            <div className="text-center p-8">
                <p>Reporte no encontrado.</p>
                <Button variant="outline" onClick={() => router.back()} className="mt-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Atrás
                </Button>
            </div>
         );
    }

    const { ingresos, egresos, notas } = reportData;
    const totalIngresos = ingresos.reduce((sum, item) => sum + Number(item.monto), 0);
    const totalEgresos = egresos.reduce((sum, item) => sum + Number(item.monto), 0);
    const saldoNeto = totalIngresos - totalEgresos;
    const monthLabel = months.find(m => m.value === reportData.id.split('-')[1])?.label;
    const yearLabel = reportData.id.split('-')[0];
    const period = `${monthLabel} ${yearLabel}`;
    

    return (
        <div className="space-y-8">
            
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Balance Financiero: {period}</h1>
                    <p className="text-muted-foreground">Publicado el {format(new Date(reportData.createdAt), 'dd MMMM, yyyy', { locale: es })}</p>
                </div>
                <Button onClick={handleGeneratePdf}>
                    <Download className="mr-2 h-4 w-4"/>
                    Descargar PDF
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <CardHeader><CardTitle className="text-green-500">Ingresos</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ingresos.map((item, index) => (
                                    <TableRow key={`ingreso-${index}`}>
                                        <TableCell>{item.concepto}</TableCell>
                                        <TableCell className="text-right">{formatToTwoDecimals(item.monto)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell className="font-bold">Total Ingresos</TableCell>
                                    <TableCell className="text-right font-bold">{formatToTwoDecimals(totalIngresos)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-destructive">Egresos</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {egresos.map((item, index) => (
                                    <TableRow key={`egreso-${index}`}>
                                        <TableCell>{item.concepto}</TableCell>
                                        <TableCell className="text-right">{formatToTwoDecimals(item.monto)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell className="font-bold">Total Egresos</TableCell>
                                    <TableCell className="text-right font-bold">{formatToTwoDecimals(totalEgresos)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader><CardTitle>Resumen del Período</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-primary/10 rounded-md">
                        <Label htmlFor="saldoNeto" className="text-base font-bold">SALDO NETO</Label>
                        <p id="saldoNeto" className={`text-2xl font-bold text-center ${saldoNeto >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {formatToTwoDecimals(saldoNeto)}
                        </p>
                    </div>
                     <div className="space-y-2">
                        <Label>Notas Adicionales</Label>
                        <p className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/50 whitespace-pre-wrap">{notas || 'No hay notas para este período.'}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

    

    

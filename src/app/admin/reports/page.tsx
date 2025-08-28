
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search, Loader2, BarChart2 } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { collection, getDocs, query, where, doc, getDoc, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';


type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
    email?: string;
    balance: number;
    delinquency: number; 
    status: 'solvente' | 'moroso';
    street?: string;
    house?: string;
};

type Payment = {
  id: string;
  reportedBy: string;
  paymentDate: Timestamp;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  beneficiaries: { ownerId: string, house?: string, amount: number }[];
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
};

type ChartData = {
    name: string;
    total: number;
}

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type ReportPreviewData = {
    title: string;
    headers: string[];
    rows: (string|number)[][];
    footers?: string[];
    filename: string;
    isDetailedStatement?: boolean;
    detailedData?: {
        payments: { headers: string[], rows: (string|number)[][], total: number };
        debts: { headers: string[], rows: (string|number)[][], total: number };
        ownerInfo: string;
        dateRange: string;
    }
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};


export default function ReportsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [owners, setOwners] = useState<Owner[]>([]);

    // --- Form State ---
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();
    const [selectedOwner, setSelectedOwner] = useState('');
    const [delinquencyPeriod, setDelinquencyPeriod] = useState('');

    // --- Chart State ---
    const [incomeChartData, setIncomeChartData] = useState<ChartData[]>([]);
    const [debtChartData, setDebtChartData] = useState<ChartData[]>([]);
    const incomeChartRef = useRef<HTMLDivElement>(null);
    const debtChartRef = useRef<HTMLDivElement>(null);
    
    // --- System State ---
    const [activeRate, setActiveRate] = useState(0);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    // --- Preview State ---
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<ReportPreviewData | null>(null);


    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Owners
                const ownersQuery = query(collection(db, 'owners'));
                const ownersSnapshot = await getDocs(ownersQuery);
                let ownersData = ownersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), delinquency: 0, status: 'solvente' })) as Owner[];
                
                // Fetch ALL pending debts to calculate delinquency in real-time
                const allPendingDebtsQuery = query(collection(db, 'debts'), where('status', '==', 'pending'));
                const allPendingDebtsSnapshot = await getDocs(allPendingDebtsQuery);
                const debtCountsByOwner: {[key: string]: number} = {};
                allPendingDebtsSnapshot.forEach(doc => {
                    const debt = doc.data();
                    debtCountsByOwner[debt.ownerId] = (debtCountsByOwner[debt.ownerId] || 0) + 1;
                });

                // Update owners with real-time delinquency and status
                ownersData = ownersData.map(owner => {
                    const delinquency = debtCountsByOwner[owner.id] || 0;
                    return {
                        ...owner,
                        delinquency,
                        status: delinquency > 0 ? 'moroso' : 'solvente'
                    };
                });
                
                setOwners(ownersData.sort((a,b) => a.name.localeCompare(b.name)));

                // Fetch Settings for Rate and Company Info
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    setCompanyInfo(settings.companyInfo);
                    const rate = (settings.exchangeRates || []).find((r: any) => r.active)?.rate || 36.5;
                    setActiveRate(rate);
                }

                // Fetch Payments for Income Chart
                const incomeQuery = query(collection(db, 'payments'), where('status', '==', 'aprobado'));
                const incomeSnapshot = await getDocs(incomeQuery);
                const incomeByMonth: {[key: string]: number} = {};
                incomeSnapshot.forEach(doc => {
                    const payment = doc.data();
                    const month = format(new Date(payment.paymentDate.seconds * 1000), 'yyyy-MM');
                    incomeByMonth[month] = (incomeByMonth[month] || 0) + payment.totalAmount;
                });
                setIncomeChartData(Object.entries(incomeByMonth).map(([name, total]) => ({name, total})).sort((a,b) => a.name.localeCompare(b.name)));

                // Fetch Debts for Debt Chart (using the already fetched pending debts)
                const debtsByStreet: {[key: string]: number} = {};
                for(const debtDoc of allPendingDebtsSnapshot.docs) {
                    const debt = debtDoc.data();
                    const owner = ownersData.find(o => o.id === debt.ownerId);
                    if(owner) {
                        const ownerStreet = (owner.properties && owner.properties.length > 0) ? owner.properties[0].street : owner.street;
                        if (ownerStreet) {
                            debtsByStreet[ownerStreet] = (debtsByStreet[ownerStreet] || 0) + (debt.amountUSD * activeRate);
                        }
                    }
                }
                setDebtChartData(Object.entries(debtsByStreet).map(([name, total]) => ({name, total})).sort((a,b) => a.name.localeCompare(b.name)));

            } catch (error) {
                console.error("Error fetching report data:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos para los reportes.' });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [toast, activeRate]);

    const generatePdf = (data: ReportPreviewData) => {
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
    
        if (companyInfo?.logo) {
            doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        }
        if (companyInfo) {
            doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
            doc.text(companyInfo.address, margin + 30, margin + 19);
        }
        doc.setFontSize(10);
        doc.text(`Fecha de Emisión:`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setFont('helvetica', 'bold').text(new Date().toLocaleString('es-VE'), pageWidth - margin, margin + 13, { align: 'right' });
    
        doc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);
    
        doc.setFontSize(16).setFont('helvetica', 'bold').text(data.title, pageWidth / 2, margin + 45, { align: 'center' });
    
        let startY = margin + 55;
    
        if (data.isDetailedStatement && data.detailedData) {
            const { ownerInfo, dateRange, payments, debts } = data.detailedData;
            doc.setFontSize(10).setFont('helvetica', 'normal');
            doc.text(ownerInfo, margin, startY);
            doc.text(dateRange, margin, startY + 5);
            startY += 15;
    
            // Payments Table
            doc.setFontSize(12).setFont('helvetica', 'bold').text("Resumen de Pagos", margin, startY);
            startY += 5;
            autoTable(doc, {
                head: [payments.headers],
                body: payments.rows,
                startY,
                headStyles: { fillColor: [40, 167, 69] },
                didDrawPage: (hookData) => { startY = hookData.cursor?.y || startY; }
            });
            startY = (doc as any).lastAutoTable.finalY + 5;
            const balanceBs = data.detailedData ? (owners.find(o => o.id === selectedOwner)?.balance || 0) : 0;
            const balanceText = balanceBs > 0 ? `(Saldo a Favor aplicado: Bs. ${balanceBs.toLocaleString('es-VE', {minimumFractionDigits: 2})})` : '';
            doc.setFontSize(10).setFont('helvetica', 'bold').text(`Total Pagado: Bs. ${payments.total.toLocaleString('es-VE', {minimumFractionDigits: 2})} ${balanceText}`, pageWidth - margin, startY, { align: 'right' });
            startY += 10;
    
            // Debts Table
            doc.setFontSize(12).setFont('helvetica', 'bold').text("Resumen de Deudas", margin, startY);
            startY += 5;
            autoTable(doc, {
                head: [debts.headers],
                body: debts.rows,
                startY,
                headStyles: { fillColor: [220, 53, 69] },
                didDrawPage: (hookData) => { startY = hookData.cursor?.y || startY; }
            });
            startY = (doc as any).lastAutoTable.finalY + 5;
            doc.setFontSize(10).setFont('helvetica', 'bold').text(`Total Adeudado: $${debts.total.toLocaleString('en-US', {minimumFractionDigits: 2})}`, pageWidth - margin, startY, { align: 'right' });
            startY += 10;
    
        } else {
            autoTable(doc, { head: [data.headers], body: data.rows, startY });
            if (data.footers) {
                const finalY = (doc as any).lastAutoTable.finalY;
                doc.setFontSize(12).setFont('helvetica', 'bold').text(data.footers.join(' | '), margin, finalY + 15);
            }
        }
    
        doc.save(`${data.filename}.pdf`);
    };

    const handleExportPreview = () => {
        if (!previewData) return;
        generatePdf(previewData);
        setIsPreviewOpen(false);
        setPreviewData(null);
    }
    
    const generateChartPdf = async (chartRef: React.RefObject<HTMLDivElement>, title: string, filename: string) => {
        if (!chartRef.current) return;
        const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF('landscape');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) {
            pdf.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        }
        if (companyInfo) {
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text(companyInfo.name, margin + 30, margin + 8);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
            pdf.text(companyInfo.address, margin + 30, margin + 19);
        }
        pdf.setFontSize(10);
        pdf.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
        
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, pageWidth / 2, margin + 40, { align: 'center' });
        
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pageWidth - (margin * 2);
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', margin, margin + 50, pdfWidth, pdfHeight);

        pdf.save(`${filename}.pdf`);
    };

    const generateIndividualStatement = async () => {
        if (!selectedOwner) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un propietario.' });
            return;
        }

        const owner = owners.find(o => o.id === selectedOwner);
        if (!owner) return;
        
        const validProperties = (owner.properties || []).filter(p => p.street && p.house);
        if (validProperties.length === 0) {
            toast({ variant: 'destructive', title: 'Error de Datos', description: 'El propietario seleccionado no tiene propiedades completas registradas.' });
            return;
        }

        setGeneratingReport(true);
        try {
            // Fetch Payments
             const paymentsQuery = query(
                collection(db, "payments"),
                where("status", "==", "aprobado"),
                where("beneficiaries", "array-contains-any", validProperties.map(p => ({ ownerId: owner.id, house: p.house })))
            );

            const paymentsSnapshot = await getDocs(paymentsQuery);
            let totalPaid = 0;
            const allPayments = paymentsSnapshot.docs.map(doc => doc.data() as Payment);

            const paymentsRows = allPayments
                .sort((a, b) => a.paymentDate.toMillis() - b.paymentDate.toMillis())
                .map(p => {
                    totalPaid += p.totalAmount;
                    const paidByOwner = owners.find(o => o.id === p.reportedBy);
                    return [
                        format(p.paymentDate.toDate(), "dd/MM/yyyy"),
                        "Pago de Condominio",
                        paidByOwner?.name || 'N/A',
                        `Bs. ${p.totalAmount.toLocaleString('es-VE', {minimumFractionDigits: 2})}`
                    ];
                });

            // Fetch Debts
            const debtsQuery = query(
                collection(db, "debts"),
                where("ownerId", "==", owner.id)
            );
            const debtSnapshot = await getDocs(debtsQuery);
            let totalDebt = 0;
            const allDebts = debtSnapshot.docs.map(doc => doc.data() as Debt);
            
            const debtsRows = allDebts
                .sort((a, b) => a.year - b.year || a.month - b.month)
                .map(d => {
                    totalDebt += d.amountUSD;
                    return [
                        `${monthsLocale[d.month]} ${d.year}`,
                        `$${d.amountUSD.toFixed(2)}`,
                        d.status === 'paid' ? 'Pagada' : 'Pendiente'
                    ];
                });

            let dateRange = "Sin transacciones";
            if (allDebts.length > 0) {
                const firstDebt = allDebts[0];
                const lastDebt = allDebts[allDebts.length - 1];
                dateRange = `Período: ${monthsLocale[firstDebt.month]} ${firstDebt.year} - ${monthsLocale[lastDebt.month]} ${lastDebt.year}`;
            }

            const ownerProps = (owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', ');

            setPreviewData({
                title: `Estado de Cuenta Detallado`,
                filename: `estado_cuenta_detallado_${owner.name.replace(/\s/g, '_')}`,
                isDetailedStatement: true,
                headers: [], // Not used for detailed view
                rows: [], // Not used for detailed view
                detailedData: {
                    ownerInfo: `Propietario: ${owner.name} | Propiedad: ${ownerProps}`,
                    dateRange: dateRange,
                    payments: {
                        headers: ["Fecha", "Concepto", "Pagado por", "Monto"],
                        rows: paymentsRows,
                        total: totalPaid
                    },
                    debts: {
                        headers: ["Período", "Monto ($)", "Estado"],
                        rows: debtsRows,
                        total: totalDebt
                    }
                }
            });
            setIsPreviewOpen(true);

        } catch (error) {
            console.error("Error generating individual statement:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el estado de cuenta.' });
        } finally {
            setGeneratingReport(false);
        }
    };

    const showDelinquencyReportPreview = () => {
        if (!delinquencyPeriod) return toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un período de morosidad.' });
        const months = parseInt(delinquencyPeriod);
        const delinquentOwners = owners.filter(o => o.delinquency >= months);
        
        setPreviewData({
            title: `Reporte de Morosidad (${months} o más meses)`,
            headers: ['Propietario', 'Propiedades', 'Meses de Deuda', 'Saldo Deudor (Bs.)'],
            rows: delinquentOwners.map(o => {
                const properties = (o.properties || []).map(p => `${p.street} - ${p.house}`).join(', ');
                const debtBs = o.balance < 0 ? Math.abs(o.balance * activeRate) : 0;
                return [o.name, properties, o.delinquency, debtBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })];
            }),
            filename: `reporte_morosidad`
        });
        setIsPreviewOpen(true);
    }
    
    const showSolvencyReportPreview = () => {
        const solventOwners = owners.filter(o => o.status === 'solvente');
        setPreviewData({
            title: 'Reporte de Solvencia',
            headers: ['Propietario', 'Propiedades', 'Email'],
            rows: solventOwners.map(o => [o.name, (o.properties || []).map(p => `${p.street} - ${p.house}`).join(', '), o.email || '-']),
            filename: 'reporte_solvencia'
        });
        setIsPreviewOpen(true);
    };

    const showBalanceFavorReportPreview = () => {
        const ownersWithBalance = owners.filter(o => o.balance > 0);
        setPreviewData({
            title: 'Reporte de Saldos a Favor',
            headers: ['Propietario', 'Propiedades', 'Saldo a Favor (Bs.)'],
            rows: ownersWithBalance.map(o => [o.name, (o.properties || []).map(p => `${p.street} - ${p.house}`).join(', '), (o.balance * activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })]),
            filename: 'reporte_saldos_favor'
        });
        setIsPreviewOpen(true);
    };
    
    const showIncomeReportPreview = async () => {
        if (!startDate || !endDate) return toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un rango de fechas.' });
        setGeneratingReport(true);
        const q = query(
            collection(db, 'payments'),
            where('paymentDate', '>=', startDate),
            where('paymentDate', '<=', endDate),
            where('status', '==', 'aprobado')
        );
        
        const incomeSnapshot = await getDocs(q);
        const incomePayments = incomeSnapshot.docs.map(doc => doc.data());
        const totalIncome = incomePayments.reduce((sum, p) => sum + p.totalAmount, 0);

        setPreviewData({
            title: `Reporte de Ingresos (${format(startDate, "dd/MM/yy")} - ${format(endDate, "dd/MM/yy")})`,
            headers: ['Fecha', 'Monto (Bs.)', 'Método de Pago'],
            rows: incomePayments.map(p => [new Date(p.paymentDate.seconds * 1000).toLocaleDateString('es-VE'), p.totalAmount.toFixed(2), p.paymentMethod]),
            footers: [`Total de Ingresos: Bs. ${totalIncome.toFixed(2)}`],
            filename: 'reporte_ingresos',
        });
        setGeneratingReport(false);
        setIsPreviewOpen(true);
    };

    const showGeneralStatusReportPreview = () => {
         setPreviewData({
            title: 'Reporte General de Estatus',
            headers: ['Propietario', 'Propiedades', 'Estatus', 'Saldo (Bs.)'],
            rows: owners.map(o => {
                const properties = (o.properties && o.properties.length > 0)
                    ? o.properties.map(p => `${p.street} - ${p.house}`).join(', ')
                    : (o.house ? `${o.street} - ${o.house}` : 'N/A');
                const balanceBs = o.balance * activeRate;
                return [o.name, properties, o.status === 'solvente' ? 'Solvente' : 'Moroso', balanceBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })]
            }),
            filename: 'reporte_general_estatus'
        });
        setIsPreviewOpen(true);
    };


    if (loading && !isPreviewOpen) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Consultas y Reportes</h1>
                <p className="text-muted-foreground">Genere y exporte reportes detallados sobre la gestión del condominio.</p>
            </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5"/> Gráfico de Ingresos por Mes</CardTitle>
                        <CardDescription>Visualización de los ingresos aprobados mensualmente.</CardDescription>
                    </CardHeader>
                    <CardContent ref={incomeChartRef} className="pl-2">
                        {incomeChartData.length > 0 ? (
                            <ChartContainer config={{
                                total: { label: "Ingresos (Bs.)", color: "hsl(var(--primary))" }
                            }} className="h-[250px] w-full">
                                <BarChart accessibilityLayer data={incomeChartData}>
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} angle={-45} textAnchor="end" height={60} />
                                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                                </BarChart>
                            </ChartContainer>
                        ) : <p className="text-center text-muted-foreground h-[250px] flex items-center justify-center">No hay datos de ingresos para mostrar.</p>}
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={() => generateChartPdf(incomeChartRef, 'Gráfico de Ingresos por Mes', 'grafico_ingresos')}>
                           <Download className="mr-2 h-4 w-4" /> Exportar Gráfico
                        </Button>
                    </CardFooter>
                </Card>
                 <Card className="lg-col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5"/> Gráfico de Deuda por Calle</CardTitle>
                        <CardDescription>Visualización de la deuda pendiente agrupada por calle.</CardDescription>
                    </CardHeader>
                    <CardContent ref={debtChartRef} className="pl-2">
                         {debtChartData.length > 0 ? (
                             <ChartContainer config={{
                                total: { label: "Deuda (Bs.)", color: "hsl(var(--destructive))" }
                            }} className="h-[250px] w-full">
                                <BarChart accessibilityLayer data={debtChartData}>
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                                </BarChart>
                            </ChartContainer>
                         ) : <p className="text-center text-muted-foreground h-[250px] flex items-center justify-center">No hay datos de deudas para mostrar.</p>}
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" variant="destructive" onClick={() => generateChartPdf(debtChartRef, 'Gráfico de Deuda por Calle', 'grafico_deudas')}>
                           <Download className="mr-2 h-4 w-4" /> Exportar Gráfico
                        </Button>
                    </CardFooter>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Reporte: Estado de Cuenta Individual */}
                <Card className="md:col-span-2 lg:col-span-3">
                    <CardHeader>
                        <CardTitle>Estado de Cuenta Individual Detallado</CardTitle>
                        <CardDescription>Consulte el historial completo de movimientos (pagos y deudas) de un propietario.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="owner-select">Propietario</Label>
                            <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                                <SelectTrigger id="owner-select">
                                    <SelectValue placeholder="Seleccione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateIndividualStatement} disabled={!selectedOwner || generatingReport}>
                            {generatingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4" />} 
                            Generar Vista Previa
                        </Button>
                    </CardFooter>
                </Card>

                {/* Reporte: Morosidad por Periodo */}
                <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Morosidad</CardTitle>
                        <CardDescription>Liste los propietarios con pagos pendientes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                       <div className="space-y-2">
                            <Label htmlFor="delinquency-period">Período de Morosidad</Label>
                            <Select value={delinquencyPeriod} onValueChange={setDelinquencyPeriod}>
                                <SelectTrigger id="delinquency-period">
                                    <SelectValue placeholder="Seleccione período..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 o más meses</SelectItem>
                                    <SelectItem value="2">2 o más meses</SelectItem>
                                    <SelectItem value="3">3 o más meses</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full" onClick={showDelinquencyReportPreview} disabled={!delinquencyPeriod}>
                            <Search className="mr-2 h-4 w-4" /> Generar Vista Previa
                        </Button>
                    </CardFooter>
                </Card>

                {/* Reporte: Solvencia */}
                <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Solvencia</CardTitle>
                        <CardDescription>Genere una lista de todos los propietarios al día con sus pagos.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-20">
                         <p className="text-sm text-muted-foreground">Haga clic para generar.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={showSolvencyReportPreview}>
                           <Search className="mr-2 h-4 w-4" /> Generar Vista Previa
                        </Button>
                    </CardFooter>
                </Card>

                {/* Reporte: Saldos a Favor */}
                 <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Saldos a Favor</CardTitle>
                        <CardDescription>Liste todos los propietarios con saldo a favor y sus montos.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-20">
                         <p className="text-sm text-muted-foreground">Haga clic para generar.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={showBalanceFavorReportPreview}>
                           <Search className="mr-2 h-4 w-4" /> Generar Vista Previa
                        </Button>
                    </CardFooter>
                </Card>

                {/* Reporte: Ingresos por Período */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Reporte de Ingresos</CardTitle>
                        <CardDescription>Calcule los ingresos totales dentro de un rango de fechas específico.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start-date">Fecha de Inicio</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                    id="start-date"
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !startDate && "text-muted-foreground"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startDate ? format(startDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={startDate}
                                        onSelect={setStartDate}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="end-date">Fecha de Fin</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                    id="end-date"
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !endDate && "text-muted-foreground"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {endDate ? format(endDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={endDate}
                                        onSelect={setEndDate}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full" onClick={showIncomeReportPreview} disabled={!startDate || !endDate || generatingReport}>
                            {generatingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4" />}
                            Generar Vista Previa
                        </Button>
                    </CardFooter>
                </Card>

                 {/* Reporte: General de Estatus */}
                 <Card>
                    <CardHeader>
                        <CardTitle>Reporte General de Estatus</CardTitle>
                        <CardDescription>Una vista completa del estatus de pago de todas las unidades.</CardDescription>
                    </CardHeader>
                     <CardContent className="flex items-center justify-center h-20">
                         <p className="text-sm text-muted-foreground">Haga clic para generar.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={showGeneralStatusReportPreview}>
                           <Search className="mr-2 h-4 w-4" /> Generar Vista Previa
                        </Button>
                    </CardFooter>
                </Card>

            </div>

             {/* Preview Dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{previewData?.title}</DialogTitle>
                        <DialogDescription>
                            Revise la información a continuación. Si todo es correcto, puede exportar el reporte a PDF.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto">
                        {previewData?.isDetailedStatement && previewData.detailedData ? (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="font-semibold">{previewData.detailedData.ownerInfo}</h3>
                                    <p className="text-sm text-muted-foreground">{previewData.detailedData.dateRange}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold mb-2">Resumen de Pagos</h4>
                                    <Table>
                                        <TableHeader><TableRow>{previewData.detailedData.payments.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
                                        <TableBody>{previewData.detailedData.payments.rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}</TableBody>
                                    </Table>
                                    <p className="text-right font-bold mt-2">Total Pagado: Bs. {previewData.detailedData.payments.total.toLocaleString('es-VE', {minimumFractionDigits: 2})}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold mb-2">Resumen de Deudas</h4>
                                    <Table>
                                        <TableHeader><TableRow>{previewData.detailedData.debts.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
                                        <TableBody>{previewData.detailedData.debts.rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}</TableBody>
                                    </Table>
                                    <p className="text-right font-bold mt-2">Total Adeudado: ${previewData.detailedData.debts.total.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                                </div>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {previewData?.headers.map((header, index) => (
                                            <TableHead key={index}>{header}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewData?.rows.map((row, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {row.map((cell, cellIndex) => (
                                                <TableCell key={cellIndex}>{cell}</TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                     {previewData?.footers && (
                        <div className="mt-4 pt-4 border-t font-semibold text-right">
                           {previewData.footers.map((footer, index) => (
                               <p key={index}>{footer}</p>
                           ))}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Cerrar</Button>
                        <Button onClick={handleExportPreview}>
                             <Download className="mr-2 h-4 w-4" /> Exportar a PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}

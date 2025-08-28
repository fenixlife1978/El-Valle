
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search, Loader2, BarChart2 } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { collection, getDocs, query, where, doc, getDoc, orderBy } from 'firebase/firestore';
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
  paymentDate: { seconds: number };
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

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};


export default function ReportsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [owners, setOwners] = useState<Owner[]>([]);

    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();
    const [selectedOwner, setSelectedOwner] = useState('');
    const [delinquencyPeriod, setDelinquencyPeriod] = useState('');

    const [incomeChartData, setIncomeChartData] = useState<ChartData[]>([]);
    const [debtChartData, setDebtChartData] = useState<ChartData[]>([]);
    const incomeChartRef = useRef<HTMLDivElement>(null);
    const debtChartRef = useRef<HTMLDivElement>(null);
    const [activeRate, setActiveRate] = useState(0);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Owners
                const ownersQuery = query(collection(db, 'owners'));
                const ownersSnapshot = await getDocs(ownersQuery);
                const ownersData = ownersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Owner[];
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

                // Fetch Debts for Debt Chart
                const debtsQuery = query(collection(db, 'debts'), where('status', '==', 'pending'));
                const debtsSnapshot = await getDocs(debtsQuery);
                const debtsByStreet: {[key: string]: number} = {};

                for(const debtDoc of debtsSnapshot.docs) {
                    const debt = debtDoc.data();
                    const owner = ownersData.find(o => o.id === debt.ownerId);
                    if(owner) {
                        const ownerStreet = owner.properties && owner.properties.length > 0 ? owner.properties[0].street : owner.street;
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
    }, [toast]);


    const generatePdf = (title: string, head: any[], body: any[], filename: string, options: { footerText?: string } = {}) => {
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        // --- PDF Header ---
        if (companyInfo?.logo) {
            doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        }
        if (companyInfo) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(companyInfo.name, margin + 30, margin + 8);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
            doc.text(companyInfo.address, margin + 30, margin + 19);
            doc.text(companyInfo.email, margin + 30, margin + 24);
        }
        doc.setFontSize(10);
        doc.text(`Fecha de Emisión:`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(new Date().toLocaleDateString('es-VE'), pageWidth - margin, margin + 13, { align: 'right' });
        doc.setLineWidth(0.5);
        doc.line(margin, margin + 32, pageWidth - margin, margin + 32);

        // --- PDF Title ---
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(title, pageWidth / 2, margin + 45, { align: 'center' });

        // --- PDF Body ---
        autoTable(doc, {
            head,
            body,
            startY: margin + 55,
            headStyles: { fillColor: [30, 80, 180] },
        });

        if (options.footerText) {
            const finalY = (doc as any).lastAutoTable.finalY;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(options.footerText, margin, finalY + 15);
        }

        doc.save(`${filename}.pdf`);
    }

    const generateChartPdf = async (chartRef: React.RefObject<HTMLDivElement>, title: string, filename: string) => {
        if (!chartRef.current) return;
        const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF('landscape');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 14;

        // --- PDF Header ---
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
        
        // --- PDF Title ---
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, pageWidth / 2, margin + 40, { align: 'center' });
        
        // --- PDF Chart Image ---
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

        setLoading(true);
        try {
            // Fetch all related data
            const paymentsQuery = query(
                collection(db, "payments"),
                where("beneficiaries", "array-contains-any", owner.properties.map(p => ({ ownerId: owner.id, house: p.house }))),
                where("status", "==", "aprobado")
            );

            const debtsQuery = query(
                collection(db, "debts"),
                where("ownerId", "==", owner.id),
                orderBy("year", "asc"),
                orderBy("month", "asc")
            );

            const [paymentSnapshot, debtSnapshot] = await Promise.all([
                getDocs(paymentsQuery),
                getDocs(debtsQuery)
            ]);

            const ownerPayments = paymentSnapshot.docs.map(doc => doc.data() as Payment);
            const ownerDebts = debtSnapshot.docs.map(doc => doc.data() as Debt);
            
            // Generate PDF
            const doc = new jsPDF();
            const margin = 14;
            const pageWidth = doc.internal.pageSize.getWidth();
            let finalY = margin;

            // --- Header ---
            if (companyInfo?.logo) {
                doc.addImage(companyInfo.logo, 'PNG', margin, finalY, 25, 25);
            }
            if (companyInfo) {
                doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, finalY + 5);
            }
            
            doc.setFontSize(9).setFont('helvetica', 'normal');
            const ownerProperties = (owner.properties && owner.properties.length > 0) 
                ? owner.properties.map(p => `${p.street} - ${p.house}`).join(', ')
                : (owner.street && owner.house ? `${owner.street} - ${owner.house}`: 'N/A');

            doc.text(`Propietario: ${owner.name}`, margin + 30, finalY + 10);
            doc.text(`Propiedad(es): ${ownerProperties}`, margin + 30, finalY + 14);
            
            const generatedDate = format(new Date(), "dd/MM/yyyy, h:mm:ss a");
            doc.text(`Reporte generado el: ${generatedDate}`, margin + 30, finalY + 18);
            
            finalY += 35;

            // --- Resumen de Pagos ---
            doc.setFontSize(12).setFont('helvetica', 'bold').text('Resumen de Pagos', margin, finalY);
            finalY += 5;

            const paymentsBody = ownerPayments.map(p => {
                const paymentForOwner = p.beneficiaries.find(b => b.ownerId === owner.id);
                const amountBs = paymentForOwner ? paymentForOwner.amount : 0;
                return [
                    format(new Date(p.paymentDate.seconds * 1000), 'dd/MM/yyyy'),
                    p.paymentMethod === 'transferencia' ? 'Transferencia' : 'Pago Móvil',
                    'N/A', // "Pagado por" is not available in the data model
                    `Bs. ${amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
                ];
            });

            const totalPaid = ownerPayments.reduce((acc, p) => {
                 const paymentForOwner = p.beneficiaries.find(b => b.ownerId === owner.id);
                 return acc + (paymentForOwner ? paymentForOwner.amount : 0);
            }, 0);

            autoTable(doc, {
                startY: finalY,
                head: [['Fecha', 'Concepto', 'Pagado por', 'Monto (Bs)']],
                body: paymentsBody,
                foot: [['Total Pagado', '', '', `Bs. ${totalPaid.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`]],
                theme: 'striped',
                headStyles: { fillColor: [26, 145, 125], textColor: 255 },
                footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold' },
            });
            finalY = (doc as any).lastAutoTable.finalY + 10;
            
            // --- Resumen de Deudas ---
            doc.setFontSize(12).setFont('helvetica', 'bold').text('Resumen de Deudas', margin, finalY);
            finalY += 5;

            let totalAdeudadoUSD = 0;
            const debtsBody = ownerDebts.map(d => {
                if (d.status === 'pending') {
                    totalAdeudadoUSD += d.amountUSD;
                }
                return [
                    `${monthsLocale[d.month]} ${d.year}`,
                    `$${d.amountUSD.toFixed(2)}`,
                    d.status === 'paid' ? 'Pagada' : 'Pendiente'
                ];
            });
            
            autoTable(doc, {
                startY: finalY,
                head: [['Periodo', 'Monto ($)', 'Estado']],
                body: debtsBody,
                foot: [['Total Adeudado', `$${totalAdeudadoUSD.toFixed(2)}`, '']],
                theme: 'striped',
                headStyles: { fillColor: [26, 145, 125], textColor: 255 },
                footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold' },
                 didParseCell: (data) => {
                    if (data.row.section === 'foot') {
                       if(data.column.dataKey === 'Monto ($)') data.cell.styles.halign = 'left';
                    }
                }
            });
            finalY = (doc as any).lastAutoTable.finalY + 10;
            
            // --- Saldo a Favor ---
            doc.setFontSize(11).setFont('helvetica', 'bold');
            doc.text(`Saldo a Favor Actual: Bs. ${(owner.balance > 0 ? owner.balance * activeRate : 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, pageWidth - margin, finalY, { align: 'right' });

            doc.save(`estado_cuenta_${owner.name.replace(/\s/g, '_')}.pdf`);

        } catch (error) {
            console.error("Error generating individual statement:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el estado de cuenta.' });
        } finally {
            setLoading(false);
        }
    };

    const generateDelinquencyReport = () => {
        if (!delinquencyPeriod) return toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un período de morosidad.' });
        const months = parseInt(delinquencyPeriod);
        const delinquentOwners = owners.filter(o => o.delinquency >= months);
        
         generatePdf(
            `Reporte de Morosidad (${months} o más meses)`,
            [['Propietario', 'Propiedades', 'Meses de Deuda', 'Saldo Deudor (Bs.)']],
            delinquentOwners.map(o => {
                const properties = (o.properties || []).map(p => `${p.street} - ${p.house}`).join(', ');
                const debtBs = o.balance < 0 ? Math.abs(o.balance * activeRate) : 0;
                return [o.name, properties, o.delinquency, debtBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })];
            }),
            `reporte_morosidad`
        );
    }
    
    const generateSolvencyReport = () => {
        const solventOwners = owners.filter(o => o.status === 'solvente');
         generatePdf(
            'Reporte de Solvencia',
            [['Propietario', 'Propiedades', 'Email']],
            solventOwners.map(o => [o.name, (o.properties || []).map(p => `${p.street} - ${p.house}`).join(', '), o.email || '-']),
            'reporte_solvencia'
        );
    };

    const generateBalanceFavorReport = () => {
        const ownersWithBalance = owners.filter(o => o.balance > 0);
         generatePdf(
            'Reporte de Saldos a Favor',
            [['Propietario', 'Propiedades', 'Saldo a Favor (Bs.)']],
            ownersWithBalance.map(o => [o.name, (o.properties || []).map(p => `${p.street} - ${p.house}`).join(', '), (o.balance * activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })]),
            'reporte_saldos_favor'
        );
    };
    
    const generateIncomeReport = async () => {
        if (!startDate || !endDate) return toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un rango de fechas.' });
        
        const q = query(
            collection(db, 'payments'),
            where('paymentDate', '>=', startDate),
            where('paymentDate', '<=', endDate),
            where('status', '==', 'aprobado')
        );
        
        const incomeSnapshot = await getDocs(q);
        const incomePayments = incomeSnapshot.docs.map(doc => doc.data());
        const totalIncome = incomePayments.reduce((sum, p) => sum + p.totalAmount, 0);

        generatePdf(
            `Reporte de Ingresos (${format(startDate, "dd/MM/yy")} - ${format(endDate, "dd/MM/yy")})`,
            [['Fecha', 'Monto (Bs.)', 'Método de Pago']],
            incomePayments.map(p => [new Date(p.paymentDate.seconds * 1000).toLocaleDateString('es-VE'), p.totalAmount.toFixed(2), p.paymentMethod]),
            'reporte_ingresos',
            { footerText: `Total de Ingresos: Bs. ${totalIncome.toFixed(2)}` }
        );
    };

    const generateGeneralStatusReport = () => {
         generatePdf(
            'Reporte General de Estatus',
            [['Propietario', 'Propiedades', 'Estatus', 'Saldo (Bs.)']],
            owners.map(o => {
                const properties = (o.properties && o.properties.length > 0)
                    ? o.properties.map(p => `${p.street} - ${p.house}`).join(', ')
                    : (o.house ? `${o.street} - ${o.house}` : 'N/A');
                const balanceBs = o.balance * activeRate;
                return [o.name, properties, o.status === 'solvente' ? 'Solvente' : 'Moroso', balanceBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })]
            }),
            'reporte_general_estatus'
        );
    };


    if (loading) {
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
                <Card>
                    <CardHeader>
                        <CardTitle>Estado de Cuenta Individual</CardTitle>
                        <CardDescription>Consulte el estado de cuenta detallado de un propietario.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="owner-select">Propietario</Label>
                            <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                                <SelectTrigger id="owner-select">
                                    <SelectValue placeholder="Seleccione un propietario..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {owners.map(o => {
                                        const properties = (o.properties && o.properties.length > 0) 
                                            ? o.properties.map(p => p.house).join(', ') 
                                            : (o.house || 'N/A');
                                        return <SelectItem key={o.id} value={o.id}>{o.name} ({properties})</SelectItem>
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateIndividualStatement} disabled={!selectedOwner || loading}>
                            {loading && selectedOwner ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />} 
                            Generar y Exportar
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
                         <Button className="w-full" onClick={generateDelinquencyReport} disabled={!delinquencyPeriod}>
                            <Download className="mr-2 h-4 w-4" /> Generar y Exportar
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
                         <p className="text-sm text-muted-foreground">Vista previa no disponible.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateSolvencyReport}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
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
                         <p className="text-sm text-muted-foreground">Vista previa no disponible.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateBalanceFavorReport}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
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
                         <Button className="w-full" onClick={generateIncomeReport} disabled={!startDate || !endDate}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
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
                         <p className="text-sm text-muted-foreground">Vista previa no disponible.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateGeneralStatusReport}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
                        </Button>
                    </CardFooter>
                </Card>

            </div>
        </div>
    );
}

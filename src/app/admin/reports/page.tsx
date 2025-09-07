
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search, Loader2, DollarSign, ShieldCheck, FileText } from "lucide-react";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, getDocs, query, where, doc, getDoc, orderBy, Timestamp, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Calendar } from "@/components/ui/calendar";


type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
    email?: string;
    balance: number;
    delinquency: number; 
    status: 'solvente' | 'moroso';
};

type Payment = {
  id: string;
  reportedBy: string;
  paymentDate: Timestamp;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  reference: string;
  beneficiaries: { ownerId: string, ownerName: string, house?: string, street?: string, amount: number }[];
  observations?: string;
  exchangeRate?: number;
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paymentId?: string;
    paidAmountUSD?: number;
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
        payments: { headers: string[], rows: (string|number)[][], total: number, currency: 'Bs.' | '$', totalUSD: number };
        debts: { headers: string[], rows: (string|number)[][], total: number };
        ownerInfo: { name: string, properties: string, balance: number };
        dateRange: string;
        diagnosis?: string;
    }
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const ADMIN_USER_ID = 'G2jhcEnp05TcvjYj8SwhzVCHbW83'; // EDWIN AGUIAR's ID

export default function ReportsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [owners, setOwners] = useState<Owner[]>([]);
    const [ownersMap, setOwnersMap] = useState<Map<string, Owner>>(new Map());

    // --- Form State ---
    const [selectedOwner, setSelectedOwner] = useState('');
    const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
    
    // --- Chart State ---
    const [incomeChartData, setIncomeChartData] = useState<ChartData[]>([]);
    
    // --- System State ---
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    // --- Preview State ---
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<ReportPreviewData | null>(null);


    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Owners
                const ownersQuery = query(collection(db, 'owners'), orderBy('name'));
                const ownersSnapshot = await getDocs(ownersQuery);
                const localOwnersMap = new Map<string, Owner>();
                const ownersData = ownersSnapshot.docs.map(doc => {
                    if (doc.id === ADMIN_USER_ID) return null;
                    const owner = { id: doc.id, ...doc.data(), delinquency: 0, status: 'solvente' } as Owner;
                    localOwnersMap.set(owner.id, owner);
                    return owner;
                }).filter(Boolean) as Owner[];
                
                setOwners(ownersData);
                setOwnersMap(localOwnersMap);

                // Fetch Settings for Company Info
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    setCompanyInfo(settingsSnap.data().companyInfo);
                } else {
                    toast({ variant: 'destructive', title: 'Error de Configuración', description: 'No se encontró el documento de configuración principal.' });
                }

                // Fetch Payments for Income Chart
                const incomeQuery = query(collection(db, 'payments'), where('status', '==', 'aprobado'), orderBy('paymentDate', 'asc'));
                const incomeSnapshot = await getDocs(incomeQuery);
                const incomeByMonth: {[key: string]: number} = {};
                incomeSnapshot.forEach(doc => {
                    const payment = doc.data();
                    const month = format(new Date(payment.paymentDate.seconds * 1000), 'yyyy-MM');
                    incomeByMonth[month] = (incomeByMonth[month] || 0) + payment.totalAmount;
                });
                setIncomeChartData(Object.entries(incomeByMonth).map(([name, total]) => ({name, total})).sort((a,b) => a.name.localeCompare(b.name)));

            } catch (error) {
                console.error("Error fetching report data:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos para los reportes.' });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [toast]);

    const generatePdf = (data: ReportPreviewData) => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'letter'
        });
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 40;
    
        if (data.isDetailedStatement && data.detailedData) {
            const { ownerInfo, payments, debts } = data.detailedData;
            let startY = 40;
    
            // --- Header ---
            if (companyInfo?.logo) {
                doc.addImage(companyInfo.logo, 'PNG', margin, startY, 60, 60);
            }
            if (companyInfo) {
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(companyInfo.name, margin + 70, startY + 15);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.text(`Propietario: ${ownerInfo.name}`, margin + 70, startY + 30);
                doc.text(`Propiedad(es): ${ownerInfo.properties}`, margin + 70, startY + 42);
                doc.text(`Reporte generado el: ${new Date().toLocaleString('es-VE')}`, margin + 70, startY + 54);
            }
            startY += 90;
    
            // --- Payments Summary ---
            if (payments.rows.length > 0) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text("Resumen de Pagos", margin, startY);
                startY += 15;
                (doc as any).autoTable({
                    head: [payments.headers],
                    body: payments.rows,
                    startY: startY,
                    theme: 'striped',
                    headStyles: { fillColor: '#20c997', textColor: '#ffffff', fontSize: 9, fontStyle: 'bold', halign: 'center' },
                    styles: { fontSize: 8, cellPadding: 4, lineColor: '#dee2e6', lineWidth: 0.5 },
                    columnStyles: { 3: { halign: 'right' } },
                    foot: [[
                        { content: 'Total Pagado', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
                        { content: `Bs. ${payments.total.toLocaleString('es-VE', {minimumFractionDigits: 2})} ($${payments.totalUSD.toFixed(2)})`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
                    ]],
                });
                startY = (doc as any).lastAutoTable.finalY + 20;
            }
    
            // --- Debts Summary ---
            if(debts.rows.length > 0) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text("Resumen de Deudas", margin, startY);
                startY += 15;
                (doc as any).autoTable({
                    head: [debts.headers],
                    body: debts.rows,
                    startY: startY,
                    theme: 'striped',
                    headStyles: { fillColor: '#20c997', textColor: '#ffffff', fontSize: 9, fontStyle: 'bold', halign: 'center' },
                    styles: { fontSize: 8, cellPadding: 4, lineColor: '#dee2e6', lineWidth: 0.5 },
                    columnStyles: { 1: { halign: 'right' } },
                    didParseCell: (data) => {
                        if (data.column.dataKey === 2 && data.cell.raw === 'Pendiente') {
                            data.cell.styles.textColor = '#dc3545';
                            data.cell.styles.fontStyle = 'bold';
                        }
                    },
                    foot: [[
                        { content: 'Total Adeudado', colSpan: 1, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
                        { content: `$${debts.total.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
                        { content: '', styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
                    ]],
                });
                 startY = (doc as any).lastAutoTable.finalY + 20;
            }
    
            // --- Final Balance ---
            if (ownerInfo.balance > 0) {
                 doc.setFontSize(12);
                 doc.setFont('helvetica', 'bold');
                 doc.text(`Saldo a Favor Actual: Bs. ${ownerInfo.balance.toLocaleString('es-VE', {minimumFractionDigits: 2})}`, margin, startY);
                 startY += 20;
            }

            // --- Observations ---
            if(data.detailedData?.diagnosis) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text("Observaciones y Diagnóstico", margin, startY);
                startY += 15;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                const splitText = doc.splitTextToSize(data.detailedData.diagnosis, pageWidth - (margin * 2));
                doc.text(splitText, margin, startY);
            }
        
        } else { // Generic table report
             let startY = 40;
            if (companyInfo) {
                if (companyInfo.logo) doc.addImage(companyInfo.logo, 'PNG', margin, startY, 60, 60);
                doc.setFontSize(14).setFont('helvetica', 'bold').text(companyInfo.name, margin + 70, startY + 15);
                doc.setFontSize(9).setFont('helvetica', 'normal').text(`Reporte generado el: ${new Date().toLocaleString('es-VE')}`, margin + 70, startY + 30);
                startY += 90;
            }
            doc.setFontSize(11).setFont('helvetica', 'bold').text(data.title, margin, startY);
            startY += 15;
            (doc as any).autoTable({ 
                head: [data.headers], 
                body: data.rows, 
                startY: startY,
                styles: { cellPadding: 4, fontSize: 9 },
                headStyles: { fillColor: [30, 80, 180], fontSize: 9, fontStyle: 'bold' }
            });
        }
    
        doc.save(`${data.filename}.pdf`);
    };

    const handleExportPreview = () => {
        if (!previewData) return;
        generatePdf(previewData);
        setIsPreviewOpen(false);
        setPreviewData(null);
    }

    const generateIndividualStatement = async () => {
        if (!selectedOwner) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un propietario.' });
            return;
        }

        const owner = owners.find(o => o.id === selectedOwner);
        if (!owner) {
            toast({ variant: 'destructive', title: 'Error', description: 'Propietario no encontrado.' });
            return;
        }

        setGeneratingReport(true);
        try {
            if (!owner.properties || owner.properties.length === 0) {
                 toast({ variant: 'destructive', title: 'Error de Datos', description: 'El propietario seleccionado no tiene propiedades registradas.' });
                 setGeneratingReport(false);
                 return;
            }
            
            // Fetch Payments for the owner, approved only, ordered by most recent
            const clientFilteredPayments = [];
            const allPaymentsForOwnerQuery = query(collection(db, 'payments'), where('status', '==', 'aprobado'), orderBy('paymentDate', 'desc'));
            const allPaymentsSnapshot = await getDocs(allPaymentsForOwnerQuery);
            allPaymentsSnapshot.forEach(doc => {
                const payment = {id: doc.id, ...doc.data()} as Payment;
                if(payment.beneficiaries.some(b => b.ownerId === owner.id)) {
                    clientFilteredPayments.push(payment);
                }
            });

            const lastPayments = clientFilteredPayments.slice(0, 3);
            
            // Fetch all debts (paid and pending) for the owner
            const allDebtsQuery = query(collection(db, "debts"), where("ownerId", "==", owner.id), orderBy("year", "desc"), orderBy("month", "desc"));
            const allDebtsSnapshot = await getDocs(allDebtsQuery);
            const allOwnerDebts = allDebtsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));

            let totalPaidBs = 0;
            let totalPaidUsd = 0;
            const paymentsRows = lastPayments.map(p => {
                totalPaidBs += p.totalAmount;
                if(p.exchangeRate && p.exchangeRate > 0) {
                   totalPaidUsd += p.totalAmount / p.exchangeRate;
                }
                
                const paidDebtsForThisPayment = allOwnerDebts.filter(debt => debt.paymentId === p.id);
                let concept = "Abono a Saldo a Favor";
                if(paidDebtsForThisPayment.length > 0) {
                    const periods = paidDebtsForThisPayment.map(d => `${monthsLocale[d.month]?.substring(0,3)} ${d.year}`).join(', ');
                    concept = `Pago Cuota(s): ${periods}`;
                } else if (p.observations) {
                    concept = p.observations;
                }

                const reportedByOwner = ownersMap.get(p.reportedBy);
                const paidBy = reportedByOwner ? reportedByOwner.name : 'Administrador';

                return [
                    format(p.paymentDate.toDate(), "dd/MM/yyyy"),
                    concept,
                    paidBy,
                    `Bs. ${p.totalAmount.toLocaleString('es-VE', {minimumFractionDigits: 2})}`
                ];
            });

            let totalDebtUSD = 0;
            const debtsRows = allOwnerDebts.map(d => {
                if(d.status === 'pending') totalDebtUSD += d.amountUSD;
                return [
                    `${monthsLocale[d.month]} ${d.year}`,
                     d.status === 'paid' ? `(${(d.paidAmountUSD || d.amountUSD).toFixed(2)})` : `$${d.amountUSD.toFixed(2)}`,
                    d.status === 'paid' ? 'Pagada' : 'Pendiente'
                ];
            });

            const pendingDebts = allOwnerDebts.filter(d => d.status === 'pending');
            let dateRangeText = "Al día";
            if (pendingDebts.length > 0) {
                pendingDebts.sort((a,b) => a.year - b.year || a.month - b.month);
                const firstDebt = pendingDebts[0];
                dateRangeText = `Deudas desde ${monthsLocale[firstDebt.month]} ${firstDebt.year}`;
            }

            const ownerProps = (owner.properties && owner.properties.length > 0) 
                ? owner.properties.map(p => `${p.street}-${p.house}`).join('; ') 
                : 'N/A';
            const ownerInfo = { name: owner.name, properties: ownerProps, balance: owner.balance };
            
            let diagnosis = "Estado de cuenta completo. ";
            if(totalDebtUSD > 0) {
                diagnosis += `El propietario presenta una deuda de ${pendingDebts.length} mes(es). `;
            } else {
                diagnosis += "El propietario se encuentra solvente. ";
            }
            if(owner.balance > 0) {
                diagnosis += `Posee un saldo a favor de Bs. ${owner.balance.toLocaleString('es-VE', {minimumFractionDigits: 2})}.`;
            }

            setPreviewData({
                title: `Estado de Cuenta Detallado`,
                filename: `estado_cuenta_detallado_${owner.name.replace(/\s/g, '_')}`,
                isDetailedStatement: true,
                headers: [],
                rows: [],
                detailedData: {
                    ownerInfo,
                    dateRange: dateRangeText,
                    payments: {
                        headers: ["Fecha", "Concepto", "Pagado por", "Monto (Bs)"],
                        rows: paymentsRows,
                        total: totalPaidBs,
                        totalUSD: totalPaidUsd,
                        currency: 'Bs.',
                    },
                    debts: {
                        headers: ["Período", "Monto ($)", "Estado"],
                        rows: debtsRows,
                        total: totalDebtUSD
                    },
                    diagnosis,
                }
            });
            setIsPreviewOpen(true);

        } catch (error) {
            console.error("Error generating individual statement:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el estado de cuenta. Verifique que no falten índices en Firestore.' });
        } finally {
            setGeneratingReport(false);
        }
    };
    
    const showSolvencyReportPreview = async () => {
        setGeneratingReport(true);
        try {
            const debtsSnapshot = await getDocs(query(collection(db, 'debts'), where('status', '==', 'pending')));
            const delinquentOwnerIds = new Set(debtsSnapshot.docs.map(doc => doc.data().ownerId));

            const solventOwners = owners.filter(o => !delinquentOwnerIds.has(o.id));
            
            if (solventOwners.length === 0) {
                setPreviewData({ title: 'Reporte de Solvencia', headers: ['PROPIETARIO', 'PROPIEDADES', 'ESTADO'], rows: [], filename: 'reporte_solvencia' });
                setIsPreviewOpen(true);
                return;
            }
    
            const reportRows = solventOwners.map(owner => {
                const properties = (owner.properties && owner.properties.length > 0) 
                    ? owner.properties.map(p => `${p.street} - ${p.house}`).join('\n') 
                    : 'N/A';
                return [owner.name, properties, 'Solvente'];
            });
    
            setPreviewData({
                title: 'Reporte de Solvencia',
                headers: ['PROPIETARIO', 'PROPIEDADES', 'ESTADO'],
                rows: reportRows,
                filename: 'reporte_solvencia'
            });
            setIsPreviewOpen(true);
    
        } catch (error) {
            console.error("Error generating solvency report:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el reporte de solvencia.' });
        } finally {
            setGeneratingReport(false);
        }
    };

    const showBalanceFavorReportPreview = () => {
        const ownersWithBalance = owners.filter(o => o.balance > 0);
        setPreviewData({
            title: 'Reporte de Saldos a Favor',
            headers: ['Propietario', 'Propiedades', 'Saldo a Favor (Bs.)'],
            rows: ownersWithBalance.map(o => {
                const properties = (o.properties && o.properties.length > 0) 
                    ? o.properties.map(p => `${p.street} - ${p.house}`).join('\n') 
                    : 'N/A';
                return [o.name, properties, `Bs. ${o.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`];
            }),
            filename: 'reporte_saldos_favor'
        });
        setIsPreviewOpen(true);
    };
    
    const showPaymentsByPeriodReport = async () => {
        if (!dateRange.from || !dateRange.to) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un período de fechas válido (Desde y Hasta).' });
            return;
        }

        setGeneratingReport(true);
        try {
            const startDate = Timestamp.fromDate(dateRange.from);
            const endDate = Timestamp.fromDate(dateRange.to);

            const paymentsQuery = query(
                collection(db, 'payments'),
                where('paymentDate', '>=', startDate),
                where('paymentDate', '<=', endDate),
                orderBy('paymentDate', 'desc')
            );
            
            const paymentsSnapshot = await getDocs(paymentsQuery);
            const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));

            const reportRows = payments
                .filter(p => !p.beneficiaries.some(b => b.ownerId === ADMIN_USER_ID)) // Exclude admin payments
                .map(p => {
                    let userName = 'N/A';
                    let properties = 'N/A';

                    if (p.beneficiaries && p.beneficiaries.length > 0) {
                        const beneficiaryId = p.beneficiaries[0].ownerId;
                        const owner = owners.find(o => o.id === beneficiaryId);
                        if (owner) {
                            userName = owner.name;
                            properties = owner.properties.map(prop => `${prop.street} - ${prop.house}`).join('\n');
                        } else {
                            userName = p.beneficiaries[0].ownerName || 'Desconocido';
                        }
                    }

                    return [
                        userName,
                        properties,
                        format(p.paymentDate.toDate(), "dd/MM/yyyy"),
                        p.reference,
                        p.totalAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })
                    ];
                });

            setPreviewData({
                title: `Reporte de Pagos de ${format(dateRange.from, 'dd/MM/yy')} a ${format(dateRange.to, 'dd/MM/yy')}`,
                headers: ['PROPIETARIO', 'PROPIEDADES', 'FECHA DE PAGO', 'REFERENCIA', 'MONTO (BS)'],
                rows: reportRows,
                filename: `reporte_pagos_${format(dateRange.from, 'yyyy-MM-dd')}_a_${format(dateRange.to, 'yyyy-MM-dd')}`
            });
            setIsPreviewOpen(true);

        } catch (error) {
            console.error("Error generating payments report: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el reporte de pagos.' });
        } finally {
            setGeneratingReport(false);
        }
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Reporte: Estado de Cuenta Individual */}
                <Card>
                    <CardHeader>
                        <CardTitle>Estado de Cuenta Individual</CardTitle>
                        <CardDescription>Consulte el historial completo de un propietario.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="owner-select">Propietario</label>
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

                {/* Reporte: Solvencia */}
                <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Solvencia</CardTitle>
                        <CardDescription>Genere una lista de todos los propietarios al día.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-[92px]">
                         <p className="text-sm text-muted-foreground text-center">Haga clic para generar la lista de propietarios solventes.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={showSolvencyReportPreview} disabled={generatingReport}>
                           {generatingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4" />} Generar Vista Previa
                        </Button>
                    </CardFooter>
                </Card>

                 {/* Reporte: Pagos por Período */}
                <Card>
                    <CardHeader>
                        <CardTitle>Reporte General de Pagos</CardTitle>
                        <CardDescription>Consulte todos los pagos en un período específico.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <label>Desde</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange.from ? format(dateRange.from, "LLL dd, y", { locale: es }) : <span>Seleccione fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange.from} onSelect={(d) => setDateRange(prev => ({...prev, from: d}))} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <label>Hasta</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange.to && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange.to ? format(dateRange.to, "LLL dd, y", { locale: es }) : <span>Seleccione fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange.to} onSelect={(d) => setDateRange(prev => ({...prev, to: d}))} /></PopoverContent>
                            </Popover>
                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full" onClick={showPaymentsByPeriodReport} disabled={generatingReport || !dateRange.from || !dateRange.to}>
                            {generatingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileText className="mr-2 h-4 w-4" />}
                            Generar Vista Previa
                        </Button>
                    </CardFooter>
                </Card>
                
                {/* Reporte: Saldos a Favor */}
                 <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Saldos a Favor</CardTitle>
                        <CardDescription>Liste todos los propietarios con saldo a favor y sus montos.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-[92px]">
                         <p className="text-sm text-muted-foreground text-center">Haga clic para generar el reporte de saldos.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={showBalanceFavorReportPreview} disabled={generatingReport}>
                           {generatingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <DollarSign className="mr-2 h-4 w-4" />} Generar Vista Previa
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
                            <div className="space-y-6 p-4">
                                {/* This section is intentionally left simple for the dialog. The PDF generation holds the complex layout. */}
                                <div>
                                    <h3 className="font-semibold text-lg">{`Estado de Cuenta para ${previewData.detailedData.ownerInfo.name}`}</h3>
                                    <p className="text-sm text-muted-foreground">{`Propiedades: ${previewData.detailedData.ownerInfo.properties}`}</p>
                                    <p className="text-sm text-muted-foreground mt-1">{`Período de Deuda: ${previewData.detailedData.dateRange}`}</p>
                                </div>
                                <hr/>
                                {previewData.detailedData.payments.rows.length > 0 && (
                                <div>
                                    <h4 className="font-semibold mb-2">Resumen de Pagos</h4>
                                    <Table>
                                        <TableHeader><TableRow>{previewData.detailedData.payments.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
                                        <TableBody>{previewData.detailedData.payments.rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className={j === 3 ? 'text-right' : ''}>{c}</TableCell>)}</TableRow>)}</TableBody>
                                    </Table>
                                </div>
                                )}
                                {previewData.detailedData.debts.rows.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2 mt-4">Resumen de Deudas</h4>
                                        <Table>
                                            <TableHeader><TableRow>{previewData.detailedData.debts.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
                                            <TableBody>{previewData.detailedData.debts.rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className={j === 1 ? 'text-right' : ''}>{c}</TableCell>)}</TableRow>)}</TableBody>
                                        </Table>
                                        <p className="text-right font-bold mt-2 text-destructive">Total Adeudado: ${previewData.detailedData.debts.total.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                                    </div>
                                )}
                                {previewData.detailedData.ownerInfo.balance > 0 && (
                                     <p className="text-right font-bold mt-4 text-green-600 text-lg">Saldo a Favor Actual: Bs. {previewData.detailedData.ownerInfo.balance.toLocaleString('es-VE', {minimumFractionDigits: 2})}</p>
                                )}
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
                                                <TableCell key={cellIndex} className="whitespace-pre-wrap">{cell}</TableCell>
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
            
            <div className="grid grid-cols-1 gap-6 mt-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5"/> Gráfico de Ingresos por Mes</CardTitle>
                        <CardDescription>Visualización de los ingresos aprobados mensualmente en Bolívares (Bs.).</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        {incomeChartData.length > 0 ? (
                            <ChartContainer config={{
                                total: { label: "Ingresos (Bs.)", color: "hsl(var(--primary))" }
                            }} className="h-[300px] w-full">
                                <ResponsiveContainer>
                                    <BarChart data={incomeChartData}>
                                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false}/>
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Bs. ${new Intl.NumberFormat('es-VE').format(value as number)}`}/>
                                        <Tooltip content={<ChartTooltipContent />} formatter={(value) => `Bs. ${new Intl.NumberFormat('es-VE').format(value as number)}`}/>
                                        <Bar dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} className="fill-primary" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : <p className="text-center text-muted-foreground h-[300px] flex items-center justify-center">No hay datos de ingresos para mostrar.</p>}
                    </CardContent>
                </Card>
            </div>

        </div>
    );
}

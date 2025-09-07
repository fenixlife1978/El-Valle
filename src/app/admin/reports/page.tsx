
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search, Loader2, DollarSign, ShieldCheck, FileText, FileSpreadsheet } from "lucide-react";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { collection, getDocs, query, where, doc, getDoc, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
    email?: string;
    balance: number;
};

type Payment = {
  id: string;
  paymentDate: Timestamp;
  totalAmount: number;
  exchangeRate?: number;
  beneficiaries: { ownerId: string }[];
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    status: 'pending' | 'paid';
};

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
    filename: string;
};

type IntegralReportRow = {
    ownerId: string;
    name: string;
    properties: string;
    paidAmount: number;
    avgRate: number;
    balance: number;
    status: 'Solvente' | 'Moroso';
    period: string;
    monthsOwed?: number;
};

const monthsLocale: { [key: number]: string } = {
    1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun',
    7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic'
};

const ADMIN_USER_ID = 'G2jhcEnp05TcvjYj8SwhzVCHbW83';

export default function ReportsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [generatingReport, setGeneratingReport] = useState(false);
    
    // Data stores
    const [owners, setOwners] = useState<Owner[]>([]);
    const [allPayments, setAllPayments] = useState<Payment[]>([]);
    const [allDebts, setAllDebts] = useState<Debt[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    // Filters for Integral Report
    const [integralStatusFilter, setIntegralStatusFilter] = useState('todos');
    const [integralOwnerFilter, setIntegralOwnerFilter] = useState('');
    const [integralDateRange, setIntegralDateRange] = useState<{ from?: Date; to?: Date }>({});

    // State for simple reports
    const [selectedOwner, setSelectedOwner] = useState('');
    
    // Preview Dialog
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<ReportPreviewData | null>(null);


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const ownersQuery = query(collection(db, 'owners'), where('name', '!=', 'EDWIN AGUIAR'), orderBy('name'));
            const paymentsQuery = query(collection(db, 'payments'), where('status', '==', 'aprobado'));
            const debtsQuery = query(collection(db, 'debts'));
            
            const [settingsSnap, ownersSnapshot, paymentsSnapshot, debtsSnapshot] = await Promise.all([
                getDoc(settingsRef),
                getDocs(ownersQuery),
                getDocs(paymentsQuery),
                getDocs(debtsQuery)
            ]);

            if (settingsSnap.exists()) setCompanyInfo(settingsSnap.data().companyInfo);

            setOwners(ownersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Owner)));
            setAllPayments(paymentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
            setAllDebts(debtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt)));

        } catch (error) {
            console.error("Error fetching report data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos para los reportes.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        fetchData();
    }, [fetchData]);


    const integralReportData = useMemo<IntegralReportRow[]>(() => {
        return owners.map(owner => {
            const ownerDebts = allDebts.filter(d => d.ownerId === owner.id);
            const pendingDebts = ownerDebts.filter(d => d.status === 'pending').sort((a,b) => a.year - b.year || a.month - b.month);
            
            let status: 'Solvente' | 'Moroso' = pendingDebts.length > 0 ? 'Moroso' : 'Solvente';
            let period = '';
            if (status === 'Moroso') {
                const firstDebt = pendingDebts[0];
                const lastDebt = pendingDebts[pendingDebts.length - 1];
                period = `${monthsLocale[firstDebt.month]}/${firstDebt.year} - ${monthsLocale[lastDebt.month]}/${lastDebt.year}`;
            } else {
                const lastPaidDebt = ownerDebts
                    .filter(d => d.status === 'paid')
                    .sort((a,b) => b.year - a.year || b.month - b.month)[0];
                if (lastPaidDebt) {
                    period = `${monthsLocale[lastPaidDebt.month]}/${lastPaidDebt.year}`;
                }
            }
            
            const fromDate = integralDateRange.from;
            const toDate = integralDateRange.to;

            if(fromDate) fromDate.setHours(0,0,0,0);
            if(toDate) toDate.setHours(23,59,59,999);

            const ownerPayments = allPayments.filter(p => {
                const isOwnerPayment = p.beneficiaries.some(b => b.ownerId === owner.id);
                if (!isOwnerPayment) return false;

                const paymentDate = p.paymentDate.toDate();
                if (fromDate && paymentDate < fromDate) return false;
                if (toDate && paymentDate > toDate) return false;
                return true;
            });

            const totalPaid = ownerPayments.reduce((sum, p) => sum + p.totalAmount, 0);
            const totalRateWeight = ownerPayments.reduce((sum, p) => sum + ((p.exchangeRate || 0) * p.totalAmount), 0);
            const avgRate = totalPaid > 0 ? totalRateWeight / totalPaid : 0;
            
            return {
                ownerId: owner.id,
                name: owner.name,
                properties: (owner.properties || []).map(p => `${p.street}-${p.house}`).join(', '),
                paidAmount: totalPaid,
                avgRate: avgRate,
                balance: owner.balance,
                status,
                period,
                monthsOwed: pendingDebts.length > 0 ? pendingDebts.length : undefined,
            };
        }).filter(row => {
            const statusMatch = integralStatusFilter === 'todos' || row.status.toLowerCase() === integralStatusFilter;
            const ownerMatch = !integralOwnerFilter || row.name.toLowerCase().includes(integralOwnerFilter.toLowerCase());
            return statusMatch && ownerMatch;
        });
    }, [owners, allDebts, allPayments, integralDateRange, integralStatusFilter, integralOwnerFilter]);

    const handleExport = (format: 'pdf' | 'excel') => {
        const data = integralReportData;
        const headers = [["Propietario", "Propiedad", "Monto Pagado (Bs)", "Tasa Prom. (Bs/$)", "Saldo a Favor (Bs)", "Estado", "Período", "Meses Adeudados"]];
        const body = data.map(row => [
            row.name,
            row.properties,
            row.paidAmount > 0 ? row.paidAmount.toLocaleString('es-VE', {minimumFractionDigits: 2}) : '',
            row.avgRate > 0 ? row.avgRate.toLocaleString('es-VE', {minimumFractionDigits: 2}) : '',
            row.balance > 0 ? row.balance.toLocaleString('es-VE', {minimumFractionDigits: 2}) : '',
            row.status,
            row.period,
            row.monthsOwed || ''
        ]);

        const filename = `reporte_integral_${new Date().toISOString().split('T')[0]}`;
        const emissionDate = format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss", { locale: es });
        let periodString = "Período: Todos";
        if (integralDateRange.from && integralDateRange.to) {
            periodString = `Período: Desde ${format(integralDateRange.from, 'P', { locale: es })} hasta ${format(integralDateRange.to, 'P', { locale: es })}`;
        } else if (integralDateRange.from) {
            periodString = `Período: Desde ${format(integralDateRange.from, 'P', { locale: es })}`;
        } else if (integralDateRange.to) {
            periodString = `Período: Hasta ${format(integralDateRange.to, 'P', { locale: es })}`;
        }


        if (format === 'pdf') {
            const doc = new jsPDF({ orientation: 'landscape' });
            let startY = 15;
            if (companyInfo?.logo) {
                doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
            }
            if (companyInfo) {
                doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);
            }
            
            doc.setFontSize(14).setFont('helvetica', 'bold').text('Reporte Integral de Propietarios', doc.internal.pageSize.getWidth() / 2, startY + 15, { align: 'center'});
            
            startY += 25;
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(periodString, 15, startY);
            doc.text(`Fecha de Emisión: ${emissionDate}`, doc.internal.pageSize.getWidth() - 15, startY, { align: 'right'});
            
            startY += 10;
            (doc as any).autoTable({
                head: headers,
                body: body,
                startY: startY,
                headStyles: { fillColor: [30, 80, 180] },
                styles: { fontSize: 8, cellPadding: 1.5 },
                columnStyles: {
                    2: { halign: 'right' },
                    3: { halign: 'right' },
                    4: { halign: 'right' },
                    7: { halign: 'center' },
                }
            });
            doc.save(`${filename}.pdf`);
        } else {
            const headerData = [
                ["Reporte Integral de Propietarios"],
                [periodString],
                [`Fecha de Emisión: ${emissionDate}`],
                [] // Empty row for spacing
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(headerData);
            XLSX.utils.sheet_add_aoa(worksheet, headers, { origin: "A5" });
            XLSX.utils.sheet_add_json(worksheet, data.map(row => ({
                 "Propietario": row.name, 
                 "Propiedad": row.properties,
                 "Monto Pagado (Bs)": row.paidAmount,
                 "Tasa Prom. (Bs/$)": row.avgRate,
                 "Saldo a Favor (Bs)": row.balance,
                 "Estado": row.status,
                 "Período": row.period,
                 "Meses Adeudados": row.monthsOwed || ''
            })), { origin: "A6", skipHeader: true });

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Integral");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
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
            
            <Tabs defaultValue="integral" className="w-full">
                <TabsList>
                    <TabsTrigger value="integral">Reporte Integral</TabsTrigger>
                </TabsList>
                <TabsContent value="integral">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reporte Integral de Propietarios</CardTitle>
                            <CardDescription>Una vista consolidada del estado financiero de todos los propietarios. Filtre y exporte según sus necesidades.</CardDescription>
                             <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Buscar Propietario</Label>
                                    <Input placeholder="Nombre..." value={integralOwnerFilter} onChange={e => setIntegralOwnerFilter(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Estado</Label>
                                    <Select value={integralStatusFilter} onValueChange={setIntegralStatusFilter}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="todos">Todos</SelectItem>
                                            <SelectItem value="solvente">Solvente</SelectItem>
                                            <SelectItem value="moroso">Moroso</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Pagos Desde</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full justify-start", !integralDateRange.from && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {integralDateRange.from ? format(integralDateRange.from, "P", { locale: es }) : "Fecha"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent><Calendar mode="single" selected={integralDateRange.from} onSelect={d => setIntegralDateRange(prev => ({...prev, from: d}))} /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label>Pagos Hasta</Label>
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full justify-start", !integralDateRange.to && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {integralDateRange.to ? format(integralDateRange.to, "P", { locale: es }) : "Fecha"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent><Calendar mode="single" selected={integralDateRange.to} onSelect={d => setIntegralDateRange(prev => ({...prev, to: d}))} /></PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <div className="flex justify-end gap-2 mb-4">
                                <Button variant="outline" onClick={() => handleExport('pdf')} disabled={generatingReport}>
                                    <FileText className="mr-2 h-4 w-4" /> Exportar a PDF
                                </Button>
                                <Button variant="outline" onClick={() => handleExport('excel')} disabled={generatingReport}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel
                                </Button>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Propietario</TableHead>
                                        <TableHead>Propiedad</TableHead>
                                        <TableHead className="text-right">Monto Pagado</TableHead>
                                        <TableHead className="text-right">Tasa Prom.</TableHead>
                                        <TableHead className="text-right">Saldo a Favor</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Período</TableHead>
                                        <TableHead className="text-center">Meses Deuda</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {integralReportData.map(row => (
                                        <TableRow key={row.ownerId}>
                                            <TableCell className="font-medium">{row.name}</TableCell>
                                            <TableCell>{row.properties}</TableCell>
                                            <TableCell className="text-right">{row.paidAmount > 0 ? `Bs. ${row.paidAmount.toLocaleString('es-VE', {minimumFractionDigits: 2})}`: ''}</TableCell>
                                            <TableCell className="text-right">{row.avgRate > 0 ? `Bs. ${row.avgRate.toLocaleString('es-VE', {minimumFractionDigits: 2})}`: ''}</TableCell>
                                            <TableCell className="text-right">{row.balance > 0 ? `Bs. ${row.balance.toLocaleString('es-VE', {minimumFractionDigits: 2})}`: ''}</TableCell>
                                            <TableCell>
                                                <span className={cn('font-semibold', row.status === 'Moroso' ? 'text-destructive' : 'text-success')}>{row.status}</span>
                                            </TableCell>
                                            <TableCell>{row.period}</TableCell>
                                            <TableCell className="text-center">{row.monthsOwed || ''}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

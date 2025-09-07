
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search, Loader2, FileText, FileSpreadsheet, ArrowUpDown } from "lucide-react";
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

type HistoricalPayment = {
    ownerId: string;
    referenceMonth: number;
    referenceYear: number;
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

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
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

type DelinquentOwner = {
    id: string;
    name: string;
    properties: string;
    debtAmountUSD: number;
    monthsOwed: number;
};

const monthsLocale: { [key: number]: string } = {
    1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun',
    7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic'
};

type SortKey = 'name' | 'debtAmountUSD' | 'monthsOwed';
type SortDirection = 'asc' | 'desc';


export default function ReportsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [generatingReport, setGeneratingReport] = useState(false);
    
    // Data stores
    const [owners, setOwners] = useState<Owner[]>([]);
    const [allPayments, setAllPayments] = useState<Payment[]>([]);
    const [allDebts, setAllDebts] = useState<Debt[]>([]);
    const [allHistoricalPayments, setAllHistoricalPayments] = useState<HistoricalPayment[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState(0);

    // Filters for Integral Report
    const [integralStatusFilter, setIntegralStatusFilter] = useState('todos');
    const [integralOwnerFilter, setIntegralOwnerFilter] = useState('');
    const [integralDateRange, setIntegralDateRange] = useState<{ from?: Date; to?: Date }>({});

    // State for Delinquency Report
    const [allDelinquentOwners, setAllDelinquentOwners] = useState<DelinquentOwner[]>([]);
    const [delinquencyFilterType, setDelinquencyFilterType] = useState('all');
    const [customMonthRange, setCustomMonthRange] = useState({ from: '1', to: '6' });
    const [delinquencySearchTerm, setDelinquencySearchTerm] = useState('');
    const [delinquencySortConfig, setDelinquencySortConfig] = useState<{ key: SortKey, direction: SortDirection }>({ key: 'name', direction: 'asc' });
    const [selectedDelinquentOwners, setSelectedDelinquentOwners] = useState<Set<string>>(new Set());
    const [includeDelinquencyAmounts, setIncludeDelinquencyAmounts] = useState(true);


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const ownersQuery = query(collection(db, 'owners'), where('name', '!=', 'EDWIN AGUIAR'), orderBy('name'));
            const paymentsQuery = query(collection(db, 'payments'), where('status', '==', 'aprobado'));
            const debtsQuery = query(collection(db, 'debts'));
            const historicalPaymentsQuery = query(collection(db, 'historical_payments'));
            
            const [settingsSnap, ownersSnapshot, paymentsSnapshot, debtsSnapshot, historicalSnapshot] = await Promise.all([
                getDoc(settingsRef),
                getDocs(ownersQuery),
                getDocs(paymentsQuery),
                getDocs(debtsQuery),
                getDocs(historicalPaymentsQuery)
            ]);

            let rate = 0;
            if (settingsSnap.exists()){
                 const settings = settingsSnap.data();
                 setCompanyInfo(settings.companyInfo);
                 const rates = settings.exchangeRates || [];
                 const activeRateObj = rates.find((r: any) => r.active);
                 rate = activeRateObj ? activeRateObj.rate : (rates.length > 0 ? rates[0]?.rate : 0);
                 setActiveRate(rate);
            }

            const ownersData = ownersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Owner));
            setOwners(ownersData);
            setAllPayments(paymentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
            const debtsData = debtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
            setAllDebts(debtsData);
            setAllHistoricalPayments(historicalSnapshot.docs.map(d => d.data() as HistoricalPayment));

             // --- Delinquency Data Calculation ---
            const debtsByOwner = new Map<string, { totalUSD: number, count: number }>();
            debtsData.filter(d => d.status === 'pending').forEach(debt => {
                const ownerData = debtsByOwner.get(debt.ownerId) || { totalUSD: 0, count: 0 };
                // We only count base fees for "months owed", not adjustments
                if (debt.description.toLowerCase().includes('condominio')) {
                    ownerData.count += 1;
                }
                ownerData.totalUSD += debt.amountUSD;
                debtsByOwner.set(debt.ownerId, ownerData);
            });

            const delinquentData: DelinquentOwner[] = [];
            debtsByOwner.forEach((debtInfo, ownerId) => {
                const owner = ownersData.find(o => o.id === ownerId);
                if (owner) {
                    delinquentData.push({
                        id: ownerId,
                        name: owner.name,
                        properties: (owner.properties || []).map((p: any) => `${p.street} - ${p.house}`).join(', '),
                        debtAmountUSD: debtInfo.totalUSD,
                        monthsOwed: debtInfo.count,
                    });
                }
            });

            setAllDelinquentOwners(delinquentData);
            setSelectedDelinquentOwners(new Set(delinquentData.map(o => o.id)));


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
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        return owners.map(owner => {
            const ownerDebts = allDebts.filter(d => d.ownerId === owner.id);
            const ownerHistorical = allHistoricalPayments.filter(h => h.ownerId === owner.id);
            
            const pendingDebts = ownerDebts.filter(d => {
                if (d.status !== 'pending') return false;
                // If it's a regular debt, it always counts.
                if (!d.description.toLowerCase().includes('ajuste')) return true;
                
                // If it's an adjustment debt, check if its month has passed or is the current month.
                const debtDate = new Date(d.year, d.month - 1);
                const currentDate = new Date(currentYear, currentMonth - 1);
                return debtDate <= currentDate;
            });
            
            let status: 'Solvente' | 'Moroso' = pendingDebts.length > 0 ? 'Moroso' : 'Solvente';
            let period = '';

            if (status === 'Moroso') {
                const sortedPending = [...pendingDebts].sort((a,b) => a.year - b.year || a.month - b.month);
                const firstDebt = sortedPending[0];
                const lastDebt = sortedPending[sortedPending.length - 1];
                period = `${monthsLocale[firstDebt.month]}/${firstDebt.year} - ${monthsLocale[lastDebt.month]}/${lastDebt.year}`;
            } else {
                 const allPaidPeriods = new Set<string>();
                ownerDebts.filter(d => d.status === 'paid').forEach(d => allPaidPeriods.add(`${d.year}-${String(d.month).padStart(2, '0')}`));
                ownerHistorical.forEach(h => allPaidPeriods.add(`${h.referenceYear}-${String(h.referenceMonth).padStart(2, '0')}`));

                if (allPaidPeriods.size > 0) {
                    const lastPaidPeriod = Array.from(allPaidPeriods).sort().pop()!;
                    const [year, month] = lastPaidPeriod.split('-').map(Number);
                    period = `Hasta ${monthsLocale[month]}/${year}`;
                } else {
                    period = "Solvente (Sin Pagos)";
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
                monthsOwed: status === 'Moroso' ? pendingDebts.length : undefined,
            };
        }).filter(row => {
            const statusMatch = integralStatusFilter === 'todos' || row.status.toLowerCase() === integralStatusFilter;
            const ownerMatch = !integralOwnerFilter || row.name.toLowerCase().includes(integralOwnerFilter.toLowerCase());
            return statusMatch && ownerMatch;
        });
    }, [owners, allDebts, allPayments, allHistoricalPayments, integralDateRange, integralStatusFilter, integralOwnerFilter]);

    // --- Delinquency Report Logic ---
    const filteredAndSortedDelinquents = useMemo(() => {
        let owners = [...allDelinquentOwners];
        switch (delinquencyFilterType) {
            case '2_or_more': owners = owners.filter(o => o.monthsOwed >= 2); break;
            case '3_exact': owners = owners.filter(o => o.monthsOwed === 3); break;
            case 'custom':
                const from = parseInt(customMonthRange.from) || 1;
                const to = parseInt(customMonthRange.to) || 6;
                owners = owners.filter(o => o.monthsOwed >= from && o.monthsOwed <= to);
                break;
            default: break;
        }

        if (delinquencySearchTerm) {
            const lowerCaseSearch = delinquencySearchTerm.toLowerCase();
            owners = owners.filter(o => o.name.toLowerCase().includes(lowerCaseSearch) || o.properties.toLowerCase().includes(lowerCaseSearch));
        }

        owners.sort((a, b) => {
            if (a[delinquencySortConfig.key] < b[delinquencySortConfig.key]) return delinquencySortConfig.direction === 'asc' ? -1 : 1;
            if (a[delinquencySortConfig.key] > b[delinquencySortConfig.key]) return delinquencySortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return owners;
    }, [allDelinquentOwners, delinquencyFilterType, customMonthRange, delinquencySearchTerm, delinquencySortConfig]);

    useEffect(() => {
        setSelectedDelinquentOwners(new Set(filteredAndSortedDelinquents.map(o => o.id)));
    }, [filteredAndSortedDelinquents]);

    // --- Handlers ---

    const handleExportIntegral = (format: 'pdf' | 'excel') => {
        const data = integralReportData;
        const headers = [["Propietario", "Propiedad", "Monto Pagado (Bs)", "Tasa Prom. (Bs/$)", "Saldo a Favor (Bs)", "Estado", "Período Solvencia", "Meses Adeudados"]];
        const body = data.map(row => [
            row.name, row.properties,
            row.paidAmount > 0 ? row.paidAmount.toLocaleString('es-VE', {minimumFractionDigits: 2}) : '',
            row.avgRate > 0 ? row.avgRate.toLocaleString('es-VE', {minimumFractionDigits: 2}) : '',
            row.balance > 0 ? row.balance.toLocaleString('es-VE', {minimumFractionDigits: 2}) : '',
            row.status, row.period, row.monthsOwed || ''
        ]);

        const filename = `reporte_integral_${new Date().toISOString().split('T')[0]}`;
        const emissionDate = format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss", { locale: es });
        let periodString = "Período de Pagos: Todos";
        if (integralDateRange.from && integralDateRange.to) {
            periodString = `Período de Pagos: Desde ${format(integralDateRange.from, 'P', { locale: es })} hasta ${format(integralDateRange.to, 'P', { locale: es })}`;
        } else if (integralDateRange.from) {
            periodString = `Período de Pagos: Desde ${format(integralDateRange.from, 'P', { locale: es })}`;
        } else if (integralDateRange.to) {
            periodString = `Período de Pagos: Hasta ${format(integralDateRange.to, 'P', { locale: es })}`;
        }

        if (format === 'pdf') {
            const doc = new jsPDF({ orientation: 'landscape' });
            let startY = 15;
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
            if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);
            doc.setFontSize(14).setFont('helvetica', 'bold').text('Reporte Integral de Propietarios', doc.internal.pageSize.getWidth() / 2, startY + 15, { align: 'center'});
            startY += 25;
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(periodString, 15, startY);
            doc.text(`Fecha de Emisión: ${emissionDate}`, doc.internal.pageSize.getWidth() - 15, startY, { align: 'right'});
            startY += 10;
            (doc as any).autoTable({
                head: headers, body: body, startY: startY,
                headStyles: { fillColor: [30, 80, 180] }, styles: { fontSize: 8, cellPadding: 1.5 },
                columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 7: { halign: 'center' } }
            });
            doc.save(`${filename}.pdf`);
        } else {
             const headerData = [
                ["Reporte Integral de Propietarios"], [periodString], [`Fecha de Emisión: ${emissionDate}`], []
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(headerData);
            XLSX.utils.sheet_add_aoa(worksheet, headers, { origin: "A5" });
            XLSX.utils.sheet_add_json(worksheet, data.map(row => ({
                 "Propietario": row.name, "Propiedad": row.properties, "Monto Pagado (Bs)": row.paidAmount,
                 "Tasa Prom. (Bs/$)": row.avgRate, "Saldo a Favor (Bs)": row.balance, "Estado": row.status,
                 "Período Solvencia": row.period, "Meses Adeudados": row.monthsOwed || ''
            })), { origin: "A6", skipHeader: true });
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Integral");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
    };
    
    const handleExportDelinquency = (format: 'pdf' | 'excel') => {
        const data = filteredAndSortedDelinquents.filter(o => selectedDelinquentOwners.has(o.id));
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "Por favor, seleccione al menos un propietario." });
            return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
        
        doc.setFontSize(10).text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setFontSize(16).setFont('helvetica', 'bold').text("Reporte de Morosidad", pageWidth / 2, margin + 45, { align: 'center' });
        
        const head = includeDelinquencyAmounts 
            ? [['Propietario', 'Propiedades', 'Meses Adeudados', 'Deuda (USD)', 'Deuda (Bs.)']]
            : [['Propietario', 'Propiedades', 'Meses Adeudados']];
        
        const body = data.map(o => {
            const row: (string|number)[] = [o.name, o.properties, o.monthsOwed];
            if (includeDelinquencyAmounts) {
                row.push(`$${o.debtAmountUSD.toFixed(2)}`);
                row.push(`Bs. ${(o.debtAmountUSD * activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`);
            }
            return row;
        });

        if (format === 'pdf') {
            (doc as any).autoTable({
                head: head, body: body, startY: margin + 55, headStyles: { fillColor: [220, 53, 69] },
                styles: { cellPadding: 2, fontSize: 8 },
            });
            doc.save(`reporte_morosidad_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        } else {
             const dataToExport = data.map(o => {
                const baseData = { 'Propietario': o.name, 'Propiedades': o.properties, 'Meses Adeudados': o.monthsOwed };
                if (includeDelinquencyAmounts) {
                    return { ...baseData, 'Deuda (USD)': o.debtAmountUSD, 'Deuda (Bs.)': o.debtAmountUSD * activeRate };
                }
                return baseData;
            });
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Morosidad");
            XLSX.writeFile(workbook, `reporte_morosidad_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        }
    };
    
    const handleSortDelinquency = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (delinquencySortConfig.key === key && delinquencySortConfig.direction === 'asc') direction = 'desc';
        setDelinquencySortConfig({ key, direction });
    };

    const renderSortIcon = (key: SortKey) => {
        if (delinquencySortConfig.key !== key) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
        return delinquencySortConfig.direction === 'asc' ? '▲' : '▼';
    };


    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Consultas y Reportes</h1>
                <p className="text-muted-foreground">Genere y exporte reportes detallados sobre la gestión del condominio.</p>
            </div>
            
            <Tabs defaultValue="integral" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="integral">Reporte Integral</TabsTrigger>
                    <TabsTrigger value="delinquency">Reporte de Morosidad</TabsTrigger>
                </TabsList>
                <TabsContent value="integral">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reporte Integral de Propietarios</CardTitle>
                            <CardDescription>Una vista consolidada del estado financiero de todos los propietarios.</CardDescription>
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
                                <Button variant="outline" onClick={() => handleExportIntegral('pdf')} disabled={generatingReport}>
                                    <FileText className="mr-2 h-4 w-4" /> Exportar a PDF
                                </Button>
                                <Button variant="outline" onClick={() => handleExportIntegral('excel')} disabled={generatingReport}>
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
                                        <TableHead>Período Solvencia</TableHead>
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
                                                <span className={cn('font-semibold', row.status === 'Moroso' ? 'text-destructive' : 'text-green-600')}>{row.status}</span>
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
                 <TabsContent value="delinquency">
                     <Card>
                        <CardHeader>
                            <CardTitle>Reporte Interactivo de Morosidad</CardTitle>
                            <CardDescription>Filtre, seleccione y exporte la lista de propietarios con deudas pendientes.</CardDescription>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 items-end">
                                <div className="space-y-2">
                                    <Label>Antigüedad de Deuda</Label>
                                    <Select value={delinquencyFilterType} onValueChange={setDelinquencyFilterType}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los morosos</SelectItem>
                                            <SelectItem value="2_or_more">2 meses o más</SelectItem>
                                            <SelectItem value="3_exact">Exactamente 3 meses</SelectItem>
                                            <SelectItem value="custom">Rango personalizado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {delinquencyFilterType === 'custom' && (
                                    <div className="md:col-span-2 lg:col-span-1 grid grid-cols-2 gap-2 items-end">
                                        <div className="space-y-2">
                                            <Label>Desde (meses)</Label>
                                            <Input type="number" value={customMonthRange.from} onChange={e => setCustomMonthRange(c => ({...c, from: e.target.value}))} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Hasta (meses)</Label>
                                            <Input type="number" value={customMonthRange.to} onChange={e => setCustomMonthRange(c => ({...c, to: e.target.value}))} />
                                        </div>
                                    </div>
                                )}
                                 <div className="space-y-2 md:col-start-1 lg:col-start-auto">
                                    <Label>Buscar Propietario</Label>
                                     <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input placeholder="Buscar por nombre o propiedad..." className="pl-9" value={delinquencySearchTerm} onChange={e => setDelinquencySearchTerm(e.target.value)} />
                                    </div>
                                </div>
                                 <div className="flex items-center space-x-2">
                                    <Checkbox id="include-amounts" checked={includeDelinquencyAmounts} onCheckedChange={(checked) => setIncludeDelinquencyAmounts(Boolean(checked))} />
                                    <Label htmlFor="include-amounts" className="cursor-pointer">
                                        Incluir montos en el reporte
                                    </Label>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm text-muted-foreground">
                                    Mostrando {filteredAndSortedDelinquents.length} de {allDelinquentOwners.length} propietarios morosos. 
                                    Seleccionados: {selectedDelinquentOwners.size}
                                </p>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => handleExportDelinquency('pdf')}><FileText className="mr-2 h-4 w-4" /> Exportar a PDF</Button>
                                    <Button variant="outline" onClick={() => handleExportDelinquency('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel</Button>
                                </div>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">
                                             <Checkbox 
                                                checked={selectedDelinquentOwners.size === filteredAndSortedDelinquents.length && filteredAndSortedDelinquents.length > 0}
                                                onCheckedChange={(checked) => setSelectedDelinquentOwners(new Set(Boolean(checked) ? filteredAndSortedDelinquents.map(o => o.id) : []))}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <Button variant="ghost" onClick={() => handleSortDelinquency('name')}>
                                                Propietario {renderSortIcon('name')}
                                            </Button>
                                        </TableHead>
                                        <TableHead>Propiedades</TableHead>
                                        <TableHead>
                                             <Button variant="ghost" onClick={() => handleSortDelinquency('monthsOwed')}>
                                                Meses {renderSortIcon('monthsOwed')}
                                            </Button>
                                        </TableHead>
                                        <TableHead className="text-right">
                                             <Button variant="ghost" onClick={() => handleSortDelinquency('debtAmountUSD')}>
                                                Deuda (USD) {renderSortIcon('debtAmountUSD')}
                                            </Button>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAndSortedDelinquents.length > 0 ? (
                                        filteredAndSortedDelinquents.map(owner => (
                                            <TableRow key={owner.id} data-state={selectedDelinquentOwners.has(owner.id) && 'selected'}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedDelinquentOwners.has(owner.id)}
                                                        onCheckedChange={() => {
                                                            const newSelection = new Set(selectedDelinquentOwners);
                                                            if (newSelection.has(owner.id)) newSelection.delete(owner.id);
                                                            else newSelection.add(owner.id);
                                                            setSelectedDelinquentOwners(newSelection);
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">{owner.name}</TableCell>
                                                <TableCell>{owner.properties}</TableCell>
                                                <TableCell>{owner.monthsOwed}</TableCell>
                                                <TableCell className="text-right font-semibold">${owner.debtAmountUSD.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                No se encontraron propietarios con los filtros seleccionados.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                 </TabsContent>
            </Tabs>
        </div>
    );
}

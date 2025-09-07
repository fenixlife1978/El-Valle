
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileDown, Search, ArrowUpDown, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

type DelinquentOwner = {
    id: string;
    name: string;
    properties: string;
    debtAmountUSD: number;
    monthsOwed: number;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type SortKey = 'name' | 'debtAmountUSD' | 'monthsOwed';
type SortDirection = 'asc' | 'desc';

export default function DelinquencyReportPage() {
    const [allDelinquentOwners, setAllDelinquentOwners] = useState<DelinquentOwner[]>([]);
    const [loading, setLoading] = useState(true);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState(0);

    // --- Filtering and Sorting State ---
    const [filterType, setFilterType] = useState('all');
    const [customMonthRange, setCustomMonthRange] = useState({ from: '1', to: '6' });
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: SortDirection }>({ key: 'name', direction: 'asc' });

    // --- Selection State ---
    const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());

    const { toast } = useToast();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch settings
            const settingsRef = doc(db, 'config', 'mainSettings');
            const settingsSnap = await getDoc(settingsRef);
            let rate = 0;
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCompanyInfo(settings.companyInfo);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                rate = activeRateObj ? activeRateObj.rate : (rates[0]?.rate || 0);
                setActiveRate(rate);
            }

            // Fetch owners and debts
            const ownersQuery = query(collection(db, "owners"));
            const debtsQuery = query(collection(db, "debts"), where("status", "==", "pending"));

            const [ownersSnapshot, debtsSnapshot] = await Promise.all([getDocs(ownersQuery), getDocs(debtsQuery)]);

            const ownersMap = new Map();
            ownersSnapshot.forEach(doc => ownersMap.set(doc.id, doc.data()));

            const debtsByOwner = new Map<string, { totalUSD: number, count: number }>();
            debtsSnapshot.forEach(doc => {
                const debt = doc.data();
                const ownerData = debtsByOwner.get(debt.ownerId) || { totalUSD: 0, count: 0 };
                ownerData.totalUSD += debt.amountUSD;
                ownerData.count += 1;
                debtsByOwner.set(debt.ownerId, ownerData);
            });

            const delinquentData: DelinquentOwner[] = [];
            debtsByOwner.forEach((debtInfo, ownerId) => {
                const owner = ownersMap.get(ownerId);
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
            setSelectedOwners(new Set(delinquentData.map(o => o.id)));

        } catch (error) {
            console.error("Error fetching delinquency data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la información de morosidad.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredAndSortedOwners = useMemo(() => {
        let owners = [...allDelinquentOwners];

        // Apply month filter
        switch (filterType) {
            case '2_or_more':
                owners = owners.filter(o => o.monthsOwed >= 2);
                break;
            case '3_exact':
                owners = owners.filter(o => o.monthsOwed === 3);
                break;
            case 'custom':
                const from = parseInt(customMonthRange.from) || 1;
                const to = parseInt(customMonthRange.to) || 6;
                owners = owners.filter(o => o.monthsOwed >= from && o.monthsOwed <= to);
                break;
            default: // 'all'
                break;
        }

        // Apply search term filter
        if (searchTerm) {
            const lowerCaseSearch = searchTerm.toLowerCase();
            owners = owners.filter(o =>
                o.name.toLowerCase().includes(lowerCaseSearch) ||
                o.properties.toLowerCase().includes(lowerCaseSearch)
            );
        }

        // Apply sorting
        owners.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

        return owners;
    }, [allDelinquentOwners, filterType, customMonthRange, searchTerm, sortConfig]);
    
    // Update selection when filters change
    useEffect(() => {
        setSelectedOwners(new Set(filteredAndSortedOwners.map(o => o.id)));
    }, [filteredAndSortedOwners]);


    const handleSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleSelectOwner = (ownerId: string) => {
        const newSelection = new Set(selectedOwners);
        if (newSelection.has(ownerId)) {
            newSelection.delete(ownerId);
        } else {
            newSelection.add(ownerId);
        }
        setSelectedOwners(newSelection);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedOwners(new Set(filteredAndSortedOwners.map(o => o.id)));
        } else {
            setSelectedOwners(new Set());
        }
    };

    const getExportData = () => {
        return filteredAndSortedOwners.filter(o => selectedOwners.has(o.id));
    };

    const handleExportPDF = () => {
        const data = getExportData();
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "Por favor, seleccione al menos un propietario." });
            return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) {
            doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        }
        if (companyInfo) {
            doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9).text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
        }
        doc.setFontSize(10).text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
        
        doc.setFontSize(16).setFont('helvetica', 'bold').text("Reporte de Morosidad", pageWidth / 2, margin + 45, { align: 'center' });

        (doc as any).autoTable({
            head: [['Propietario', 'Propiedades', 'Meses Adeudados', 'Deuda (USD)', 'Deuda (Bs.)']],
            body: data.map(o => [
                o.name,
                o.properties,
                o.monthsOwed,
                `$${o.debtAmountUSD.toFixed(2)}`,
                `Bs. ${(o.debtAmountUSD * activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
            ]),
            startY: margin + 55,
            headStyles: { fillColor: [220, 53, 69] },
            styles: { cellPadding: 2, fontSize: 8 },
        });

        doc.save(`reporte_morosidad_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };

    const handleExportExcel = () => {
        const data = getExportData();
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "Por favor, seleccione al menos un propietario." });
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(data.map(o => ({
            'Propietario': o.name,
            'Propiedades': o.properties,
            'Meses Adeudados': o.monthsOwed,
            'Deuda (USD)': o.debtAmountUSD,
            'Deuda (Bs.)': o.debtAmountUSD * activeRate
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Morosidad");
        XLSX.writeFile(workbook, `reporte_morosidad_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };
    
    const renderSortIcon = (key: SortKey) => {
        if (sortConfig.key !== key) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
        return sortConfig.direction === 'asc' ? '▲' : '▼';
    };


    if (loading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Reporte Interactivo de Morosidad</h1>
                <p className="text-muted-foreground">Filtre, seleccione y exporte la lista de propietarios con deudas pendientes.</p>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Filtros y Controles</CardTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                        <div className="space-y-2">
                            <Label>Antigüedad de Deuda</Label>
                            <Select value={filterType} onValueChange={setFilterType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los morosos</SelectItem>
                                    <SelectItem value="2_or_more">2 meses o más</SelectItem>
                                    <SelectItem value="3_exact">Exactamente 3 meses</SelectItem>
                                    <SelectItem value="custom">Rango personalizado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {filterType === 'custom' && (
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
                                <Input placeholder="Buscar por nombre o propiedad..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-muted-foreground">
                            Mostrando {filteredAndSortedOwners.length} de {allDelinquentOwners.length} propietarios morosos. 
                            Seleccionados: {selectedOwners.size}
                        </p>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline"><FileDown className="mr-2 h-4 w-4" /> Exportar Seleccionados</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={handleExportPDF}>Exportar a PDF</DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportExcel}>Exportar a Excel</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">
                                     <Checkbox 
                                        checked={selectedOwners.size === filteredAndSortedOwners.length && filteredAndSortedOwners.length > 0}
                                        onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                                    />
                                </TableHead>
                                <TableHead>
                                    <Button variant="ghost" onClick={() => handleSort('name')}>
                                        Propietario {renderSortIcon('name')}
                                    </Button>
                                </TableHead>
                                <TableHead>Propiedades</TableHead>
                                <TableHead>
                                     <Button variant="ghost" onClick={() => handleSort('monthsOwed')}>
                                        Meses {renderSortIcon('monthsOwed')}
                                    </Button>
                                </TableHead>
                                <TableHead className="text-right">
                                     <Button variant="ghost" onClick={() => handleSort('debtAmountUSD')}>
                                        Deuda (USD) {renderSortIcon('debtAmountUSD')}
                                    </Button>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAndSortedOwners.length > 0 ? (
                                filteredAndSortedOwners.map(owner => (
                                    <TableRow key={owner.id} data-state={selectedOwners.has(owner.id) && 'selected'}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedOwners.has(owner.id)}
                                                onCheckedChange={() => handleSelectOwner(owner.id)}
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
        </div>
    );
}

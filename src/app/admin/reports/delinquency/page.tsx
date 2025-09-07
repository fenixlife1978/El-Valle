
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search, FileDown, ListTodo, ListX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

type Owner = {
    id: string;
    name: string;
    properties?: { street: string, house: string }[];
};

type Debt = {
    id: string;
    ownerId: string;
    property: { street: string, house: string };
    year: number;
    month: number;
    amountUSD: number;
    description: string;
};

type FullDebt = Debt & {
    ownerName: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const months = [
    { value: '1', label: 'Enero' }, { value: '2', label: 'Febrero' }, { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' }, { value: '5', label: 'Mayo' }, { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' }, { value: '8', label: 'Agosto' }, { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', 'Diciembre': '12' }
];

const years = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));


export default function DelinquencyReportPage() {
    const [allDebts, setAllDebts] = useState<FullDebt[]>([]);
    const [loading, setLoading] = useState(true);
    const [ownersMap, setOwnersMap] = useState<Map<string, Owner>>(new Map());
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState(0);

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDescription, setSelectedDescription] = useState('all');
    const [selectedMonth, setSelectedMonth] = useState('all');
    const [selectedYear, setSelectedYear] = useState('all');

    // Selection state
    const [selectedDebts, setSelectedDebts] = useState<Set<string>>(new Set());

    const { toast } = useToast();

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                // Fetch Company Info & Rate
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    setCompanyInfo(settings.companyInfo);
                    const rates = (settings.exchangeRates || []);
                    const activeRateObj = rates.find((r: any) => r.active);
                    if (activeRateObj) {
                        setActiveRate(activeRateObj.rate);
                    } else if (rates.length > 0) {
                        const sortedRates = [...rates].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        setActiveRate(sortedRates[0].rate);
                    }
                }

                // Fetch Owners
                const ownersQuery = query(collection(db, "owners"));
                const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
                    const newOwnersMap = new Map<string, Owner>();
                    snapshot.forEach(doc => {
                        newOwnersMap.set(doc.id, { id: doc.id, ...doc.data() } as Owner);
                    });
                    setOwnersMap(newOwnersMap);
                });

                // Fetch Debts - Simplified query
                const debtsQuery = query(collection(db, "debts"), where("status", "==", "pending"));
                const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
                    const debtsData = snapshot.docs.map(doc => {
                        const debtData = doc.data();
                        return {
                            id: doc.id,
                            ...debtData,
                            ownerName: ownersMap.get(debtData.ownerId)?.name || 'Propietario no encontrado',
                        } as FullDebt;
                    });
                     // Sort locally
                    const sortedDebts = debtsData.sort((a, b) => {
                        if (b.year !== a.year) return b.year - a.year;
                        return b.month - a.month;
                    });
                    setAllDebts(sortedDebts);
                    setLoading(false);
                });

                return () => {
                    ownersUnsubscribe();
                    debtsUnsubscribe();
                };
            } catch (err) {
                 toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos iniciales.' });
                 setLoading(false);
            }
        };

        fetchInitialData();
    }, [toast, ownersMap]);
    
    const uniqueDescriptions = useMemo(() => {
        const descriptions = new Set(allDebts.map(d => d.description));
        return Array.from(descriptions);
    }, [allDebts]);

    const filteredDebts = useMemo(() => {
        return allDebts.filter(debt => {
            const owner = ownersMap.get(debt.ownerId);
            const ownerName = owner?.name.toLowerCase() || '';
            const lowerCaseSearch = searchTerm.toLowerCase();

            const matchesSearch = searchTerm ? ownerName.includes(lowerCaseSearch) : true;
            const matchesDescription = selectedDescription !== 'all' ? debt.description === selectedDescription : true;
            const matchesMonth = selectedMonth !== 'all' ? String(debt.month) === selectedMonth : true;
            const matchesYear = selectedYear !== 'all' ? String(debt.year) === selectedYear : true;

            return matchesSearch && matchesDescription && matchesMonth && matchesYear;
        });
    }, [allDebts, searchTerm, selectedDescription, selectedMonth, selectedYear, ownersMap]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allIds = new Set(filteredDebts.map(d => d.id));
            setSelectedDebts(allIds);
        } else {
            setSelectedDebts(new Set());
        }
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        const newSet = new Set(selectedDebts);
        if (checked) {
            newSet.add(id);
        } else {
            newSet.delete(id);
        }
        setSelectedDebts(newSet);
    };

    const generatePDF = () => {
        if (selectedDebts.size === 0) {
            toast({ variant: 'destructive', title: 'Sin Selección', description: 'Por favor, seleccione al menos una deuda para generar el reporte.' });
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
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
            doc.text(companyInfo.address, margin + 30, margin + 19);
        }
        
        doc.setFontSize(10).text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);
        
        doc.setFontSize(16).setFont('helvetica', 'bold').text("Reporte de Morosidad Seleccionada", pageWidth / 2, margin + 45, { align: 'center' });

        let totalDebtUSD = 0;
        const body = filteredDebts
            .filter(d => selectedDebts.has(d.id))
            .map(debt => {
                const owner = ownersMap.get(debt.ownerId);
                const properties = owner?.properties?.map(p => `${p.street} - ${p.house}`).join(', ') || 'N/A';
                const period = `${months.find(m => m.value === String(debt.month))?.label} ${debt.year}`;
                totalDebtUSD += debt.amountUSD;
                return [
                    debt.ownerName,
                    properties,
                    period,
                    debt.description,
                    debt.amountUSD.toFixed(2)
                ];
            });
        
        const totalDebtBs = totalDebtUSD * activeRate;

        (doc as any).autoTable({
            head: [['Propietario', 'Propiedad', 'Período', 'Concepto', 'Monto (USD)']],
            body,
            startY: margin + 55,
            headStyles: { fillColor: [220, 53, 69] },
            styles: { cellPadding: 2, fontSize: 8 },
            footStyles: { fontStyle: 'bold' },
            foot: [
                [
                    { content: 'Total Adeudado:', colSpan: 4, styles: { halign: 'right' } },
                    { content: `$${totalDebtUSD.toFixed(2)}`, styles: { halign: 'left' } },
                ],
                [
                    { content: 'Total en Bolívares (Tasa Actual):', colSpan: 4, styles: { halign: 'right' } },
                    { content: `Bs. ${totalDebtBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}`, styles: { halign: 'left' } },
                ]
            ],
        });

        doc.save('reporte_morosidad_seleccionada.pdf');
    };

    if (loading) {
        return (
           <div className="flex justify-center items-center h-64">
               <Loader2 className="h-10 w-10 animate-spin text-primary" />
           </div>
       );
   }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Reporte de Morosidad Interactivo</h1>
                <p className="text-muted-foreground">Filtre, seleccione y excluya deudas para generar reportes personalizados.</p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar por propietario..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <Select value={selectedDescription} onValueChange={setSelectedDescription}>
                            <SelectTrigger><SelectValue placeholder="Filtrar por concepto..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los conceptos</SelectItem>
                                {uniqueDescriptions.map(desc => <SelectItem key={desc} value={desc}>{desc}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger><SelectValue placeholder="Filtrar por mes..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los meses</SelectItem>
                                {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger><SelectValue placeholder="Filtrar por año..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los años</SelectItem>
                                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                           <Button variant="outline" size="sm" onClick={() => handleSelectAll(true)}><ListTodo className="mr-2 h-4 w-4" /> Seleccionar Todo</Button>
                           <Button variant="outline" size="sm" onClick={() => handleSelectAll(false)}><ListX className="mr-2 h-4 w-4" /> Deseleccionar Todo</Button>
                        </div>
                        <Button onClick={generatePDF}>
                            <FileDown className="mr-2 h-4 w-4" /> Generar Reporte PDF
                        </Button>
                    </div>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px] text-center">
                                        <Checkbox 
                                            onCheckedChange={handleSelectAll}
                                            checked={selectedDebts.size > 0 && selectedDebts.size === filteredDebts.length}
                                            aria-label="Seleccionar todo"
                                        />
                                    </TableHead>
                                    <TableHead>Propietario</TableHead>
                                    <TableHead>Período</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Monto (USD)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredDebts.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">No se encontraron deudas con los filtros aplicados.</TableCell></TableRow>
                                ) : (
                                    filteredDebts.map(debt => (
                                        <TableRow key={debt.id} data-state={selectedDebts.has(debt.id) ? 'selected' : ''}>
                                            <TableCell className="text-center">
                                                <Checkbox onCheckedChange={(checked) => handleSelectRow(debt.id, !!checked)} checked={selectedDebts.has(debt.id)} />
                                            </TableCell>
                                            <TableCell>{debt.ownerName}</TableCell>
                                            <TableCell>{months.find(m => m.value === String(debt.month))?.label} {debt.year}</TableCell>
                                            <TableCell>{debt.description}</TableCell>
                                            <TableCell className="text-right font-medium">${debt.amountUSD.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                     <div className="text-right mt-4 font-semibold">
                        {selectedDebts.size} deuda(s) seleccionada(s)
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

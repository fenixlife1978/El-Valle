

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from "@/lib/utils";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search, Loader2, FileText, FileSpreadsheet, ArrowUpDown, Building, BadgeInfo, BadgeCheck, BadgeX, History } from "lucide-react";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { collection, getDocs, query, where, doc, getDoc, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';


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
  beneficiaries: { ownerId: string; street?: string; house?: string; amount: number;}[];
  status: 'aprobado' | 'pendiente' | 'rechazado';
  reportedBy: string;
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
    paymentDate?: Timestamp;
    property: { street: string, house: string };
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
    lastPaymentDate: string;
    paidAmount: number;
    avgRate: number;
    balance: number;
    status: 'Solvente' | 'No Solvente';
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

type BalanceOwner = {
    id: string;
    name: string;
    properties: string;
    balance: number;
    lastMovement: string;
};

type TransactionHistoryItem = (Debt & { type: 'debt' }) | (Payment & { type: 'payment' });


const monthsLocale: { [key: number]: string } = {
    1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun',
    7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic'
};

type SortKey = 'name' | 'debtAmountUSD' | 'monthsOwed';
type SortDirection = 'asc' | 'desc';

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) {
        return '0,00';
    }
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Custom Label for Bar Charts
const CustomBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    return (
        <text x={x + width / 2} y={y} fill="#fff" textAnchor="middle" dy={-6} fontSize="12" fontWeight="bold">
            {`$${Math.round(value)}`}
        </text>
    );
};


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
    
    // State for Individual Report
    const [individualSearchTerm, setIndividualSearchTerm] = useState('');
    const [selectedIndividual, setSelectedIndividual] = useState<Owner | null>(null);
    const [individualHistory, setIndividualHistory] = useState<TransactionHistoryItem[]>([]);
    const [individualDebtUSD, setIndividualDebtUSD] = useState(0);

    // State for Balance Report
    const [balanceOwners, setBalanceOwners] = useState<BalanceOwner[]>([]);
    const [balanceSearchTerm, setBalanceSearchTerm] = useState('');

    // State for Charts
    const [chartsDateRange, setChartsDateRange] = useState<{ from?: Date; to?: Date }>({});


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const ownersQuery = query(collection(db, 'owners'), where('name', '!=', 'EDWIN AGUIAR'));
            const paymentsQuery = query(collection(db, 'payments'));
            const debtsQuery = query(collection(db, 'debts'));
            const historicalPaymentsQuery = query(collection(db, 'historical_payments'));
            
            const [settingsSnap, ownersSnapshot, paymentsSnapshot, debtsSnapshot, historicalPaymentsSnapshot] = await Promise.all([
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

            const paymentsData = paymentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
            setAllPayments(paymentsData);
            
            const debtsData = debtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
            setAllDebts(debtsData);
            setAllHistoricalPayments(historicalPaymentsSnapshot.docs.map(d => d.data() as HistoricalPayment));

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

            // --- Balance Report Data Calculation ---
            const ownersWithBalance = ownersData.filter(o => o.balance > 0);
            const balanceReportData = ownersWithBalance.map(owner => {
                const ownerPayments = paymentsData.filter(p => p.beneficiaries.some(b => b.ownerId === owner.id));
                const lastPayment = ownerPayments.sort((a,b) => b.paymentDate.toMillis() - a.paymentDate.toMillis())[0];
                return {
                    id: owner.id,
                    name: owner.name,
                    properties: (owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', '),
                    balance: owner.balance,
                    lastMovement: lastPayment ? format(lastPayment.paymentDate.toDate(), 'dd/MM/yyyy') : 'N/A'
                };
            });
            setBalanceOwners(balanceReportData);

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

        const getSortKeys = (owner: Owner) => {
            const prop = (owner.properties && owner.properties.length > 0) ? owner.properties[0] : { street: 'N/A', house: 'N/A' };
            const streetNum = parseInt(String(prop.street || '').replace('Calle ', '') || '999');
            const houseNum = parseInt(String(prop.house || '').replace('Casa ', '') || '999');
            return { streetNum, houseNum };
        };

        const sortedOwners = [...owners].sort((a, b) => {
            const aKeys = getSortKeys(a);
            const bKeys = getSortKeys(b);
            if (aKeys.streetNum !== bKeys.streetNum) {
                return aKeys.streetNum - bKeys.streetNum;
            }
            return aKeys.houseNum - bKeys.houseNum;
        });

        return sortedOwners.map(owner => {
            const ownerDebts = allDebts.filter(d => d.ownerId === owner.id);
            const ownerHistorical = allHistoricalPayments.filter(h => h.ownerId === owner.id);
            
            const pendingDebts = ownerDebts.filter(d => {
                if (d.status !== 'pending') return false;
                
                if (d.description.toLowerCase().includes('ajuste')) {
                    const debtDate = new Date(d.year, d.month - 1);
                    const currentDate = new Date(currentYear, currentMonth - 1);
                    return debtDate <= currentDate;
                }
                return true;
            });
            
            let status: 'Solvente' | 'No Solvente' = pendingDebts.length > 0 ? 'No Solvente' : 'Solvente';
            let period = '';

            if (status === 'No Solvente') {
                const sortedPending = [...pendingDebts].sort((a,b) => a.year - b.year || a.month - a.month);
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
                const isOwnerPayment = p.beneficiaries.some(b => b.ownerId === owner.id) && p.status === 'aprobado';
                if (!isOwnerPayment) return false;

                const paymentDate = p.paymentDate.toDate();
                if (fromDate && paymentDate < fromDate) return false;
                if (toDate && paymentDate > toDate) return false;
                return true;
            });

            const totalPaid = ownerPayments.reduce((sum, p) => sum + p.totalAmount, 0);
            const totalRateWeight = ownerPayments.reduce((sum, p) => sum + ((p.exchangeRate || 0) * p.totalAmount), 0);
            const avgRate = totalPaid > 0 ? totalRateWeight / totalPaid : 0;
            
            let lastPaymentDate = '';
            if(ownerPayments.length > 0) {
                const lastPayment = ownerPayments.sort((a,b) => b.paymentDate.toMillis() - a.paymentDate.toMillis())[0];
                lastPaymentDate = format(lastPayment.paymentDate.toDate(), 'dd/MM/yyyy');
            }

            return {
                ownerId: owner.id,
                name: owner.name,
                properties: (owner.properties || []).map(p => `${p.street}-${p.house}`).join(', '),
                lastPaymentDate,
                paidAmount: totalPaid,
                avgRate: avgRate,
                balance: owner.balance,
                status,
                period,
                monthsOwed: status === 'No Solvente' ? pendingDebts.length : undefined,
            };
        }).filter(row => {
            const statusMatch = integralStatusFilter === 'todos' || row.status.toLowerCase().replace(' ', '') === integralStatusFilter.toLowerCase().replace(' ', '');
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

     const debtsByStreetChartData = useMemo(() => {
        const fromDate = chartsDateRange.from;
        const toDate = chartsDateRange.to;
        if(fromDate) fromDate.setHours(0,0,0,0);
        if(toDate) toDate.setHours(23,59,59,999);

        const filteredDebts = allDebts.filter(debt => {
            if (debt.status !== 'pending') return false;
            // Use optional chaining to safely access property
            const street = debt.property?.street;
            if (!street) return false;

            const debtDate = new Date(debt.year, debt.month - 1);
            if (fromDate && debtDate < fromDate) return false;
            if (toDate && debtDate > toDate) return false;
            return true;
        });

        const debtsByStreet = filteredDebts.reduce((acc, debt) => {
            // This check is now safe due to the filter above
            const street = debt.property.street;
            if (!acc[street]) acc[street] = 0;
            acc[street] += debt.amountUSD;
            return acc;
        }, {} as { [key: string]: number });
        
        return Object.entries(debtsByStreet).map(([name, TotalDeuda]) => ({ name, TotalDeuda: parseFloat(TotalDeuda.toFixed(2)) }))
            .sort((a, b) => {
                const streetNumA = parseInt(a.name.replace('Calle ', ''));
                const streetNumB = parseInt(b.name.replace('Calle ', ''));
                return streetNumA - streetNumB;
            });
    }, [allDebts, chartsDateRange]);

    const incomeByStreetChartData = useMemo(() => {
        const fromDate = chartsDateRange.from;
        const toDate = chartsDateRange.to;
        if(fromDate) fromDate.setHours(0,0,0,0);
        if(toDate) toDate.setHours(23,59,59,999);

        const filteredPayments = allPayments.filter(payment => {
            if (payment.status !== 'aprobado') return false;
            const paymentDate = payment.paymentDate.toDate();
            if (fromDate && paymentDate < fromDate) return false;
            if (toDate && paymentDate > toDate) return false;
            return true;
        });
        
        const incomeByStreet = filteredPayments.reduce((acc, payment) => {
            payment.beneficiaries.forEach(beneficiary => {
                if (beneficiary.street) {
                    if (!acc[beneficiary.street]) acc[beneficiary.street] = 0;
                    // Approximate income in USD
                    const incomeUSD = beneficiary.amount / (payment.exchangeRate || activeRate || 1);
                    acc[beneficiary.street] += incomeUSD;
                }
            });
            return acc;
        }, {} as { [key: string]: number });

        return Object.entries(incomeByStreet).map(([name, TotalIngresos]) => ({ name, TotalIngresos: parseFloat(TotalIngresos.toFixed(2)) }))
            .sort((a, b) => {
                const streetNumA = parseInt(a.name.replace('Calle ', ''));
                const streetNumB = parseInt(b.name.replace('Calle ', ''));
                return streetNumA - streetNumB;
            });
    }, [allPayments, chartsDateRange, activeRate]);


    useEffect(() => {
        setSelectedDelinquentOwners(new Set(filteredAndSortedDelinquents.map(o => o.id)));
    }, [filteredAndSortedDelinquents]);

    const filteredIndividualOwners = useMemo(() => {
        if (!individualSearchTerm) return [];
        return owners.filter(o => o.name.toLowerCase().includes(individualSearchTerm.toLowerCase()));
    }, [individualSearchTerm, owners]);

    const filteredBalanceOwners = useMemo(() => {
        if (!balanceSearchTerm) return balanceOwners;
        return balanceOwners.filter(o => o.name.toLowerCase().includes(balanceSearchTerm.toLowerCase()));
    }, [balanceSearchTerm, balanceOwners]);

    // --- Handlers ---

    const handleSelectIndividual = (owner: Owner) => {
        setSelectedIndividual(owner);
        setIndividualSearchTerm('');

        const ownerDebts = allDebts.filter(d => d.ownerId === owner.id);
        const ownerPayments = allPayments.filter(p => p.beneficiaries.some(b => b.ownerId === owner.id) && p.status === 'aprobado').map(p => ({ ...p, type: 'payment' as const }));
        
        const combinedHistory: any[] = [
            ...ownerDebts.map(d => ({ ...d, type: 'debt' as const })),
            ...ownerPayments
        ];

        combinedHistory.sort((a, b) => {
            const dateA = a.type === 'debt' ? new Date(a.year, a.month-1) : a.paymentDate.toDate();
            const dateB = b.type === 'debt' ? new Date(b.year, b.month-1) : b.paymentDate.toDate();
            return dateA.getTime() - dateB.getTime();
        });

        setIndividualHistory(combinedHistory as TransactionHistoryItem[]);

        const totalDebt = ownerDebts.filter(d => d.status === 'pending').reduce((acc, debt) => acc + debt.amountUSD, 0);
        setIndividualDebtUSD(totalDebt);
    };

    const handleExportIntegral = (formatType: 'pdf' | 'excel') => {
        const data = integralReportData;
        const headers = [["Propietario", "Propiedad", "Fecha Últ. Pago", "Monto Pagado (Bs)", "Tasa Prom. (Bs/$)", "Saldo a Favor (Bs)", "Estado", "Período Solvencia", "Meses Adeudados"]];
        const body = data.map(row => [
            row.name, row.properties, row.lastPaymentDate,
            row.paidAmount > 0 ? formatToTwoDecimals(row.paidAmount) : '',
            row.avgRate > 0 ? formatToTwoDecimals(row.avgRate) : '',
            row.balance > 0 ? formatToTwoDecimals(row.balance) : '',
            row.status, row.period, row.monthsOwed || ''
        ]);

        const filename = `reporte_integral_${new Date().toISOString().split('T')[0]}`;
        const emissionDate = format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss");
        let periodString = "Período de Pagos: Todos";
        if (integralDateRange.from && integralDateRange.to) {
            periodString = `Período de Pagos: Desde ${format(integralDateRange.from, 'P', { locale: es })} hasta ${format(integralDateRange.to, 'P', { locale: es })}`;
        } else if (integralDateRange.from) {
            periodString = `Período de Pagos: Desde ${format(integralDateRange.from, 'P', { locale: es })}`;
        } else if (integralDateRange.to) {
            periodString = `Período de Pagos: Hasta ${format(integralDateRange.to, 'P', { locale: es })}`;
        }

        if (formatType === 'pdf') {
            const doc = new jsPDF({ orientation: 'portrait' });
            const pageWidth = doc.internal.pageSize.getWidth();
            let startY = 15;
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
            if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);

            doc.setFontSize(16).setFont('helvetica', 'bold').text('Reporte Integral de Propietarios', pageWidth / 2, startY + 15, { align: 'center'});
            
            startY += 25;
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(periodString, 15, startY);
            doc.text(`Fecha de Emisión: ${emissionDate}`, pageWidth - 15, startY, { align: 'right'});
            
            startY += 10;
            
            (doc as any).autoTable({
                head: headers, body: body, startY: startY,
                headStyles: { fillColor: [30, 80, 180] }, 
                styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
                 columnStyles: { 
                    0: { cellWidth: 30 },
                    1: { cellWidth: 25 },
                    2: { cellWidth: 20 },
                    3: { halign: 'right', cellWidth: 20 },
                    4: { halign: 'right', cellWidth: 20 }, 
                    5: { halign: 'right', cellWidth: 20 },
                    6: { cellWidth: 20 },
                    7: { cellWidth: 'auto' },
                    8: { halign: 'center', cellWidth: 15 } 
                }
            });
            doc.save(`${filename}.pdf`);
        } else {
             const headerData = [
                ["Reporte Integral de Propietarios"], [periodString], [`Fecha de Emisión: ${emissionDate}`], []
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(headerData);
            XLSX.utils.sheet_add_aoa(worksheet, headers, { origin: "A5" });
            XLSX.utils.sheet_add_json(worksheet, data.map(row => ({
                 "Propietario": row.name, "Propiedad": row.properties, "Fecha Últ. Pago": row.lastPaymentDate, "Monto Pagado (Bs)": row.paidAmount,
                 "Tasa Prom. (Bs/$)": row.avgRate, "Saldo a Favor (Bs)": row.balance, "Estado": row.status,
                 "Período Solvencia": row.period, "Meses Adeudados": row.monthsOwed || ''
            })), { origin: "A6", skipHeader: true });
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Integral");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
    };
    
    const handleExportDelinquency = (formatType: 'pdf' | 'excel') => {
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
                row.push(`Bs. ${formatToTwoDecimals(o.debtAmountUSD * activeRate)}`);
            }
            return row;
        });

        if (formatType === 'pdf') {
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

    const handleExportIndividual = (formatType: 'pdf' | 'excel') => {
        if (!selectedIndividual || !companyInfo) return;
    
        const filename = `estado_cuenta_${selectedIndividual.name.replace(/\s/g, '_')}`;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        // --- Header ---
        if (companyInfo.logo) {
            try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 20, 20); } 
            catch (e) { console.error("Error adding logo to PDF:", e); }
        }
        doc.setFontSize(16).setFont('helvetica', 'bold').text('ESTADO DE CUENTA', pageWidth - margin, margin + 8, { align: 'right'});
        
        doc.setFontSize(9).setFont('helvetica', 'normal');
        doc.text(`${companyInfo.name} | ${companyInfo.rif}`, margin, margin + 25);
        doc.text(`Propietario: ${selectedIndividual.name}`, margin, margin + 30);
        doc.text(`Propiedad(es): ${(selectedIndividual.properties || []).map(p => `${p.street}-${p.house}`).join(', ')}`, margin, margin + 35);
        
        const dateText = `Fecha: ${format(new Date(), "dd/MM/yyyy")}`;
        const rateText = `Tasa del día: ${formatToTwoDecimals(activeRate)}`;
        
        doc.setFontSize(9).setFont('helvetica', 'normal');
        doc.text(dateText, pageWidth - margin, margin + 30, { align: 'right'});

        doc.setFont('helvetica', 'bold').setTextColor(255, 0, 0);
        doc.text(rateText, pageWidth - margin, margin + 35, { align: 'right'});
        doc.setTextColor(0, 0, 0);
        
        let startY = margin + 45;

        // --- Payment Summary ---
        const approvedPayments = allPayments.filter(p => p.beneficiaries.some(b => b.ownerId === selectedIndividual.id) && p.status === 'aprobado');
        let totalPaidBs = approvedPayments.reduce((sum, p) => sum + p.totalAmount, 0);
        
        if (approvedPayments.length > 0) {
            doc.setFontSize(11).setFont('helvetica', 'bold').text('Resumen de Pagos', margin, startY);
            startY += 7;
            const paymentBody = approvedPayments.map(p => {
                const totalAmountUSD = (p.totalAmount / (p.exchangeRate || activeRate || 1));
                const beneficiary = p.beneficiaries.find(b => b.ownerId === selectedIndividual.id);
                const paymentAmount = beneficiary ? beneficiary.amount : p.totalAmount;
                const concept = p.beneficiaries.length > 1 ? `Pago Múltiple` : `Pago Cuota(s)`;

                return [
                    format(p.paymentDate.toDate(), 'dd-MM-yyyy'),
                    concept,
                    p.reportedBy === selectedIndividual.id ? 'Propietario' : 'Administrador', // Who paid
                    `Bs. ${formatToTwoDecimals(paymentAmount)}`,
                ]
            });
            (doc as any).autoTable({
                head: [['Fecha', 'Concepto', 'Pagado por', 'Monto (Bs)']], 
                body: paymentBody,
                startY: startY, 
                theme: 'striped', 
                headStyles: { fillColor: [22, 102, 102] }, // Teal header
                styles: { fontSize: 8 },
                foot: [[ { content: 'Total Pagado', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } }, { content: `Bs. ${formatToTwoDecimals(totalPaidBs)}`, styles: { fontStyle: 'bold' } } ]],
                footStyles: { fillColor: [22, 102, 102], textColor: 255 }
            });
            startY = (doc as any).lastAutoTable.finalY + 10;
        }

        // --- Debt Summary ---
        const ownerDebts = allDebts.filter(d => d.ownerId === selectedIndividual.id);
        const totalDebtUsd = ownerDebts.filter(d => d.status === 'pending').reduce((acc, d) => acc + d.amountUSD, 0);
        
        if (ownerDebts.length > 0) {
            doc.setFontSize(11).setFont('helvetica', 'bold').text('Resumen de Deudas', margin, startY);
            startY += 7;
            const debtBody = ownerDebts
                .sort((a,b) => b.year - a.year || b.month - a.month) // Sort descending
                .map(d => [
                `${Object.values(monthsLocale)[d.month -1] || ''} ${d.year}`,
                `$${d.amountUSD.toFixed(2)}`,
                `Bs. ${formatToTwoDecimals(d.amountUSD * activeRate)}`,
                d.status === 'paid' ? 'Pagada' : 'Pendiente'
            ]);
            (doc as any).autoTable({
                head: [['Período', 'Monto ($)', 'Monto (Bs.)', 'Estado']], 
                body: debtBody,
                startY: startY, 
                theme: 'striped', 
                headStyles: { fillColor: [22, 102, 102] }, // Teal header
                styles: { fontSize: 8 },
                foot: [[ { content: 'Total Adeudado', colSpan: 1, styles: { halign: 'right', fontStyle: 'bold' } }, 
                         { content: `$${totalDebtUsd.toFixed(2)}`, styles: { fontStyle: 'bold' } },
                         { content: `Bs. ${formatToTwoDecimals(totalDebtUsd * activeRate)}`, styles: { fontStyle: 'bold' } },
                         ''
                      ]],
                footStyles: { fillColor: [22, 102, 102], textColor: 255 }
            });
            startY = (doc as any).lastAutoTable.finalY + 10;
        }

        // --- Balance Footer ---
        doc.setFontSize(11).setFont('helvetica', 'bold');
        doc.text(`Saldo a Favor Actual: Bs. ${formatToTwoDecimals(selectedIndividual.balance)}`, margin, startY);
        startY += 10;

        // --- Legal Disclaimer ---
        doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(255, 0, 0);
        const disclaimer = "Los montos en bolívares expresados en las deudas, son producto de la conversión aplicada a la tasa del día de hoy por lo que dichos montos variarán según vaya cambiando la tasa al día de pago.";
        const splitDisclaimer = doc.splitTextToSize(disclaimer, pageWidth - margin * 2);
        doc.text(splitDisclaimer, margin, startY);
        doc.setTextColor(0,0,0);
        doc.setFont('helvetica', 'normal');

        doc.save(`${filename}.pdf`);
    };
    
    const handleExportBalance = (formatType: 'pdf' | 'excel') => {
        const data = filteredBalanceOwners;
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "No hay propietarios con saldo a favor." });
            return;
        }

        const filename = `reporte_saldos_favor_${format(new Date(), 'yyyy-MM-dd')}`;
        const head = [['Propietario', 'Propiedades', 'Fecha Últ. Movimiento', 'Saldo a Favor (Bs.)']];
        const body = data.map(o => [o.name, o.properties, o.lastMovement, `Bs. ${formatToTwoDecimals(o.balance)}`]);

        if (formatType === 'pdf') {
            const doc = new jsPDF();
            doc.setFontSize(16).setFont('helvetica', 'bold').text("Reporte de Saldos a Favor", doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
            (doc as any).autoTable({
                head: head,
                body: body,
                startY: 30,
                headStyles: { fillColor: [22, 163, 74] }, // Green color
            });
            doc.save(`${filename}.pdf`);
        } else { // excel
            const worksheet = XLSX.utils.json_to_sheet(data.map(o => ({
                'Propietario': o.name,
                'Propiedades': o.properties,
                'Fecha Últ. Movimiento': o.lastMovement,
                'Saldo a Favor (Bs.)': o.balance
            })));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Saldos a Favor");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
    };

    const handleExportChart = async (chartId: string, title: string, formatType: 'pdf' | 'excel') => {
        const chartElement = document.getElementById(chartId);
        if (!chartElement) return;

        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(chartElement, { backgroundColor: '#1f2937' }); // Match dark bg
        const imgData = canvas.toDataURL('image/png');
        const filename = `${title.toLowerCase().replace(/\s/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}`;
        const data = chartId === 'debt-chart-container' ? debtsByStreetChartData : incomeByStreetChartData;

        if (formatType === 'pdf') {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;

            // PDF Header
            if (companyInfo?.logo) {
                try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 20, 20); } 
                catch (e) { console.error("Error adding logo to PDF:", e); }
            }
            if (companyInfo) {
                doc.setFontSize(10).setFont('helvetica', 'bold').text(companyInfo.name, margin + 25, margin + 8);
                doc.setFontSize(8).setFont('helvetica', 'normal').text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 25, margin + 13);
            }
            doc.setFontSize(8).setFont('helvetica', 'normal').text(`Fecha de Emisión: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - margin, margin + 8, { align: 'right'});
            
            // PDF Title
            doc.setFontSize(14).setFont('helvetica', 'bold').text(title, pageWidth / 2, margin + 40, { align: 'center' });
            
            // Add Chart Image
            const imgWidth = pageWidth - (margin * 2);
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            doc.addImage(imgData, 'PNG', margin, margin + 50, imgWidth, imgHeight);

            doc.save(`${filename}.pdf`);
        } else { // excel
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Datos del Gráfico");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
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
                <h1 className="text-3xl font-bold font-headline">Módulo de Informes</h1>
                <p className="text-muted-foreground">Genere y exporte reportes detallados sobre la gestión del condominio.</p>
            </div>
            
            <Tabs defaultValue="integral" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5 h-auto flex-wrap">
                    <TabsTrigger value="integral">Integral</TabsTrigger>
                    <TabsTrigger value="individual">Ficha Individual</TabsTrigger>
                    <TabsTrigger value="delinquency">Morosidad</TabsTrigger>
                    <TabsTrigger value="balance">Saldos a Favor</TabsTrigger>
                    <TabsTrigger value="charts">Gráficos</TabsTrigger>
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
                                            <SelectItem value="nosolvente">No Solvente</SelectItem>
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
                                        <TableHead>Fecha Últ. Pago</TableHead>
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
                                            <TableCell>{row.lastPaymentDate}</TableCell>
                                            <TableCell className="text-right">{row.paidAmount > 0 ? `Bs. ${formatToTwoDecimals(row.paidAmount)}`: ''}</TableCell>
                                            <TableCell className="text-right">{row.avgRate > 0 ? `Bs. ${formatToTwoDecimals(row.avgRate)}`: ''}</TableCell>
                                            <TableCell className="text-right">{row.balance > 0 ? `Bs. ${formatToTwoDecimals(row.balance)}`: ''}</TableCell>
                                            <TableCell>
                                                <span className={cn('font-semibold', row.status === 'No Solvente' ? 'text-destructive' : 'text-green-600')}>{row.status}</span>
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

                 <TabsContent value="individual">
                     <Card>
                        <CardHeader>
                            <CardTitle>Ficha de Estado de Cuenta Individual</CardTitle>
                            <CardDescription>Busque un propietario para ver su estado de cuenta detallado.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar por nombre..." className="pl-9" value={individualSearchTerm} onChange={e => setIndividualSearchTerm(e.target.value)} />
                            </div>
                            {individualSearchTerm && filteredIndividualOwners.length > 0 && (
                                <Card className="border rounded-md">
                                    <ScrollArea className="h-48">
                                        {filteredIndividualOwners.map(owner => (
                                            <div key={owner.id} onClick={() => handleSelectIndividual(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                                <p className="font-medium">{owner.name}</p>
                                                <p className="text-sm text-muted-foreground">{(owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}</p>
                                            </div>
                                        ))}
                                    </ScrollArea>
                                </Card>
                            )}

                            {selectedIndividual && (
                                <Card className="mt-4 bg-card-foreground/5 dark:bg-card-foreground/5">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle>{selectedIndividual.name}</CardTitle>
                                                <CardDescription>{(selectedIndividual.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}</CardDescription>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" onClick={() => handleExportIndividual('pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Card>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium">Deuda Total (USD)</CardTitle>
                                                    <BadgeX className="h-4 w-4 text-destructive" />
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-destructive">${individualDebtUSD.toFixed(2)}</div>
                                                </CardContent>
                                            </Card>
                                             <Card>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium">Saldo a Favor (Bs)</CardTitle>
                                                    <BadgeCheck className="h-4 w-4 text-green-500" />
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-green-500">Bs. {formatToTwoDecimals(selectedIndividual.balance)}</div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2 flex items-center"><History className="mr-2 h-5 w-5"/> Historial de Cuenta</h3>
                                            <ScrollArea className="h-96 border rounded-md">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Fecha</TableHead>
                                                            <TableHead>Concepto</TableHead>
                                                            <TableHead className="text-right">Monto (USD)</TableHead>
                                                            <TableHead className="text-right">Monto (Bs)</TableHead>
                                                            <TableHead className="text-right">Estado</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                    {individualHistory.map((item, index) => {
                                                        if (item.type === 'debt') {
                                                            const date = `${monthsLocale[item.month]} ${item.year}`;
                                                            return (
                                                                <TableRow key={`debt-${item.id}-${index}`}>
                                                                    <TableCell>{date}</TableCell>
                                                                    <TableCell>{item.description}</TableCell>
                                                                    <TableCell className="text-right">${formatToTwoDecimals(item.amountUSD)}</TableCell>
                                                                    <TableCell className="text-right text-destructive">- Bs. {formatToTwoDecimals(item.amountUSD * activeRate)}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        {item.status === 'paid' ? <Badge variant="success">Pagada</Badge> : <Badge variant="destructive">Pendiente</Badge>}
                                                                    </TableCell>
                                                                </TableRow>
                                                            )
                                                        } else {
                                                            const paymentRate = item.exchangeRate || activeRate;
                                                            return (
                                                                <TableRow key={`payment-${item.id}-${index}`}>
                                                                    <TableCell>{format(item.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                                                    <TableCell>Pago Aprobado</TableCell>
                                                                    <TableCell className="text-right">${formatToTwoDecimals(item.beneficiaries[0].amount / paymentRate)}</TableCell>
                                                                    <TableCell className="text-right text-green-500">+ Bs. {formatToTwoDecimals(item.beneficiaries[0].amount)}</TableCell>
                                                                    <TableCell className="text-right"><Badge variant="outline">Aplicado</Badge></TableCell>
                                                                </TableRow>
                                                            )
                                                        }
                                                    })}
                                                    </TableBody>
                                                </Table>
                                            </ScrollArea>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
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
                                            <TableRow key={owner.id} data-state={selectedDelinquentOwners.has(owner.id) ? 'selected' : undefined}>
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

                 <TabsContent value="balance">
                     <Card>
                        <CardHeader>
                            <CardTitle>Consulta de Saldos a Favor</CardTitle>
                            <CardDescription>Lista de todos los propietarios con saldo positivo en sus cuentas.</CardDescription>
                             <div className="flex items-center justify-between mt-4">
                                <div className="relative max-w-sm">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Buscar por propietario..." className="pl-9" value={balanceSearchTerm} onChange={e => setBalanceSearchTerm(e.target.value)} />
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => handleExportBalance('pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                    <Button variant="outline" onClick={() => handleExportBalance('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Propietario</TableHead>
                                        <TableHead>Propiedades</TableHead>
                                        <TableHead>Fecha Últ. Movimiento</TableHead>
                                        <TableHead className="text-right">Saldo (Bs.)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredBalanceOwners.length > 0 ? (
                                        filteredBalanceOwners.map(owner => (
                                            <TableRow key={owner.id}>
                                                <TableCell className="font-medium">{owner.name}</TableCell>
                                                <TableCell>{owner.properties}</TableCell>
                                                <TableCell>{owner.lastMovement}</TableCell>
                                                <TableCell className="text-right font-bold text-green-500">Bs. {formatToTwoDecimals(owner.balance)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay propietarios con saldo a favor.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                     </Card>
                 </TabsContent>

                 <TabsContent value="charts">
                     <Card>
                        <CardHeader>
                            <CardTitle>Gráficos de Gestión</CardTitle>
                            <CardDescription>Visualizaciones de datos clave del condominio, filtradas por período.</CardDescription>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Desde</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !chartsDateRange.from && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {chartsDateRange.from ? format(chartsDateRange.from, "PPP", { locale: es }) : <span>Seleccione fecha de inicio</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={chartsDateRange.from} onSelect={d => setChartsDateRange(prev => ({ ...prev, from: d }))} /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label>Hasta</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !chartsDateRange.to && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {chartsDateRange.to ? format(chartsDateRange.to, "PPP", { locale: es }) : <span>Seleccione fecha final</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={chartsDateRange.to} onSelect={d => setChartsDateRange(prev => ({ ...prev, to: d }))} /></PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-8">
                             <div id="debt-chart-container" className="p-4 bg-gray-800 text-white rounded-lg">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold">Deuda Pendiente por Calle (USD)</h3>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => handleExportChart('debt-chart-container', 'Gráfico de Deuda por Calle (USD)', 'pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                        <Button size="sm" variant="outline" onClick={() => handleExportChart('debt-chart-container', 'Gráfico de Deuda por Calle (USD)', 'excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                                    </div>
                                </div>
                                {debtsByStreetChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart data={debtsByStreetChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} />
                                        <YAxis stroke="#a1a1aa" fontSize={12}/>
                                        <Tooltip 
                                            cursor={{fill: 'rgba(255, 255, 255, 0.1)'}}
                                            contentStyle={{ backgroundColor: '#374151', border: 'none', color: '#fff', borderRadius: '0.5rem' }}
                                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Deuda Total']}
                                        />
                                        <Bar dataKey="TotalDeuda" fill="#dc2626" name="Deuda Total (USD)" radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="TotalDeuda" content={<CustomBarLabel />} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-400 py-8">No hay datos de deuda para mostrar en el período seleccionado.</p>
                                )}
                             </div>
                             <div id="income-chart-container" className="p-4 bg-gray-800 text-white rounded-lg">
                                <div className="flex justify-between items-center mb-4">
                                     <h3 className="font-semibold">Ingresos por Calle (USD)</h3>
                                      <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => handleExportChart('income-chart-container', 'Gráfico de Ingresos por Calle (USD)', 'pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                        <Button size="sm" variant="outline" onClick={() => handleExportChart('income-chart-container', 'Gráfico de Ingresos por Calle (USD)', 'excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                                    </div>
                                </div>
                                {incomeByStreetChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart data={incomeByStreetChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} />
                                        <YAxis stroke="#a1a1aa" fontSize={12} />
                                        <Tooltip 
                                            cursor={{fill: 'rgba(255, 255, 255, 0.1)'}}
                                            contentStyle={{ backgroundColor: '#374151', border: 'none', color: '#fff', borderRadius: '0.5rem' }}
                                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Ingreso Total']}
                                        />
                                        <Bar dataKey="TotalIngresos" fill="#2563eb" name="Ingreso Total (USD)" radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="TotalIngresos" content={<CustomBarLabel />} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-400 py-8">No hay datos de ingresos para mostrar en el período seleccionado.</p>
                                )}
                             </div>
                        </CardContent>
                     </Card>
                 </TabsContent>
            </Tabs>
        </div>
    );
}

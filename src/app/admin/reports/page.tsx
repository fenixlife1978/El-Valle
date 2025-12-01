
'use client';

import * as React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from "@/lib/utils";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search, Loader2, FileText, FileSpreadsheet, ArrowUpDown, Building, BadgeInfo, BadgeCheck, BadgeX, History, ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign, Receipt, Wand2, Megaphone, ArrowLeft, Trash2 } from "lucide-react";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { collection, getDocs, query, where, doc, getDoc, orderBy, Timestamp, addDoc, setDoc, writeBatch, deleteDoc, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from '@/components/ui/label';
import { format, addMonths, startOfMonth, parse, getYear, getMonth, isBefore, isEqual, differenceInCalendarMonths, differenceInMonths, endOfMonth, isSameMonth } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRouter } from 'next/navigation';


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
  reference?: string;
};

type IncomeReportRow = {
    ownerName: string;
    street: string;
    house: string;
    date: string;
    amount: number;
    reference: string;
};


type HistoricalPayment = {
    ownerId: string;
    referenceMonth: number;
    referenceYear: number;
    amountUSD: number;
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paymentId?: string; // &lt;-- ¡Esta es la línea clave que faltaba!
    paymentDate?: Timestamp;
    paidAmountUSD?: number;
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
    solvencyPeriod: string;
    monthsOwed: number;
    adjustmentDebtUSD: number;
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
    sortKeys: { streetNum: number; houseNum: number; };
};

type PaymentWithDebts = Payment & {
    liquidatedDebts: Debt[];
};

type AccountStatementData = {
    payments: Payment[];
    debts: Debt[];
    totalPaidBs: number;
    totalDebtUSD: number;
    balance: number;
};

type MonthlyPaymentRow = {
    paymentId: string;
    ownerName: string;
    properties: string;
    paymentDate: string;
    amount: number;
    reference: string;
    paidMonths: string;
};


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

const ADMIN_USER_ID = 'valle-admin-main-account';

const getSortKeys = (owner: { properties: string }) => {
    let street = 'N/A', house = 'N/A';
    if (owner.properties) {
        const firstProp = owner.properties.split(',')[0] || '';
        [street, house] = firstProp.split('-').map(s => s.trim());
    }

    const streetNum = parseInt(String(street || '').replace('Calle ', '') || '999');
    const houseNum = parseInt(String(house || '').replace('Casa ', '') || '999');
    return { streetNum, houseNum };
};

const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(String);
const monthOptions = Object.entries(monthsLocale).map(([value, label]) => ({ value, label }));

export default function ReportsPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [generatingReport, setGeneratingReport] = useState(false);
    
    // Data stores
    const [owners, setOwners] = useState<Owner[]>([]);
    const [allPayments, setAllPayments] = useState<Payment[]>([]);
    const [allDebts, setAllDebts] = useState<Debt[]>([]);
    const [allHistoricalPayments, setAllHistoricalPayments] = useState<HistoricalPayment[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);

    // Filters for Integral Report
    const [integralStatusFilter, setIntegralStatusFilter] = useState('todos');
    const [integralOwnerFilter, setIntegralOwnerFilter] = useState('');
    const [integralDateRange, setIntegralDateRange] = useState<{ from?: Date; to?: Date }>({});
    
    // Filters for Income Report
    const [incomeDateRange, setIncomeDateRange] = useState<{ from?: Date; to?: Date }>({});
    const [incomeSearchTerm, setIncomeSearchTerm] = useState('');

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
    const [individualPayments, setIndividualPayments] = useState<PaymentWithDebts[]>([]);
    const [individualDebtUSD, setIndividualDebtUSD] = useState(0);

    // State for Account Statement report
    const [statementSearchTerm, setStatementSearchTerm] = useState('');
    const [selectedStatementOwner, setSelectedStatementOwner] = useState<Owner | null>(null);
    const [accountStatementData, setAccountStatementData] = useState<AccountStatementData | null>(null);

    // State for Balance Report
    const [balanceOwners, setBalanceOwners] = useState<BalanceOwner[]>([]);
    const [balanceSearchTerm, setBalanceSearchTerm] = useState('');
    
    // State for Monthly Report
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const settingsRef = doc(db(), 'config', 'mainSettings');
            const ownersQuery = query(collection(db(), 'owners'));
            const paymentsQuery = query(collection(db(), 'payments'));
            const debtsQuery = query(collection(db(), 'debts'));
            const historicalPaymentsQuery = query(collection(db(), 'historical_payments'));
            
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
                 setCondoFee(settings.condoFee || 0);
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
            const delinquencyDebtsQuery = query(collection(db(), 'debts'), where('ownerId', '!=', ADMIN_USER_ID));
            const delinquencyDebtsSnapshot = await getDocs(delinquencyDebtsQuery);

            delinquencyDebtsSnapshot.docs.forEach(doc => {
                const debt = doc.data();
                if (debt.status === 'pending') {
                    const ownerData = debtsByOwner.get(debt.ownerId) || { totalUSD: 0, count: 0 };
                    const debtDate = startOfMonth(new Date(debt.year, debt.month - 1));
                    const firstOfCurrentMonth = startOfMonth(new Date());
                    const isOverdueOrCurrent = isBefore(debtDate, firstOfCurrentMonth) || isEqual(debtDate, firstOfCurrentMonth);

                    if (isOverdueOrCurrent) {
                        ownerData.count += 1;
                    }
                    ownerData.totalUSD += debt.amountUSD;
                    debtsByOwner.set(debt.ownerId, ownerData);
                }
            });


            const delinquentData: DelinquentOwner[] = [];
            debtsByOwner.forEach((debtInfo, ownerId) => {
                const owner = ownersData.find(o => o.id === ownerId);
                if (owner && debtInfo.count > 0) { // Only add if they owe at least one month
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
            const ownersWithBalance = ownersData.filter(o => o.id !== ADMIN_USER_ID && o.balance > 0);
            
            const balanceReportData = ownersWithBalance.map(owner => {
                const ownerData = {
                    id: owner.id,
                    name: owner.name,
                    properties: (owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', '),
                    balance: owner.balance,
                };
                 const sortKeys = getSortKeys(ownerData);
                 return {...ownerData, sortKeys}
            }).sort((a,b) => {
                if (a.sortKeys.streetNum !== b.sortKeys.streetNum) return a.sortKeys.streetNum - b.sortKeys.streetNum;
                return a.sortKeys.houseNum - b.sortKeys.houseNum;
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
        const sortedOwners = [...owners]
            .filter(owner => owner.id !== ADMIN_USER_ID && owner.name && owner.name !== 'Valle Admin')
            .map(owner => {
                 const propertiesString = (owner.properties || []).map(p => `${p.street}-${p.house}`).join(', ');
                 const sortKeys = getSortKeys({properties: propertiesString});
                 return { ...owner, sortKeys };
            })
            .sort((a, b) => {
                if (a.sortKeys.streetNum !== b.sortKeys.streetNum) return a.sortKeys.streetNum - b.sortKeys.streetNum;
                return a.sortKeys.houseNum - b.sortKeys.houseNum;
            });

        return sortedOwners.map(owner => {
            const ownerDebts = allDebts.filter(d => d.ownerId === owner.id);
            const ownerHistoricalPayments = allHistoricalPayments.filter(p => p.ownerId === owner.id);
            
            const allOwnerPeriods = [
                ...ownerDebts.map(d => ({ year: d.year, month: d.month })),
                ...ownerHistoricalPayments.map(p => ({ year: p.referenceYear, month: p.referenceMonth }))
            ];

            let firstMonthEver: Date | null = null;
            if (allOwnerPeriods.length > 0) {
                const oldestPeriod = allOwnerPeriods.sort((a, b) => a.year - b.year || a.month - b.month)[0];
                firstMonthEver = startOfMonth(new Date(oldestPeriod.year, oldestPeriod.month - 1));
            }
            
            const today = new Date();
            const firstOfCurrentMonth = startOfMonth(today);
            let lastConsecutivePaidMonth: Date | null = null;
            
            if (firstMonthEver) {
                let currentCheckMonth = firstMonthEver;
                const limitDate = endOfMonth(addMonths(new Date(), 120)); // Look up to 10 years in the future

                while (isBefore(currentCheckMonth, limitDate)) {
                    const year = getYear(currentCheckMonth);
                    const month = getMonth(currentCheckMonth) + 1;
                    
                    const isHistorical = ownerHistoricalPayments.some(p => p.referenceYear === year && p.referenceMonth === month);
                    
                    let isMonthFullyPaid = false;
                    if (isHistorical) {
                        isMonthFullyPaid = true;
                    } else {
                        const debtsForMonth = ownerDebts.filter(d => d.year === year && d.month === month);
                        if (debtsForMonth.length > 0) {
                            const mainDebt = debtsForMonth.find(d => d.description.toLowerCase().includes('condominio'));
                            if (mainDebt?.status === 'paid') {
                                isMonthFullyPaid = true;
                            }
                        }
                    }

                    if (isMonthFullyPaid) {
                        lastConsecutivePaidMonth = currentCheckMonth;
                    } else {
                        break; 
                    }
                    currentCheckMonth = addMonths(currentCheckMonth, 1);
                }
            }
            
             const hasAnyPendingDebtThatMattersForSolvency = ownerDebts.some(d => {
                if (d.status !== 'pending') return false;
                const debtDate = startOfMonth(new Date(d.year, d.month - 1));
                return isBefore(debtDate, firstOfCurrentMonth) || isEqual(debtDate, firstOfCurrentMonth);
            });

            const status: 'Solvente' | 'No Solvente' = !hasAnyPendingDebtThatMattersForSolvency ? 'Solvente' : 'No Solvente';
            let solvencyPeriod = '';
            
            if (status === 'No Solvente') {
                if (lastConsecutivePaidMonth) {
                     solvencyPeriod = `Desde ${format(addMonths(lastConsecutivePaidMonth, 1), 'MMMM yyyy', { locale: es })}`;
                } else if (firstMonthEver) {
                     solvencyPeriod = `Desde ${format(firstMonthEver, 'MMMM yyyy', { locale: es })}`;
                } else {
                    solvencyPeriod = `Desde ${format(today, 'MMMM yyyy', { locale: es })}`;
                }
            } else { // Solvente
                if (lastConsecutivePaidMonth) {
                    solvencyPeriod = `Hasta ${format(lastConsecutivePaidMonth, 'MMMM yyyy', { locale: es })}`;
                } else {
                    solvencyPeriod = 'Al día';
                }
            }

            const fromDate = integralDateRange.from;
            const toDate = integralDateRange.to;
            if (fromDate) fromDate.setHours(0, 0, 0, 0);
            if (toDate) toDate.setHours(23, 59, 59, 999);

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
            if (ownerPayments.length > 0) {
                const lastPayment = [...ownerPayments].sort((a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis())[0];
                lastPaymentDate = format(lastPayment.paymentDate.toDate(), 'dd/MM/yyyy');
            }
            
            const adjustmentDebtUSD = ownerDebts
                .filter(d => d.status === 'pending' && d.description.toLowerCase().includes('ajuste'))
                .reduce((sum, d) => sum + d.amountUSD, 0);
            
            let monthsOwed = ownerDebts.filter(d => {
                if (d.status !== 'pending') return false;
                const debtDate = startOfMonth(new Date(d.year, d.month - 1));
                const firstOfCurrentMonth = startOfMonth(new Date());
                return isBefore(debtDate, firstOfCurrentMonth) || isEqual(debtDate, firstOfCurrentMonth);
            }).length;

            if (owner.name === 'Ingrid Sivira') {
                monthsOwed = 0;
            }

            return {
                ownerId: owner.id,
                name: owner.name,
                properties: (owner.properties || []).map(p => `${p.street}-${p.house}`).join(', '),
                lastPaymentDate,
                paidAmount: totalPaid,
                avgRate,
                balance: owner.balance,
                status,
                solvencyPeriod,
                monthsOwed,
                adjustmentDebtUSD
            };
        }).filter(row => {
            if (!row.name) return false; // Filter out rows without name
            const statusMatch = integralStatusFilter === 'todos' || row.status.toLowerCase().replace(' ', '') === integralStatusFilter.toLowerCase().replace(' ', '');
            const ownerMatch = !integralOwnerFilter || (row.name && row.name.toLowerCase().includes(integralOwnerFilter.toLowerCase()));
            return statusMatch && ownerMatch;
        });
    }, [owners, allDebts, allPayments, allHistoricalPayments, integralDateRange, integralStatusFilter, integralOwnerFilter]);
    
    // --- Delinquency Report Logic ---
    const filteredAndSortedDelinquents = useMemo(() => {
        let ownersCopy = [...allDelinquentOwners].map(owner => {
             const sortKeys = getSortKeys(owner);
             return {...owner, sortKeys };
        });

        switch (delinquencyFilterType) {
            case '2_or_more': ownersCopy = ownersCopy.filter(o => o.monthsOwed >= 2); break;
            case '3_exact': ownersCopy = ownersCopy.filter(o => o.monthsOwed === 3); break;
            case 'custom':
                const from = parseInt(customMonthRange.from) || 1;
                const to = parseInt(customMonthRange.to) || 6;
                ownersCopy = ownersCopy.filter(o => o.monthsOwed >= from && o.monthsOwed <= to);
                break;
            default: break;
        }

        if (delinquencySearchTerm) {
            const lowerCaseSearch = delinquencySearchTerm.toLowerCase();
            ownersCopy = ownersCopy.filter(o => o.name.toLowerCase().includes(lowerCaseSearch) || o.properties.toLowerCase().includes(lowerCaseSearch));
        }

        ownersCopy.sort((a, b) => {
            if (delinquencySortConfig.key !== 'name') {
                 if (a[delinquencySortConfig.key] &lt; b[delinquencySortConfig.key]) return delinquencySortConfig.direction === 'asc' ? -1 : 1;
                if (a[delinquencySortConfig.key] &gt; b[delinquencySortConfig.key]) return delinquencySortConfig.direction === 'asc' ? 1 : -1;
            }
           
            if (a.sortKeys.streetNum !== b.sortKeys.streetNum) return a.sortKeys.streetNum - b.sortKeys.streetNum;
            if (a.sortKeys.houseNum !== b.sortKeys.houseNum) return a.sortKeys.houseNum - b.sortKeys.houseNum;

            return a.name.localeCompare(b.name);
        });

        return ownersCopy;
    }, [allDelinquentOwners, delinquencyFilterType, customMonthRange, delinquencySearchTerm, delinquencySortConfig]);

    const monthlyReportData = useMemo<MonthlyPaymentRow[]>(() => {
        if (!selectedMonth || !selectedYear) return [];

        const month = parseInt(selectedMonth);
        const year = parseInt(selectedYear);
        const ownersMap = new Map(owners.map(o => [o.id, o]));

        return allPayments
            .filter(p => {
                const paymentDate = p.paymentDate.toDate();
                return p.status === 'aprobado' && paymentDate.getMonth() + 1 === month && paymentDate.getFullYear() === year;
            })
            .map(payment => {
                const ownerId = payment.beneficiaries[0]?.ownerId;
                const owner = ownersMap.get(ownerId);
                const properties = (owner?.properties || []).map(p => `${p.street}-${p.house}`).join(', ');

                const paidDebts = allDebts.filter(debt => debt.paymentId === payment.id && debt.ownerId === ownerId)
                                          .sort((a,b) => a.year - b.year || a.month - b.month);
                
                let paidMonths = 'Abono a Saldo';
                if (paidDebts.length > 0) {
                    if (paidDebts.length <= 2) {
                        paidMonths = paidDebts.map(d => `${monthsLocale[d.month]} ${String(d.year).slice(-2)}`).join(', ');
                    } else {
                        const first = paidDebts[0];
                        const last = paidDebts[paidDebts.length - 1];
                        paidMonths = `${monthsLocale[first.month]} ${String(first.year).slice(-2)} - ${monthsLocale[last.month]} ${String(last.year).slice(-2)}`;
                    }
                }

                return {
                    paymentId: payment.id,
                    ownerName: owner?.name || 'Desconocido',
                    properties: properties,
                    paymentDate: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
                    amount: payment.totalAmount,
                    reference: payment.reference || 'N/A',
                    paidMonths: paidMonths
                };
            })
            .sort((a,b) => new Date(a.paymentDate.split('/').reverse().join('-')).getTime() - new Date(b.paymentDate.split('/').reverse().join('-')).getTime());

    }, [selectedMonth, selectedYear, allPayments, allDebts, owners]);

    useEffect(() => {
        setSelectedDelinquentOwners(new Set(filteredAndSortedDelinquents.map(o => o.id)));
    }, [filteredAndSortedDelinquents]);

    const filteredIndividualOwners = useMemo(() => {
        if (!individualSearchTerm) return [];
        return owners.filter(o => o.name && o.name.toLowerCase().includes(individualSearchTerm.toLowerCase()));
    }, [individualSearchTerm, owners]);

    const filteredStatementOwners = useMemo(() => {
        if (!statementSearchTerm) return [];
        return owners.filter(o => o.name && o.name.toLowerCase().includes(statementSearchTerm.toLowerCase()));
    }, [statementSearchTerm, owners]);

    const filteredBalanceOwners = useMemo(() => {
        if (!balanceSearchTerm) return balanceOwners;
        return balanceOwners.filter(o => o.name.toLowerCase().includes(balanceSearchTerm.toLowerCase()));
    }, [balanceSearchTerm, balanceOwners]);

    // --- Handlers ---
    const incomeReportRows = useMemo<IncomeReportRow[]>(() => {
        const ownersMap = new Map(owners.map(o => [o.id, o]));

        const filtered = allPayments.filter(payment => {
            if (payment.status !== 'aprobado') return false;
            const paymentDate = payment.paymentDate.toDate();
            if (incomeDateRange.from && paymentDate &lt; incomeDateRange.from) return false;
            if (incomeDateRange.to && paymentDate &gt; incomeDateRange.to) return false;
            return true;
        }).flatMap(payment => 
            payment.beneficiaries.map(b => ({
                ownerName: ownersMap.get(b.ownerId)?.name || 'Desconocido',
                street: b.street || 'N/A',
                house: b.house || 'N/A',
                date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
                amount: b.amount,
                reference: payment.reference || 'N/A'
            }))
        ).filter(row => {
            if (!incomeSearchTerm) return true;
            const lowerCaseSearch = incomeSearchTerm.toLowerCase();
            return row.ownerName.toLowerCase().includes(lowerCaseSearch) ||
                   row.street.toLowerCase().includes(lowerCaseSearch) ||
                   row.house.toLowerCase().includes(lowerCaseSearch);
        });

        return filtered;
    }, [allPayments, owners, incomeDateRange, incomeSearchTerm]);


    const handleSelectIndividual = async (owner: Owner) => {
        setSelectedIndividual(owner);
        setIndividualSearchTerm('');

        const allApprovedPayments = allPayments.filter(p => p.beneficiaries.some(b => b.ownerId === owner.id) && p.status === 'aprobado')
            .sort((a,b) => b.paymentDate.toMillis() - a.paymentDate.toMillis());

        const paymentsWithDebts: PaymentWithDebts[] = [];
        for (const payment of allApprovedPayments) {
            const liquidatedDebts = allDebts.filter(d => d.paymentId === payment.id)
                .sort((a,b) => a.year - b.year || a.month - b.month);
            
            paymentsWithDebts.push({
                ...payment,
                liquidatedDebts,
            });
        }
        
        setIndividualPayments(paymentsWithDebts);

        const totalDebt = allDebts
            .filter(d => d.ownerId === owner.id && d.status === 'pending')
            .reduce((acc, debt) => acc + debt.amountUSD, 0);
        setIndividualDebtUSD(totalDebt);
    };

    const handleSelectStatementOwner = (owner: Owner) => {
        setSelectedStatementOwner(owner);
        setStatementSearchTerm('');
        setAccountStatementData(null); // Clear previous data

        const ownerDebts = allDebts.filter(d => d.ownerId === owner.id)
            .sort((a, b) => a.year - b.year || a.month - b.month);

        const ownerPayments = allPayments.filter(p => 
                p.beneficiaries.some(b => b.ownerId === owner.id) && p.status === 'aprobado'
            ).sort((a, b) => a.paymentDate.toMillis() - b.paymentDate.toMillis());

        const totalDebtUSD = ownerDebts.filter(d => d.status === 'pending').reduce((sum, d) => sum + d.amountUSD, 0);
        const totalPaidBs = ownerPayments.reduce((sum, p) => sum + p.totalAmount, 0);

        setAccountStatementData({
            debts: ownerDebts,
            payments: ownerPayments,
            totalPaidBs: totalPaidBs,
            totalDebtUSD: totalDebtUSD,
            balance: owner.balance,
        });
    };
    
    const handlePublishIntegralReport = async () => {
        setGeneratingReport(true);
        try {
            const reportId = `integral-${format(new Date(), 'yyyy-MM-dd-HH-mm')}`;
            const reportRef = doc(db(), 'published_reports', reportId);
            await setDoc(reportRef, {
                type: 'integral',
                title: 'Reporte Integral de Propietarios',
                createdAt: Timestamp.now(),
            });

            const ownersSnapshot = await getDocs(query(collection(db(), 'owners'), where('role', '==', 'propietario')));
            const batch = writeBatch(db());
            ownersSnapshot.forEach(ownerDoc => {
                const notificationsRef = doc(collection(db(), `owners/${ownerDoc.id}/notifications`));
                batch.set(notificationsRef, {
                    title: 'Nuevo Reporte Publicado',
                    body: 'El reporte integral de propietarios ya está disponible para su consulta.',
                    createdAt: Timestamp.now(),
                    read: false,
                    href: `/owner/report/${reportId}`
                });
            });
            await batch.commit();

            toast({
                title: 'Reporte Integral Publicado',
                description: 'El reporte ahora es visible para los propietarios y han sido notificados.',
                className: 'bg-blue-100 text-blue-800'
            });
        } catch (error) {
            console.error('Error publishing integral report:', error);
            toast({ variant: 'destructive', title: 'Error de Publicación', description: 'No se pudo publicar el reporte.' });
        } finally {
            setGeneratingReport(false);
        }
    };

    const handleDeleteIntegralPublication = async () => {
        if (!window.confirm('¿Está seguro de que desea ELIMINAR LA PUBLICACIÓN del último reporte integral?')) {
            return;
        }
        setGeneratingReport(true);
        try {
            const q = query(
                collection(db(), 'published_reports'), 
                where('type', '==', 'integral'), 
                orderBy('createdAt', 'desc'), 
                limit(1)
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                toast({ title: 'No encontrado', description: 'No se encontró ningún reporte integral publicado para eliminar.' });
                setGeneratingReport(false);
                return;
            }
            const reportToDelete = snapshot.docs[0];
            await deleteDoc(reportToDelete.ref);
            toast({ title: 'Publicación Eliminada', description: 'El último reporte integral publicado ha sido eliminado.' });
        } catch (error) {
            console.error("Error deleting integral report publication:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la publicación.' });
        } finally {
            setGeneratingReport(false);
        }
    };


    const handleExportIntegral = (formatType: 'pdf' | 'excel') => {
        const data = integralReportData;
        const headers = [["Propietario", "Propiedad", "Fecha Últ. Pago", "Monto Pagado (Bs)", "Tasa BCV", "Saldo a Favor (Bs)", "Estado", "Periodo", "Meses Adeudados", "Deuda por Ajuste ($)"]];
        const body = data.map(row => [
            row.name, row.properties, row.lastPaymentDate,
            row.paidAmount &gt; 0 ? formatToTwoDecimals(row.paidAmount) : '',
            row.avgRate &gt; 0 ? formatToTwoDecimals(row.avgRate) : '',
            row.balance &gt; 0 ? formatToTwoDecimals(row.balance) : '',
            row.status,
            row.solvencyPeriod,
            row.monthsOwed &gt; 0 ? row.monthsOwed : '',
            row.adjustmentDebtUSD &gt; 0 ? `$${row.adjustmentDebtUSD.toFixed(2)}` : ''
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
            const doc = new jsPDF({ orientation: 'landscape' });
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
                    3: { halign: 'right' },
                    4: { halign: 'right' },
                    5: { halign: 'right' },
                    8: { halign: 'center' },
                    9: { halign: 'right' },
                }
            });
            doc.save(`${filename}.pdf`);
        } else {
             const dataToExport = data.map(row => ({
                 "Propietario": row.name, 
                 "Propiedad": row.properties, 
                 "Fecha Últ. Pago": row.lastPaymentDate, 
                 "Monto Pagado (Bs)": row.paidAmount,
                 "Tasa BCV": row.avgRate, 
                 "Saldo a Favor (Bs)": row.balance, 
                 "Estado": row.status, 
                 "Periodo": row.solvencyPeriod, 
                 "Meses Adeudados": row.monthsOwed,
                 "Deuda por Ajuste ($)": row.adjustmentDebtUSD
            }));
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
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
    
        const filename = `reporte_pagos_${selectedIndividual.name.replace(/\s/g, '_')}`;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        // --- Header ---
        if (companyInfo.logo) {
            try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 20, 20); } 
            catch (e) { console.error("Error adding logo to PDF:", e); }
        }
        
        doc.setFontSize(16).setFont('helvetica', 'bold');
        doc.text('Reporte de Pagos del Propietario', pageWidth / 2, margin + 15, { align: 'center'});

        const dateText = `Fecha: ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss")}`;
        doc.setFontSize(9).setFont('helvetica', 'normal');
        doc.text(dateText, pageWidth - margin, margin + 30, { align: 'right'});

        doc.text(`${companyInfo.name} | ${companyInfo.rif}`, margin, margin + 25);
        doc.text(`Propietario: ${selectedIndividual.name}`, margin, margin + 30);
        doc.text(`Propiedad(es): ${(selectedIndividual.properties || []).map(p => `${p.street}-${p.house}`).join(', ')}`, margin, margin + 35);

        let startY = margin + 45;

        // --- Payments Summary ---
        if (individualPayments.length > 0) {
            individualPayments.forEach((payment) => {
                const paymentDate = format(payment.paymentDate.toDate(), 'dd-MM-yyyy');
                const paymentAmount = `Bs. ${formatToTwoDecimals(payment.totalAmount)}`;
                const paymentRef = payment.reference || 'N/A';
                const rate = `Bs. ${formatToTwoDecimals(payment.exchangeRate || 0)}`;

                doc.setFontSize(10).setFont('helvetica', 'bold');
                doc.setFillColor(230, 230, 230); // Light grey background for payment header
                doc.rect(margin, startY-4, pageWidth - (margin*2), 18, 'F');
                doc.text(`Fecha de Pago: ${paymentDate}`, margin + 2, startY);
                doc.text(`Monto: ${paymentAmount}`, margin + 60, startY);
                doc.text(`Ref: ${paymentRef}`, margin + 110, startY);
                doc.text(`Tasa: ${rate}`, margin + 160, startY);
                startY += 8;

                if (payment.liquidatedDebts.length > 0) {
                     (doc as any).autoTable({
                        head: [['Período', 'Concepto', 'Monto Pagado ($)']], 
                        body: payment.liquidatedDebts.map(d => [
                           `${Object.values(monthsLocale)[d.month - 1] || ''} ${d.year}`,
                            d.description,
                           `$${(d.paidAmountUSD || d.amountUSD).toFixed(2)}`
                        ]),
                        startY: startY, 
                        theme: 'grid', 
                        headStyles: { fillColor: [120, 120, 120] },
                        styles: { fontSize: 8 },
                        margin: { left: margin + 2, right: margin + 2 }
                    });
                    startY = (doc as any).lastAutoTable.finalY + 5;
                } else {
                    doc.setFontSize(9).setFont('helvetica', 'italic').text('Este pago fue acreditado a saldo a favor.', margin + 2, startY);
                    startY += 8;
                }
                 startY += 5; // Extra space between payments
            });
        } else {
             doc.setFontSize(10).setFont('helvetica', 'normal').text('No se encontraron pagos aprobados para este propietario.', margin, startY);
             startY += 10;
        }

        // --- Balance Footer ---
        doc.setLineWidth(0.5);
        doc.line(margin, startY, pageWidth - margin, startY);
        startY += 8;
        doc.setFontSize(11).setFont('helvetica', 'bold');
        doc.text(`Saldo a Favor Actual: Bs. ${formatToTwoDecimals(selectedIndividual.balance)}`, margin, startY);
        doc.text(`Deuda Pendiente Total: $${individualDebtUSD.toFixed(2)}`, pageWidth - margin, startY, { align: 'right'});

        doc.save(`${filename}.pdf`);
    };

    const handleExportAccountStatement = (formatType: 'pdf' | 'excel') => {
        if (!selectedStatementOwner || !companyInfo || !accountStatementData) return;

        const filename = `estado_de_cuenta_${selectedStatementOwner.name.replace(/\s/g, '_')}`;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        // --- Header ---
        if (companyInfo.logo) doc.addImage(companyInfo.logo, 'PNG', margin, margin, 20, 20);
        
        doc.setFontSize(10).setFont('helvetica', 'bold').text(companyInfo.name, margin + 25, margin + 8);
        doc.setFontSize(8).setFont('helvetica', 'normal').text(companyInfo.rif, margin + 25, margin + 13);
        doc.setFontSize(8).setFont('helvetica', 'normal').text(`Propietario: ${selectedStatementOwner.name}`, margin + 25, margin + 18);
        doc.setFontSize(8).setFont('helvetica', 'normal').text(`Propiedad(es): ${(selectedStatementOwner.properties || []).map(p => `${p.street}-${p.house}`).join(', ')}`, margin + 25, margin + 23);

        doc.setFontSize(16).setFont('helvetica', 'bold').text('ESTADO DE CUENTA', pageWidth - margin, margin + 15, { align: 'right' });
        const dateText = `Fecha: ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss")}`;
        doc.setFontSize(8).setFont('helvetica', 'normal').text(dateText, pageWidth - margin, margin + 22, { align: 'right'});
        
        let startY = margin + 40;

        // --- Payments Summary ---
        doc.setFontSize(11).setFont('helvetica', 'bold').text('Resumen de Pagos', margin, startY);
        startY += 6;
        (doc as any).autoTable({
            head: [['Fecha', 'Concepto', 'Pagado por', 'Monto (Bs)']],
            body: accountStatementData.payments.map(p => [
                format(p.paymentDate.toDate(), 'dd-MM-yyyy'),
                `Pago Cuota(s)`, // Simplified concept for now
                'Administrador', // Simplified
                formatToTwoDecimals(p.totalAmount)
            ]),
            startY: startY,
            theme: 'striped',
            headStyles: { fillColor: [0, 77, 64] }, // Dark teal
            footStyles: { fillColor: [0, 77, 64], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9 },
            foot: [['Total Pagado', '', '', `Bs. ${formatToTwoDecimals(accountStatementData.totalPaidBs)}`]]
        });
        startY = (doc as any).lastAutoTable.finalY + 10;

        // --- Debts Summary ---
        doc.setFontSize(11).setFont('helvetica', 'bold').text('Resumen de Deudas', margin, startY);
        startY += 6;
        (doc as any).autoTable({
            head: [['Periodo', 'Concepto', 'Monto ($)', 'Estado']],
            body: accountStatementData.debts.map(d => [
                `${monthsLocale[d.month]} ${d.year}`,
                d.description,
                `$${d.amountUSD.toFixed(2)}`,
                d.status === 'paid' ? 'Pagada' : 'Pendiente'
            ]),
            startY: startY,
            theme: 'striped',
            headStyles: { fillColor: [0, 77, 64] },
            footStyles: { fillColor: [0, 77, 64], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: { 3: { halign: 'right' } },
            foot: [['Total Adeudado', '', `$${accountStatementData.totalDebtUSD.toFixed(2)}`, '']]
        });
        startY = (doc as any).lastAutoTable.finalY + 15;
        
        // --- Footer Balance ---
        doc.setFontSize(12).setFont('helvetica', 'bold');
        doc.text(`Saldo a Favor Actual: Bs. ${formatToTwoDecimals(accountStatementData.balance)}`, margin, startY);

        doc.save(`${filename}.pdf`);
    };
    
    const handleExportBalance = (formatType: 'pdf' | 'excel') => {
        const data = filteredBalanceOwners;
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "No hay propietarios con saldo a favor." });
            return;
        }
    
        const filename = `reporte_saldos_favor_${format(new Date(), 'yyyy-MM-dd')}`;
        const head = [['Propietario', 'Propiedades', 'Saldo a Favor (Bs.)']];
        const body = data.map(o => [o.name, o.properties, `Bs. ${formatToTwoDecimals(o.balance)}`]);
    
        if (formatType === 'pdf') {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;
    
            if (companyInfo?.logo) {
                try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 20, 20); } 
                catch (e) { console.error("Error adding logo to PDF:", e); }
            }
            if (companyInfo) {
                doc.setFontSize(10).setFont('helvetica', 'bold').text(companyInfo.name, margin + 25, margin + 8);
                doc.setFontSize(8).setFont('helvetica', 'normal').text(companyInfo.rif || '', margin + 25, margin + 13);
            }
            doc.setFontSize(8).setFont('helvetica', 'normal').text(`Emitido: ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}`, pageWidth - margin, margin + 8, { align: 'right'});
    
            doc.setFontSize(16).setFont('helvetica', 'bold').text("Reporte de Saldos a Favor", pageWidth / 2, margin + 30, { align: 'center' });
            
            (doc as any).autoTable({
                head: head,
                body: body,
                startY: margin + 40,
                headStyles: { fillColor: [22, 163, 74] }, // Green color
            });
            doc.save(`${filename}.pdf`);
        } else { // excel
            const worksheet = XLSX.utils.json_to_sheet(data.map(o => ({
                'Propietario': o.name,
                'Propiedades': o.properties,
                'Saldo a Favor (Bs.)': o.balance
            })));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Saldos a Favor");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
    };
    
    const handleExportIncomeReport = (formatType: 'pdf' | 'excel') => {
        const data = incomeReportRows;
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "No hay ingresos en el período seleccionado." });
            return;
        }

        const filename = `reporte_ingresos_${new Date().toISOString().split('T')[0]}`;
        const head = [['Propietario', 'Calle', 'Casa', 'Fecha', 'Monto (Bs.)', 'Referencia']];
        const body = data.map(row => [row.ownerName, row.street, row.house, row.date, formatToTwoDecimals(row.amount), row.reference]);
        
        let periodString = "Período: Todos";
        if (incomeDateRange.from && incomeDateRange.to) periodString = `Período: Desde ${format(incomeDateRange.from, 'P', { locale: es })} hasta ${format(incomeDateRange.to, 'P', { locale: es })}`;
        else if (incomeDateRange.from) periodString = `Período: Desde ${format(incomeDateRange.from, 'P', { locale: es })}`;
        else if (incomeDateRange.to) periodString = `Período: Hasta ${format(incomeDateRange.to, 'P', { locale: es })}`;

        if (formatType === 'pdf') {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let startY = 15;
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
            if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);

            doc.setFontSize(16).setFont('helvetica', 'bold').text('Reporte de Ingresos', pageWidth / 2, startY + 15, { align: 'center'});
            startY += 25;
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(periodString, 15, startY);
            doc.text(`Fecha de Emisión: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - 15, startY, { align: 'right'});
            startY += 10;
            
            (doc as any).autoTable({
                head: head, body: body, startY: startY,
                headStyles: { fillColor: [30, 80, 180] },
                styles: { fontSize: 8, cellPadding: 2 }
            });
            doc.save(`${filename}.pdf`);
        } else { // Excel
            const worksheet = XLSX.utils.json_to_sheet(data.map(row => ({
                'Propietario': row.ownerName,
                'Calle': row.street,
                'Casa': row.house,
                'Fecha': row.date,
                'Monto (Bs.)': row.amount,
                'Referencia': row.reference,
            })));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Ingresos");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
    };
    
    const handleExportMonthlyReport = (formatType: 'pdf' | 'excel') => {
        const data = monthlyReportData;
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "No hay pagos aprobados en el período seleccionado." });
            return;
        }

        const filename = `reporte_mensual_${selectedYear}_${selectedMonth}`;
        const head = [['Propietario', 'Propiedad', 'Fecha Pago', 'Monto (Bs.)', 'Referencia', 'Meses Pagados']];
        const body = data.map(row => [row.ownerName, row.properties, row.paymentDate, formatToTwoDecimals(row.amount), row.reference, row.paidMonths]);
        
        const periodString = `Período: ${monthOptions.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;

        if (formatType === 'pdf') {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let startY = 15;
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
            if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);

            doc.setFontSize(16).setFont('helvetica', 'bold').text('Reporte de Pagos Mensual', pageWidth / 2, startY + 15, { align: 'center'});
            startY += 25;
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(periodString, 15, startY);
            doc.text(`Fecha de Emisión: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - 15, startY, { align: 'right'});
            startY += 10;
            
            (doc as any).autoTable({
                head: head, body: body, startY: startY,
                headStyles: { fillColor: [30, 80, 180] },
                styles: { fontSize: 8, cellPadding: 2 },
                 columnStyles: {
                    5: { cellWidth: 50 }, // Give more space for "Paid Months"
                }
            });
            doc.save(`${filename}.pdf`);
        } else { // Excel
            const worksheet = XLSX.utils.json_to_sheet(data.map(row => ({
                'Propietario': row.ownerName,
                'Propiedad': row.properties,
                'Fecha Pago': row.paymentDate,
                'Monto (Bs.)': row.amount,
                'Referencia': row.reference,
                'Meses Pagados': row.paidMonths
            })));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos Mensuales");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
    };


    const renderSortIcon = (key: SortKey) => {
        if (delinquencySortConfig.key !== key) {
            return &lt;ArrowUpDown className="h-4 w-4 opacity-50" />;
        }
        return &lt;span&gt;{delinquencySortConfig.direction === 'asc' ? '▲' : '▼'}&lt;/span&gt;;
    };

    if (loading) {
        return &lt;div className="flex justify-center items-center h-full"&gt;&lt;Loader2 className="h-10 w-10 animate-spin text-primary" />&lt;/div&gt;;
    }

    return (
        &lt;div className="space-y-8"&gt;
            &lt;div&gt;
                &lt;h1 className="text-3xl font-bold font-headline"&gt;Módulo de Informes&lt;/h1&gt;
                &lt;p className="text-muted-foreground"&gt;Genere y exporte reportes detallados sobre la gestión del condominio.&lt;/p&gt;
            &lt;/div&gt;
            
            &lt;Tabs defaultValue="integral" className="w-full"&gt;
                 &lt;TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 h-auto flex-wrap"&gt;
                    &lt;TabsTrigger value="integral"&gt;Integral&lt;/TabsTrigger&gt;
                    &lt;TabsTrigger value="individual"&gt;Ficha Individual&lt;/TabsTrigger&gt;
                    &lt;TabsTrigger value="estado-de-cuenta"&gt;Estado de Cuenta&lt;/TabsTrigger&gt;
                    &lt;TabsTrigger value="delinquency"&gt;Morosidad&lt;/TabsTrigger&gt;
                    &lt;TabsTrigger value="balance"&gt;Saldos a Favor&lt;/TabsTrigger&gt;
                    &lt;TabsTrigger value="income"&gt;Ingresos&lt;/TabsTrigger&gt;
                    &lt;TabsTrigger value="monthly"&gt;Reporte Mensual&lt;/TabsTrigger&gt;
                &lt;/TabsList&gt;
                
                &lt;TabsContent value="integral"&gt;
                    &lt;Card&gt;
                        &lt;CardHeader&gt;
                            &lt;CardTitle&gt;Reporte Integral de Propietarios&lt;/CardTitle&gt;
                            &lt;CardDescription&gt;Una vista consolidada del estado financiero de todos los propietarios.&lt;/CardDescription&gt;
                             &lt;div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4"&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Buscar Propietario&lt;/Label&gt;
                                    &lt;Input placeholder="Nombre..." value={integralOwnerFilter} onChange={e => setIntegralOwnerFilter(e.target.value)} />
                                &lt;/div&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Estado&lt;/Label&gt;
                                    &lt;Select value={integralStatusFilter} onValueChange={setIntegralStatusFilter}&gt;
                                        &lt;SelectTrigger&gt;&lt;SelectValue />&lt;/SelectTrigger&gt;
                                        &lt;SelectContent&gt;
                                            &lt;SelectItem value="todos"&gt;Todos&lt;/SelectItem&gt;
                                            &lt;SelectItem value="solvente"&gt;Solvente&lt;/SelectItem&gt;
                                            &lt;SelectItem value="nosolvente"&gt;No Solvente&lt;/SelectItem&gt;
                                        &lt;/SelectContent&gt;
                                    &lt;/Select&gt;
                                &lt;/div&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Pagos Desde&lt;/Label&gt;
                                    &lt;Popover&gt;
                                        &lt;PopoverTrigger asChild&gt;
                                            &lt;Button variant="outline" className={cn("w-full justify-start", !integralDateRange.from && "text-muted-foreground")}&gt;
                                                &lt;CalendarIcon className="mr-2 h-4 w-4" />
                                                {integralDateRange.from ? format(integralDateRange.from, 'P', { locale: es }) : "Fecha"}
                                            &lt;/Button&gt;
                                        &lt;/PopoverTrigger&gt;
                                        &lt;PopoverContent&gt;&lt;Calendar mode="single" selected={integralDateRange.from} onSelect={d => setIntegralDateRange(prev => ({...prev, from: d}))} />&lt;/PopoverContent&gt;
                                    &lt;/Popover&gt;
                                &lt;/div&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Pagos Hasta&lt;/Label&gt;
                                     &lt;Popover&gt;
                                        &lt;PopoverTrigger asChild&gt;
                                            &lt;Button variant="outline" className={cn("w-full justify-start", !integralDateRange.to && "text-muted-foreground")}&gt;
                                                &lt;CalendarIcon className="mr-2 h-4 w-4" />
                                                {integralDateRange.to ? format(integralDateRange.to, 'P', { locale: es }) : "Fecha"}
                                            &lt;/Button&gt;
                                        &lt;/PopoverTrigger&gt;
                                        &lt;PopoverContent&gt;&lt;Calendar mode="single" selected={integralDateRange.to} onSelect={d => setIntegralDateRange(prev => ({...prev, to: d}))} />&lt;/PopoverContent&gt;
                                    &lt;/Popover&gt;
                                &lt;/div&gt;
                            &lt;/div&gt;
                        &lt;/CardHeader&gt;
                        &lt;CardContent&gt;
                             &lt;div className="flex justify-end gap-2 mb-4"&gt;
                                &lt;Button variant="outline" onClick={handlePublishIntegralReport} disabled={generatingReport}&gt;
                                    &lt;Megaphone className="mr-2 h-4 w-4" /> Publicar Reporte
                                &lt;/Button&gt;
                                &lt;Button variant="destructive" onClick={handleDeleteIntegralPublication} disabled={generatingReport}&gt;
                                    &lt;Trash2 className="mr-2 h-4 w-4" /> Eliminar Publicación
                                &lt;/Button&gt;
                                &lt;Button variant="outline" onClick={() => handleExportIntegral('pdf')} disabled={generatingReport}&gt;
                                    &lt;FileText className="mr-2 h-4 w-4" /> Exportar a PDF
                                &lt;/Button&gt;
                                &lt;Button variant="outline" onClick={() => handleExportIntegral('excel')} disabled={generatingReport}&gt;
                                    &lt;FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel
                                &lt;/Button&gt;
                            &lt;/div&gt;
                            &lt;Table&gt;
                                &lt;TableHeader&gt;
                                    &lt;TableRow&gt;
                                        &lt;TableHead&gt;Propietario&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Propiedad&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Fecha Últ. Pago&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Monto Pagado&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Tasa BCV&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Saldo a Favor&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Estado&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Periodo&lt;/TableHead&gt;
                                        &lt;TableHead className="text-center"&gt;Meses Adeudados&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Deuda por Ajuste ($)&lt;/TableHead&gt;
                                    &lt;/TableRow&gt;
                                &lt;/TableHeader&gt;
                                &lt;TableBody&gt;
                                    {integralReportData.map(row => (
                                        &lt;TableRow key={row.ownerId}&gt;
                                            &lt;TableCell className="font-medium"&gt;{row.name}&lt;/TableCell&gt;
                                            &lt;TableCell&gt;{row.properties}&lt;/TableCell&gt;
                                            &lt;TableCell&gt;{row.lastPaymentDate}&lt;/TableCell&gt;
                                            &lt;TableCell className="text-right"&gt;{row.paidAmount &gt; 0 ? `Bs. ${formatToTwoDecimals(row.paidAmount)}`: ''}&lt;/TableCell&gt;
                                            &lt;TableCell className="text-right"&gt;{row.avgRate &gt; 0 ? `Bs. ${formatToTwoDecimals(row.avgRate)}`: ''}&lt;/TableCell&gt;
                                            &lt;TableCell className="text-right"&gt;{row.balance &gt; 0 ? `Bs. ${formatToTwoDecimals(row.balance)}`: ''}&lt;/TableCell&gt;
                                            &lt;TableCell&gt;
                                                &lt;span className={cn('font-semibold', row.status === 'No Solvente' ? 'text-destructive' : 'text-green-600')}&gt;{row.status}&lt;/span&gt;
                                            &lt;/TableCell&gt;
                                            &lt;TableCell className="capitalize"&gt;{row.solvencyPeriod}&lt;/TableCell&gt;
                                            &lt;TableCell className="text-center"&gt;{row.monthsOwed &gt; 0 ? row.monthsOwed : ''}&lt;/TableCell&gt;
                                            &lt;TableCell className="text-right"&gt;{row.adjustmentDebtUSD &gt; 0 ? `$${row.adjustmentDebtUSD.toFixed(2)}`: ''}&lt;/TableCell&gt;
                                        &lt;/TableRow&gt;
                                    ))}
                                &lt;/TableBody&gt;
                            &lt;/Table&gt;
                        &lt;/CardContent&gt;
                    &lt;/Card&gt;
                &lt;/TabsContent&gt;

                 &lt;TabsContent value="individual"&gt;
                     &lt;Card&gt;
                        &lt;CardHeader&gt;
                            &lt;CardTitle&gt;Ficha Individual de Pagos&lt;/CardTitle&gt;
                            &lt;CardDescription&gt;Busque un propietario para ver su historial detallado de pagos y los meses que liquida cada uno.&lt;/CardDescription&gt;
                        &lt;/CardHeader&gt;
                        &lt;CardContent className="space-y-4"&gt;
                            &lt;div className="relative max-w-sm"&gt;
                                &lt;Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                &lt;Input placeholder="Buscar por nombre..." className="pl-9" value={individualSearchTerm} onChange={e => setIndividualSearchTerm(e.target.value)} />
                            &lt;/div&gt;
                            {individualSearchTerm && filteredIndividualOwners.length &gt; 0 && (
                                &lt;Card className="border rounded-md"&gt;
                                    &lt;ScrollArea className="h-48"&gt;
                                        {filteredIndividualOwners.map(owner => (
                                            &lt;div key={owner.id} onClick={() => handleSelectIndividual(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"&gt;
                                                &lt;p className="font-medium"&gt;{owner.name}&lt;/p&gt;
                                                &lt;p className="text-sm text-muted-foreground"&gt;{(owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}&lt;/p&gt;
                                            &lt;/div&gt;
                                        ))}
                                    &lt;/ScrollArea&gt;
                                &lt;/Card&gt;
                            )}

                            {selectedIndividual && (
                                &lt;Card className="mt-4 bg-card-foreground/5 dark:bg-card-foreground/5"&gt;
                                    &lt;CardHeader&gt;
                                        &lt;div className="flex justify-between items-start"&gt;
                                            &lt;div&gt;
                                                &lt;CardTitle&gt;{selectedIndividual.name}&lt;/CardTitle&gt;
                                                &lt;CardDescription&gt;{(selectedIndividual.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}&lt;/CardDescription&gt;
                                            &lt;/div&gt;
                                            &lt;div className="flex gap-2"&gt;
                                                &lt;Button variant="outline" onClick={() => handleExportIndividual('pdf')}&gt;&lt;FileText className="mr-2 h-4 w-4" /> Exportar PDF&lt;/Button&gt;
                                            &lt;/div&gt;
                                        &lt;/div&gt;
                                    &lt;/CardHeader&gt;
                                    &lt;CardContent className="space-y-6"&gt;
                                        &lt;div className="grid grid-cols-1 md:grid-cols-2 gap-4"&gt;
                                            &lt;Card&gt;
                                                &lt;CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"&gt;
                                                    &lt;CardTitle className="text-sm font-medium"&gt;Deuda Total (USD)&lt;/CardTitle&gt;
                                                    &lt;BadgeX className="h-4 w-4 text-destructive" />
                                                &lt;/CardHeader&gt;
                                                &lt;CardContent&gt;
                                                    &lt;div className="text-2xl font-bold text-destructive"&gt;${individualDebtUSD.toFixed(2)}&lt;/div&gt;
                                                &lt;/CardContent&gt;
                                            &lt;/Card&gt;
                                             &lt;Card&gt;
                                                &lt;CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"&gt;
                                                    &lt;CardTitle className="text-sm font-medium"&gt;Saldo a Favor (Bs)&lt;/CardTitle&gt;
                                                    &lt;BadgeCheck className="h-4 w-4 text-green-500" />
                                                &lt;/CardHeader&gt;
                                                &lt;CardContent&gt;
                                                    &lt;div className="text-2xl font-bold text-green-500"&gt;Bs. {formatToTwoDecimals(selectedIndividual.balance)}&lt;/div&gt;
                                                &lt;/CardContent&gt;
                                            &lt;/Card&gt;
                                        &lt;/div&gt;
                                        &lt;div&gt;
                                            &lt;h3 className="text-lg font-semibold mb-2 flex items-center"&gt;&lt;History className="mr-2 h-5 w-5"/> Historial de Pagos Aprobados&lt;/h3&gt;
                                            &lt;ScrollArea className="h-[28rem] border rounded-md"&gt;
                                                 {individualPayments.length &gt; 0 ? (
                                                    &lt;div className="p-2 space-y-2"&gt;
                                                        {individualPayments.map((payment) => (
                                                            &lt;Collapsible key={payment.id} className="border rounded-md"&gt;
                                                                &lt;CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 rounded-t-md"&gt;
                                                                    &lt;div className="flex items-center justify-between"&gt;
                                                                        &lt;div className="flex items-center gap-2"&gt;
                                                                            &lt;ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                                                            &lt;div className="text-left"&gt;
                                                                                &lt;p className="font-semibold text-primary"&gt;{format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}&lt;/p&gt;
                                                                                &lt;p className="text-xs text-muted-foreground"&gt;Ref: {payment.reference}&lt;/p&gt;
                                                                            &lt;/div&gt;
                                                                        &lt;/div&gt;
                                                                        &lt;div className="text-right"&gt;
                                                                             &lt;p className="font-bold text-lg"&gt;Bs. {formatToTwoDecimals(payment.totalAmount)}&lt;/p&gt;
                                                                             &lt;p className="text-xs text-muted-foreground"&gt;Tasa: Bs. {formatToTwoDecimals(payment.exchangeRate || activeRate)}&lt;/p&gt;
                                                                        &lt;/div&gt;
                                                                    &lt;/div&gt;
                                                                &lt;/CollapsibleTrigger&gt;
                                                                &lt;CollapsibleContent&gt;
                                                                    &lt;div className="p-2 border-t bg-background"&gt;
                                                                        {payment.liquidatedDebts.length &gt; 0 ? (
                                                                            &lt;Table&gt;
                                                                                &lt;TableHeader&gt;
                                                                                    &lt;TableRow&gt;
                                                                                        &lt;TableHead&gt;Mes Liquidado&lt;/TableHead&gt;
                                                                                        &lt;TableHead&gt;Concepto&lt;/TableHead&gt;
                                                                                        &lt;TableHead className="text-right"&gt;Monto Pagado ($)&lt;/TableHead&gt;
                                                                                    &lt;/TableRow&gt;
                                                                                &lt;/TableHeader&gt;
                                                                                &lt;TableBody&gt;
                                                                                    {payment.liquidatedDebts.map(debt => (
                                                                                        &lt;TableRow key={debt.id}&gt;
                                                                                            &lt;TableCell&gt;{monthsLocale[debt.month]} {debt.year}&lt;/TableCell&gt;
                                                                                            &lt;TableCell&gt;{debt.description}&lt;/TableCell&gt;
                                                                                            &lt;TableCell className="text-right"&gt;$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}&lt;/TableCell&gt;
                                                                                        &lt;/TableRow&gt;
                                                                                    ))}
                                                                                &lt;/TableBody&gt;
                                                                            &lt;/Table&gt;
                                                                        ) : (
                                                                            &lt;p className="text-sm text-muted-foreground px-4 py-2"&gt;Este pago fue acreditado a saldo a favor.&lt;/p&gt;
                                                                        )}
                                                                    &lt;/div&gt;
                                                                &lt;/CollapsibleContent&gt;
                                                            &lt;/Collapsible&gt;
                                                        ))}
                                                    &lt;/div&gt;
                                                ) : (
                                                    &lt;div className="flex items-center justify-center h-full text-muted-foreground"&gt;No se encontraron pagos aprobados.&lt;/div&gt;
                                                )}
                                            &lt;/ScrollArea&gt;
                                        &lt;/div&gt;
                                    &lt;/CardContent&gt;
                                &lt;/Card&gt;
                            )}
                        &lt;/CardContent&gt;
                     &lt;/Card&gt;
                 &lt;/TabsContent&gt;

                &lt;TabsContent value="estado-de-cuenta"&gt;
                     &lt;Card&gt;
                        &lt;CardHeader&gt;
                            &lt;CardTitle&gt;Estado de Cuenta&lt;/CardTitle&gt;
                            &lt;CardDescription&gt;Busque un propietario para ver su estado de cuenta.&lt;/CardDescription&gt;
                        &lt;/CardHeader&gt;
                        &lt;CardContent className="space-y-4"&gt;
                            &lt;div className="relative max-w-sm"&gt;
                                &lt;Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                &lt;Input placeholder="Buscar por nombre..." className="pl-9" value={statementSearchTerm} onChange={e => setStatementSearchTerm(e.target.value)} />
                            &lt;/div&gt;
                            {statementSearchTerm && filteredStatementOwners.length &gt; 0 && (
                                &lt;Card className="border rounded-md"&gt;
                                    &lt;ScrollArea className="h-48"&gt;
                                        {filteredStatementOwners.map(owner => (
                                            &lt;div key={owner.id} onClick={() => handleSelectStatementOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"&gt;
                                                &lt;p className="font-medium"&gt;{owner.name}&lt;/p&gt;
                                                &lt;p className="text-sm text-muted-foreground"&gt;{(owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}&lt;/p&gt;
                                            &lt;/div&gt;
                                        ))}
                                    &lt;/ScrollArea&gt;
                                &lt;/Card&gt;
                            )}

                            {selectedStatementOwner && accountStatementData && (
                                &lt;Card className="mt-4 bg-card-foreground/5 dark:bg-card-foreground/5"&gt;
                                    &lt;CardHeader&gt;
                                        &lt;div className="flex justify-between items-center"&gt;
                                            &lt;div className="flex items-center gap-4"&gt;
                                                {companyInfo?.logo && &lt;img src={companyInfo.logo} alt="Logo" className="w-16 h-16 rounded-md"/>}
                                                &lt;div&gt;
                                                    &lt;p className="font-bold"&gt;{companyInfo?.name} | {companyInfo?.rif}&lt;/p&gt;
                                                    &lt;p className="text-sm"&gt;Propietario: {selectedStatementOwner.name}&lt;/p&gt;
                                                    &lt;p className="text-sm"&gt;Propiedad(es): {(selectedStatementOwner.properties || []).map(p => `${p.street}-${p.house}`).join(', ')}&lt;/p&gt;
                                                &lt;/div&gt;
                                            &lt;/div&gt;
                                            &lt;div className="text-right"&gt;
                                                &lt;h2 className="text-2xl font-bold"&gt;ESTADO DE CUENTA&lt;/h2&gt;
                                                &lt;p className="text-xs"&gt;Fecha: {format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss")}&lt;/p&gt;
                                                &lt;Button size="sm" variant="outline" className="mt-2" onClick={() => handleExportAccountStatement('pdf')}&gt;&lt;FileText className="mr-2 h-4 w-4" /> Exportar PDF&lt;/Button&gt;
                                            &lt;/div&gt;
                                        &lt;/div&gt;
                                    &lt;/CardHeader&gt;
                                    &lt;CardContent className="space-y-6"&gt;
                                        &lt;div&gt;
                                            &lt;h3 className="font-bold mb-2"&gt;Resumen de Pagos&lt;/h3&gt;
                                            &lt;Table&gt;
                                                &lt;TableHeader&gt;
                                                    &lt;TableRow className="bg-[#004D40] hover:bg-[#00382e] text-white"&gt;
                                                        &lt;TableHead className="text-white"&gt;Fecha&lt;/TableHead&gt;
                                                        &lt;TableHead className="text-white"&gt;Concepto&lt;/TableHead&gt;
                                                        &lt;TableHead className="text-white"&gt;Pagado por&lt;/TableHead&gt;
                                                        &lt;TableHead className="text-white text-right"&gt;Monto (Bs)&lt;/TableHead&gt;
                                                    &lt;/TableRow&gt;
                                                &lt;/TableHeader&gt;
                                                &lt;TableBody&gt;
                                                    {accountStatementData.payments.map(p => (
                                                        &lt;TableRow key={p.id}&gt;
                                                            &lt;TableCell&gt;{format(p.paymentDate.toDate(), 'dd-MM-yyyy')}&lt;/TableCell&gt;
                                                            &lt;TableCell&gt;Pago Cuota(s)&lt;/TableCell&gt;
                                                            &lt;TableCell&gt;Administrador&lt;/TableCell&gt;
                                                            &lt;TableCell className="text-right"&gt;{formatToTwoDecimals(p.totalAmount)}&lt;/TableCell&gt;
                                                        &lt;/TableRow&gt;
                                                    ))}
                                                &lt;/TableBody&gt;
                                                &lt;TableFooter&gt;
                                                     &lt;TableRow className="bg-[#004D40] hover:bg-[#00382e] text-white font-bold"&gt;
                                                        &lt;TableCell colSpan={3}&gt;Total Pagado&lt;/TableCell&gt;
                                                        &lt;TableCell className="text-right"&gt;Bs. {formatToTwoDecimals(accountStatementData.totalPaidBs)}&lt;/TableCell&gt;
                                                    &lt;/TableRow&gt;
                                                &lt;/TableFooter&gt;
                                            &lt;/Table&gt;
                                        &lt;/div&gt;
                                        &lt;div&gt;
                                            &lt;h3 className="font-bold mb-2"&gt;Resumen de Deudas&lt;/h3&gt;
                                            &lt;Table&gt;
                                                &lt;TableHeader&gt;
                                                    &lt;TableRow className="bg-[#004D40] hover:bg-[#00382e] text-white"&gt;
                                                        &lt;TableHead className="text-white"&gt;Periodo&lt;/TableHead&gt;
                                                        &lt;TableHead className="text-white"&gt;Concepto&lt;/TableHead&gt;
                                                        &lt;TableHead className="text-white text-right"&gt;Monto ($)&lt;/TableHead&gt;
                                                        &lt;TableHead className="text-white text-right"&gt;Estado&lt;/TableHead&gt;
                                                    &lt;/TableRow&gt;
                                                &lt;/TableHeader&gt;
                                                &lt;TableBody&gt;
                                                     {accountStatementData.debts.map(d => (
                                                        &lt;TableRow key={d.id}&gt;
                                                            &lt;TableCell&gt;{monthsLocale[d.month]} {d.year}&lt;/TableCell&gt;
                                                            &lt;TableCell&gt;{d.description}&lt;/TableCell&gt;
                                                            &lt;TableCell className="text-right"&gt;$${d.amountUSD.toFixed(2)}&lt;/TableCell&gt;
                                                            &lt;TableCell className="text-right"&gt;{d.status === 'paid' ? 'Pagada' : 'Pendiente'}&lt;/TableCell&gt;
                                                        &lt;/TableRow&gt;
                                                     ))}
                                                &lt;/TableBody&gt;
                                                &lt;TableFooter&gt;
                                                    &lt;TableRow className="bg-[#004D40] hover:bg-[#00382e] text-white font-bold"&gt;
                                                        &lt;TableCell colSpan={2}&gt;Total Adeudado&lt;/TableCell&gt;
                                                        &lt;TableCell className="text-right"&gt;$${accountStatementData.totalDebtUSD.toFixed(2)}&lt;/TableCell&gt;
                                                        &lt;TableCell&gt;&lt;/TableCell&gt;
                                                    &lt;/TableRow&gt;
                                                &lt;/TableFooter&gt;
                                            &lt;/Table&gt;
                                        &lt;/div&gt;
                                        &lt;div className="text-right font-bold text-lg pt-4"&gt;
                                            Saldo a Favor Actual: Bs. {formatToTwoDecimals(accountStatementData.balance)}
                                        &lt;/div&gt;
                                    &lt;/CardContent&gt;
                                &lt;/Card&gt;
                            )}
                        &lt;/CardContent&gt;
                     &lt;/Card&gt;
                &lt;/TabsContent&gt;

                 &lt;TabsContent value="delinquency"&gt;
                     &lt;Card&gt;
                        &lt;CardHeader&gt;
                            &lt;CardTitle&gt;Reporte Interactivo de Morosidad&lt;/CardTitle&gt;
                            &lt;CardDescription&gt;Filtre, seleccione y exporte la lista de propietarios con deudas pendientes.&lt;/CardDescription&gt;
                             &lt;div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 items-end"&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Antigüedad de Deuda&lt;/Label&gt;
                                    &lt;Select value={delinquencyFilterType} onValueChange={setDelinquencyFilterType}&gt;
                                        &lt;SelectTrigger&gt;&lt;SelectValue />&lt;/SelectTrigger&gt;
                                        &lt;SelectContent&gt;
                                            &lt;SelectItem value="all"&gt;Todos los morosos&lt;/SelectItem&gt;
                                            &lt;SelectItem value="2_or_more"&gt;2 meses o más&lt;/SelectItem&gt;
                                            &lt;SelectItem value="3_exact"&gt;Exactamente 3 meses&lt;/SelectItem&gt;
                                            &lt;SelectItem value="custom"&gt;Rango personalizado&lt;/SelectItem&gt;
                                        &lt;/SelectContent&gt;
                                    &lt;/Select&gt;
                                &lt;/div&gt;
                                {delinquencyFilterType === 'custom' && (
                                    &lt;div className="md:col-span-2 lg:col-span-1 grid grid-cols-2 gap-2 items-end"&gt;
                                        &lt;div className="space-y-2"&gt;
                                            &lt;Label&gt;Desde (meses)&lt;/Label&gt;
                                            &lt;Input type="number" value={customMonthRange.from} onChange={e => setCustomMonthRange(c => ({...c, from: e.target.value}))} />
                                        &lt;/div&gt;
                                        &lt;div className="space-y-2"&gt;
                                            &lt;Label&gt;Hasta (meses)&lt;/Label&gt;
                                            &lt;Input type="number" value={customMonthRange.to} onChange={e => setCustomMonthRange(c => ({...c, to: e.target.value}))} />
                                        &lt;/div&gt;
                                    &lt;/div&gt;
                                )}
                                 &lt;div className="space-y-2 md:col-start-1 lg:col-start-auto"&gt;
                                    &lt;Label&gt;Buscar Propietario&lt;/Label&gt;
                                     &lt;div className="relative"&gt;
                                        &lt;Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        &lt;Input placeholder="Buscar por nombre o propiedad..." className="pl-9" value={delinquencySearchTerm} onChange={e => setDelinquencySearchTerm(e.target.value)} />
                                    &lt;/div&gt;
                                &lt;/div&gt;
                                 &lt;div className="flex items-center space-x-2"&gt;
                                    &lt;Checkbox id="include-amounts" checked={includeDelinquencyAmounts} onCheckedChange={(checked) => setIncludeDelinquencyAmounts(Boolean(checked))} />
                                    &lt;Label htmlFor="include-amounts" className="cursor-pointer"&gt;
                                        Incluir montos en el reporte
                                    &lt;/Label&gt;
                                &lt;/div&gt;
                            &lt;/div&gt;
                        &lt;/CardHeader&gt;
                        &lt;CardContent&gt;
                            &lt;div className="flex items-center justify-between mb-4"&gt;
                                &lt;p className="text-sm text-muted-foreground"&gt;
                                    Mostrando {filteredAndSortedDelinquents.length} de {allDelinquentOwners.length} propietarios morosos. 
                                    Seleccionados: {selectedDelinquentOwners.size}
                                &lt;/p&gt;
                                &lt;div className="flex gap-2"&gt;
                                    &lt;Button variant="outline" onClick={() => handleExportDelinquency('pdf')}&gt;&lt;FileText className="mr-2 h-4 w-4" /> Exportar a PDF&lt;/Button&gt;
                                    &lt;Button variant="outline" onClick={() => handleExportDelinquency('excel')}&gt;&lt;FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel&lt;/Button&gt;
                                &lt;/div&gt;
                            &lt;/div&gt;
                            &lt;Table&gt;
                                &lt;TableHeader&gt;
                                    &lt;TableRow&gt;
                                        &lt;TableHead className="w-[50px]"&gt;
                                             &lt;Checkbox 
                                                checked={selectedDelinquentOwners.size === filteredAndSortedDelinquents.length && filteredAndSortedDelinquents.length &gt; 0}
                                                onCheckedChange={(checked) => setSelectedDelinquentOwners(new Set(Boolean(checked) ? filteredAndSortedDelinquents.map(o => o.id) : []))}
                                            />
                                        &lt;/TableHead&gt;
                                        &lt;TableHead&gt;
                                            &lt;Button variant="ghost" onClick={() => handleSortDelinquency('name')}&gt;
                                                Propietario {renderSortIcon('name')}
                                            &lt;/Button&gt;
                                        &lt;/TableHead&gt;
                                        &lt;TableHead&gt;Propiedades&lt;/TableHead&gt;
                                        &lt;TableHead&gt;
                                             &lt;Button variant="ghost" onClick={() => handleSortDelinquency('monthsOwed')}&gt;
                                                Meses {renderSortIcon('monthsOwed')}
                                            &lt;/Button&gt;
                                        &lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;
                                             &lt;Button variant="ghost" onClick={() => handleSortDelinquency('debtAmountUSD')}&gt;
                                                Deuda (USD) {renderSortIcon('debtAmountUSD')}
                                            &lt;/Button&gt;
                                        &lt;/TableHead&gt;
                                    &lt;/TableRow&gt;
                                &lt;/TableHeader&gt;
                                &lt;TableBody&gt;
                                    {filteredAndSortedDelinquents.length &gt; 0 ? (
                                        filteredAndSortedDelinquents.map(owner => (
                                            &lt;TableRow key={owner.id} data-state={selectedDelinquentOwners.has(owner.id) ? 'selected' : undefined}&gt;
                                                &lt;TableCell&gt;
                                                    &lt;Checkbox
                                                        checked={selectedDelinquentOwners.has(owner.id)}
                                                        onCheckedChange={()=>{
                                                            const newSelection = new Set(selectedDelinquentOwners);
                                                            if (newSelection.has(owner.id)) newSelection.delete(owner.id);
                                                            else newSelection.add(owner.id);
                                                            setSelectedDelinquentOwners(newSelection);
                                                        }}
                                                    />
                                                &lt;/TableCell&gt;
                                                &lt;TableCell className="font-medium"&gt;{owner.name}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{owner.properties}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{owner.monthsOwed}&lt;/TableCell&gt;
                                                &lt;TableCell className="text-right font-semibold"&gt;${owner.debtAmountUSD.toFixed(2)}&lt;/TableCell&gt;
                                            &lt;/TableRow&gt;
                                        ))
                                    ) : (
                                        &lt;TableRow&gt;
                                            &lt;TableCell colSpan={5} className="h-24 text-center"&gt;
                                                No se encontraron propietarios con los filtros seleccionados.
                                            &lt;/TableCell&gt;
                                        &lt;/TableRow&gt;
                                    )}
                                &lt;/TableBody&gt;
                            &lt;/Table&gt;
                        &lt;/CardContent&gt;
                     &lt;/Card&gt;
                 &lt;/TabsContent&gt;

                 &lt;TabsContent value="balance"&gt;
                     &lt;Card&gt;
                        &lt;CardHeader&gt;
                            &lt;CardTitle&gt;Consulta de Saldos a Favor&lt;/CardTitle&gt;
                            &lt;CardDescription&gt;Lista de todos los propietarios con saldo positivo en sus cuentas.&lt;/CardDescription&gt;
                             &lt;div className="flex items-center justify-between mt-4"&gt;
                                &lt;div className="relative max-w-sm"&gt;
                                    &lt;Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    &lt;Input placeholder="Buscar por propietario..." className="pl-9" value={balanceSearchTerm} onChange={e => setBalanceSearchTerm(e.target.value)} />
                                &lt;/div&gt;
                                &lt;div className="flex gap-2"&gt;
                                    &lt;Button variant="outline" onClick={()=>handleExportBalance('pdf')}&gt;&lt;FileText className="mr-2 h-4 w-4" /> PDF&lt;/Button&gt;
                                    &lt;Button variant="outline" onClick={()=>handleExportBalance('excel')}&gt;&lt;FileSpreadsheet className="mr-2 h-4 w-4" /> Excel&lt;/Button&gt;
                                &lt;/div&gt;
                            &lt;/div&gt;
                        &lt;/CardHeader&gt;
                        &lt;CardContent&gt;
                            &lt;Table&gt;
                                &lt;TableHeader&gt;
                                    &lt;TableRow&gt;
                                        &lt;TableHead&gt;Propietario&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Propiedades&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Saldo (Bs.)&lt;/TableHead&gt;
                                    &lt;/TableRow&gt;
                                &lt;/TableHeader&gt;
                                &lt;TableBody&gt;
                                    {filteredBalanceOwners.length &gt; 0 ? (
                                        filteredBalanceOwners.map(owner => (
                                            &lt;TableRow key={owner.id}&gt;
                                                &lt;TableCell className="font-medium"&gt;{owner.name}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{owner.properties}&lt;/TableCell&gt;
                                                &lt;TableCell className="text-right font-bold text-green-500"&gt;Bs. {formatToTwoDecimals(owner.balance)}&lt;/TableCell&gt;
                                            &lt;/TableRow&gt;
                                        ))
                                    ) : (
                                        &lt;TableRow&gt;&lt;TableCell colSpan={3} className="h-24 text-center"&gt;No hay propietarios con saldo a favor.&lt;/TableCell&gt;&lt;/TableRow&gt;
                                    )}
                                &lt;/TableBody&gt;
                            &lt;/Table&gt;
                        &lt;/CardContent&gt;
                     &lt;/Card&gt;
                 &lt;/TabsContent&gt;
                 
                &lt;TabsContent value="income"&gt;
                     &lt;Card&gt;
                        &lt;CardHeader&gt;
                            &lt;CardTitle&gt;Informe de Ingresos&lt;/CardTitle&gt;
                            &lt;CardDescription&gt;Consulta los pagos aprobados en un período específico.&lt;/CardDescription&gt;
                             &lt;div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 items-end"&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Buscar Propietario/Propiedad&lt;/Label&gt;
                                    &lt;Input placeholder="Nombre, calle o casa..." value={incomeSearchTerm} onChange={e => setIncomeSearchTerm(e.target.value)} />
                                &lt;/div&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Pagos Desde&lt;/Label&gt;
                                    &lt;Popover&gt;
                                        &lt;PopoverTrigger asChild&gt;
                                            &lt;Button variant="outline" className={cn("w-full justify-start", !incomeDateRange.from && "text-muted-foreground")}&gt;
                                                &lt;CalendarIcon className="mr-2 h-4 w-4" />
                                                {incomeDateRange.from ? format(incomeDateRange.from, 'P', { locale: es }) : "Fecha"}
                                            &lt;/Button&gt;
                                        &lt;/PopoverTrigger&gt;
                                        &lt;PopoverContent&gt;&lt;Calendar mode="single" selected={incomeDateRange.from} onSelect={d => setIncomeDateRange(prev => ({...prev, from: d}))} />&lt;/PopoverContent&gt;
                                    &lt;/Popover&gt;
                                &lt;/div&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Pagos Hasta&lt;/Label&gt;
                                     &lt;Popover&gt;
                                        &lt;PopoverTrigger asChild&gt;
                                            &lt;Button variant="outline" className={cn("w-full justify-start", !incomeDateRange.to && "text-muted-foreground")}&gt;
                                                &lt;CalendarIcon className="mr-2 h-4 w-4" />
                                                {incomeDateRange.to ? format(incomeDateRange.to, 'P', { locale: es }) : "Fecha"}
                                            &lt;/Button&gt;
                                        &lt;/PopoverTrigger&gt;
                                        &lt;PopoverContent&gt;&lt;Calendar mode="single" selected={incomeDateRange.to} onSelect={d => setIncomeDateRange(prev => ({...prev, to: d}))} />&lt;/PopoverContent&gt;
                                    &lt;/Popover&gt;
                                &lt;/div&gt;
                            &lt;/div&gt;
                        &lt;/CardHeader&gt;
                        &lt;CardContent&gt;
                             &lt;div className="flex justify-end gap-2 mb-4"&gt;
                                &lt;Button variant="outline" onClick={() => handleExportIncomeReport('pdf')} disabled={generatingReport}&gt;
                                    &lt;FileText className="mr-2 h-4 w-4" /> Exportar a PDF
                                &lt;/Button&gt;
                                &lt;Button variant="outline" onClick={()=>handleExportIncomeReport('excel')} disabled={generatingReport}&gt;
                                    &lt;FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel
                                &lt;/Button&gt;
                            &lt;/div&gt;
                            &lt;Table&gt;
                                &lt;TableHeader&gt;
                                    &lt;TableRow&gt;
                                        &lt;TableHead&gt;Propietario&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Calle&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Casa&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Fecha&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Monto (Bs.)&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Referencia&lt;/TableHead&gt;
                                    &lt;/TableRow&gt;
                                &lt;/TableHeader&gt;
                                &lt;TableBody&gt;
                                    {incomeReportRows.length &gt; 0 ? (
                                        incomeReportRows.map((row, index) => (
                                            &lt;TableRow key={index}&gt;
                                                &lt;TableCell&gt;{row.ownerName}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{row.street}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{row.house}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{row.date}&lt;/TableCell&gt;
                                                &lt;TableCell className="text-right"&gt;{formatToTwoDecimals(row.amount)}&lt;/TableCell&gt;
                                                &lt;TableCell className="text-right"&gt;{row.reference}&lt;/TableCell&gt;
                                            &lt;/TableRow&gt;
                                        ))
                                    ) : (
                                        &lt;TableRow&gt;&lt;TableCell colSpan={6} className="h-24 text-center"&gt;No se encontraron ingresos para el período y filtro seleccionados.&lt;/TableCell&gt;&lt;/TableRow&gt;
                                    )}
                                &lt;/TableBody&gt;
                            &lt;/Table&gt;
                        &lt;/CardContent&gt;
                    &lt;/Card&gt;
                &lt;/TabsContent&gt;

                &lt;TabsContent value="monthly"&gt;
                    &lt;Card&gt;
                        &lt;CardHeader&gt;
                            &lt;CardTitle&gt;Reporte de Pagos Mensual&lt;/CardTitle&gt;
                            &lt;CardDescription&gt;Revisa todos los pagos aprobados en un mes específico y los meses que liquidaron.&lt;/CardDescription&gt;
                            &lt;div className="flex gap-4 pt-4"&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Mes&lt;/Label&gt;
                                    &lt;Select value={selectedMonth} onValueChange={setSelectedMonth}&gt;
                                        &lt;SelectTrigger className="w-40"&gt;&lt;SelectValue />&lt;/SelectTrigger&gt;
                                        &lt;SelectContent&gt;{monthOptions.map(m => &lt;SelectItem key={m.value} value={m.value}&gt;{m.label}&lt;/SelectItem&gt;)}&lt;/SelectContent&gt;
                                    &lt;/Select&gt;
                                &lt;/div&gt;
                                &lt;div className="space-y-2"&gt;
                                    &lt;Label&gt;Año&lt;/Label&gt;
                                    &lt;Select value={selectedYear} onValueChange={setSelectedYear}&gt;
                                        &lt;SelectTrigger className="w-32"&gt;&lt;SelectValue />&lt;/SelectTrigger&gt;
                                        &lt;SelectContent&gt;{years.map(y => &lt;SelectItem key={y} value={y}&gt;{y}&lt;/SelectItem&gt;)}&lt;/SelectContent&gt;
                                    &lt;/Select&gt;
                                &lt;/div&gt;
                            &lt;/div&gt;
                        &lt;/CardHeader&gt;
                        &lt;CardContent&gt;
                            &lt;div className="flex justify-end gap-2 mb-4"&gt;
                                &lt;Button variant="outline" onClick={() => handleExportMonthlyReport('pdf')}&gt;&lt;FileText className="mr-2 h-4 w-4" /> PDF&lt;/Button&gt;
                                &lt;Button variant="outline" onClick={() => handleExportMonthlyReport('excel')}&gt;&lt;FileSpreadsheet className="mr-2 h-4 w-4" /> Excel&lt;/Button&gt;
                            &lt;/div&gt;
                            &lt;Table&gt;
                                &lt;TableHeader&gt;
                                    &lt;TableRow&gt;
                                        &lt;TableHead&gt;Propietario&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Propiedad&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Fecha Pago&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Monto (Bs.)&lt;/TableHead&gt;
                                        &lt;TableHead className="text-right"&gt;Referencia&lt;/TableHead&gt;
                                        &lt;TableHead&gt;Meses Pagados&lt;/TableHead&gt;
                                    &lt;/TableRow&gt;
                                &lt;/TableHeader&gt;
                                &lt;TableBody&gt;
                                    {monthlyReportData.length &gt; 0 ? (
                                        monthlyReportData.map(row => (
                                            &lt;TableRow key={row.paymentId}&gt;
                                                &lt;TableCell&gt;{row.ownerName}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{row.properties}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{row.paymentDate}&lt;/TableCell&gt;
                                                &lt;TableCell className="text-right"&gt;{formatToTwoDecimals(row.amount)}&lt;/TableCell&gt;
                                                &lt;TableCell className="text-right"&gt;{row.reference}&lt;/TableCell&gt;
                                                &lt;TableCell&gt;{row.paidMonths}&lt;/TableCell&gt;
                                            &lt;/TableRow&gt;
                                        ))
                                    ) : (
                                        &lt;TableRow&gt;&lt;TableCell colSpan={6} className="h-24 text-center"&gt;No hay pagos aprobados para el mes seleccionado.&lt;/TableCell&gt;&lt;/TableRow&gt;
                                    )}
                                &lt;/TableBody&gt;
                            &lt;/Table&gt;
                        &lt;/CardContent&gt;
                    &lt;/Card&gt;
                &lt;/TabsContent&gt;
            &lt;/Tabs&gt;
        &lt;/div&gt;
    );
}

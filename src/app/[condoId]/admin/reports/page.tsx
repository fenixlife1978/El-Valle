
// @ts-nocheck


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
import { Calendar as CalendarIcon, Download, Search, Loader2, FileText, FileSpreadsheet, ArrowUpDown, Building, BadgeInfo, BadgeCheck, BadgeX, History, ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign, Receipt, Wand2, Megaphone, ArrowLeft, Trash2, MoreHorizontal, Eye } from "lucide-react";
import { collection, getDocs, query, where, doc, getDoc, orderBy, Timestamp, addDoc, setDoc, writeBatch, deleteDoc, limit, onSnapshot } from 'firebase/firestore';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuthorization } from '@/hooks/use-authorization';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
    email?: string;
    balance: number;
    role: 'propietario' | 'administrador';
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
    status: 'pending' | 'paid' | 'vencida';
    paymentId?: string; // <-- ¡Esta es la línea clave que faltaba!
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

type SavedIntegralReport = {
    id: string;
    createdAt: Timestamp;
    data: IntegralReportRow[];
    filters: {
        statusFilter: string;
        ownerFilter: string;
        dateRangeFrom?: string;
        dateRangeTo?: string;
    }
};

type PublishedReport = {
    id: string;
    type: 'integral' | 'balance';
    sourceId: string;
    createdAt: Timestamp;
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

const buildIntegralReportData = (
    owners: Owner[],
    allDebts: Debt[],
    allPayments: Payment[],
    allHistoricalPayments: HistoricalPayment[],
    dateRange: { from?: Date; to?: Date }
): IntegralReportRow[] => {
    const sortedOwners = [...owners]
        .filter(owner => owner.role === 'propietario')
        .map(owner => {
            const propertiesString = (owner.properties || []).map(p => `${p.street}-${p.house}`).join(', ');
            const sortKeys = getSortKeys({ properties: propertiesString });
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
        let lastConsecutivePaidMonth: Date | null = null;
        
        if (firstMonthEver) {
            let currentCheckMonth = firstMonthEver;
            const limitDate = endOfMonth(addMonths(new Date(), 120));

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
        
        const pendingDebts = ownerDebts.filter(d => d.status === 'pending' || d.status === 'vencida');
        const hasAnyPendingDebt = pendingDebts.length > 0;

        const status: 'Solvente' | 'No Solvente' = !hasAnyPendingDebt ? 'Solvente' : 'No Solvente';
        let solvencyPeriod = '';
        
        if (status === 'No Solvente') {
            if (lastConsecutivePaidMonth) {
                 solvencyPeriod = `Desde ${format(addMonths(lastConsecutivePaidMonth, 1), 'MMMM yyyy', { locale: es })}`;
            } else if (firstMonthEver) {
                 solvencyPeriod = `Desde ${format(firstMonthEver, 'MMMM yyyy', { locale: es })}`;
            } else {
                solvencyPeriod = `Desde ${format(today, 'MMMM yyyy', { locale: es })}`;
            }
        } else {
            if (lastConsecutivePaidMonth) {
                solvencyPeriod = `Hasta ${format(lastConsecutivePaidMonth, 'MMMM yyyy', { locale: es })}`;
            } else {
                solvencyPeriod = 'Al día';
            }
        }

        const fromDate = dateRange.from;
        const toDate = dateRange.to;
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
        
        const adjustmentDebtUSD = pendingDebts
            .filter(d => d.description.toLowerCase().includes('ajuste'))
            .reduce((sum, d) => sum + d.amountUSD, 0);
        
        const uniquePendingMonths = new Set(pendingDebts.map(d => `${d.year}-${d.month}`));
        const monthsOwed = uniquePendingMonths.size;

        
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
    });
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

type IncomeReportRow = {
    period: string;
    totalBs: number;
    totalUsd: number;
    paymentCount: number;
};

export default function ReportsPage() {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const router = useRouter();
    const { activeCondoId, companyInfo: authCompanyInfo } = useAuth();

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

    // New state for saved integral reports
    const [savedIntegralReports, setSavedIntegralReports] = useState<SavedIntegralReport[]>([]);
    const [publishedReports, setPublishedReports] = useState<PublishedReport[]>([]);
    const [reportToPreview, setReportToPreview] = useState<SavedIntegralReport | null>(null);


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

    // State for Income Report
    const [incomeDateRange, setIncomeDateRange] = useState<{ from?: Date; to?: Date }>({});
    


    const fetchData = useCallback(async () => {
        if (!activeCondoId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const settingsRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
            const ownersQuery = query(collection(db, 'condominios', activeCondoId, 'owners'));
            const paymentsQuery = query(collection(db, 'condominios', activeCondoId, 'payments'));
            const debtsQuery = query(collection(db, 'condominios', activeCondoId, 'debts'));
            const historicalPaymentsQuery = query(collection(db, 'condominios', activeCondoId, 'historical_payments'));
            const savedReportsQuery = query(collection(db, 'condominios', activeCondoId, 'integral_reports'), orderBy('createdAt', 'desc'));
            const publishedReportsQuery = query(collection(db, 'condominios', activeCondoId, 'published_reports'));
            
            const unsubs: (() => void)[] = [];

            const settingsSnap = await getDoc(settingsRef);
            let rate = 0;
            if (settingsSnap.exists()){
                 const settings = settingsSnap.data();
                 setCompanyInfo(settings.companyInfo as CompanyInfo);
                 setCondoFee(settings.condoFee || 0);
                 const rates = settings.exchangeRates || [];
                 const activeRateObj = rates.find((r: any) => r.active);
                 rate = activeRateObj ? activeRateObj.rate : (rates.length > 0 ? rates[0]?.rate : 0);
                 setActiveRate(rate);
            }
            
            unsubs.push(onSnapshot(savedReportsQuery, (snapshot) => {
                setSavedIntegralReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedIntegralReport)));
            }));
            
            unsubs.push(onSnapshot(publishedReportsQuery, (snapshot) => {
                setPublishedReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PublishedReport)));
            }));

            const ownersSnapshot = await getDocs(ownersQuery);
            const ownersData = ownersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Owner));
            setOwners(ownersData);

            const paymentsSnapshot = await getDocs(paymentsQuery);
            const paymentsData = paymentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
            setAllPayments(paymentsData);
            
            const debtsSnapshot = await getDocs(debtsQuery);
            const debtsData = debtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
            setAllDebts(debtsData);
            
            const historicalPaymentsSnapshot = await getDocs(historicalPaymentsQuery);
            setAllHistoricalPayments(historicalPaymentsSnapshot.docs.map(d => d.data() as HistoricalPayment));


            // --- Delinquency Data Calculation (Corrected Logic) ---
            const debtsByOwner = new Map<string, { totalUSD: number, uniqueMonths: Set<string> }>();
            const delinquencyDebtsQuery = query(collection(db, 'condominios', activeCondoId, 'debts'), where('status', 'in', ['pending', 'vencida']));
            const delinquencyDebtsSnapshot = await getDocs(delinquencyDebtsQuery);

            delinquencyDebtsSnapshot.docs.forEach(doc => {
                const debt = doc.data() as Debt;
                if (debt.ownerId) {
                    const ownerData = debtsByOwner.get(debt.ownerId) || { totalUSD: 0, uniqueMonths: new Set() };
                    ownerData.uniqueMonths.add(`${debt.year}-${debt.month}`);
                    ownerData.totalUSD += debt.amountUSD;
                    debtsByOwner.set(debt.ownerId, ownerData);
                }
            });


            const delinquentData: DelinquentOwner[] = [];
            debtsByOwner.forEach((debtInfo, ownerId) => {
                const owner = ownersData.find(o => o.id === ownerId);
                if (owner && debtInfo.uniqueMonths.size > 0 && owner.role === 'propietario') { 
                    delinquentData.push({
                        id: ownerId,
                        name: owner.name,
                        properties: (owner.properties || []).map((p: any) => `${p.street} - ${p.house}`).join(', '),
                        debtAmountUSD: debtInfo.totalUSD,
                        monthsOwed: debtInfo.uniqueMonths.size,
                    });
                }
            });
            setAllDelinquentOwners(delinquentData);
            setSelectedDelinquentOwners(new Set(delinquentData.map(o => o.id)));

            // --- Balance Report Data Calculation ---
            const ownersWithBalance = ownersData.filter(o => o.role === 'propietario' && o.balance > 0);
            
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
            
            return () => unsubs.forEach(unsub => unsub());

        } catch (error) {
            console.error("Error fetching report data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos para los reportes.' });
        } finally {
            setLoading(false);
        }
    }, [toast, activeCondoId]);
    
    useEffect(() => {
        const unsubPromise = fetchData();
        return () => {
            unsubPromise.then(cleanup => cleanup && cleanup());
        }
    }, [fetchData]);


    const integralReportData = useMemo<IntegralReportRow[]>(() => {
        const data = buildIntegralReportData(
            owners,
            allDebts,
            allPayments,
            allHistoricalPayments,
            integralDateRange
        );

        return data.filter(row => {
            const statusMatch = integralStatusFilter === 'todos' || row.status.toLowerCase().replace(' ', '') === integralStatusFilter.toLowerCase().replace(' ', '');
            const ownerNameMatch = !integralOwnerFilter || (row.name && row.name.toLowerCase().includes(integralOwnerFilter.toLowerCase()));
            return statusMatch && ownerNameMatch;
        });
    }, [owners, allDebts, allPayments, allHistoricalPayments, integralDateRange, integralOwnerFilter, integralStatusFilter]);
    
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
                 if (a[delinquencySortConfig.key] < b[delinquencySortConfig.key]) return delinquencySortConfig.direction === 'asc' ? -1 : 1;
                if (a[delinquencySortConfig.key] > b[delinquencySortConfig.key]) return delinquencySortConfig.direction === 'asc' ? 1 : -1;
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

    const incomeReportData = useMemo<IncomeReportRow[]>(() => {
        const filteredPayments = allPayments.filter(p => {
            if (p.status !== 'aprobado') return false;
            const paymentDate = p.paymentDate.toDate();
            if (incomeDateRange.from && paymentDate < incomeDateRange.from) return false;
            if (incomeDateRange.to && paymentDate > incomeDateRange.to) return false;
            return true;
        });
    
        const groupedByMonth = filteredPayments.reduce((acc, p) => {
            const monthKey = format(p.paymentDate.toDate(), 'yyyy-MM');
            if (!acc[monthKey]) {
                acc[monthKey] = {
                    period: format(p.paymentDate.toDate(), 'MMMM yyyy', { locale: es }),
                    sortKey: monthKey,
                    totalBs: 0,
                    totalUsd: 0,
                    paymentCount: 0
                };
            }
            const amountBs = p.totalAmount;
            acc[monthKey].totalBs += amountBs;
            acc[monthKey].totalUsd += amountBs / (p.exchangeRate || activeRate || 1);
            acc[monthKey].paymentCount++;
            return acc;
        }, {} as Record<string, any>);
    
        return Object.values(groupedByMonth).sort((a:any, b:any) => b.sortKey.localeCompare(a.sortKey));
    }, [allPayments, incomeDateRange, activeRate]);

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
            .filter(d => d.ownerId === owner.id && (d.status === 'pending' || d.status === 'vencida'))
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

        const totalDebtUSD = ownerDebts.filter(d => d.status === 'pending' || d.status === 'vencida').reduce((sum, d) => sum + d.amountUSD, 0);
        const totalPaidBs = ownerPayments.reduce((sum, p) => sum + p.totalAmount, 0);

        setAccountStatementData({
            debts: ownerDebts,
            payments: ownerPayments,
            totalPaidBs: totalPaidBs,
            totalDebtUSD: totalDebtUSD,
            balance: owner.balance,
        });
    };
    
    const handleGenerateAndSaveIntegral = async () => {
        if (!activeCondoId) return;
        setGeneratingReport(true);
        try {
            // Refetch all data to ensure it's current
            const ownersData = (await getDocs(collection(db, 'condominios', activeCondoId, 'owners'))).docs.map(d => ({ id: d.id, ...d.data() } as Owner));
            const debtsData = (await getDocs(collection(db, 'condominios', activeCondoId, 'debts'))).docs.map(d => ({ id: d.id, ...d.data() } as Debt));
            const paymentsData = (await getDocs(collection(db, 'condominios', activeCondoId, 'payments'))).docs.map(d => ({ id: d.id, ...d.data() } as Payment));
            const historicalData = (await getDocs(collection(db, 'condominios', activeCondoId, 'historical_payments'))).docs.map(d => d.data() as HistoricalPayment);
            
            const dataToSave = buildIntegralReportData(ownersData, debtsData, paymentsData, historicalData, integralDateRange);

            const reportRef = doc(collection(db, 'condominios', activeCondoId, 'integral_reports'));
            await setDoc(reportRef, {
                createdAt: Timestamp.now(),
                data: dataToSave,
                filters: {
                    statusFilter: integralStatusFilter,
                    ownerFilter: integralOwnerFilter,
                    dateRangeFrom: integralDateRange.from?.toISOString(),
                    dateRangeTo: integralDateRange.to?.toISOString(),
                }
            });

            toast({ title: "Reporte Guardado", description: "El reporte integral ha sido generado y guardado." });
        } catch (error) {
            console.error('Error saving integral report:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el reporte integral.' });
        } finally {
            setGeneratingReport(false);
        }
    };
    
    const handlePublishIntegralReport = async (reportId: string, report: SavedIntegralReport) => {
        if (!activeCondoId) return;
        requestAuthorization(async () => {
            setGeneratingReport(true);
            try {
                const publicationId = `integral-${report.id}`;
                const reportRef = doc(db, 'condominios', activeCondoId, 'published_reports', publicationId);
                await setDoc(reportRef, {
                    type: 'integral',
                    sourceId: report.id,
                    createdAt: Timestamp.now(),
                });

                const ownersSnapshot = await getDocs(query(collection(db, 'condominios', activeCondoId, 'owners'), where('role', '==', 'propietario')));
                const batch = writeBatch(db);
                ownersSnapshot.forEach(ownerDoc => {
                    const notificationsRef = doc(collection(db, `condominios/${activeCondoId}/owners/${ownerDoc.id}/notifications`));
                    batch.set(notificationsRef, {
                        title: 'Nuevo Reporte Publicado',
                        body: 'El reporte integral de propietarios ya está disponible para su consulta.',
                        createdAt: Timestamp.now(),
                        read: false,
                        href: `/${activeCondoId}/owner/reports`
                    });
                });
                await batch.commit();

                toast({ title: 'Reporte Publicado', description: 'El reporte integral ahora es visible para los propietarios.', className: 'bg-blue-100 text-blue-800' });
            } catch (error) {
                console.error('Error publishing integral report:', error);
                toast({ variant: 'destructive', title: 'Error de Publicación' });
            } finally {
                setGeneratingReport(false);
            }
        });
    };

    const handleDeleteIntegralPublication = async (reportId: string) => {
        if (!activeCondoId) return;
        requestAuthorization(async () => {
            setGeneratingReport(true);
            try {
                const publicationId = `integral-${reportId}`;
                const pubDocRef = doc(db, 'condominios', activeCondoId, 'published_reports', publicationId);
                await deleteDoc(pubDocRef);
                toast({ title: 'Publicación Eliminada' });
            } catch (error) {
                console.error("Error deleting integral report publication:", error);
                toast({ variant: 'destructive', title: 'Error' });
            } finally {
                setGeneratingReport(false);
            }
        });
    };

    const handleDeleteSavedIntegralReport = async (reportId: string) => {
        if (!activeCondoId) return;
        requestAuthorization(async () => {
            setGeneratingReport(true);
            try {
                const batch = writeBatch(db);
                batch.delete(doc(db, 'condominios', activeCondoId, 'integral_reports', reportId));
                
                const publicationId = `integral-${reportId}`;
                const pubDocRef = doc(db, 'condominios', activeCondoId, 'published_reports', publicationId);
                batch.delete(pubDocRef); 
                
                await batch.commit();
                toast({ title: 'Reporte Eliminado' });
            } catch (error) {
                console.error("Error deleting saved integral report:", error);
                toast({ variant: 'destructive', title: 'Error al eliminar' });
            } finally {
                setGeneratingReport(false);
            }
        });
    };
    
    const handlePreviewIntegralReport = (report: SavedIntegralReport) => {
        setReportToPreview(report);
    };

    const handleExportIntegralPdf = async (report: SavedIntegralReport) => {
        if (!report || !companyInfo) return;
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const data = report.data;
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 14;
        let startY = 20;
    
        // 1. Header
        if (companyInfo?.logo) {
            try {
                doc.addImage(companyInfo.logo, 'PNG', margin, startY, 20, 20);
            } catch (e) {
                console.error("Error adding logo to PDF:", e);
            }
        }
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(companyInfo.name, margin + 25, startY + 8);
    
        doc.setFontSize(18);
        doc.text("Reporte Integral de Propietarios", pageWidth / 2, startY + 18, { align: 'center' });
    
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const emissionDateText = `Fecha de Emisión: ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss")}`;
        doc.text(emissionDateText, pageWidth - margin, startY + 25, { align: 'right' });
        
        startY = startY + 40; // Space after header
    
        // 2. Table
        autoTable(doc, {
            head: [["Propietario", "Propiedad", "Fecha Últ. Pago", "Monto Pagado (Bs)", "Tasa BCV", "Saldo a Favor (Bs)", "Estado", "Periodo", "Meses Adeudados", "Deuda por Ajuste ($)"]],
            body: data.map((row: IntegralReportRow) => [
                row.name,
                row.properties,
                row.lastPaymentDate,
                row.paidAmount > 0 ? formatToTwoDecimals(row.paidAmount) : '',
                row.avgRate > 0 ? formatToTwoDecimals(row.avgRate) : '',
                row.balance > 0 ? formatToTwoDecimals(row.balance) : '',
                row.status,
                row.solvencyPeriod,
                row.monthsOwed > 0 ? row.monthsOwed : '',
                row.adjustmentDebtUSD > 0 ? `$${row.adjustmentDebtUSD.toFixed(2)}` : '',
            ]),
            startY,
            theme: 'striped',
            headStyles: { 
                fillColor: [30, 80, 180], // Dark blue
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8,
            },
            styles: { 
                fontSize: 8, 
                cellPadding: 2, 
                overflow: 'linebreak',
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: 30 }, // Propietario
                1: { cellWidth: 30 }, // Propiedad
                2: { halign: 'left' }, // Fecha Últ. Pago
                3: { halign: 'right' }, // Monto Pagado
                4: { halign: 'right' }, // Tasa BCV
                5: { halign: 'right' }, // Saldo a Favor
                6: { halign: 'left' }, // Estado
                7: { halign: 'left' }, // Periodo
                8: { halign: 'center' }, // Meses Adeudados
                9: { halign: 'right' }, // Deuda por Ajuste
            },
        });
    
        doc.save(`Reporte_Integral_${format(report.createdAt.toDate(), 'yyyy-MM-dd')}.pdf`);
    };


    const handleExportDelinquency = async (formatType: 'pdf' | 'excel') => {
        const data = filteredAndSortedDelinquents.filter(o => selectedDelinquentOwners.has(o.id));
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "Por favor, seleccione al menos un propietario." });
            return;
        }

        const head = includeDelinquencyAmounts 
            ? [['Propietario', 'Propiedades', 'Meses Adeudados', 'Deuda (USD)']]
            : [['Propietario', 'Propiedades', 'Meses Adeudados']];
        
        const body = data.map(o => {
            const row: (string|number)[] = [o.name, o.properties, o.monthsOwed];
            if (includeDelinquencyAmounts) {
                row.push(`$${o.debtAmountUSD.toFixed(2)}`);
            }
            return row;
        });

        if (formatType === 'pdf') {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;

            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
            if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
            
            doc.setFontSize(10).text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
            doc.setFontSize(16).setFont('helvetica', 'bold').text("Reporte de Morosidad", pageWidth / 2, margin + 45, { align: 'center' });
        
            autoTable(doc, {
                head: head, body: body, startY: margin + 55, headStyles: { fillColor: [220, 53, 69] },
                styles: { cellPadding: 2.5, fontSize: 10 },
                columnStyles: {
                    3: { halign: 'right' }
                }
            });
            doc.save(`reporte_morosidad_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        } else {
             const ExcelJS = await import('exceljs');
             const workbook = new ExcelJS.Workbook();
             const worksheet = workbook.addWorksheet("Morosidad");

             const columns: { 
                header: string; 
                key: string; 
                width: number; 
                style?: { numFmt?: string } 
            }[] = [
                { header: 'Propietario', key: 'name', width: 30 },
                { header: 'Propiedades', key: 'properties', width: 30 },
                { header: 'Meses Adeudados', key: 'monthsOwed', width: 15 },
            ];
            
            if (includeDelinquencyAmounts) {
                columns.push({
                    header: 'Deuda (USD)',
                    key: 'debtAmountUSD',
                    width: 15,
                    style: { numFmt: '$#,##0.00' }
                });
            }
            
             worksheet.columns = columns as any;

             const dataToExport = data.map(o => {
                const baseData: any = { name: o.name, properties: o.properties, monthsOwed: o.monthsOwed };
                if (includeDelinquencyAmounts) {
                    baseData.debtAmountUSD = o.debtAmountUSD;
                }
                return baseData;
            });
             worksheet.addRows(dataToExport);

             const buffer = await workbook.xlsx.writeBuffer();
             const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
             const link = document.createElement('a');
             link.href = URL.createObjectURL(blob);
             link.download = `reporte_morosidad_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
             link.click();
             window.URL.revokeObjectURL(link.href);
        }
    };
    
    const handleSortDelinquency = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (delinquencySortConfig.key === key && delinquencySortConfig.direction === 'asc') direction = 'desc';
        setDelinquencySortConfig({ key, direction });
    };

    const handleExportIndividual = async (formatType: 'pdf' | 'excel') => {
        if (!selectedIndividual || !companyInfo) return;

        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
    
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
                doc.rect(margin, startY-4, pageWidth - (margin*2), 10, 'F');
                doc.text(`Fecha: ${paymentDate}`, margin + 2, startY);
                doc.text(`Monto: ${paymentAmount}`, margin + 70, startY);
                doc.text(`Ref: ${paymentRef}`, margin + 125, startY);
                doc.text(`Tasa: ${rate}`, pageWidth - margin - 2, startY, { align: 'right' });
                startY += 8;

                if (payment.liquidatedDebts.length > 0) {
                     autoTable(doc, {
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

    const handleExportAccountStatement = async (formatType: 'pdf' | 'excel') => {
        if (!selectedStatementOwner || !companyInfo || !accountStatementData) return;

        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

        const filename = `estado_de_cuenta_${selectedStatementOwner.name.replace(/\s/g, '_')}`;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        // --- Header ---
        if (companyInfo.logo) doc.addImage(companyInfo.logo, 'PNG', margin, margin, 20, 20);
        
        doc.setFontSize(10).setFont('helvetica', 'bold').text(companyInfo.name, margin + 25, margin + 8);
        doc.setFontSize(8).setFont('helvetica', 'normal').text(companyInfo.rif, margin + 25, margin + 13);
        doc.setFontSize(8).setFont('helvetica', 'normal').text(`Propietario: ${selectedStatementOwner.name}`, margin + 25, margin + 18);
        doc.setFontSize(8).setFont('helvetica', 'normal').text(`Propiedad(es): ${(selectedStatementOwner.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}`, margin + 25, margin + 23);

        doc.setFontSize(16).setFont('helvetica', 'bold').text('ESTADO DE CUENTA', pageWidth - margin, margin + 15, { align: 'right' });
        const dateText = `Fecha: ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss")}`;
        doc.setFontSize(8).setFont('helvetica', 'normal').text(dateText, pageWidth - margin, margin + 22, { align: 'right'});
        
        let startY = margin + 40;

        // --- Payments Summary ---
        doc.setFontSize(11).setFont('helvetica', 'bold').text('Resumen de Pagos', margin, startY);
        startY += 6;
        autoTable(doc, {
            head: [['Fecha', 'Concepto', 'Pagado por', 'Monto (Bs)']],
            body: accountStatementData.payments.map(p => [
                format(p.paymentDate.toDate(), 'dd-MM-yyyy'),
                `Pago Cuota(s)`, // Simplified concept for now
                'Administrador', // Simplified
                formatToTwoDecimals(p.totalAmount)
            ]),
            startY: startY,
            theme: 'striped',
            headStyles: { fillColor: [30, 80, 180] },
            footStyles: { fillColor: [30, 80, 180], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9 },
            foot: [['Total Pagado', '', '', `Bs. ${formatToTwoDecimals(accountStatementData.totalPaidBs)}`]]
        });
        startY = (doc as any).lastAutoTable.finalY + 10;

        // --- Debts Summary ---
        doc.setFontSize(11).setFont('helvetica', 'bold').text('Resumen de Deudas', margin, startY);
        startY += 6;
        autoTable(doc, {
            head: [['Periodo', 'Concepto', 'Monto ($)', 'Estado']],
            body: accountStatementData.debts.map(d => [
                `${monthsLocale[d.month]} ${d.year}`,
                d.description,
                `$${d.amountUSD.toFixed(2)}`,
                d.status === 'paid' ? 'Pagada' : 'Pendiente'
            ]),
            startY: startY,
            theme: 'striped',
            headStyles: { fillColor: [30, 80, 180] },
            footStyles: { fillColor: [30, 80, 180], textColor: 255, fontStyle: 'bold' },
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
    
    const handleExportBalance = async (formatType: 'pdf' | 'excel') => {
        const data = filteredBalanceOwners;
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "No hay propietarios con saldo a favor." });
            return;
        }
    
        const filename = `reporte_saldos_favor_${format(new Date(), 'yyyy-MM-dd')}`;
        
        if (formatType === 'pdf') {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
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
            
            autoTable(doc, {
                head: [['Propietario', 'Propiedades', 'Saldo a Favor (Bs.)']],
                body: data.map(o => [o.name, o.properties, `Bs. ${formatToTwoDecimals(o.balance)}`]),
                startY: margin + 40,
                headStyles: { fillColor: [30, 80, 180] },
                styles: { fontSize: 10, cellPadding: 2.5 },
                columnStyles: {
                    2: { halign: 'right' }
                }
            });
            doc.save(`${filename}.pdf`);
        } else { // excel
             const ExcelJS = await import('exceljs');
             const workbook = new ExcelJS.Workbook();
             const worksheet = workbook.addWorksheet("Saldos a Favor");
             worksheet.columns = [
                { header: 'Propietario', key: 'name', width: 30 },
                { header: 'Propiedades', key: 'properties', width: 30 },
                { header: 'Saldo a Favor (Bs.)', key: 'balance', width: 20, style: { numFmt: '#,##0.00' } },
            ];
             worksheet.addRows(data);
             const buffer = await workbook.xlsx.writeBuffer();
             const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
             const link = document.createElement('a');
             link.href = URL.createObjectURL(blob);
             link.download = `${filename}.xlsx`;
             link.click();
             window.URL.revokeObjectURL(link.href);
        }
    };
    
    const handleExportMonthlyReport = async (formatType: 'pdf' | 'excel') => {
        const data = monthlyReportData;
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "No hay pagos aprobados en el período seleccionado." });
            return;
        }

        const filename = `reporte_mensual_${selectedYear}_${selectedMonth}`;
        const periodString = `Período: ${monthOptions.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;

        if (formatType === 'pdf') {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            let startY = 15;
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
            if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);

            doc.setFontSize(16).setFont('helvetica', 'bold').text('Reporte de Pagos Mensual', doc.internal.pageSize.getWidth() / 2, startY + 15, { align: 'center'});
            startY += 25;
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(periodString, 15, startY);
            doc.text(`Fecha de Emisión: ${format(new Date(), "dd/MM/yyyy")}`, doc.internal.pageSize.getWidth() - 15, startY, { align: 'right'});
            startY += 10;
            
            autoTable(doc, {
                head: [['Propietario', 'Propiedad', 'Fecha Pago', 'Monto (Bs.)', 'Referencia', 'Meses Pagados']], 
                body: data.map(row => [row.ownerName, row.properties, row.paymentDate, formatToTwoDecimals(row.amount), row.reference, row.paidMonths]),
                startY: startY,
                headStyles: { fillColor: [30, 80, 180] },
                styles: { fontSize: 8, cellPadding: 2 },
                 columnStyles: {
                    5: { cellWidth: 50 }, // Give more space for "Paid Months"
                }
            });
            doc.save(`${filename}.pdf`);
        } else { // Excel
             const ExcelJS = await import('exceljs');
             const workbook = new ExcelJS.Workbook();
             const worksheet = workbook.addWorksheet("Pagos Mensuales");
             worksheet.columns = [
                 { header: 'Propietario', key: 'ownerName', width: 30 },
                 { header: 'Propiedad', key: 'properties', width: 20 },
                 { header: 'Fecha Pago', key: 'paymentDate', width: 15 },
                 { header: 'Monto (Bs.)', key: 'amount', width: 20, style: { numFmt: '#,##0.00' } },
                 { header: 'Referencia', key: 'reference', width: 20 },
                 { header: 'Meses Pagados', key: 'paidMonths', width: 40 },
             ];
             worksheet.addRows(data);
             const buffer = await workbook.xlsx.writeBuffer();
             const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
             const link = document.createElement('a');
             link.href = URL.createObjectURL(blob);
             link.download = `${filename}.xlsx`;
             link.click();
             window.URL.revokeObjectURL(link.href);
        }
    };
    
    const handleExportIncomeReport = async (formatType: 'pdf' | 'excel') => {
        const data = incomeReportData;
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "No hay ingresos en el período seleccionado." });
            return;
        }
    
        const filename = `reporte_ingresos_${format(new Date(), 'yyyy-MM-dd')}`;
        const totalBs = data.reduce((sum, row) => sum + row.totalBs, 0);
        const totalUsd = data.reduce((sum, row) => sum + row.totalUsd, 0);
    
        if (formatType === 'pdf') {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            let startY = 15;
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
            if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);
    
            doc.setFontSize(16).setFont('helvetica', 'bold').text('Reporte de Ingresos', doc.internal.pageSize.getWidth() / 2, startY + 15, { align: 'center' });
            startY += 25;
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(`Fecha de Emisión: ${format(new Date(), "dd/MM/yyyy")}`, doc.internal.pageSize.getWidth() - 15, startY, { align: 'right' });
            startY += 10;
            
            autoTable(doc, {
                head: [['Período', 'Ingresos (Bs)', 'Ingresos (USD Aprox.)', 'Nº de Pagos']],
                body: data.map(row => [
                    row.period,
                    formatToTwoDecimals(row.totalBs),
                    `$${formatToTwoDecimals(row.totalUsd)}`,
                    row.paymentCount
                ]),
                foot: [[
                    'TOTAL',
                    formatToTwoDecimals(totalBs),
                    `$${formatToTwoDecimals(totalUsd)}`,
                    ''
                ]],
                startY,
                headStyles: { fillColor: [30, 80, 180] },
                footStyles: { fillColor: [30, 80, 180], textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 2.5 },
                columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'center' } }
            });
            doc.save(`${filename}.pdf`);
        } else { // Excel
             const ExcelJS = await import('exceljs');
             const workbook = new ExcelJS.Workbook();
             const worksheet = workbook.addWorksheet("Ingresos");
             worksheet.columns = [
                 { header: 'Período', key: 'period', width: 20 },
                 { header: 'Ingresos (Bs)', key: 'totalBs', width: 20, style: { numFmt: '#,##0.00' } },
                 { header: 'Ingresos (USD Aprox.)', key: 'totalUsd', width: 25, style: { numFmt: '"$"#,##0.00' } },
                 { header: 'Nº de Pagos', key: 'paymentCount', width: 15 },
             ];
             worksheet.addRows(data);
             // Add footer row
             worksheet.addRow([]);
             const footerRow = worksheet.addRow(['TOTAL', totalBs, totalUsd, '']);
             footerRow.font = { bold: true };
             
             const buffer = await workbook.xlsx.writeBuffer();
             const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
             const link = document.createElement('a');
             link.href = URL.createObjectURL(blob);
             link.download = `${filename}.xlsx`;
             link.click();
             window.URL.revokeObjectURL(link.href);
        }
    };

    const renderSortIcon = (key: SortKey) => {
        if (delinquencySortConfig.key !== key) {
            return <ArrowUpDown className="h-4 w-4 opacity-50" />;
        }
        return <span>{delinquencySortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Módulo de <span className="text-primary">Informes</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Genere y exporte reportes detallados sobre la gestión del condominio.
                </p>
            </div>
            
            <Tabs defaultValue="integral-report" className="w-full">
                 <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 lg:grid-cols-7 h-auto flex-wrap">
                    <TabsTrigger value="integral-report">Reporte Integral</TabsTrigger>
                    <TabsTrigger value="individual">Ficha Individual</TabsTrigger>
                    <TabsTrigger value="estado-de-cuenta">Estado de Cuenta</TabsTrigger>
                    <TabsTrigger value="delinquency">Morosidad</TabsTrigger>
                    <TabsTrigger value="balance">Saldos a Favor</TabsTrigger>
                    <TabsTrigger value="monthly">Reporte Mensual</TabsTrigger>
                    <TabsTrigger value="income">Ingresos</TabsTrigger>
                </TabsList>
                
                <TabsContent value="integral-report">
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Reporte Integral</CardTitle>
                                <CardDescription>Genere una vista consolidada del estado de todos los propietarios para un período específico.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-6">
                                <div className="p-4 border rounded-lg bg-muted/50">
                                    <h4 className="font-semibold mb-3">Filtros para Nuevo Reporte</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                        <div className="space-y-2">
                                            <Label>Desde</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !integralDateRange.from && "text-muted-foreground")}>
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {integralDateRange.from ? format(integralDateRange.from, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar mode="single" selected={integralDateRange.from} onSelect={date => setIntegralDateRange(prev => ({...prev, from: date || undefined}))} initialFocus />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Hasta</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !integralDateRange.to && "text-muted-foreground")}>
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {integralDateRange.to ? format(integralDateRange.to, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar mode="single" selected={integralDateRange.to} onSelect={date => setIntegralDateRange(prev => ({...prev, to: date || undefined}))} initialFocus />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <Button onClick={handleGenerateAndSaveIntegral} disabled={generatingReport} className="h-10">
                                            <FileText className="mr-2 h-4 w-4" /> Generar y Guardar
                                        </Button>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Historial de Reportes Guardados</h3>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Fecha de Creación</TableHead>
                                                <TableHead>Estado</TableHead>
                                                <TableHead className="text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {savedIntegralReports.map(report => {
                                                const isPublished = publishedReports.some(p => p.sourceId === report.id);
                                                return (
                                                    <TableRow key={report.id}>
                                                        <TableCell>{format(report.createdAt.toDate(), "dd/MM/yyyy HH:mm")}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={isPublished ? "success" : "outline"}>{isPublished ? "Publicado" : "No Publicado"}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                                                <DropdownMenuContent>
                                                                    <DropdownMenuItem onClick={() => handlePreviewIntegralReport(report)}><Eye className="mr-2 h-4 w-4" /> Ver</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleExportIntegralPdf(report)}><Download className="mr-2 h-4 w-4" /> Exportar PDF</DropdownMenuItem>
                                                                    {!isPublished && <DropdownMenuItem onClick={() => handlePublishIntegralReport(report.id, report)}><Megaphone className="mr-2 h-4 w-4"/> Publicar</DropdownMenuItem>}
                                                                    {isPublished && <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteIntegralPublication(report.id)}><Trash2 className="mr-2 h-4 w-4"/> Quitar Publicación</DropdownMenuItem>}
                                                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteSavedIntegralReport(report.id)}><Trash2 className="mr-2 h-4 w-4"/> Eliminar</DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                 <TabsContent value="individual">
                     <Card>
                        <CardHeader>
                            <CardTitle>Ficha Individual de Pagos</CardTitle>
                            <CardDescription>Busque un propietario para ver su historial detallado de pagos y los meses que liquida cada uno.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar por nombre..." className="pl-9" value={individualSearchTerm} onChange={e => setIndividualSearchTerm(e.target.value)} />
                            </div>
                            {individualSearchTerm && filteredIndividualOwners.length > 0 && (
                                <Card className="border rounded-lg">
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
                                                <Button variant="outline" onClick={() => handleExportIndividual('pdf')}><FileText className="mr-2 h-4 w-4" /> Exportar PDF</Button>
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
                                                    <BadgeCheck className="h-4 w-4 text-primary" />
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-primary">Bs. {formatToTwoDecimals(selectedIndividual.balance)}</div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2 flex items-center"><History className="mr-2 h-5 w-5"/> Historial de Pagos Aprobados</h3>
                                            <ScrollArea className="h-[28rem] border rounded-lg">
                                                 {individualPayments.length > 0 ? (
                                                    <div className="p-2 space-y-2">
                                                        {individualPayments.map((payment) => (
                                                            <Collapsible key={payment.id} className="border rounded-md">
                                                                <CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 rounded-t-md">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                                                            <div className="text-left">
                                                                                <p className="font-semibold text-primary">{format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                                                                                <p className="text-xs text-muted-foreground">Ref: {payment.reference}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                             <p className="font-bold text-lg">Bs. {formatToTwoDecimals(payment.totalAmount)}</p>
                                                                             <p className="text-xs text-muted-foreground">Tasa: Bs. {formatToTwoDecimals(payment.exchangeRate || activeRate)}</p>
                                                                        </div>
                                                                    </div>
                                                                </CollapsibleTrigger>
                                                                <CollapsibleContent>
                                                                    <div className="p-2 border-t bg-background">
                                                                        {payment.liquidatedDebts.length > 0 ? (
                                                                            <Table>
                                                                                <TableHeader>
                                                                                    <TableRow>
                                                                                        <TableHead>Mes Liquidado</TableHead>
                                                                                        <TableHead>Concepto</TableHead>
                                                                                        <TableHead className="text-right">Monto Pagado ($)</TableHead>
                                                                                    </TableRow>
                                                                                </TableHeader>
                                                                                <TableBody>
                                                                                    {payment.liquidatedDebts.map(debt => (
                                                                                        <TableRow key={debt.id}>
                                                                                            <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                                                            <TableCell>{debt.description}</TableCell>
                                                                                            <TableCell className="text-right">$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}</TableCell>
                                                                                        </TableRow>
                                                                                    ))}
                                                                                </TableBody>
                                                                            </Table>
                                                                        ) : (
                                                                            <p className="text-sm text-muted-foreground px-4 py-2">Este pago fue acreditado a saldo a favor.</p>
                                                                        )}
                                                                    </div>
                                                                </CollapsibleContent>
                                                            </Collapsible>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-muted-foreground">No se encontraron pagos aprobados.</div>
                                                )}
                                            </ScrollArea>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </CardContent>
                     </Card>
                 </TabsContent>

                <TabsContent value="estado-de-cuenta">
                     <Card>
                        <CardHeader>
                            <CardTitle>Estado de Cuenta</CardTitle>
                            <CardDescription>Busque un propietario para ver su estado de cuenta.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar por nombre..." className="pl-9" value={statementSearchTerm} onChange={e => setStatementSearchTerm(e.target.value)} />
                            </div>
                            {statementSearchTerm && filteredStatementOwners.length > 0 && (
                                <Card className="border rounded-lg">
                                    <ScrollArea className="h-48">
                                        {filteredStatementOwners.map(owner => (
                                            <div key={owner.id} onClick={() => handleSelectStatementOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                                <p className="font-medium">{owner.name}</p>
                                                <p className="text-sm text-muted-foreground">{(owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}</p>
                                            </div>
                                        ))}
                                    </ScrollArea>
                                </Card>
                            )}

                            {selectedStatementOwner && accountStatementData && (
                                <Card className="mt-4 bg-card-foreground/5 dark:bg-card-foreground/5">
                                    <CardHeader>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-4">
                                                {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="w-16 h-16 rounded-lg"/>}
                                                <div>
                                                    <p className="font-bold">{companyInfo?.name} | {companyInfo?.rif}</p>
                                                    <p className="text-sm">Propietario: {selectedStatementOwner.name}</p>
                                                    <p className="text-sm">Propiedad(es): {(selectedStatementOwner.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <h2 className="text-2xl font-bold">ESTADO DE CUENTA</h2>
                                                <p className="text-xs">Fecha: {format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss")}</p>
                                                <Button size="sm" variant="outline" className="mt-2" onClick={() => handleExportAccountStatement('pdf')}><FileText className="mr-2 h-4 w-4" /> Exportar PDF</Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div>
                                            <h3 className="font-bold mb-2">Resumen de Pagos</h3>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                                        <TableHead className="text-primary-foreground">Fecha</TableHead>
                                                        <TableHead className="text-primary-foreground">Concepto</TableHead>
                                                        <TableHead className="text-primary-foreground">Pagado por</TableHead>
                                                        <TableHead className="text-primary-foreground text-right">Monto (Bs)</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {accountStatementData.payments.map(p => (
                                                        <TableRow key={p.id}>
                                                            <TableCell>{format(p.paymentDate.toDate(), 'dd-MM-yyyy')}</TableCell>
                                                            <TableCell>Pago Cuota(s)</TableCell>
                                                            <TableCell>Administrador</TableCell>
                                                            <TableCell className="text-right">{formatToTwoDecimals(p.totalAmount)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                                <TableFooter>
                                                     <TableRow className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                                                        <TableCell colSpan={3}>Total Pagado</TableCell>
                                                        <TableCell className="text-right">Bs. {formatToTwoDecimals(accountStatementData.totalPaidBs)}</TableCell>
                                                    </TableRow>
                                                </TableFooter>
                                            </Table>
                                        </div>
                                        <div>
                                            <h3 className="font-bold mb-2">Resumen de Deudas</h3>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                                        <TableHead className="text-primary-foreground">Periodo</TableHead>
                                                        <TableHead className="text-primary-foreground">Concepto</TableHead>
                                                        <TableHead className="text-primary-foreground text-right">Monto ($)</TableHead>
                                                        <TableHead className="text-primary-foreground text-right">Estado</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                     {accountStatementData.debts.map(d => (
                                                        <TableRow key={d.id}>
                                                            <TableCell>{monthsLocale[d.month]} {d.year}</TableCell>
                                                            <TableCell>{d.description}</TableCell>
                                                            <TableCell className="text-right">$${d.amountUSD.toFixed(2)}</TableCell>
                                                            <TableCell className="text-right">{d.status === 'paid' ? 'Pagada' : 'Pendiente'}</TableCell>
                                                        </TableRow>
                                                     ))}
                                                </TableBody>
                                                <TableFooter>
                                                    <TableRow className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                                                        <TableCell colSpan={2}>Total Adeudado</TableCell>
                                                        <TableCell className="text-right">$${accountStatementData.totalDebtUSD.toFixed(2)}</TableCell>
                                                        <TableCell></TableCell>
                                                    </TableRow>
                                                </TableFooter>
                                            </Table>
                                        </div>
                                        <div className="text-right font-bold text-lg pt-4">
                                            Saldo a Favor Actual: Bs. {formatToTwoDecimals(accountStatementData.balance)}
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
                                                        onCheckedChange={()=>{
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
                                                <TableCell className="text-right font-semibold">$${owner.debtAmountUSD.toFixed(2)}</TableCell>
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
                                    <Button variant="outline" onClick={()=>handleExportBalance('pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                    <Button variant="outline" onClick={()=>handleExportBalance('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Propietario</TableHead>
                                        <TableHead>Propiedades</TableHead>
                                        <TableHead className="text-right">Saldo (Bs.)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredBalanceOwners.length > 0 ? (
                                        filteredBalanceOwners.map(owner => (
                                            <TableRow key={owner.id}>
                                                <TableCell className="font-medium">{owner.name}</TableCell>
                                                <TableCell>{owner.properties}</TableCell>
                                                <TableCell className="text-right font-bold text-primary">Bs. {formatToTwoDecimals(owner.balance)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={3} className="h-24 text-center">No hay propietarios con saldo a favor.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                     </Card>
                 </TabsContent>
                 <TabsContent value="monthly">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reporte de Pagos Mensual</CardTitle>
                            <CardDescription>Ver los pagos aprobados para un período específico.</CardDescription>
                            <div className="flex gap-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Año</Label>
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Mes</Label>
                                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>{monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-end gap-2 mb-4">
                                <Button variant="outline" onClick={() => handleExportMonthlyReport('pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                <Button variant="outline" onClick={() => handleExportMonthlyReport('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Propietario</TableHead>
                                        <TableHead>Propiedad</TableHead>
                                        <TableHead>Fecha Pago</TableHead>
                                        <TableHead>Monto (Bs.)</TableHead>
                                        <TableHead>Referencia</TableHead>
                                        <TableHead>Meses Pagados</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {monthlyReportData.length > 0 ? (
                                        monthlyReportData.map(row => (
                                            <TableRow key={row.paymentId}>
                                                <TableCell>{row.ownerName}</TableCell>
                                                <TableCell>{row.properties}</TableCell>
                                                <TableCell>{row.paymentDate}</TableCell>
                                                <TableCell>{formatToTwoDecimals(row.amount)}</TableCell>
                                                <TableCell>{row.reference}</TableCell>
                                                <TableCell>{row.paidMonths}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay pagos aprobados en este período.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                 </TabsContent>

                <TabsContent value="income">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reporte de Ingresos</CardTitle>
                            <CardDescription>Analice los ingresos totales por período.</CardDescription>
                            <div className="flex gap-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Desde</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal", !incomeDateRange.from && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {incomeDateRange.from ? format(incomeDateRange.from, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={incomeDateRange.from} onSelect={date => setIncomeDateRange(prev => ({...prev, from: date}))} initialFocus /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label>Hasta</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal", !incomeDateRange.to && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {incomeDateRange.to ? format(incomeDateRange.to, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={incomeDateRange.to} onSelect={date => setIncomeDateRange(prev => ({...prev, to: date}))} initialFocus /></PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-end gap-2 mb-4">
                                <Button variant="outline" onClick={() => handleExportIncomeReport('pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                <Button variant="outline" onClick={() => handleExportIncomeReport('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Período</TableHead>
                                        <TableHead className="text-right">Ingresos (Bs)</TableHead>
                                        <TableHead className="text-right">Ingresos (USD Aprox.)</TableHead>
                                        <TableHead className="text-center">Nº de Pagos</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {incomeReportData.length > 0 ? (
                                        incomeReportData.map(row => (
                                            <TableRow key={row.period}>
                                                <TableCell className="font-medium capitalize">{row.period}</TableCell>
                                                <TableCell className="text-right">{formatToTwoDecimals(row.totalBs)}</TableCell>
                                                <TableCell className="text-right">${formatToTwoDecimals(row.totalUsd)}</TableCell>
                                                <TableCell className="text-center">{row.paymentCount}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay ingresos en el período seleccionado.</TableCell></TableRow>
                                    )}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell className="font-bold">TOTAL</TableCell>
                                        <TableCell className="text-right font-bold">{formatToTwoDecimals(incomeReportData.reduce((acc, row) => acc + row.totalBs, 0))}</TableCell>
                                        <TableCell className="text-right font-bold">${formatToTwoDecimals(incomeReportData.reduce((acc, row) => acc + row.totalUsd, 0))}</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
            </Tabs>
             {reportToPreview && (
                <Dialog open={!!reportToPreview} onOpenChange={(open) => !open && setReportToPreview(null)}>
                    <DialogContent className="max-w-4xl">
                        <DialogHeader>
                            <DialogTitle>Vista Previa del Reporte Integral</DialogTitle>
                            <DialogDescription>
                                Generado el {format(reportToPreview.createdAt.toDate(), "dd/MM/yyyy HH:mm")}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[70vh] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Propietario</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Periodo Solvencia</TableHead>
                                        <TableHead className="text-center">Meses Adeudados</TableHead>
                                        <TableHead className="text-right">Saldo a Favor (Bs)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportToPreview.data.map(row => (
                                        <TableRow key={row.ownerId}>
                                            <TableCell className="font-medium">{row.name}<br/><span className="text-xs text-muted-foreground">{row.properties}</span></TableCell>
                                            <TableCell>
                                                <Badge variant={row.status === 'Solvente' ? 'success' : 'destructive'}>{row.status}</Badge>
                                            </TableCell>
                                            <TableCell>{row.solvencyPeriod}</TableCell>
                                            <TableCell className="text-center">{row.monthsOwed > 0 ? row.monthsOwed : '-'}</TableCell>
                                            <TableCell className="text-right">
                                                {row.balance > 0 ? `Bs. ${formatToTwoDecimals(row.balance)}` : ''}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}


"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, Timestamp, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { Download, Loader2, RefreshCw, BarChart, Banknote, Landmark, DollarSign, Wallet } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/use-auth';

// --- TYPES ---
interface Payment {
  paymentDate: Timestamp;
  paymentMethod: 'transferencia' | 'movil' | 'efectivo_bs' | 'efectivo_usd';
  totalAmount: number;
  description: string;
  reference?: string;
}

interface Expense {
  date: Timestamp;
  paymentSource?: 'banco' | 'efectivo_bs' | 'efectivo_usd';
  amount: number;
  description: string;
  reference?: string;
}

interface PettyCashMovement {
    id: string;
    type: 'ingreso' | 'egreso';
    amount: number;
    description: string;
    date: Timestamp;
    reference?: string;
}

interface Transaction {
    date: Date;
    description: string;
    reference: string;
    credit: number;
    debit: number;
    balance: number;
}

const formatCurrency = (amount: number): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

const AccountingPage = ({ params }: { params: { condoId: string } }) => {
    const { toast } = useToast();
    const { user: currentUser, companyInfo } = useAuth();
    const workingCondoId = params.condoId;

    const [loading, setLoading] = useState(true);
    const [allPayments, setAllPayments] = useState<Payment[]>([]);
    const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
    const [allPettyCash, setAllPettyCash] = useState<PettyCashMovement[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const fetchData = useCallback(async () => {
        if (!workingCondoId) return;
        setLoading(true);
        try {
            const unsubscribers = [
                onSnapshot(collection(db, 'condominios', workingCondoId, 'payments'), 
                    snap => setAllPayments(snap.docs.map(d => d.data() as Payment))),
                onSnapshot(collection(db, 'condominios', workingCondoId, 'gastos'), 
                    snap => setAllExpenses(snap.docs.map(d => d.data() as Expense))),
                onSnapshot(collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'), 
                    snap => setAllPettyCash(snap.docs.map(d => d.data() as PettyCashMovement))),
            ];
            return () => unsubscribers.forEach(unsub => unsub());
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error al sincronizar datos' });
        } finally {
            setLoading(false);
        }
    }, [workingCondoId, toast]);

    useEffect(() => {
        const unsubPromise = fetchData();
        return () => {
            unsubPromise.then(cleanup => cleanup && cleanup());
        };
    }, [fetchData]);

    const periodData = useMemo(() => {
        const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
        const toDate = endOfMonth(fromDate);
        const accounts = {
            banco: { transactions: [] as Transaction[], startBalance: 0, endBalance: 0 },
            efectivoBs: { transactions: [] as Transaction[], startBalance: 0, endBalance: 0 },
            efectivoUsd: { transactions: [] as Transaction[], startBalance: 0, endBalance: 0 },
            cajaChica: { transactions: [] as Transaction[], startBalance: 0, endBalance: 0 },
        };

        const processTransactions = (items: (Payment | Expense | PettyCashMovement)[], accountKey: keyof typeof accounts, type: 'credit' | 'debit', dateKey: 'paymentDate' | 'date', sourceField?: 'paymentMethod' | 'paymentSource', sourceValue?: string[]) => {
            items.forEach(item => {
                const date = (item as any)[dateKey].toDate();
                if (sourceField && sourceValue && !(sourceValue.includes((item as any)[sourceField]))) return;
                
                const amount = 'totalAmount' in item ? item.totalAmount : item.amount;
                const entry = {
                    date,
                    description: item.description || 'N/A',
                    reference: item.reference || 'N/A',
                    credit: type === 'credit' ? amount : 0,
                    debit: type === 'debit' ? amount : 0,
                };
                if (date < fromDate) {
                    accounts[accountKey].startBalance += entry.credit - entry.debit;
                } else if (date <= toDate) {
                    (accounts[accountKey].transactions as any).push(entry);
                }
            });
        };

        processTransactions(allPayments, 'banco', 'credit', 'paymentDate', 'paymentMethod', ['transferencia', 'movil']);
        processTransactions(allExpenses, 'banco', 'debit', 'date', 'paymentSource', ['banco']);
        processTransactions(allPayments, 'efectivoBs', 'credit', 'paymentDate', 'paymentMethod', ['efectivo_bs']);
        processTransactions(allExpenses, 'efectivoBs', 'debit', 'date', 'paymentSource', ['efectivo_bs']);
        processTransactions(allPayments, 'efectivoUsd', 'credit', 'paymentDate', 'paymentMethod', ['efectivo_usd']);
        processTransactions(allExpenses, 'efectivoUsd', 'debit', 'date', 'paymentSource', ['efectivo_usd']);
        allPettyCash.forEach(item => {
            const date = item.date.toDate();
            const entry = { date, description: item.description, reference: 'Caja Chica', credit: item.type === 'ingreso' ? item.amount : 0, debit: item.type === 'egreso' ? item.amount : 0 };
            if (date < fromDate) {
                accounts.cajaChica.startBalance += entry.credit - entry.debit;
            } else if (date <= toDate) {
                (accounts.cajaChica.transactions as any).push(entry);
            }
        });

        Object.values(accounts).forEach(acc => {
            acc.transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
            let runningBalance = acc.startBalance;
            acc.transactions.forEach(tx => {
                runningBalance += tx.credit - tx.debit;
                tx.balance = runningBalance;
            });
            acc.endBalance = runningBalance;
        });

        return accounts;
    }, [allPayments, allExpenses, allPettyCash, selectedMonth, selectedYear]);

    const generalLedger = useMemo(() => {
        return Object.entries(periodData).map(([key, data]) => {
            const totalCredit = data.transactions.reduce((sum, tx) => sum + tx.credit, 0);
            const totalDebit = data.transactions.reduce((sum, tx) => sum + tx.debit, 0);
            return {
                account: key,
                startBalance: data.startBalance,
                totalCredit,
                totalDebit,
                endBalance: data.endBalance
            };
        });
    }, [periodData]);

    const handleExportPdf = (accountKey: keyof typeof periodData, accountName: string) => {
        const { transactions, startBalance } = periodData[accountKey];
        const doc = new jsPDF();
        const periodStr = `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;
        
        doc.setFontSize(16);
        doc.text(`Libro Diario: ${accountName}`, 14, 22);
        doc.setFontSize(10);
        doc.text(`Período: ${periodStr}`, 14, 28);
        doc.text(`Condominio: ${companyInfo?.name || workingCondoId}`, 14, 34);

        autoTable(doc, {
            startY: 40,
            head: [['Fecha', 'Descripción', 'Referencia', 'Crédito (Bs)', 'Débito (Bs)', 'Saldo (Bs)']],
            body: [
                [{ content: 'Saldo Anterior', colSpan: 5, styles: { fontStyle: 'bold', halign: 'left' } }, formatCurrency(startBalance)],
                ...transactions.map(tx => [
                    format(tx.date, 'dd/MM/yyyy'),
                    tx.description,
                    tx.reference,
                    tx.credit ? formatCurrency(tx.credit) : '',
                    tx.debit ? formatCurrency(tx.debit) : '',
                    formatCurrency(tx.balance)
                ])
            ],
            headStyles: { fillColor: [22, 163, 74] },
            columnStyles: {
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right', fontStyle: 'bold' }
            }
        });

        doc.save(`Libro_Diario_${accountName}_${selectedYear}_${selectedMonth}.pdf`);
    };

    const accountTitles: Record<string, { title: string, icon: React.ElementType }> = {
        banco: { title: 'Banco', icon: Landmark },
        efectivoBs: { title: 'Efectivo Bs.', icon: Banknote },
        efectivoUsd: { title: 'Efectivo USD (Eq. Bs.)', icon: DollarSign },
        cajaChica: { title: 'Caja Chica', icon: Wallet },
    };

    return (
        <div className="space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                    Módulo de <span className="text-[#0081c9]">Contabilidad</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
                    Libros diarios y mayores para un control financiero preciso.
                </p>
            </div>
            
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Selector de Período</CardTitle>
                        <CardDescription>Filtre los libros contables por mes y año.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button onClick={() => fetchData()} variant="outline"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="libroMayor">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="libroMayor">Libro Mayor</TabsTrigger>
                    {Object.keys(accountTitles).map(key => (
                         <TabsTrigger key={key} value={key}>{accountTitles[key].title}</TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="libroMayor" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Libro Mayor</CardTitle>
                            <CardDescription>Resumen de saldos, créditos y débitos de todas las cuentas para el período seleccionado.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cuenta</TableHead>
                                        <TableHead className="text-right">Saldo Anterior (Bs)</TableHead>
                                        <TableHead className="text-right">Créditos (+) (Bs)</TableHead>
                                        <TableHead className="text-right">Débitos (-) (Bs)</TableHead>
                                        <TableHead className="text-right">Saldo Final (Bs)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {generalLedger.map(acc => (
                                        <TableRow key={acc.account} className="font-medium">
                                            <TableCell className="font-bold flex items-center gap-2">
                                                {React.createElement(accountTitles[acc.account].icon, { className: 'h-4 w-4 text-primary' })}
                                                {accountTitles[acc.account].title}
                                            </TableCell>
                                            <TableCell className="text-right">{formatCurrency(acc.startBalance)}</TableCell>
                                            <TableCell className="text-right text-green-600">{formatCurrency(acc.totalCredit)}</TableCell>
                                            <TableCell className="text-right text-red-600">{formatCurrency(acc.totalDebit)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(acc.endBalance)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                 <TableFooter className="bg-muted">
                                    <TableRow className="font-bold">
                                        <TableCell>TOTAL CONSOLIDADO</TableCell>
                                        <TableCell className="text-right">{formatCurrency(generalLedger.reduce((s, a) => s + a.startBalance, 0))}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(generalLedger.reduce((s, a) => s + a.totalCredit, 0))}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(generalLedger.reduce((s, a) => s + a.totalDebit, 0))}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(generalLedger.reduce((s, a) => s + a.endBalance, 0))}</TableCell>
                                    </TableRow>
                                 </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {Object.keys(accountTitles).map(key => {
                    const accountKey = key as keyof typeof periodData;
                    const { title } = accountTitles[key];
                    const { transactions, startBalance } = periodData[accountKey];
                    return (
                        <TabsContent key={key} value={key} className="mt-4">
                            <Card>
                                <CardHeader className="flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>Libro Diario: {title}</CardTitle>
                                        <CardDescription>Movimientos del período: {months.find(m => m.value === selectedMonth)?.label} {selectedYear}</CardDescription>
                                    </div>
                                    <Button onClick={() => handleExportPdf(accountKey, title)} variant="outline">
                                        <Download className="mr-2 h-4 w-4" /> Exportar PDF
                                    </Button>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead>Descripción</TableHead>
                                                <TableHead>Ref.</TableHead>
                                                <TableHead className="text-right">Crédito (Bs)</TableHead>
                                                <TableHead className="text-right">Débito (Bs)</TableHead>
                                                <TableHead className="text-right">Saldo (Bs)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow className="bg-muted/50 font-bold">
                                                <TableCell colSpan={5}>SALDO ANTERIOR</TableCell>
                                                <TableCell className="text-right">{formatCurrency(startBalance)}</TableCell>
                                            </TableRow>
                                            {transactions.length === 0 ? (
                                                <TableRow><TableCell colSpan={6} className="h-24 text-center">Sin movimientos para este período.</TableCell></TableRow>
                                            ) : (
                                                transactions.map((tx, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell>{format(tx.date, 'dd/MM/yyyy')}</TableCell>
                                                        <TableCell>{tx.description}</TableCell>
                                                        <TableCell>{tx.reference}</TableCell>
                                                        <TableCell className="text-right text-green-600">{tx.credit ? formatCurrency(tx.credit) : ''}</TableCell>
                                                        <TableCell className="text-right text-red-600">{tx.debit ? formatCurrency(tx.debit) : ''}</TableCell>
                                                        <TableCell className="text-right font-medium">{formatCurrency(tx.balance)}</TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )
                })}
            </Tabs>
        </div>
    );
};

export default AccountingPage;

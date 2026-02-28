"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, Timestamp, where, query } from 'firebase/firestore';
import { Download, RefreshCw, Landmark, Banknote, Coins, Wallet } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/use-auth';

// --- TYPES ---
interface Payment {
    paymentDate: Timestamp;
    paymentMethod: 'transferencia' | 'movil' | 'efectivo_bs';
    totalAmount: number;
    description: string;
    reference?: string;
    status: string;
}

interface Expense {
    date: Timestamp;
    paymentSource?: 'banco' | 'caja_principal' | 'caja_chica';
    amount: number;
    description: string;
    reference?: string;
}

interface MainCashMovement {
    id: string;
    type: 'ingreso' | 'egreso';
    amount: number;
    description: string;
    date: Timestamp;
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

const AccountingPage = () => {
    const { toast } = useToast();
    const { companyInfo, workingCondoId } = useAuth();

    const [loading, setLoading] = useState(true);
    const [allPayments, setAllPayments] = useState<Payment[]>([]);
    const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
    const [allMainCash, setAllMainCash] = useState<MainCashMovement[]>([]);
    const [allPettyCash, setAllPettyCash] = useState<PettyCashMovement[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const fetchData = useCallback(() => {
        if (!workingCondoId) return;
        setLoading(true);

        const unsubPayments = onSnapshot(query(collection(db, 'condominios', workingCondoId, 'payments'), where('status', '==', 'aprobado')), 
            snap => setAllPayments(snap.docs.map(d => d.data() as Payment)));
        
        const unsubExpenses = onSnapshot(collection(db, 'condominios', workingCondoId, 'gastos'), 
            snap => setAllExpenses(snap.docs.map(d => d.data() as Expense)));

        const unsubMain = onSnapshot(collection(db, 'condominios', workingCondoId, 'cajaPrincipal_movimientos'), 
            snap => setAllMainCash(snap.docs.map(d => ({ id: d.id, ...d.data() } as MainCashMovement))));
        
        const unsubPetty = onSnapshot(collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'), 
            snap => setAllPettyCash(snap.docs.map(d => d.data() as PettyCashMovement)));

        setLoading(false);
        return () => {
            unsubPayments();
            unsubExpenses();
            unsubMain();
            unsubPetty();
        };
    }, [workingCondoId]);

    useEffect(() => {
        const cleanup = fetchData();
        return () => cleanup?.();
    }, [fetchData]);

    const periodData = useMemo(() => {
        const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
        const toDate = endOfMonth(fromDate);
        
        const accounts = {
            banco: { transactions: [] as Transaction[], startBalance: 0, endBalance: 0 },
            cajaPrincipal: { transactions: [] as Transaction[], startBalance: 0, endBalance: 0 },
            cajaChica: { transactions: [] as Transaction[], startBalance: 0, endBalance: 0 },
        };

        // Procesar Banco
        allPayments.filter(p => ['transferencia', 'movil'].includes(p.paymentMethod)).forEach(p => {
            const date = p.paymentDate.toDate();
            const entry: Transaction = { date, description: p.description || 'PAGO RECIBIDO', reference: p.reference || 'N/A', credit: p.totalAmount, debit: 0, balance: 0 };
            if (date < fromDate) accounts.banco.startBalance += entry.credit;
            else if (date <= toDate) accounts.banco.transactions.push(entry);
        });
        allExpenses.filter(e => e.paymentSource === 'banco').forEach(e => {
            const date = e.date.toDate();
            const entry: Transaction = { date, description: e.description, reference: e.reference || 'GASTO', credit: 0, debit: e.amount, balance: 0 };
            if (date < fromDate) accounts.banco.startBalance -= entry.debit;
            else if (date <= toDate) accounts.banco.transactions.push(entry);
        });

        // Procesar Caja Principal
        allPayments.filter(p => p.paymentMethod === 'efectivo_bs').forEach(p => {
            const date = p.paymentDate.toDate();
            const entry: Transaction = { date, description: `PAGO EFECTIVO BS: ${p.description || 'PROPIETARIO'}`, reference: p.reference || 'N/A', credit: p.totalAmount, debit: 0, balance: 0 };
            if (date < fromDate) accounts.cajaPrincipal.startBalance += entry.credit;
            else if (date <= toDate) accounts.cajaPrincipal.transactions.push(entry);
        });
        allMainCash.forEach(m => {
            const date = m.date.toDate();
            const entry: Transaction = { date, description: m.description, reference: m.reference || 'MANUAL', credit: m.type === 'ingreso' ? m.amount : 0, debit: m.type === 'egreso' ? m.amount : 0, balance: 0 };
            if (date < fromDate) accounts.cajaPrincipal.startBalance += (entry.credit - entry.debit);
            else if (date <= toDate) accounts.cajaPrincipal.transactions.push(entry);
        });

        // Procesar Caja Chica
        allPettyCash.forEach(item => {
            if (!item.date) return;
            const date = item.date.toDate();
            const entry: Transaction = { date, description: item.description, reference: item.reference || 'Caja Chica', credit: item.type === 'ingreso' ? item.amount : 0, debit: item.type === 'egreso' ? item.amount : 0, balance: 0 };
            if (date < fromDate) accounts.cajaChica.startBalance += (entry.credit - entry.debit);
            else if (date <= toDate) accounts.cajaChica.transactions.push(entry);
        });

        // Calcular balances
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
    }, [allPayments, allExpenses, allMainCash, allPettyCash, selectedMonth, selectedYear]);

    const generalLedger = useMemo(() => {
        return Object.entries(periodData).map(([key, data]) => ({
            account: key as keyof typeof periodData,
            startBalance: data.startBalance,
            totalCredit: data.transactions.reduce((sum, tx) => sum + tx.credit, 0),
            totalDebit: data.transactions.reduce((sum, tx) => sum + tx.debit, 0),
            endBalance: data.endBalance
        }));
    }, [periodData]);

    const handleExportPdf = async (accountKey: keyof typeof periodData, accountName: string) => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

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
            headStyles: { fillColor: [0, 129, 201] },
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } }
        });

        doc.save(`Libro_Diario_${accountName}_${selectedYear}_${selectedMonth}.pdf`);
    };

    const accountTitles: Record<string, { title: string, icon: React.ElementType }> = {
        banco: { title: 'Banco', icon: Landmark },
        cajaPrincipal: { title: 'Caja Principal (Cobranza)', icon: Coins },
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
                    {companyInfo?.name || "EFAS CondoSys"} - Control financiero preciso.
                </p>
            </div>
            
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
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
                        <Button onClick={() => fetchData()} variant="outline" size="icon">
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="libroMayor">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="libroMayor">Libro Mayor</TabsTrigger>
                    {Object.keys(accountTitles).map(key => (
                         <TabsTrigger key={key} value={key}>{accountTitles[key].title}</TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="libroMayor" className="mt-4">
                    <Card>
                        <CardHeader><CardTitle>Libro Mayor</CardTitle></CardHeader>
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
                                                {React.createElement(accountTitles[acc.account].icon, { className: 'h-4 w-4 text-[#0081c9]' })}
                                                {accountTitles[acc.account].title}
                                            </TableCell>
                                            <TableCell className="text-right">{formatCurrency(acc.startBalance)}</TableCell>
                                            <TableCell className="text-right text-green-600">{formatCurrency(acc.totalCredit)}</TableCell>
                                            <TableCell className="text-right text-red-600">{formatCurrency(acc.totalDebit)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(acc.endBalance)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
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
                                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                    <div><CardTitle>Libro Diario: {title}</CardTitle></div>
                                    <Button onClick={() => handleExportPdf(accountKey, title)} variant="outline"><Download className="mr-2 h-4 w-4" /> PDF</Button>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead>Descripción</TableHead>
                                                <TableHead>Ref.</TableHead>
                                                <TableHead className="text-right">Crédito</TableHead>
                                                <TableHead className="text-right">Débito</TableHead>
                                                <TableHead className="text-right">Saldo</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow className="bg-slate-50 font-bold"><TableCell colSpan={5}>SALDO ANTERIOR</TableCell><TableCell className="text-right">{formatCurrency(startBalance)}</TableCell></TableRow>
                                            {transactions.map((tx, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="whitespace-nowrap">{format(tx.date, 'dd/MM/yy')}</TableCell>
                                                    <TableCell>{tx.description}</TableCell>
                                                    <TableCell className="text-[10px]">{tx.reference}</TableCell>
                                                    <TableCell className="text-right text-green-600">{tx.credit ? formatCurrency(tx.credit) : '-'}</TableCell>
                                                    <TableCell className="text-right text-red-600">{tx.debit ? formatCurrency(tx.debit) : '-'}</TableCell>
                                                    <TableCell className="text-right font-medium">{formatCurrency(tx.balance)}</TableCell>
                                                </TableRow>
                                            ))}
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

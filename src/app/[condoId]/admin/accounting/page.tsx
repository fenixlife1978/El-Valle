
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, Timestamp, where, query, orderBy } from 'firebase/firestore';
import { Download, RefreshCw, Landmark, Coins, Wallet, History } from 'lucide-react';
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
interface Account {
    id: string;
    nombre: string;
    tipo: string;
    saldoActual: number;
}

interface Transaction {
    id: string;
    fecha: Timestamp;
    monto: number;
    tipo: 'ingreso' | 'egreso';
    cuentaId: string;
    nombreCuenta: string;
    descripcion: string;
    referencia?: string;
}

interface ProcessedTransaction {
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
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const fetchData = useCallback(() => {
        if (!workingCondoId) return;
        setLoading(true);

        // 1. Cargar todas las cuentas definidas en Tesorería
        const unsubAccounts = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), 
            snap => setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account))));
        
        // 2. Cargar todos los movimientos registrados en Tesorería
        const unsubTx = onSnapshot(query(collection(db, 'condominios', workingCondoId, 'transacciones'), orderBy('fecha', 'asc')), 
            snap => setAllTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction))));

        setLoading(false);
        return () => {
            unsubAccounts();
            unsubTx();
        };
    }, [workingCondoId]);

    useEffect(() => {
        const cleanup = fetchData();
        return () => cleanup?.();
    }, [fetchData]);

    const periodData = useMemo(() => {
        const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
        const toDate = endOfMonth(fromDate);
        
        const accountData: Record<string, { transactions: ProcessedTransaction[], startBalance: number, endBalance: number }> = {};

        // Inicializar datos para cada cuenta
        accounts.forEach(acc => {
            accountData[acc.id] = { transactions: [], startBalance: 0, endBalance: 0 };
        });

        // Procesar todas las transacciones históricas para calcular saldo inicial y filtrar período
        allTransactions.forEach(tx => {
            const date = tx.fecha.toDate();
            const entry: ProcessedTransaction = { 
                date, 
                description: tx.descripcion, 
                reference: tx.referencia || 'N/A', 
                credit: tx.tipo === 'ingreso' ? tx.monto : 0, 
                debit: tx.tipo === 'egreso' ? tx.monto : 0, 
                balance: 0 
            };

            if (accountData[tx.cuentaId]) {
                if (date < fromDate) {
                    accountData[tx.cuentaId].startBalance += (entry.credit - entry.debit);
                } else if (date <= toDate) {
                    accountData[tx.cuentaId].transactions.push(entry);
                }
            }
        });

        // Calcular balances dinámicos por cada cuenta en el período
        Object.keys(accountData).forEach(accId => {
            const acc = accountData[accId];
            acc.transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
            let runningBalance = acc.startBalance;
            acc.transactions.forEach(tx => {
                runningBalance += tx.credit - tx.debit;
                tx.balance = runningBalance;
            });
            acc.endBalance = runningBalance;
        });

        return accountData;
    }, [accounts, allTransactions, selectedMonth, selectedYear]);

    const generalLedger = useMemo(() => {
        return accounts.map(acc => {
            const data = periodData[acc.id] || { startBalance: 0, transactions: [], endBalance: 0 };
            return {
                accountName: acc.nombre,
                accountId: acc.id,
                tipo: acc.tipo,
                startBalance: data.startBalance,
                totalCredit: data.transactions.reduce((sum, tx) => sum + tx.credit, 0),
                totalDebit: data.transactions.reduce((sum, tx) => sum + tx.debit, 0),
                endBalance: data.endBalance
            };
        });
    }, [accounts, periodData]);

    const handleExportPdf = async (accountId: string, accountName: string) => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

        const { transactions, startBalance } = periodData[accountId];
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
            headStyles: { fillColor: [15, 23, 42] },
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } }
        });

        doc.save(`Libro_Diario_${accountName.replace(/ /g, '_')}_${selectedYear}_${selectedMonth}.pdf`);
    };

    const getAccountIcon = (tipo: string) => {
        if (tipo === 'banco') return Landmark;
        if (tipo === 'efectivo') return Coins;
        return Wallet;
    };

    return (
        <div className="space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                    Módulo de <span className="text-[#0081c9]">Contabilidad</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
                    {companyInfo?.name || "EFAS CondoSys"} - Libros Diarios y Mayor Dinámico.
                </p>
            </div>
            
            <Card className="rounded-3xl border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle>Selector de Período</CardTitle>
                        <CardDescription>Filtre los libros contables dinámicos de Tesorería.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-[180px] rounded-xl"><SelectValue /></SelectTrigger>
                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-[120px] rounded-xl"><SelectValue /></SelectTrigger>
                            <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button onClick={() => fetchData()} variant="outline" size="icon" className="rounded-xl">
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="libroMayor">
                <TabsList className="flex flex-wrap h-auto gap-2 bg-slate-100/50 p-2 rounded-3xl">
                    <TabsTrigger value="libroMayor" className="rounded-2xl font-black uppercase text-[10px] px-6">Libro Mayor</TabsTrigger>
                    {accounts.map(acc => (
                         <TabsTrigger key={acc.id} value={acc.id} className="rounded-2xl font-black uppercase text-[10px] px-6">
                            {acc.nombre}
                         </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="libroMayor" className="mt-4">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
                        <CardHeader className="bg-slate-900 text-white p-8">
                            <CardTitle className="flex items-center gap-3 italic">
                                <History className="text-[#f59e0b]" /> Libro Mayor Consolidado
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                             <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="text-[10px] font-black uppercase px-8">Cuenta</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase">Saldo Anterior</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase">Créditos (+)</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase">Débitos (-)</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase pr-8">Saldo Final</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {generalLedger.map(acc => {
                                        const Icon = getAccountIcon(acc.tipo);
                                        return (
                                            <TableRow key={acc.accountId} className="font-medium hover:bg-slate-50">
                                                <TableCell className="font-bold flex items-center gap-2 px-8 py-6">
                                                    <Icon className="h-4 w-4 text-[#0081c9]" />
                                                    <span className="uppercase text-xs">{acc.accountName}</span>
                                                </TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(acc.startBalance)}</TableCell>
                                                <TableCell className="text-right text-green-600 font-bold">+{formatCurrency(acc.totalCredit)}</TableCell>
                                                <TableCell className="text-right text-red-600 font-bold">-{formatCurrency(acc.totalDebit)}</TableCell>
                                                <TableCell className="text-right font-black italic text-lg pr-8">Bs. {formatCurrency(acc.endBalance)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {accounts.map(acc => {
                    const { transactions, startBalance } = periodData[acc.id] || { transactions: [], startBalance: 0 };
                    return (
                        <TabsContent key={acc.id} value={acc.id} className="mt-4">
                            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-slate-50 border-b p-8">
                                    <div>
                                        <CardTitle className="uppercase italic">Libro Diario: {acc.nombre}</CardTitle>
                                        <CardDescription className="font-bold uppercase text-[9px] tracking-widest mt-1">Registros del mes seleccionado</CardDescription>
                                    </div>
                                    <Button onClick={() => handleExportPdf(acc.id, acc.nombre)} variant="outline" className="rounded-xl font-bold uppercase text-[10px]">
                                        <Download className="mr-2 h-4 w-4" /> Exportar PDF
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-100/50">
                                            <TableRow>
                                                <TableHead className="text-[10px] font-black uppercase px-8">Fecha</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase">Descripción</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase">Ref.</TableHead>
                                                <TableHead className="text-right text-[10px] font-black uppercase">Crédito</TableHead>
                                                <TableHead className="text-right text-[10px] font-black uppercase">Débito</TableHead>
                                                <TableHead className="text-right text-[10px] font-black uppercase pr-8">Saldo</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow className="bg-slate-50 font-black text-[10px] tracking-widest italic">
                                                <TableCell colSpan={5} className="px-8 py-4">SALDO ANTERIOR AL PERÍODO</TableCell>
                                                <TableCell className="text-right pr-8">{formatCurrency(startBalance)}</TableCell>
                                            </TableRow>
                                            {transactions.length === 0 ? (
                                                <TableRow><TableCell colSpan={6} className="text-center py-20 text-slate-400 font-bold italic">Sin movimientos en este período para esta cuenta</TableCell></TableRow>
                                            ) : (
                                                transactions.map((tx, idx) => (
                                                    <TableRow key={idx} className="hover:bg-slate-50 transition-colors">
                                                        <TableCell className="whitespace-nowrap px-8 font-bold text-slate-500 text-xs">{format(tx.date, 'dd/MM/yy')}</TableCell>
                                                        <TableCell className="font-black text-slate-900 uppercase italic text-xs">{tx.description}</TableCell>
                                                        <TableCell className="text-[9px] font-bold text-slate-400 uppercase">{tx.reference}</TableCell>
                                                        <TableCell className="text-right text-green-600 font-black">{tx.credit ? `+${formatCurrency(tx.credit)}` : '-'}</TableCell>
                                                        <TableCell className="text-right text-red-600 font-black">{tx.debit ? `-${formatCurrency(tx.debit)}` : '-'}</TableCell>
                                                        <TableCell className="text-right font-bold pr-8">Bs. {formatCurrency(tx.balance)}</TableCell>
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

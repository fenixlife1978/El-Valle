
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, Timestamp, where, query, orderBy, getDocs, runTransaction, doc, serverTimestamp, increment } from 'firebase/firestore';
import { Download, RefreshCw, Landmark, Coins, Wallet, History, Zap, Loader2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/use-auth';

// --- TYPES ---
interface Account { id: string; nombre: string; tipo: string; saldoActual: number; }
interface Transaction { id: string; fecha: Timestamp; monto: number; tipo: 'ingreso' | 'egreso'; cuentaId: string; nombreCuenta: string; descripcion: string; referencia?: string; sourcePaymentId?: string; }
interface ProcessedTransaction { date: Date; description: string; reference: string; credit: number; debit: number; balance: number; }

const formatCurrency = (amount: number): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

const AccountingPage = () => {
    const { toast } = useToast();
    const { companyInfo, workingCondoId, user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    useEffect(() => {
        if (!workingCondoId) return;
        setLoading(true);
        const unsubAccounts = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), snap => setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account))));
        const unsubTx = onSnapshot(query(collection(db, 'condominios', workingCondoId, 'transacciones'), orderBy('fecha', 'asc')), snap => setAllTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction))));
        setLoading(false);
        return () => { unsubAccounts(); unsubTx(); };
    }, [workingCondoId]);

    const visibleAccounts = useMemo(() => {
        return accounts.filter(acc => acc.nombre?.toUpperCase().trim() !== "CAJA PRINCIPAL (EFECTIVO BS)");
    }, [accounts]);

    const periodData = useMemo(() => {
        const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
        const toDate = endOfMonth(fromDate);
        const accountData: Record<string, { transactions: ProcessedTransaction[], startBalance: number, endBalance: number }> = {};

        accounts.forEach(acc => { accountData[acc.id] = { transactions: [], startBalance: 0, endBalance: 0 }; });

        allTransactions.forEach(tx => {
            const date = tx.fecha.toDate();
            const entry: ProcessedTransaction = { 
                date, description: tx.descripcion, reference: tx.referencia || 'N/A', 
                credit: tx.tipo === 'ingreso' ? tx.monto : 0, 
                debit: tx.tipo === 'egreso' ? tx.monto : 0, balance: 0 
            };
            if (accountData[tx.cuentaId]) {
                if (date < fromDate) accountData[tx.cuentaId].startBalance += (entry.credit - entry.debit);
                else if (date <= toDate) accountData[tx.cuentaId].transactions.push(entry);
            }
        });

        Object.keys(accountData).forEach(accId => {
            const acc = accountData[accId];
            acc.transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
            let running = acc.startBalance;
            acc.transactions.forEach(tx => { running += tx.credit - tx.debit; tx.balance = running; });
            acc.endBalance = running;
        });
        return accountData;
    }, [accounts, allTransactions, selectedMonth, selectedYear]);

    const generalLedger = useMemo(() => {
        return visibleAccounts.map(acc => {
            const data = periodData[acc.id] || { startBalance: 0, transactions: [], endBalance: 0 };
            return {
                accountName: acc.nombre, accountId: acc.id, tipo: acc.tipo,
                startBalance: data.startBalance, totalCredit: data.transactions.reduce((sum, tx) => sum + tx.credit, 0),
                totalDebit: data.transactions.reduce((sum, tx) => sum + tx.debit, 0), endBalance: data.endBalance
            };
        });
    }, [visibleAccounts, periodData]);

    const handleSyncPeriod = async () => {
        if (!workingCondoId) return;
        setIsSyncing(true);
        try {
            const from = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const to = endOfMonth(from);
            const paySnap = await getDocs(query(collection(db, 'condominios', workingCondoId, 'payments'), where('status', '==', 'aprobado'), where('paymentDate', '>=', from), where('paymentDate', '<=', to)));
            
            let count = 0;
            await runTransaction(db, async (transaction) => {
                const accountsQuerySnap = await getDocs(collection(db, 'condominios', workingCondoId, 'cuentas'));
                let currentAccounts = accountsQuerySnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

                for (const pDoc of paySnap.docs) {
                    const p = pDoc.data();
                    if (allTransactions.some(tx => tx.sourcePaymentId === pDoc.id)) continue;

                    let target = "";
                    if (['movil', 'transferencia'].includes(p.paymentMethod)) target = "BANCO DE VENEZUELA";
                    else if (['efectivo_bs', 'efectivo'].includes(p.paymentMethod)) target = "CAJA PRINCIPAL";
                    if (!target) continue;

                    let acc = currentAccounts.find((a: any) => a.nombre?.toUpperCase().trim() === target);
                    let accId = "";
                    if (!acc) {
                        const newRef = doc(collection(db, 'condominios', workingCondoId, 'cuentas'));
                        const newData = { nombre: target, tipo: target === "CAJA PRINCIPAL" ? 'efectivo' : 'banco', saldoActual: 0, createdAt: serverTimestamp() };
                        transaction.set(newRef, newData);
                        accId = newRef.id;
                        acc = { id: accId, ...newData };
                        currentAccounts.push(acc);
                    } else { accId = acc.id; }

                    transaction.set(doc(collection(db, 'condominios', workingCondoId, 'transacciones')), {
                        monto: p.totalAmount, tipo: 'ingreso', cuentaId: accId, nombreCuenta: target,
                        descripcion: `SINCRONIZACIÓN: PAGO DE ${p.beneficiaries?.[0]?.ownerName || 'PROPIETARIO'}`,
                        referencia: p.reference, fecha: p.paymentDate, sourcePaymentId: pDoc.id,
                        createdAt: serverTimestamp(), createdBy: user?.email
                    });
                    transaction.update(doc(db, 'condominios', workingCondoId, 'cuentas', accId), { saldoActual: increment(p.totalAmount) });
                    count++;
                }
                if (count === 0) throw "no_needed";
            });
            toast({ title: "Sincronización Exitosa", description: `Se procesaron ${count} hitos contables faltantes.` });
        } catch (e) {
            if (e === "no_needed") toast({ title: "Todo al día" });
            else toast({ variant: 'destructive', title: "Error" });
        } finally { setIsSyncing(false); }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">Contabilidad <span className="text-[#0081c9]">Digital</span></h2>
                    <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                    <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">Libros Diarios y Mayor Consolidado Atómico.</p>
                </div>
                <Button onClick={handleSyncPeriod} disabled={isSyncing} variant="outline" className="rounded-xl border-[#0081c9] text-[#0081c9] font-black uppercase text-[10px] h-12 shadow-sm hover:bg-blue-50">
                    {isSyncing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />} Sincronizar Hitos
                </Button>
            </div>
            
            <Card className="rounded-3xl border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div><CardTitle className="text-slate-900">Período Fiscal</CardTitle><CardDescription className="text-slate-500">Seleccione el mes a auditar.</CardDescription></div>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-36 rounded-xl bg-slate-50 text-slate-900 border-slate-200 font-bold"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="w-24 rounded-xl bg-slate-50 text-slate-900 border-slate-200 font-bold"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="mayor">
                <TabsList className="flex flex-wrap h-auto gap-2 bg-slate-200 p-2 rounded-3xl">
                    <TabsTrigger value="mayor" className="rounded-2xl font-black uppercase text-[10px] px-6 text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900">Libro Mayor</TabsTrigger>
                    {visibleAccounts.map(acc => <TabsTrigger key={acc.id} value={acc.id} className="rounded-2xl font-black uppercase text-[10px] px-6 text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900">{acc.nombre}</TabsTrigger>)}
                </TabsList>

                <TabsContent value="mayor" className="mt-4">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
                        <CardHeader className="bg-slate-900 text-white p-8"><CardTitle className="flex items-center gap-3 italic uppercase"><History className="text-[#f59e0b]" /> Libro Mayor Consolidado</CardTitle></CardHeader>
                        <CardContent className="p-0">
                             <Table>
                                <TableHeader className="bg-slate-50"><TableRow className="border-slate-200">
                                    <TableHead className="text-[10px] font-black uppercase px-8 text-slate-700">Cuenta</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Anterior</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Ingresos (+)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Egresos (-)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase pr-8 text-slate-700">Final</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {generalLedger.map(acc => (
                                        <TableRow key={acc.accountId} className="font-medium hover:bg-slate-50 transition-colors">
                                            <TableCell className="font-bold px-8 py-6 uppercase text-xs text-slate-900">{acc.accountName}</TableCell>
                                            <TableCell className="text-right text-slate-500 font-bold">{formatCurrency(acc.startBalance)}</TableCell>
                                            <TableCell className="text-right text-green-600 font-black">+{formatCurrency(acc.totalCredit)}</TableCell>
                                            <TableCell className="text-right text-red-600 font-black">-{formatCurrency(acc.totalDebit)}</TableCell>
                                            <TableCell className="text-right font-black italic text-lg pr-8 text-slate-900">Bs. {formatCurrency(acc.endBalance)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {visibleAccounts.map(acc => {
                    const { transactions, startBalance } = periodData[acc.id] || { transactions: [], startBalance: 0 };
                    return (
                        <TabsContent key={acc.id} value={acc.id} className="mt-4">
                            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
                                <CardHeader className="bg-slate-50 border-b p-8"><CardTitle className="uppercase italic text-slate-900 font-black">Libro Diario: {acc.nombre}</CardTitle></CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-100/50"><TableRow className="border-slate-200"><TableHead className="px-8 text-[10px] font-black uppercase text-slate-700">Fecha</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-700">Descripción</TableHead><TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Haber</TableHead><TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Debe</TableHead><TableHead className="text-right text-[10px] font-black uppercase pr-8 text-slate-700">Saldo</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            <TableRow className="bg-slate-50/80 text-[10px] font-black text-slate-500 italic"><TableCell colSpan={4} className="px-8 py-4">SALDO INICIAL DEL MES</TableCell><TableCell className="text-right pr-8">{formatCurrency(startBalance)}</TableCell></TableRow>
                                            {transactions.map((tx, i) => (
                                                <TableRow key={i} className="hover:bg-slate-50 transition-colors border-slate-100">
                                                    <TableCell className="px-8 font-bold text-slate-500 text-xs">{format(tx.date, 'dd/MM/yy')}</TableCell>
                                                    <TableCell className="font-black text-slate-900 uppercase italic text-xs">{tx.description}</TableCell>
                                                    <TableCell className="text-right text-emerald-600 font-black">{tx.credit ? `+${formatCurrency(tx.credit)}` : '-'}</TableCell>
                                                    <TableCell className="text-right text-red-600 font-black">{tx.debit ? `-${formatCurrency(tx.debit)}` : '-'}</TableCell>
                                                    <TableCell className="text-right font-black pr-8 text-slate-900">Bs. {formatCurrency(tx.balance)}</TableCell>
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

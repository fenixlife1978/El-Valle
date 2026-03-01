
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, Timestamp, query, orderBy, doc, serverTimestamp, increment, runTransaction, getDocs, where } from 'firebase/firestore';
import { RefreshCw, History, Zap, Loader2, BookCopy, AlertCircle } from 'lucide-react';
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
interface Transaction { 
    id: string; 
    fecha: Timestamp; 
    monto: number; 
    tipo: 'ingreso' | 'egreso'; 
    cuentaId: string; 
    nombreCuenta: string; 
    descripcion: string; 
    referencia?: string; 
    sourcePaymentId?: string; 
}
interface ProcessedTransaction { date: Date; descripcion: string; reference: string; credit: number; debit: number; balance: number; }

const formatCurrency = (amount: number): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

const AccountingPage = () => {
    const { toast } = useToast();
    const { workingCondoId, user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    useEffect(() => {
        if (!workingCondoId) return;
        setLoading(true);
        
        // ESCUCHA DE CUENTAS EN TIEMPO REAL
        const unsubAccounts = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), snap => {
            setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
        });

        // ESCUCHA DE TRANSACCIONES CENTRALIZADAS
        const unsubTx = onSnapshot(query(collection(db, 'condominios', workingCondoId, 'transacciones'), orderBy('fecha', 'asc')), snap => {
            setAllTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
            setLoading(false);
        });

        return () => { unsubAccounts(); unsubTx(); };
    }, [workingCondoId]);

    const periodData = useMemo(() => {
        const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
        const toDate = endOfMonth(fromDate);
        const accountData: Record<string, { transactions: ProcessedTransaction[], startBalance: number, endBalance: number }> = {};

        accounts.forEach(acc => { accountData[acc.id] = { transactions: [], startBalance: 0, endBalance: 0 }; });

        allTransactions.forEach(tx => {
            const date = tx.fecha.toDate();
            const entry: ProcessedTransaction = { 
                date, 
                descripcion: tx.descripcion || 'SIN CONCEPTO', 
                reference: tx.referencia || 'N/A', 
                credit: tx.tipo === 'ingreso' ? tx.monto : 0, 
                debit: tx.tipo === 'egreso' ? tx.monto : 0, 
                balance: 0 
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
        return accounts.map(acc => {
            const data = periodData[acc.id] || { startBalance: 0, transactions: [], endBalance: 0 };
            return {
                accountName: acc.nombre, accountId: acc.id, tipo: acc.tipo,
                startBalance: data.startBalance, totalCredit: data.transactions.reduce((sum, tx) => sum + tx.credit, 0),
                totalDebit: data.transactions.reduce((sum, tx) => sum + tx.debit, 0), endBalance: data.endBalance
            };
        });
    }, [accounts, periodData]);

    const handleSyncPeriod = async () => {
        if (!workingCondoId) return;
        setIsSyncing(true);
        try {
            const from = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const to = endOfMonth(from);
            const monthId = format(from, 'yyyy-MM');

            // ID EXCLUSIVO BANCO DE VENEZUELA
            const BDV_ACCOUNT_ID = "RdiTtY9ojCuYPRNvB7C3";
            const CAJA_PRINCIPAL_ID = "CAJA_PRINCIPAL_ID";

            // Buscar pagos aprobados en este rango
            const paySnap = await getDocs(query(collection(db, 'condominios', workingCondoId, 'payments'), where('status', '==', 'aprobado'), where('paymentDate', '>=', from), where('paymentDate', '<=', to)));
            
            let count = 0;
            await runTransaction(db, async (transaction) => {
                for (const pDoc of paySnap.docs) {
                    const p = pDoc.data();
                    // Evitar duplicidad si ya existe el asiento
                    if (allTransactions.some(tx => tx.sourcePaymentId === pDoc.id)) continue;

                    let targetAccountId = "";
                    let targetAccountName = "";

                    const method = (p.paymentMethod || "").toLowerCase().trim();
                    if (method.includes('movil') || method.includes('transferencia') || method.includes('pagomovil')) {
                        targetAccountId = BDV_ACCOUNT_ID;
                        targetAccountName = "BANCO DE VENEZUELA";
                    } else if (method.includes('efectivo')) {
                        targetAccountId = CAJA_PRINCIPAL_ID;
                        targetAccountName = "CAJA PRINCIPAL";
                    }
                    
                    if (!targetAccountId) continue;

                    const accountRef = doc(db, 'condominios', workingCondoId, 'cuentas', targetAccountId);
                    transaction.update(accountRef, { saldoActual: increment(p.totalAmount) });

                    // Registrar Asiento faltante
                    const newTxRef = doc(collection(db, 'condominios', workingCondoId, 'transacciones'));
                    transaction.set(newTxRef, {
                        monto: p.totalAmount, 
                        tipo: 'ingreso', 
                        cuentaId: targetAccountId, 
                        nombreCuenta: targetAccountName,
                        descripcion: `SINCRONIZACIÓN: PAGO DE ${p.beneficiaries?.[0]?.ownerName || 'RESIDENTE'}`.toUpperCase(),
                        referencia: p.reference, 
                        fecha: p.paymentDate, 
                        sourcePaymentId: pDoc.id,
                        createdAt: serverTimestamp(), 
                        createdBy: user?.email
                    });

                    // Actualizar Hito Mensual
                    const statsRef = doc(db, 'condominios', workingCondoId, 'financial_stats', monthId);
                    transaction.set(statsRef, {
                        periodo: monthId,
                        saldoBancarioReal: increment(targetAccountName === "BANCO DE VENEZUELA" ? p.totalAmount : 0),
                        saldoCajaReal: increment(targetAccountName === "CAJA PRINCIPAL" ? p.totalAmount : 0),
                        totalIngresosMes: increment(p.totalAmount),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                    
                    count++;
                }
                if (count === 0) throw "no_needed";
            });
            toast({ title: "Sincronización Exitosa", description: `Se asentaron ${count} hitos bancarios faltantes.` });
        } catch (e) {
            if (e === "no_needed") toast({ title: "Libros al día" });
            else { console.error(e); toast({ variant: 'destructive', title: "Error en reparación de libros" }); }
        } finally { setIsSyncing(false); }
    };

    if (loading) return (
        <div className="flex flex-col h-[70vh] items-center justify-center gap-4">
            <Loader2 className="animate-spin h-12 w-12 text-[#0081c9]" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 animate-pulse italic">Sincronizando Libros Diarios...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700 font-montserrat">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">Libros <span className="text-[#0081c9]">Contables</span></h2>
                    <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                    <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">Visibilidad total de asientos por cuenta en tiempo real.</p>
                </div>
                <Button onClick={handleSyncPeriod} disabled={isSyncing} variant="outline" className="rounded-xl border-[#0081c9] text-[#0081c9] font-black uppercase text-[10px] h-12 shadow-sm hover:bg-blue-50">
                    {isSyncing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />} Reparar Libros del Período
                </Button>
            </div>
            
            <Card className="rounded-3xl border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div><CardTitle className="text-slate-900 font-black uppercase text-sm tracking-widest italic">Período Fiscal</CardTitle></div>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-36 rounded-xl bg-slate-50 text-slate-900 border-slate-200 font-bold"><SelectValue /></SelectTrigger><SelectContent className="bg-white">{months.map(m => <SelectItem key={m.value} value={m.value} className="text-slate-900">{m.label}</SelectItem>)}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="w-24 rounded-xl bg-slate-50 text-slate-900 border-slate-200 font-bold"><SelectValue /></SelectTrigger><SelectContent className="bg-white">{years.map(y => <SelectItem key={y} value={y} className="text-slate-900">{y}</SelectItem>)}</SelectContent></Select>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="mayor">
                <TabsList className="flex flex-wrap h-auto gap-2 bg-slate-200 p-2 rounded-3xl">
                    <TabsTrigger value="mayor" className="rounded-2xl font-black uppercase text-[10px] px-6 py-3">Libro Mayor</TabsTrigger>
                    {accounts.map(acc => <TabsTrigger key={acc.id} value={acc.id} className="rounded-2xl font-black uppercase text-[10px] px-6 py-3 italic tracking-tight">{acc.nombre}</TabsTrigger>)}
                </TabsList>

                <TabsContent value="mayor" className="mt-4">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
                        <CardHeader className="bg-slate-900 text-white p-8"><CardTitle className="flex items-center gap-3 italic uppercase font-black tracking-widest"><History className="text-[#f59e0b]" /> Libro Mayor Consolidado</CardTitle></CardHeader>
                        <CardContent className="p-0">
                             <Table>
                                <TableHeader className="bg-slate-50"><TableRow className="border-slate-200">
                                    <TableHead className="text-[10px] font-black uppercase px-8 py-6 text-slate-700">Cuenta de Tesorería</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Saldo Anterior</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Abonos (+)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Cargos (-)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase pr-8 text-slate-700">Saldo Final</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {generalLedger.map(acc => (
                                        <TableRow key={acc.accountId} className="font-medium hover:bg-slate-50 transition-colors border-slate-100">
                                            <TableCell className="font-black px-8 py-6 uppercase text-xs text-slate-900 italic">{acc.accountName}</TableCell>
                                            <TableCell className="text-right text-slate-500 font-bold">Bs. {formatCurrency(acc.startBalance)}</TableCell>
                                            <TableCell className="text-right text-emerald-600 font-black">+{formatCurrency(acc.totalCredit)}</TableCell>
                                            <TableCell className="text-right text-red-600 font-black">-{formatCurrency(acc.totalDebit)}</TableCell>
                                            <TableCell className="text-right font-black italic text-lg pr-8 text-slate-900">Bs. {formatCurrency(acc.endBalance)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {accounts.map(acc => {
                    const { transactions, startBalance } = periodData[acc.id] || { transactions: [], startBalance: 0 };
                    return (
                        <TabsContent key={acc.id} value={acc.id} className="mt-4">
                            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
                                <CardHeader className="bg-slate-50 border-b p-8"><CardTitle className="uppercase italic text-slate-900 font-black flex items-center gap-2"><BookCopy className="text-[#0081c9]"/> Libro Diario: {acc.nombre}</CardTitle></CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-100/50"><TableRow className="border-slate-200"><TableHead className="px-8 py-6 text-[10px] font-black uppercase text-slate-700">Fecha</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-700">Descripción / Concepto del Asiento</TableHead><TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Ingreso (+)</TableHead><TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Egreso (-)</TableHead><TableHead className="text-right text-[10px] font-black uppercase pr-8 text-slate-700">Saldo Progresivo</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            <TableRow className="bg-slate-50/80 text-[10px] font-black text-slate-500 italic"><TableCell colSpan={4} className="px-8 py-4 uppercase">SALDO INICIAL AL 01 DE ESTE MES</TableCell><TableCell className="text-right pr-8">Bs. {formatCurrency(startBalance)}</TableCell></TableRow>
                                            {transactions.map((tx, i) => (
                                                <TableRow key={i} className="hover:bg-slate-50 transition-colors border-slate-100">
                                                    <TableCell className="px-8 py-5 font-bold text-slate-500 text-xs">{format(tx.date, 'dd/MM/yy')}</TableCell>
                                                    <TableCell className="font-black text-slate-900 uppercase italic text-xs leading-tight">{tx.descripcion}</TableCell>
                                                    <TableCell className="text-right text-emerald-600 font-black">{tx.credit ? `+${formatCurrency(tx.credit)}` : '-'}</TableCell>
                                                    <TableCell className="text-right text-red-600 font-black">{tx.debit ? `-${formatCurrency(tx.debit)}` : '-'}</TableCell>
                                                    <TableCell className="text-right font-black pr-8 text-slate-900 italic">Bs. {formatCurrency(tx.balance)}</TableCell>
                                                </TableRow>
                                            ))}
                                            {transactions.length === 0 && (
                                                <TableRow><TableCell colSpan={5} className="text-center py-20 text-slate-400 italic font-bold uppercase tracking-widest text-xs">No se registran movimientos en el período seleccionado.</TableCell></TableRow>
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

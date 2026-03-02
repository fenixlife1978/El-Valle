
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, Timestamp, query, orderBy, doc, serverTimestamp, increment, runTransaction, getDocs, where } from 'firebase/firestore';
import { RefreshCw, History, Zap, Loader2, BookCopy, Download, Share2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/use-auth';

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

// ID MAESTRO ACTUALIZADO PARA EFAS CONDOSYS
const BDV_ACCOUNT_ID = "Hlc0ky0QdnaXIsuf19Od";
const CAJA_PRINCIPAL_ID = "CAJA_PRINCIPAL_ID";

const AccountingPage = () => {
    const { toast } = useToast();
    const { workingCondoId, user, companyInfo } = useAuth();

    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    useEffect(() => {
        if (!workingCondoId) return;
        setLoading(true);
        
        const unsubAccounts = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), snap => {
            setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
        });

        const unsubTx = onSnapshot(query(collection(db, 'condominios', workingCondoId, 'transacciones'), orderBy('fecha', 'asc')), snap => {
            setAllTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).map(tx => ({
                ...tx,
                descripcion: tx.descripcion || tx.description || 'SIN CONCEPTO'
            })));
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

            // 1. Obtener pagos aprobados en el rango
            const paySnap = await getDocs(query(
                collection(db, 'condominios', workingCondoId, 'payments'), 
                where('status', '==', 'aprobado'), 
                where('paymentDate', '>=', from), 
                where('paymentDate', '<=', to)
            ));
            
            if (paySnap.empty) throw "no_needed";

            // 2. Obtener transacciones ya vinculadas a pagos para evitar duplicidad
            const txSnap = await getDocs(query(
                collection(db, 'condominios', workingCondoId, 'transacciones'), 
                where('sourcePaymentId', '!=', null)
            ));
            const existingPaymentIds = new Set(txSnap.docs.map(d => d.data().sourcePaymentId));

            const missingPayments = paySnap.docs.filter(d => !existingPaymentIds.has(d.id));
            if (missingPayments.length === 0) throw "no_needed";

            let count = 0;
            await runTransaction(db, async (transaction) => {
                for (const pDoc of missingPayments) {
                    const p = pDoc.data();
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

                    // Actualización Atómica de Saldo
                    const accountRef = doc(db, 'condominios', workingCondoId, 'cuentas', targetAccountId);
                    transaction.update(accountRef, { saldoActual: increment(p.totalAmount) });

                    // Asiento en Libro Diario
                    const newTxRef = doc(collection(db, 'condominios', workingCondoId, 'transacciones'));
                    transaction.set(newTxRef, {
                        monto: p.totalAmount, 
                        tipo: 'ingreso', 
                        cuentaId: targetAccountId, 
                        nombreCuenta: targetAccountName,
                        descripcion: `SINCRONIZACIÓN: PAGO DE ${p.beneficiaries?.[0]?.ownerName || 'RESIDENTE'}`.toUpperCase(),
                        referencia: p.reference || 'S/R', 
                        fecha: p.paymentDate, 
                        sourcePaymentId: pDoc.id,
                        createdAt: serverTimestamp(), 
                        createdBy: user?.email
                    });

                    // Sincronización de Estadísticas Financieras
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
            });

            toast({ title: "Sincronización Exitosa", description: `Se asentaron ${count} hitos contables.` });
        } catch (e) {
            if (e === "no_needed") toast({ title: "Libros al día", description: "No se encontraron movimientos pendientes de asentar." });
            else { 
                console.error(e); 
                toast({ variant: 'destructive', title: "Error en reparación", description: "Ocurrió un fallo al reconstruir los libros." }); 
            }
        } finally { setIsSyncing(false); }
    };

    const handleExportDailyBook = async (account: Account, output: 'download' | 'share' = 'download') => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const docPDF = new jsPDF();
        
        const data = periodData[account.id];
        if (!data) return;

        const info = companyInfo || { name: 'EFAS CondoSys', rif: 'J-00000000-0' };
        const periodLabel = `${months.find(m => m.value === selectedMonth)?.label.toUpperCase()} ${selectedYear}`;
        const margin = 14;
        const pageWidth = docPDF.internal.pageSize.getWidth();

        // Encabezado
        docPDF.setFillColor(15, 23, 42);
        docPDF.rect(0, 0, 210, 30, 'F');
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(14).setFont('helvetica', 'bold').text(info.name.toUpperCase(), margin, 15);
        docPDF.setFontSize(8).text(`RIF: ${info.rif}`, margin, 22);
        docPDF.setFontSize(10).text("LIBRO DIARIO DE CUENTA", 196, 18, { align: 'right' });

        docPDF.setTextColor(0, 0, 0);
        docPDF.setFontSize(12).setFont('helvetica', 'bold').text(`CUENTA: ${account.nombre}`, margin, 45);
        docPDF.setFontSize(10).setFont('helvetica', 'normal').text(`Período: ${periodLabel}`, margin, 52);
        
        docPDF.setFillColor(241, 245, 249);
        docPDF.rect(margin, 58, pageWidth - (margin * 2), 10, 'F');
        docPDF.setFont('helvetica', 'bold').text(`SALDO INICIAL AL 01 DEL MES:`, margin + 2, 64.5);
        docPDF.text(`Bs. ${formatCurrency(data.startBalance)}`, 196 - 2, 64.5, { align: 'right' });

        autoTable(docPDF, {
            startY: 75,
            head: [['FECHA', 'DESCRIPCIÓN / CONCEPTO', 'REF.', 'INGRESO (+)', 'EGRESO (-)', 'SALDO']],
            body: data.transactions.map(tx => [
                format(tx.date, 'dd/MM/yy'),
                tx.descripcion.toUpperCase(),
                tx.reference,
                tx.credit > 0 ? formatCurrency(tx.credit) : '',
                tx.debit > 0 ? formatCurrency(tx.debit) : '',
                formatCurrency(tx.balance)
            ]),
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right', fontStyle: 'bold' }
            }
        });

        const finalY = (docPDF as any).lastAutoTable.finalY + 10;
        docPDF.setFontSize(10).setFont('helvetica', 'bold').text(`SALDO FINAL CONCILIADO: Bs. ${formatCurrency(data.endBalance)}`, 196, finalY, { align: 'right' });

        if (output === 'share') {
            const blob = docPDF.output('blob');
            const file = new File([blob], `Libro_Diario_${account.nombre.replace(/ /g, '_')}.pdf`, { type: 'application/pdf' });
            if (navigator.share) {
                await navigator.share({ files: [file], title: `Libro Diario: ${account.nombre}`, text: `Movimientos de ${account.nombre} para ${periodLabel}` });
            } else {
                toast({ title: "No disponible", description: "Su navegador no soporta compartir archivos." });
            }
        } else {
            docPDF.save(`Libro_Diario_${account.nombre.replace(/ /g, '_')}_${selectedYear}_${selectedMonth}.pdf`);
        }
    };

    if (loading) return (
        <div className="flex flex-col h-[70vh] items-center justify-center gap-4 bg-[#1A1D23]">
            <Loader2 className="animate-spin h-12 w-12 text-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 animate-pulse italic">Sincronizando Libros...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700 font-montserrat bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white italic">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10 border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">Libros <span className="text-primary">Contables</span></h2>
                    <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                    <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">Visibilidad total de asientos por cuenta en tiempo real.</p>
                </div>
                <Button onClick={handleSyncPeriod} disabled={isSyncing} variant="outline" className="rounded-xl border-primary text-primary font-black uppercase text-[10px] h-12 shadow-sm bg-white/5 hover:bg-white/10 italic">
                    {isSyncing ? <Loader2 className="animate-spin mr-2" /> : <Zap className="mr-2 h-4 w-4" />} Reparar Período
                </Button>
            </div>
            
            <Card className="rounded-3xl border-none shadow-sm bg-slate-900 border border-white/5 italic">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div><CardTitle className="text-white font-black uppercase text-sm tracking-widest italic">Período Fiscal</CardTitle></div>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-36 rounded-xl bg-slate-800 text-white border-none font-bold italic">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                {months.map(m => <SelectItem key={m.value} value={m.value} className="italic">{m.label.toUpperCase()}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-24 rounded-xl bg-slate-800 text-white border-none font-bold italic">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                {years.map(y => <SelectItem key={y} value={y} className="italic">{y}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="mayor">
                <TabsList className="flex flex-wrap h-auto gap-2 bg-slate-800/50 p-2 rounded-3xl border border-white/5">
                    <TabsTrigger value="mayor" className="rounded-2xl font-black uppercase text-[10px] px-6 py-3 italic">Libro Mayor</TabsTrigger>
                    {accounts.map(acc => <TabsTrigger key={acc.id} value={acc.id} className="rounded-2xl font-black uppercase text-[10px] px-6 py-3 italic tracking-tight">{acc.nombre}</TabsTrigger>)}
                </TabsList>

                <TabsContent value="mayor" className="mt-4">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-slate-900 border border-white/5">
                        <CardHeader className="bg-slate-950 text-white p-8 border-b border-white/5"><CardTitle className="flex items-center gap-3 italic uppercase font-black tracking-widest text-white"><History className="text-primary" /> Libro Mayor Consolidado</CardTitle></CardHeader>
                        <CardContent className="p-0">
                             <Table>
                                <TableHeader className="bg-slate-950/50"><TableRow className="border-white/5">
                                    <TableHead className="text-[10px] font-black uppercase px-8 py-6 text-white/40 italic">Cuenta de Tesorería</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-white/40 italic">Saldo Anterior</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-white/40 italic">Abonos (+)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-white/40 italic">Cargos (-)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase pr-8 text-white/40 italic">Saldo Final</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {generalLedger.map(acc => (
                                        <TableRow key={acc.accountId} className="font-medium hover:bg-white/5 transition-colors border-white/5">
                                            <TableCell className="font-black px-8 py-6 uppercase text-xs text-white italic">{acc.accountName}</TableCell>
                                            <TableCell className="text-right text-slate-500 font-bold italic">Bs. {formatCurrency(acc.startBalance)}</TableCell>
                                            <TableCell className="text-right text-emerald-500 font-black italic">+{formatCurrency(acc.totalCredit)}</TableCell>
                                            <TableCell className="text-right text-red-500 font-black italic">-{formatCurrency(acc.totalDebit)}</TableCell>
                                            <TableCell className="text-right font-black italic text-lg pr-8 text-white">Bs. {formatCurrency(acc.endBalance)}</TableCell>
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
                            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-slate-900 border border-white/5">
                                <CardHeader className="bg-slate-950 border-b border-white/5 p-8">
                                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                                        <CardTitle className="uppercase italic text-white font-black flex items-center gap-2">
                                            <BookCopy className="text-primary"/> Libro Diario: {acc.nombre}
                                        </CardTitle>
                                        <div className="flex gap-2">
                                            <Button onClick={() => handleExportDailyBook(acc, 'download')} variant="outline" className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] h-10 bg-white/5 hover:bg-white/10 italic">
                                                <Download className="mr-2 h-4 w-4" /> Exportar PDF
                                            </Button>
                                            <Button onClick={() => handleExportDailyBook(acc, 'share')} variant="secondary" className="rounded-xl bg-primary text-slate-900 h-10 font-black uppercase text-[10px] italic">
                                                <Share2 className="mr-2 h-4 w-4" /> Compartir
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-950/50"><TableRow className="border-white/5"><TableHead className="px-8 py-6 text-[10px] font-black uppercase text-white/40 italic">Fecha</TableHead><TableHead className="text-[10px] font-black uppercase text-white/40 italic">Descripción / Concepto</TableHead><TableHead className="text-right text-[10px] font-black uppercase text-white/40 italic">Ingreso (+)</TableHead><TableHead className="text-right text-[10px] font-black uppercase text-white/40 italic">Egreso (-)</TableHead><TableHead className="text-right text-[10px] font-black uppercase pr-8 text-white/40 italic">Saldo Progresivo</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            <TableRow className="bg-white/5 text-[10px] font-black text-white/30 italic"><TableCell colSpan={4} className="px-8 py-4 uppercase">SALDO INICIAL AL 01 DE ESTE MES</TableCell><TableCell className="text-right pr-8">Bs. {formatCurrency(startBalance)}</TableCell></TableRow>
                                            {transactions.map((tx, i) => (
                                                <TableRow key={i} className="hover:bg-white/5 transition-colors border-white/5">
                                                    <TableCell className="px-8 py-5 font-bold text-white/40 text-xs italic">{format(tx.date, 'dd/MM/yy')}</TableCell>
                                                    <TableCell className="font-black text-white uppercase italic text-xs leading-tight">{tx.descripcion}</TableCell>
                                                    <TableCell className="text-right text-emerald-500 font-black italic">{tx.credit ? `+${formatCurrency(tx.credit)}` : '-'}</TableCell>
                                                    <TableCell className="text-right text-red-500 font-black italic">{tx.debit ? `-${formatCurrency(tx.debit)}` : '-'}</TableCell>
                                                    <TableCell className="text-right font-black pr-8 text-white italic">Bs. {formatCurrency(tx.balance)}</TableCell>
                                                </TableRow>
                                            ))}
                                            {transactions.length === 0 && (
                                                <TableRow><TableCell colSpan={5} className="text-center py-20 text-white/20 italic font-black uppercase tracking-widest text-xs">No se registran movimientos en el período.</TableCell></TableRow>
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


"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, Timestamp, writeBatch, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    PlusCircle, Trash2, FileText, Download, RefreshCw, 
    TrendingUp, TrendingDown, Wallet, Calendar as CalendarIcon, 
    Loader2, Paperclip, Building2, Search 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";


// --- Interfaces ---
interface Transaction {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    type: 'ingreso' | 'egreso';
    replenishmentId?: string;
}

interface Expense {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    receiptUrl?: string;
    replenishmentId: string;
}

interface Replenishment {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    expenses: Expense[];
}

// --- Helpers ---
const formatToTwoDecimals = (num: number) => {
    return (Math.round(num * 100) / 100).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PettyCashManager() {
    const { user, activeCondoId } = useAuth();
    const { toast } = useToast();
    
    // States
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [replenishments, setReplenishments] = useState<Replenishment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // UI States
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [receiptToView, setReceiptToView] = useState<string | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [replenishmentToDelete, setReplenishmentToDelete] = useState<Replenishment | null>(null);

    // Form States
    const [dialogType, setDialogType] = useState<'ingreso' | 'egreso'>('ingreso');
    const [dialogDate, setDialogDate] = useState<Date | undefined>(new Date());
    const [dialogAmount, setDialogAmount] = useState('');
    const [dialogDescription, setDialogDescription] = useState('');
    const [dialogReceiptFile, setDialogReceiptFile] = useState<File | null>(null);
    const [dialogReceiptImage, setDialogReceiptImage] = useState<string | null>(null);

    // Filters
    const currentYear = new Date().getFullYear();
    const [filterDateRange, setFilterDateRange] = useState({
        fromMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
        fromYear: currentYear.toString(),
        toMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
        toYear: currentYear.toString()
    });
    
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const workingCondoId = (sId && user?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;

    // --- Load Data (Segmented by workingCondoId) ---
    useEffect(() => {
        if (!workingCondoId) return;

        const transactionsQuery = query(
            collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'),
            orderBy('date', 'desc')
        );

        const replenishmentsQuery = query(
            collection(db, 'condominios', workingCondoId, 'cajaChica_reposiciones'),
            orderBy('date', 'desc')
        );

        const unsubTx = onSnapshot(transactionsQuery, (snapshot) => {
            setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
            setLoading(false);
        });

        const unsubRep = onSnapshot(replenishmentsQuery, (snapshot) => {
            setReplenishments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Replenishment)));
        });

        return () => { unsubTx(); unsubRep(); };
    }, [workingCondoId]);

    // --- Calculations ---
    const totals = useMemo(() => {
        const totalIngresos = transactions.filter(t => t.type === 'ingreso').reduce((acc, t) => acc + t.amount, 0);
        const totalEgresos = transactions.filter(t => t.type === 'egreso').reduce((acc, t) => acc + t.amount, 0);
        return { totalIngresos, totalEgresos, saldo: totalIngresos - totalEgresos };
    }, [transactions]);

    const filteredTransactions = useMemo(() => {
        const fromDate = new Date(parseInt(filterDateRange.fromYear), parseInt(filterDateRange.fromMonth) - 1, 1);
        const toDate = new Date(parseInt(filterDateRange.toYear), parseInt(filterDateRange.toMonth), 0, 23, 59, 59);
        
        return transactions
            .filter(tx => {
                const txDate = tx.date.toDate();
                return txDate >= fromDate && txDate <= toDate;
            })
            .sort((a, b) => a.date.toMillis() - b.date.toMillis());
    }, [transactions, filterDateRange]);

    const periodTotals = useMemo(() => {
        const fromDate = new Date(parseInt(filterDateRange.fromYear), parseInt(filterDateRange.fromMonth) - 1, 1);
        const priorTransactions = transactions.filter(tx => tx.date.toDate() < fromDate);
        
        const saldoInicial = priorTransactions.reduce((acc, tx) => 
            tx.type === 'ingreso' ? acc + tx.amount : acc - tx.amount, 0);
        
        const totalIngresos = filteredTransactions.filter(tx => tx.type === 'ingreso').reduce((acc, tx) => acc + tx.amount, 0);
        const totalEgresos = filteredTransactions.filter(tx => tx.type === 'egreso').reduce((acc, tx) => acc + tx.amount, 0);

        return {
            saldoInicial,
            totalIngresos,
            totalEgresos,
            saldoFinal: saldoInicial + totalIngresos - totalEgresos
        };
    }, [transactions, filteredTransactions, filterDateRange]);

    const replenishmentsWithRunningBalance = useMemo(() => {
        const sorted = [...replenishments].sort((a, b) => a.date.toMillis() - b.date.toMillis());
        let runningBalance = 0;
        
        return sorted.map(rep => {
            const previousBalance = runningBalance;
            const totalRepExpenses = rep.expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
            const currentCycleEndBalance = previousBalance + rep.amount - totalRepExpenses;
            runningBalance = currentCycleEndBalance;
            
            return {
                ...rep,
                previousBalance,
                totalRepExpenses,
                currentCycleEndBalance
            };
        }).reverse();
    }, [replenishments]);

    // --- Actions ---
    const handleReceiptImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setDialogReceiptFile(file);
            setDialogReceiptImage(URL.createObjectURL(file));
        }
    };

    const resetDialog = () => {
        setIsDialogOpen(false);
        setDialogAmount('');
        setDialogDescription('');
        setDialogDate(new Date());
        setDialogReceiptFile(null);
        setDialogReceiptImage(null);
    };

    const handleSaveMovement = async (type: 'ingreso' | 'egreso') => {
        if (!workingCondoId || !dialogAmount || !dialogDescription || !dialogDate) return;
        setIsSubmitting(true);

        try {
            const amount = parseFloat(dialogAmount);
            const dateTimestamp = Timestamp.fromDate(dialogDate);

            if (type === 'ingreso') {
                // Es una nueva reposición de fondo (Ingreso al Libro)
                const repRef = await addDoc(collection(db, 'condominios', workingCondoId, 'cajaChica_reposiciones'), {
                    date: dateTimestamp,
                    description: dialogDescription,
                    amount: amount,
                    expenses: []
                });

                await addDoc(collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'), {
                    date: dateTimestamp,
                    description: `FONDO INICIAL: ${dialogDescription}`,
                    amount: amount,
                    type: 'ingreso',
                    replenishmentId: repRef.id
                });
            } else {
                // Es un gasto contra un fondo existente
                if (amount > totals.saldo) {
                    throw new Error(`Saldo insuficiente en Caja Chica. Disponible: Bs. ${formatToTwoDecimals(totals.saldo)}`);
                }

                const latestReplenishment = replenishments.length > 0 ? replenishments[0] : null;
                if (!latestReplenishment) {
                    throw new Error("No existe un ciclo de reposición para asignar este gasto. Por favor, cree un ingreso primero.");
                }
                const replenishmentToUseId = latestReplenishment.id;
                
                let receiptUrl = "";
                if (dialogReceiptFile) {
                    const storageRef = ref(storage, `condominios/${workingCondoId}/cajaChica/${Date.now()}_${dialogReceiptFile.name}`);
                    const uploadTask = await uploadBytes(storageRef, dialogReceiptFile);
                    receiptUrl = await getDownloadURL(uploadTask.ref);
                }

                const newExpense: Expense = {
                    id: crypto.randomUUID(),
                    date: dateTimestamp,
                    description: dialogDescription,
                    amount: amount,
                    receiptUrl,
                    replenishmentId: replenishmentToUseId
                };

                const repRef = doc(db, 'condominios', workingCondoId, 'cajaChica_reposiciones', replenishmentToUseId);
                const targetRep = replenishments.find(r => r.id === replenishmentToUseId);
                const updatedExpenses = [...(targetRep?.expenses || []), newExpense];

                const batch = writeBatch(db);
                batch.update(repRef, { expenses: updatedExpenses });
                const newMovementRef = doc(collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'));
                batch.set(newMovementRef, {
                    date: dateTimestamp,
                    description: dialogDescription,
                    amount: amount,
                    type: 'egreso',
                    replenishmentId: replenishmentToUseId
                });
                await batch.commit();
            }
            resetDialog();
        } catch (error: any) {
            console.error("Error saving movement:", error);
            toast({
                variant: 'destructive',
                title: 'Error al Guardar',
                description: error.message || 'Ocurrió un error inesperado.'
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleReplenish = async (rep: any) => {
        if (!workingCondoId) return;
        setIsSubmitting(true);
        try {
            const dateTimestamp = Timestamp.now();
            const amountToReplenish = rep.totalRepExpenses;

            const repRef = await addDoc(collection(db, 'condominios', workingCondoId, 'cajaChica_reposiciones'), {
                date: dateTimestamp,
                description: `REPOSICIÓN DE: ${rep.description}`,
                amount: amountToReplenish,
                expenses: []
            });

            await addDoc(collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'), {
                date: dateTimestamp,
                description: `INGRESO POR REPOSICIÓN: ${rep.description}`,
                amount: amountToReplenish,
                type: 'ingreso',
                replenishmentId: repRef.id
            });
            
            // Opcional: Registrar el egreso en la contabilidad principal aquí si se desea
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTransaction = async (tx: Transaction) => {
        if (!workingCondoId || !confirm("¿Eliminar este movimiento?")) return;
        try {
            await deleteDoc(doc(db, 'condominios', workingCondoId, 'cajaChica_movimientos', tx.id));
        } catch (error) { console.error(error); }
    };

    const confirmDeleteReplenishment = async () => {
        if (!workingCondoId || !replenishmentToDelete) return;
        setIsSubmitting(true);
        try {
            const batch = writeBatch(db);
            // 1. Borrar la reposición
            batch.delete(doc(db, 'condominios', workingCondoId, 'cajaChica_reposiciones', replenishmentToDelete.id));
            
            // 2. Borrar todos los movimientos asociados (ingreso y gastos)
            const q = query(collection(db, 'condominios', workingCondoId, 'cajaChica_movimientos'), where('replenishmentId', '==', replenishmentToDelete.id));
            const snap = await getDocs(q);
            snap.forEach(d => batch.delete(d.ref));

            await batch.commit();
            setIsDeleteConfirmationOpen(false);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- PDF Exports ---
    const handleExportLedgerPdf = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("LIBRO DE CAJA CHICA", 14, 20);
        doc.setFontSize(10);
        doc.text(`Período: ${filterDateRange.fromMonth}/${filterDateRange.fromYear} a ${filterDateRange.toMonth}/${filterDateRange.toYear}`, 14, 28);
        
        const tableData = [
            ["-", "SALDO INICIAL DEL PERÍODO", "", "", formatToTwoDecimals(periodTotals.saldoInicial)],
            ...filteredTransactions.map(tx => [
                format(tx.date.toDate(), 'dd/MM/yyyy'),
                tx.description,
                tx.type === 'ingreso' ? formatToTwoDecimals(tx.amount) : '',
                tx.type === 'egreso' ? formatToTwoDecimals(tx.amount) : '',
                ''
            ]),
            ["", "TOTALES", formatToTwoDecimals(periodTotals.totalIngresos), formatToTwoDecimals(periodTotals.totalEgresos), ""],
            ["", "SALDO FINAL", "", "", formatToTwoDecimals(periodTotals.saldoFinal)]
        ];

        autoTable(doc, {
            head: [['Fecha', 'Descripción / Concepto', 'Ingresos (Bs)', 'Egresos (Bs)', 'Saldo (Bs)']],
            body: tableData,
            startY: 35,
            theme: 'grid',
            headStyles: { fillColor: [0, 129, 201] },
            columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
        });

        doc.save(`CajaChica_Libro_${filterDateRange.fromMonth}_${filterDateRange.fromYear}.pdf`);
    };

    const handleGenerateReplenishmentPdf = (rep: any) => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text("RELACIÓN DE GASTOS DE CAJA CHICA", 14, 20);
        doc.setFontSize(10);
        doc.text(`Ciclo: ${rep.description}`, 14, 28);
        doc.text(`Fecha: ${format(rep.date.toDate(), 'dd/MM/yyyy')}`, 14, 33);

        const tableData = rep.expenses.map((e: Expense) => [
            format(e.date.toDate(), 'dd/MM/yyyy'),
            e.description,
            formatToTwoDecimals(e.amount)
        ]);

        autoTable(doc, {
            head: [['Fecha', 'Concepto del Gasto', 'Monto (Bs.)']],
            body: tableData,
            startY: 40,
            theme: 'striped',
            headStyles: { fillColor: [245, 158, 11] }
        });

        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.text(`Subtotal Gastado: Bs. ${formatToTwoDecimals(rep.totalRepExpenses)}`, 140, finalY);
        doc.text(`Saldo Remanente: Bs. ${formatToTwoDecimals(rep.currentCycleEndBalance)}`, 140, finalY + 7);

        doc.save(`Relacion_Gastos_${rep.id.substring(0,5)}.pdf`);
    };

    // --- Options ---
    const monthOptions = [
        { label: 'Enero', value: '01' }, { label: 'Febrero', value: '02' }, { label: 'Marzo', value: '03' },
        { label: 'Abril', value: '04' }, { label: 'Mayo', value: '05' }, { label: 'Junio', value: '06' },
        { label: 'Julio', value: '07' }, { label: 'Agosto', value: '08' }, { label: 'Septiembre', value: '09' },
        { label: 'Octubre', value: '10' }, { label: 'Noviembre', value: '11' }, { label: 'Diciembre', value: '12' },
    ];
    const yearOptions = [currentYear - 1, currentYear, currentYear + 1].map(String);

    // --- RENDER ---
    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                        Caja <span className="text-[#0081c9]">Chica</span>
                    </h2>
                    <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                    <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide flex items-center gap-2">
                        <Building2 className="h-4 w-4" /> Gestión de Fondos y Gastos Menores
                    </p>
                </div>
                <Button 
                    onClick={() => setIsDialogOpen(true)} 
                    className="bg-[#0081c9] hover:bg-[#006ba8] text-white font-bold shadow-lg transform transition-transform hover:scale-105"
                >
                    <PlusCircle className="mr-2 h-5 w-5" /> Registrar Movimiento
                </Button>
            </div>

            {/* Balances Card */}
            <Card className="border-t-4 border-t-[#0081c9] shadow-md overflow-hidden">
                <CardHeader className="bg-slate-50/50">
                    <CardTitle className="flex items-center gap-2 text-slate-800 text-sm uppercase tracking-widest font-black">
                        <Wallet className="text-[#f59e0b] h-5 w-5" /> Balance Consolidado
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                    <div className="p-5 bg-green-50 border border-green-200 rounded-2xl text-center">
                        <p className="text-[10px] text-green-800 font-black uppercase tracking-widest mb-1">Total Ingresos</p>
                        <p className="text-3xl font-black text-green-700">Bs. {formatToTwoDecimals(totals.totalIngresos)}</p>
                    </div>
                    <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-center">
                        <p className="text-[10px] text-red-800 font-black uppercase tracking-widest mb-1">Total Egresos</p>
                        <p className="text-3xl font-black text-red-700">Bs. {formatToTwoDecimals(totals.totalEgresos)}</p>
                    </div>
                    <div className="p-5 bg-blue-50 border border-blue-200 rounded-2xl text-center shadow-inner">
                        <p className="text-[10px] text-blue-800 font-black uppercase tracking-widest mb-1">Saldo Disponible</p>
                        <p className="text-3xl font-black text-blue-900">Bs. {formatToTwoDecimals(totals.saldo)}</p>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="ledger" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8 p-1 bg-slate-100 rounded-xl h-12">
                    <TabsTrigger value="ledger" className="rounded-lg font-black uppercase text-xs data-[state=active]:bg-white data-[state=active]:text-[#0081c9] data-[state=active]:shadow-sm">
                        Libro Contable
                    </TabsTrigger>
                    <TabsTrigger value="replenishments" className="rounded-lg font-black uppercase text-xs data-[state=active]:bg-white data-[state=active]:text-[#0081c9] data-[state=active]:shadow-sm">
                        Ciclos de Reposición
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="ledger" className="space-y-6">
                    <Card className="shadow-sm border-slate-200">
                        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2">
                            <div>
                                <CardTitle className="text-xl font-bold">Historial de Movimientos</CardTitle>
                                <CardDescription>Consulte el flujo de efectivo filtrado por período</CardDescription>
                            </div>
                            <Button onClick={handleExportLedgerPdf} variant="outline" className="font-bold border-[#0081c9] text-[#0081c9] hover:bg-blue-50">
                                <FileText className="mr-2 h-4 w-4" /> Exportar Libro PDF
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {/* Filter Bar */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 mb-6 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-black text-slate-400">Desde</Label>
                                    <div className="flex gap-1">
                                        <Select value={filterDateRange.fromMonth} onValueChange={(v) => setFilterDateRange(p => ({...p, fromMonth: v}))}>
                                            <SelectTrigger className="h-9 text-xs font-bold bg-white text-slate-900 rounded-xl"><SelectValue/></SelectTrigger>
                                            <SelectContent>{monthOptions.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Select value={filterDateRange.fromYear} onValueChange={(v) => setFilterDateRange(p => ({...p, fromYear: v}))}>
                                            <SelectTrigger className="h-9 text-xs font-bold bg-white text-slate-900 rounded-xl"><SelectValue/></SelectTrigger>
                                            <SelectContent>{yearOptions.map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-black text-slate-400">Hasta</Label>
                                    <div className="flex gap-1">
                                        <Select value={filterDateRange.toMonth} onValueChange={(v) => setFilterDateRange(p => ({...p, toMonth: v}))}>
                                            <SelectTrigger className="h-9 text-xs font-bold bg-white text-slate-900 rounded-xl"><SelectValue/></SelectTrigger>
                                            <SelectContent>{monthOptions.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Select value={filterDateRange.toYear} onValueChange={(v) => setFilterDateRange(p => ({...p, toYear: v}))}>
                                            <SelectTrigger className="h-9 text-xs font-bold bg-white text-slate-900 rounded-xl"><SelectValue/></SelectTrigger>
                                            <SelectContent>{yearOptions.map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="font-bold">Fecha</TableHead>
                                            <TableHead className="font-bold">Concepto / Descripción</TableHead>
                                            <TableHead className="text-right font-bold text-green-700">Ingreso</TableHead>
                                            <TableHead className="text-right font-bold text-red-700">Egreso</TableHead>
                                            <TableHead className="text-right"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <TableRow className="bg-blue-50/50 font-bold italic">
                                            <TableCell colSpan={2}>Saldo Inicial Período</TableCell>
                                            <TableCell colSpan={3} className="text-right text-[#0081c9]">Bs. {formatToTwoDecimals(periodTotals.saldoInicial)}</TableCell>
                                        </TableRow>
                                        {loading ? (
                                            <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-[#0081c9]"/></TableCell></TableRow>
                                        ) : filteredTransactions.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-400">No hay movimientos en este período</TableCell></TableRow>
                                        ) : (
                                            filteredTransactions.map(tx => (
                                                <TableRow key={tx.id} className="hover:bg-slate-50 transition-colors">
                                                    <TableCell className="font-medium text-slate-600">{format(tx.date.toDate(), 'dd/MM/yyyy')}</TableCell>
                                                    <TableCell className="uppercase text-[11px] font-bold text-slate-700">{tx.description}</TableCell>
                                                    <TableCell className="text-right text-green-600 font-black">{tx.type === 'ingreso' ? `Bs. ${formatToTwoDecimals(tx.amount)}` : ''}</TableCell>
                                                    <TableCell className="text-right text-red-600 font-black">{tx.type === 'egreso' ? `Bs. ${formatToTwoDecimals(tx.amount)}` : ''}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteTransaction(tx)} className="hover:bg-red-50 text-slate-400 hover:text-red-600">
                                                            <Trash2 className="h-4 w-4"/>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                    <TableFooter className="bg-slate-900 text-white">
                                        <TableRow className="font-black">
                                            <TableCell colSpan={3} className="text-right uppercase tracking-widest text-[10px]">Saldo Final Estimado del Período</TableCell>
                                            <TableCell className="text-right text-[#f59e0b] text-lg" colSpan={2}>Bs. {formatToTwoDecimals(periodTotals.saldoFinal)}</TableCell>
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="replenishments" className="space-y-4">
                    {replenishmentsWithRunningBalance.length === 0 && (
                        <div className="text-center p-12 bg-slate-50 rounded-2xl border-2 border-dashed">
                            <p className="text-slate-400 font-bold italic">No existen ciclos de reposición registrados.</p>
                            <Button variant="link" onClick={() => setIsDialogOpen(true)} className="text-[#0081c9]">Cree el primer fondo aquí</Button>
                        </div>
                    )}
                    {replenishmentsWithRunningBalance.map((rep) => (
                        <Card key={rep.id} className="overflow-hidden border-l-4 border-l-[#f59e0b] shadow-sm">
                            <Collapsible>
                                <CollapsibleTrigger className="w-full p-5 hover:bg-slate-50 transition-colors group">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                                        <div className="text-left">
                                            <h3 className="font-black text-slate-800 uppercase italic flex items-center gap-2">
                                                {rep.description}
                                            </h3>
                                            <p className="text-xs font-bold text-slate-400">{format(rep.date.toDate(), "dd 'de' MMMM, yyyy", {locale: es})}</p>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Fondo Inicial</p>
                                                <p className="font-black text-slate-900">Bs. {formatToTwoDecimals(rep.amount)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-red-400 uppercase tracking-tighter">Gastado</p>
                                                <p className="font-black text-red-600">Bs. {formatToTwoDecimals(rep.totalRepExpenses)}</p>
                                            </div>
                                            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-data-[state=open]:rotate-180 transition-transform">
                                                <TrendingDown className="h-4 w-4" />
                                            </div>
                                        </div>
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="border-t border-slate-100 bg-slate-50/20">
                                    <CardContent className="pt-6">
                                        <div className="rounded-xl border bg-white overflow-hidden mb-4">
                                            <Table>
                                                <TableHeader className="bg-slate-50">
                                                    <TableRow>
                                                        <TableHead className="text-[10px] font-black uppercase">Fecha</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase">Concepto del Gasto</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase">Soporte</TableHead>
                                                        <TableHead className="text-right text-[10px] font-black uppercase">Monto</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {rep.expenses.length === 0 ? (
                                                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-slate-400 italic text-xs">No se han registrado gastos en este ciclo</TableCell></TableRow>
                                                    ) : (
                                                        rep.expenses.map((exp: Expense) => (
                                                            <TableRow key={exp.id} className="text-xs">
                                                                <TableCell className="font-bold text-slate-500">{format(exp.date.toDate(), 'dd/MM/yy')}</TableCell>
                                                                <TableCell className="font-bold uppercase text-slate-700">{exp.description}</TableCell>
                                                                <TableCell>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="sm" 
                                                                        className="h-7 text-[10px] font-black text-[#0081c9] hover:bg-blue-50" 
                                                                        onClick={() => setReceiptToView(exp.receiptUrl || null)} 
                                                                        disabled={!exp.receiptUrl}
                                                                    >
                                                                        <Paperclip className="mr-1 h-3 w-3"/> VER COMPROBANTE
                                                                    </Button>
                                                                </TableCell>
                                                                <TableCell className="text-right font-black text-slate-900">Bs. {formatToTwoDecimals(exp.amount)}</TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                                            <div className="space-y-1.5 p-4 rounded-xl bg-white border border-slate-100 shadow-sm">
                                                <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-400 uppercase">Saldo de Ciclo Anterior</span><span className="text-slate-600">Bs. {formatToTwoDecimals(rep.previousBalance)}</span></div>
                                                <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-400 uppercase">(+) Ingreso / Reposición</span><span className="text-green-600">Bs. {formatToTwoDecimals(rep.amount)}</span></div>
                                                <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-400 uppercase">(-) Egresos del Ciclo</span><span className="text-red-600">Bs. {formatToTwoDecimals(rep.totalRepExpenses)}</span></div>
                                                <Separator className="my-2" />
                                                <div className="flex justify-between text-sm font-black italic"><span className="text-slate-800 uppercase tracking-tighter">Saldo Remanente</span><span className="text-[#0081c9]">Bs. {formatToTwoDecimals(rep.currentCycleEndBalance)}</span></div>
                                            </div>

                                            <div className="flex flex-wrap gap-2 justify-end">
                                                <Button variant="outline" size="sm" className="font-bold border-slate-300" onClick={() => handleGenerateReplenishmentPdf(rep)}><Download className="mr-2 h-4 w-4"/> Relación PDF</Button>
                                                <Button variant="outline" size="sm" className="font-bold text-red-500 border-red-200 hover:bg-red-50" 
                                                    onClick={() => { setReplenishmentToDelete(rep); setIsDeleteConfirmationOpen(true); }}
                                                    disabled={isSubmitting}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4"/> Eliminar Ciclo
                                                </Button>
                                                <Button 
                                                    size="sm"
                                                    className="bg-slate-800 hover:bg-black text-white font-bold"
                                                    onClick={() => handleReplenish(rep)}
                                                    disabled={rep.totalRepExpenses <= 0 || isSubmitting}
                                                >
                                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                                                    Reponer (Bs. {formatToTwoDecimals(rep.totalRepExpenses)})
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Collapsible>
                        </Card>
                    ))}
                </TabsContent>
            </Tabs>

            {/* --- DIALOGS --- */}
            <Dialog open={isDialogOpen} onOpenChange={resetDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter">Nuevo <span className="text-[#0081c9]">Movimiento</span></DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="ingreso" className="w-full" onValueChange={(v) => setDialogType(v as any)}>
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="ingreso" className="font-bold"><TrendingUp className="mr-2 h-4 w-4 text-green-500"/> Ingreso</TabsTrigger>
                            <TabsTrigger value="egreso" className="font-bold"><TrendingDown className="mr-2 h-4 w-4 text-red-500"/> Gasto</TabsTrigger>
                        </TabsList>
                        
                        <div className="space-y-4 py-2">
                             <div className="space-y-1.5">
                                <Label className="text-xs font-black uppercase">Fecha</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-bold", !dialogDate && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dialogDate ? format(dialogDate, "PPP", { locale: es }) : <span>Seleccionar</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dialogDate} onSelect={setDialogDate} locale={es} /></PopoverContent>
                                </Popover>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-black uppercase">{dialogType === 'ingreso' ? 'Monto Repuesto (Bs.)' : 'Monto del Gasto (Bs.)'}</Label>
                                <Input type="number" value={dialogAmount} onChange={(e) => setDialogAmount(e.target.value)} placeholder="0.00" className="font-bold text-lg" />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-black uppercase">Concepto / Descripción</Label>
                                <Input value={dialogDescription} onChange={(e) => setDialogDescription(e.target.value)} placeholder="Ej: Pago de servicios menores" className="uppercase text-xs font-bold" />
                            </div>

                            {dialogType === 'egreso' && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-black uppercase">Soporte Digital (Imagen)</Label>
                                    <div className="flex items-center gap-4">
                                        <Input type="file" accept="image/*" onChange={handleReceiptImageUpload} className="text-xs" />
                                        {dialogReceiptImage && <img src={dialogReceiptImage} className="w-12 h-12 object-cover rounded border" alt="Preview"/>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Tabs>
                    <DialogFooter className="mt-4">
                        <Button variant="ghost" onClick={resetDialog} className="font-bold">Cancelar</Button>
                        <Button onClick={() => handleSaveMovement(dialogType)} disabled={isSubmitting} className="bg-[#0081c9] font-black uppercase">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                            Guardar {dialogType === 'ingreso' ? 'Ingreso' : 'Gasto'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Viewer for Receipts */}
            <Dialog open={!!receiptToView} onOpenChange={() => setReceiptToView(null)}>
                <DialogContent className="max-w-2xl bg-black/5 p-1 border-none shadow-none">
                    <img src={receiptToView || ''} alt="Soporte" className="w-full h-auto max-h-[90vh] object-contain rounded-lg" />
                    <Button onClick={() => setReceiptToView(null)} className="absolute top-2 right-2 rounded-full w-8 h-8 p-0">X</Button>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-600 font-black uppercase italic">¿Eliminar Ciclo de Reposición?</DialogTitle>
                        <DialogDescription className="font-bold text-slate-500">
                            Esta acción eliminará el registro del fondo y TODOS los gastos asociados. También se borrarán los movimientos del libro contable. Esta acción es irreversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)} className="font-bold">Cancelar</Button>
                        <Button variant="destructive" onClick={confirmDeleteReplenishment} disabled={isSubmitting} className="font-black uppercase tracking-tighter">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Confirmar Eliminación Total
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

    

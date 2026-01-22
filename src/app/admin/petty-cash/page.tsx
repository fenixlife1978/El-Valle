
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, Timestamp, orderBy, query, serverTimestamp, writeBatch, getDoc, getDocs } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PlusCircle, Trash2, Loader2, CalendarIcon, Wallet, TrendingDown, TrendingUp, DollarSign, Download, Paperclip, Upload, FileText, RefreshCw } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImageAsBlob } from '@/lib/utils';
import { useAuthorization } from '@/hooks/use-authorization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/use-auth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Separator } from '@/components/ui/separator';


type Expense = {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    receiptUrl?: string;
};

type Replenishment = {
    id: string;
    date: Timestamp;
    amount: number;
    description: string;
    expenses: Expense[];
    sourceExpenseId?: string;
};

type Transaction = {
    type: 'ingreso' | 'egreso';
    date: Timestamp;
    description: string;
    amount: number;
    id: string; 
    parentId?: string; 
    originalDoc: Replenishment | Expense;
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const yearOptions = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + 1 - i));


export default function PettyCashPage() {
    const [replenishments, setReplenishments] = useState<Replenishment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { companyInfo } = useAuth();
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [receiptToView, setReceiptToView] = useState<string | null>(null);
    
    // New Dialog State
    const [dialogDate, setDialogDate] = useState<Date | undefined>(new Date());
    const [dialogAmount, setDialogAmount] = useState('');
    const [dialogDescription, setDialogDescription] = useState('');
    const [dialogSelectedRepId, setDialogSelectedRepId] = useState<string>('');
    const [dialogReceiptImage, setDialogReceiptImage] = useState<string | null>(null);
    const [replenishmentToDelete, setReplenishmentToDelete] = useState<Replenishment | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);


    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    
    const [filterDateRange, setFilterDateRange] = useState({
        fromMonth: String(new Date().getMonth() + 1),
        fromYear: String(new Date().getFullYear()),
        toMonth: String(new Date().getMonth() + 1),
        toYear: String(new Date().getFullYear()),
    });


    useEffect(() => {
        const q = query(collection(db, "petty_cash_replenishments"), orderBy("date", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Replenishment));
            setReplenishments(data);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching replenishments:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos de caja chica.' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);
    
    const allTransactions = useMemo<Transaction[]>(() => {
        const transactions: Transaction[] = [];
        replenishments.forEach(rep => {
            transactions.push({
                type: 'ingreso',
                date: rep.date,
                description: rep.description,
                amount: rep.amount,
                id: rep.id,
                originalDoc: rep,
            });
            rep.expenses.forEach(exp => {
                transactions.push({
                    type: 'egreso',
                    date: exp.date,
                    description: exp.description,
                    amount: exp.amount,
                    id: exp.id,
                    parentId: rep.id,
                    originalDoc: exp,
                });
            });
        });
        return transactions.sort((a, b) => a.date.toMillis() - b.date.toMillis());
    }, [replenishments]);
    
    const { filteredTransactions, periodTotals } = useMemo(() => {
        const { fromMonth, fromYear, toMonth, toYear } = filterDateRange;
        const startDate = startOfMonth(new Date(parseInt(fromYear), parseInt(fromMonth) - 1));
        const endDate = endOfMonth(new Date(parseInt(toYear), parseInt(toMonth) - 1));

        const saldoInicial = allTransactions
            .filter(tx => tx.date.toDate() < startDate)
            .reduce((balance, tx) => balance + (tx.type === 'ingreso' ? tx.amount : -tx.amount), 0);
        
        const transactionsInPeriod = allTransactions.filter(tx => {
            const txDate = tx.date.toDate();
            return txDate >= startDate && txDate <= endDate;
        });

        const totalIngresos = transactionsInPeriod.filter(tx => tx.type === 'ingreso').reduce((sum, tx) => sum + tx.amount, 0);
        const totalEgresos = transactionsInPeriod.filter(tx => tx.type === 'egreso').reduce((sum, tx) => sum + tx.amount, 0);
        const saldoFinal = saldoInicial + totalIngresos - totalEgresos;

        return {
            filteredTransactions: transactionsInPeriod,
            periodTotals: { saldoInicial, totalIngresos, totalEgresos, saldoFinal }
        };
    }, [allTransactions, filterDateRange]);


    const totals = useMemo(() => {
        const totalIngresos = allTransactions.filter(t => t.type === 'ingreso').reduce((sum, t) => sum + t.amount, 0);
        const totalEgresos = allTransactions.filter(t => t.type === 'egreso').reduce((sum, t) => sum + t.amount, 0);
        const saldo = totalIngresos - totalEgresos;
        return { totalIngresos, totalEgresos, saldo };
    }, [allTransactions]);
    
    const replenishmentsWithRunningBalance = useMemo(() => {
        const chronological = [...replenishments].sort((a, b) => a.date.toMillis() - b.date.toMillis());
        
        const calculatedList: (Replenishment & { previousBalance: number; totalRepExpenses: number; currentCycleEndBalance: number; })[] = [];
        let runningBalance = 0;

        for (const rep of chronological) {
            const previousBalance = runningBalance;
            const totalRepExpenses = rep.expenses.reduce((sum, exp) => sum + exp.amount, 0);
            const currentCycleEndBalance = previousBalance + rep.amount - totalRepExpenses;
            
            calculatedList.push({
                ...rep,
                previousBalance,
                totalRepExpenses,
                currentCycleEndBalance,
            });

            runningBalance = currentCycleEndBalance;
        }
        
        return calculatedList.reverse(); // Show newest first
    }, [replenishments]);

    const resetDialog = () => {
        setIsDialogOpen(false);
        setDialogDate(new Date());
        setDialogAmount('');
        setDialogDescription('');
        setDialogSelectedRepId('');
        setDialogReceiptImage(null);
    };

    const handleReceiptImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
    
        setIsSubmitting(true);
        toast({ title: 'Procesando y subiendo imagen...', description: 'Optimizando y guardando el archivo del soporte.' });
        try {
            const compressedBlob = await compressImageAsBlob(file, 800, 1200);
            const storageRef = ref(storage, `petty_cash_receipts/${Date.now()}_${file.name}`);
            
            const snapshot = await uploadBytes(storageRef, compressedBlob);
            const downloadURL = await getDownloadURL(snapshot.ref);
    
            setDialogReceiptImage(downloadURL);
            toast({ title: 'Soporte listo', description: 'La imagen ha sido procesada y subida correctamente.' });
        } catch (error) {
            console.error("Error uploading receipt image:", error);
            toast({ variant: 'destructive', title: 'Error de subida', description: 'No se pudo subir la imagen del soporte.' });
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleSaveMovement = async (type: 'ingreso' | 'egreso') => {
        requestAuthorization(async () => {
            if (!dialogDate || !dialogAmount || parseFloat(dialogAmount) <= 0 || !dialogDescription) {
                toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Fecha, monto y descripción son obligatorios.' });
                return;
            }
            setIsSubmitting(true);
            try {
                 if (type === 'ingreso') {
                    const expenseRef = doc(collection(db, "expenses"));
                    const replenishmentRef = doc(collection(db, "petty_cash_replenishments"));
                    
                    const batch = writeBatch(db);
    
                    batch.set(expenseRef, {
                        description: `Reposición Caja Chica: ${dialogDescription}`,
                        amount: parseFloat(dialogAmount),
                        category: "Reposición Caja Chica",
                        date: Timestamp.fromDate(dialogDate),
                        reference: `CCH-${replenishmentRef.id}`, // Link to replenishment
                        createdAt: serverTimestamp(),
                    });
                    
                    batch.set(replenishmentRef, {
                        date: Timestamp.fromDate(dialogDate),
                        amount: parseFloat(dialogAmount),
                        description: dialogDescription,
                        expenses: [],
                        sourceExpenseId: expenseRef.id // Link to expense
                    });
    
                    await batch.commit();
                    toast({ title: 'Reposición Guardada', description: 'El nuevo fondo y el egreso correspondiente han sido registrados.' });
                } else { // Egreso
                    if (!dialogSelectedRepId) {
                         toast({ variant: 'destructive', title: 'Selección requerida', description: 'Debe seleccionar a qué fondo de reposición pertenece el gasto.' });
                         setIsSubmitting(false);
                         return;
                    }
                    const repRef = doc(db, 'petty_cash_replenishments', dialogSelectedRepId);
                    const newExpense: Omit<Expense, 'id'> & { id: string } = {
                        id: `${Date.now()}-${Math.random()}`,
                        date: Timestamp.fromDate(dialogDate),
                        description: dialogDescription,
                        amount: parseFloat(dialogAmount),
                        receiptUrl: dialogReceiptImage ?? undefined,
                    };
                    await updateDoc(repRef, { expenses: arrayUnion(newExpense) });
                    toast({ title: 'Gasto Guardado', description: 'El gasto ha sido añadido al fondo seleccionado.' });
                }
                resetDialog();
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el movimiento.' });
            } finally {
                setIsSubmitting(false);
            }
        });
    };

     const handleDeleteTransaction = async (tx: Transaction) => {
        requestAuthorization(async () => {
             try {
                if (tx.type === 'ingreso') {
                    await deleteDoc(doc(db, 'petty_cash_replenishments', tx.id));
                    toast({ title: 'Reposición Eliminada' });
                } else if (tx.type === 'egreso' && tx.parentId) {
                    const repRef = doc(db, 'petty_cash_replenishments', tx.parentId);
                    await updateDoc(repRef, { expenses: arrayRemove(tx.originalDoc) });
                    toast({ title: 'Gasto Eliminado' });
                }
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el movimiento.' });
            }
        });
    };

    const confirmDeleteReplenishment = async () => {
        if (!replenishmentToDelete) return;
        requestAuthorization(async () => {
            setIsSubmitting(true);
            try {
                const batch = writeBatch(db);

                const repRef = doc(db, 'petty_cash_replenishments', replenishmentToDelete.id);
                batch.delete(repRef);

                if (replenishmentToDelete.sourceExpenseId) {
                    const expenseRef = doc(db, 'expenses', replenishmentToDelete.sourceExpenseId);
                    batch.delete(expenseRef);
                }

                await batch.commit();
                toast({ title: 'Ciclo de Reposición Eliminado', description: 'El ciclo y sus gastos asociados han sido eliminados.' });
            } catch (error) {
                console.error("Error deleting replenishment cycle:", error);
                toast({ variant: 'destructive', title: 'Error al Eliminar', description: 'No se pudo eliminar el ciclo de reposición.' });
            } finally {
                setIsDeleteConfirmationOpen(false);
                setReplenishmentToDelete(null);
                setIsSubmitting(false);
            }
        });
    };
    
     const handleGenerateReplenishmentPdf = (rep: Replenishment) => {
        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información de la empresa.' });
            return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo.logo) {
            try { doc.addImage(companyInfo.logo, 'PNG', margin, 15, 25, 25); }
            catch(e){ console.error("Error adding logo to PDF", e); }
        }

        doc.setFontSize(10).setFont('helvetica', 'normal');
        doc.text(companyInfo.name, margin + 30, 20);
        doc.text(companyInfo.rif || '', margin + 30, 25);
        doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, 20, { align: 'right' });

        doc.setFontSize(14).setFont('helvetica', 'bold').text('Relación de Gastos de Caja Chica', pageWidth / 2, 45, { align: 'center' });
        doc.setFontSize(10).setFont('helvetica', 'normal').text(`Fondo: ${rep.description}`, margin, 60);
        doc.text(`Monto de Reposición: Bs. ${formatToTwoDecimals(rep.amount)}`, pageWidth - margin, 60, { align: 'right' });
        
        const totalExpenses = rep.expenses.reduce((sum, exp) => sum + exp.amount, 0);

        autoTable(doc, {
            startY: 70,
            head: [['Fecha', 'Descripción del Gasto', 'Monto (Bs.)']],
            body: rep.expenses.map(exp => [
                format(exp.date.toDate(), 'dd/MM/yyyy'),
                exp.description,
                formatToTwoDecimals(exp.amount)
            ]),
            foot: [['', 'Total Gastos', formatToTwoDecimals(totalExpenses)]],
            headStyles: { fillColor: [30, 80, 180] },
            footStyles: { fillColor: [30, 80, 180], textColor: 255, fontStyle: 'bold' },
            didDrawPage: (data) => {
                let str = 'Página ' + doc.internal.pages.length;
                doc.setFontSize(10);
                doc.text(str, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
            }
        });

        doc.save(`relacion_gastos_${rep.description.replace(/\s/g, '_')}.pdf`);
    };

    const handleExportLedgerPdf = () => {
        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información de la empresa.' });
            return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        const periodString = `Desde ${monthOptions.find(m => m.value === filterDateRange.fromMonth)?.label} ${filterDateRange.fromYear} hasta ${monthOptions.find(m => m.value === filterDateRange.toMonth)?.label} ${filterDateRange.toYear}`;

        if (companyInfo.logo) doc.addImage(companyInfo.logo, 'PNG', margin, 15, 25, 25);
        
        doc.setFontSize(10).setFont('helvetica', 'normal');
        doc.text(companyInfo.name, margin + 30, 20);
        doc.text(companyInfo.rif || '', margin + 30, 25);
        doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, 20, { align: 'right' });
        
        doc.setFontSize(14).setFont('helvetica', 'bold').text('Libro Contable de Caja Chica', pageWidth / 2, 45, { align: 'center' });
        doc.setFontSize(10).setFont('helvetica', 'normal').text(periodString, pageWidth / 2, 52, { align: 'center' });

        const body = filteredTransactions.map(tx => [
            format(tx.date.toDate(), 'dd/MM/yyyy'),
            tx.description,
            tx.type === 'ingreso' ? formatToTwoDecimals(tx.amount) : '',
            tx.type === 'egreso' ? formatToTwoDecimals(tx.amount) : '',
        ]);

        autoTable(doc, {
            startY: 65,
            head: [['Fecha', 'Descripción', 'Ingreso (Haber)', 'Egreso (Debe)']],
            body: body,
            foot: [
                [{ content: `Saldo Inicial: Bs. ${formatToTwoDecimals(periodTotals.saldoInicial)}`, colSpan: 2, styles: { halign: 'left', fontStyle: 'bold', fillColor: [240, 240, 240] } },
                 { content: `Bs. ${formatToTwoDecimals(periodTotals.totalIngresos)}`, styles: { halign: 'right', fontStyle: 'bold' } },
                 { content: `Bs. ${formatToTwoDecimals(periodTotals.totalEgresos)}`, styles: { halign: 'right', fontStyle: 'bold' } }],
                [{ content: `Saldo Final del Período: Bs. ${formatToTwoDecimals(periodTotals.saldoFinal)}`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [220, 220, 220] } }]
            ],
            headStyles: { fillColor: [30, 80, 180] },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'right' }
            },
        });

        doc.save(`libro_caja_chica_${filterDateRange.fromYear}_${filterDateRange.fromMonth}.pdf`);
    };

    const handleReplenish = async (rep: Replenishment) => {
        const totalExpenses = rep.expenses.reduce((sum, exp) => sum + exp.amount, 0);
        if (totalExpenses <= 0) {
            toast({ variant: 'destructive', title: 'Sin gastos', description: 'No hay gastos que reponer para este ciclo.' });
            return;
        }
    
        requestAuthorization(async () => {
            setIsSubmitting(true);
            try {
                const batch = writeBatch(db);
    
                const expenseRef = doc(collection(db, "expenses"));
                batch.set(expenseRef, {
                    description: `Reposición de Caja Chica por gastos del ciclo: "${rep.description}"`,
                    amount: totalExpenses,
                    category: "Reposición Caja Chica",
                    date: Timestamp.now(),
                    reference: `CCH-REP-${rep.id.slice(0, 5)}`,
                    createdAt: serverTimestamp(),
                });
    
                const newRepRef = doc(collection(db, "petty_cash_replenishments"));
                batch.set(newRepRef, {
                    date: Timestamp.now(),
                    amount: totalExpenses,
                    description: `Reposición de gastos del ${format(new Date(), 'dd/MM/yyyy')}`,
                    expenses: [],
                });
    
                await batch.commit();
                
                toast({ title: 'Reposición Registrada', description: `Se ha creado un egreso de Bs. ${formatToTwoDecimals(totalExpenses)} y se ha repuesto el fondo de caja chica.`, className: "bg-green-100 border-green-400" });
    
            } catch (error) {
                console.error("Error replenishing petty cash:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la reposición.' });
            } finally {
                setIsSubmitting(false);
            }
        });
    };
    
    return (
        <div className="space-y-8">
             <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Libro de Caja Chica</h1>
                    <p className="text-muted-foreground">Registre y consulte todos los movimientos de la caja chica.</p>
                </div>
                <Button onClick={() => setIsDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Registrar Movimiento
                </Button>
            </div>
            
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Wallet /> Balance General de Caja Chica</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-green-100/50 rounded-lg">
                        <p className="text-sm text-green-800 font-semibold">Total Ingresos (Haber)</p>
                        <p className="text-2xl font-bold text-green-600">Bs. {formatToTwoDecimals(totals.totalIngresos)}</p>
                    </div>
                     <div className="p-4 bg-red-100/50 rounded-lg">
                        <p className="text-sm text-red-800 font-semibold">Total Egresos (Debe)</p>
                        <p className="text-2xl font-bold text-red-600">Bs. {formatToTwoDecimals(totals.totalEgresos)}</p>
                    </div>
                     <div className="p-4 bg-blue-100/50 rounded-lg">
                        <p className="text-sm text-blue-800 font-semibold">Saldo Actual</p>
                        <p className="text-2xl font-bold text-blue-600">Bs. {formatToTwoDecimals(totals.saldo)}</p>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="ledger">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="ledger">Libro Contable</TabsTrigger>
                    <TabsTrigger value="replenishments">Reposiciones y Gastos</TabsTrigger>
                </TabsList>
                <TabsContent value="ledger">
                    <Card>
                        <CardHeader>
                             <div className="flex justify-between items-center">
                                <CardTitle>Historial de Movimientos</CardTitle>
                                <Button onClick={handleExportLedgerPdf} variant="outline">
                                    <FileText className="mr-2 h-4 w-4" /> Exportar PDF
                                </Button>
                            </div>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                                 <div className="space-y-1"><Label className="text-xs">Desde Mes</Label><Select value={filterDateRange.fromMonth} onValueChange={(v) => setFilterDateRange(p => ({...p, fromMonth: v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{monthOptions.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
                                 <div className="space-y-1"><Label className="text-xs">Desde Año</Label><Select value={filterDateRange.fromYear} onValueChange={(v) => setFilterDateRange(p => ({...p, fromYear: v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{yearOptions.map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
                                 <div className="space-y-1"><Label className="text-xs">Hasta Mes</Label><Select value={filterDateRange.toMonth} onValueChange={(v) => setFilterDateRange(p => ({...p, toMonth: v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{monthOptions.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
                                 <div className="space-y-1"><Label className="text-xs">Hasta Año</Label><Select value={filterDateRange.toYear} onValueChange={(v) => setFilterDateRange(p => ({...p, toYear: v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{yearOptions.map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
                             </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Descripción / Concepto</TableHead><TableHead className="text-right">Ingreso (Haber)</TableHead><TableHead className="text-right">Egreso (Debe)</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    <TableRow className="bg-muted/30 font-semibold"><TableCell colSpan={2}>Saldo Inicial del Período</TableCell><TableCell colSpan={3} className="text-right">Bs. {formatToTwoDecimals(periodTotals.saldoInicial)}</TableCell></TableRow>
                                    {loading ? <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow> :
                                    filteredTransactions.map(tx => (
                                        <TableRow key={tx.id}>
                                            <TableCell>{format(tx.date.toDate(), 'dd/MM/yyyy', { locale: es })}</TableCell>
                                            <TableCell>{tx.description}</TableCell>
                                            <TableCell className="text-right text-green-600 font-medium">{tx.type === 'ingreso' ? `Bs. ${formatToTwoDecimals(tx.amount)}` : ''}</TableCell>
                                            <TableCell className="text-right text-red-600 font-medium">{tx.type === 'egreso' ? `Bs. ${formatToTwoDecimals(tx.amount)}` : ''}</TableCell>
                                            <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => handleDeleteTransaction(tx)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow className="font-bold bg-muted/50"><TableCell colSpan={2} className="text-right">Totales del Período</TableCell><TableCell className="text-right text-green-600">Bs. {formatToTwoDecimals(periodTotals.totalIngresos)}</TableCell><TableCell className="text-right text-red-600">Bs. {formatToTwoDecimals(periodTotals.totalEgresos)}</TableCell><TableCell></TableCell></TableRow>
                                    <TableRow className="font-bold text-lg"><TableCell colSpan={3} className="text-right">Saldo Final</TableCell><TableCell className="text-right text-blue-600" colSpan={2}>Bs. {formatToTwoDecimals(periodTotals.saldoFinal)}</TableCell></TableRow>
                                </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="replenishments">
                    <div className="space-y-4">
                        {replenishmentsWithRunningBalance.map((rep) => (
                            <Card key={rep.id}>
                                <Collapsible>
                                    <CollapsibleTrigger className="w-full p-4 hover:bg-muted/50 rounded-t-lg">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h3 className="font-semibold text-left">{rep.description}</h3>
                                                <p className="text-sm text-muted-foreground text-left">{format(rep.date.toDate(), 'dd MMMM, yyyy', {locale: es})}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-lg">Bs. {formatToTwoDecimals(rep.amount)}</p>
                                                <p className="text-xs text-muted-foreground">Monto Repuesto</p>
                                            </div>
                                        </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <CardContent>
                                            <Table>
                                                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Gasto</TableHead><TableHead>Soporte</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                                                <TableBody>
                                                    {rep.expenses.map((exp: Expense) => (
                                                        <TableRow key={exp.id}>
                                                            <TableCell>{format(exp.date.toDate(), 'dd/MM/yy')}</TableCell>
                                                            <TableCell>{exp.description}</TableCell>
                                                            <TableCell><Button variant="outline" size="sm" onClick={() => setReceiptToView(exp.receiptUrl || null)} disabled={!exp.receiptUrl}><Paperclip className="mr-2 h-4 w-4"/> Ver</Button></TableCell>
                                                            <TableCell className="text-right">Bs. {formatToTwoDecimals(exp.amount)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                            <div className="mt-4 p-4 border-t space-y-2">
                                                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Saldo Anterior</span><span>Bs. {formatToTwoDecimals(rep.previousBalance)}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-muted-foreground">(+) Reposición de este ciclo</span><span className="text-green-600 font-medium">Bs. {formatToTwoDecimals(rep.amount)}</span></div>
                                                <Separator />
                                                <div className="flex justify-between font-medium"><span className="text-muted-foreground">Subtotal Disponible</span><span>Bs. {formatToTwoDecimals(rep.previousBalance + rep.amount)}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-muted-foreground">(-) Gastos de este ciclo</span><span className="text-red-600 font-medium">Bs. {formatToTwoDecimals(rep.totalRepExpenses)}</span></div>
                                                <Separator />
                                                <div className="flex justify-between font-bold text-lg"><span className="text-primary">Saldo Final de este Ciclo</span><span className="text-primary">Bs. {formatToTwoDecimals(rep.currentCycleEndBalance)}</span></div>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                            <div className="flex gap-2">
                                                <Button variant="secondary" onClick={() => handleGenerateReplenishmentPdf(rep)}><Download className="mr-2 h-4 w-4"/> Generar Relación de Gastos</Button>
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => {
                                                        setReplenishmentToDelete(rep);
                                                        setIsDeleteConfirmationOpen(true);
                                                    }}
                                                    disabled={isSubmitting}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4"/> Eliminar Ciclo
                                                </Button>
                                            </div>
                                            <Button
                                                onClick={() => handleReplenish(rep)}
                                                disabled={rep.totalRepExpenses <= 0 || isSubmitting}
                                                title={rep.totalRepExpenses <= 0 ? "No hay gastos que reponer" : "Reponer el monto total gastado"}
                                            >
                                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                                                Reponer Caja Chica (Bs. {formatToTwoDecimals(rep.totalRepExpenses)})
                                            </Button>
                                        </CardFooter>
                                    </CollapsibleContent>
                                </Collapsible>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            <Dialog open={isDialogOpen} onOpenChange={resetDialog}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Registrar Nuevo Movimiento</DialogTitle></DialogHeader>
                    <Tabs defaultValue="ingreso" className="w-full">
                        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="ingreso"><TrendingUp className="mr-2 h-4 w-4 text-green-500"/> Ingreso</TabsTrigger><TabsTrigger value="egreso"><TrendingDown className="mr-2 h-4 w-4 text-red-500"/> Egreso</TabsTrigger></TabsList>
                        <TabsContent value="ingreso" className="pt-4 space-y-4">
                            <DialogDescription>Registre una nueva reposición de fondos para la caja chica.</DialogDescription>
                            <div className="space-y-2"><Label htmlFor="repDate">Fecha de Reposición</Label><Popover><PopoverTrigger asChild><Button id="repDate" variant={"outline"} className={cn("w-full justify-start", !dialogDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dialogDate ? format(dialogDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dialogDate} onSelect={setDialogDate} initialFocus locale={es} /></PopoverContent></Popover></div>
                            <div className="space-y-2"><Label htmlFor="repAmount">Monto (Bs.)</Label><Input id="repAmount" type="number" value={dialogAmount} onChange={(e) => setDialogAmount(e.target.value)} placeholder="0.00" /></div>
                            <div className="space-y-2"><Label htmlFor="repDescription">Descripción</Label><Input id="repDescription" value={dialogDescription} onChange={(e) => setDialogDescription(e.target.value)} placeholder="Ej: Reposición Q1 2024" /></div>
                            <DialogFooter><Button variant="outline" onClick={resetDialog}>Cancelar</Button><Button onClick={() => handleSaveMovement('ingreso')} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Ingreso</Button></DialogFooter>
                        </TabsContent>
                        <TabsContent value="egreso" className="pt-4 space-y-4">
                             <DialogDescription>Registre un nuevo gasto realizado con fondos de la caja chica.</DialogDescription>
                             <div className="space-y-2"><Label htmlFor="expDate">Fecha del Gasto</Label><Popover><PopoverTrigger asChild><Button id="expDate" variant={"outline"} className={cn("w-full justify-start", !dialogDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dialogDate ? format(dialogDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dialogDate} onSelect={setDialogDate} initialFocus locale={es} /></PopoverContent></Popover></div>
                             <div className="space-y-2"><Label htmlFor="expRepId">Fondo de Reposición</Label><Select onValueChange={setDialogSelectedRepId} value={dialogSelectedRepId}><SelectTrigger><SelectValue placeholder="Seleccione el fondo..." /></SelectTrigger><SelectContent>{replenishments.map(rep => (<SelectItem key={rep.id} value={rep.id}>{rep.description} ({format(rep.date.toDate(), "dd/MM/yy")})</SelectItem>))}</SelectContent></Select></div>
                             <div className="space-y-2"><Label htmlFor="expDescription">Concepto del Gasto</Label><Input id="expDescription" value={dialogDescription} onChange={(e) => setDialogDescription(e.target.value)} placeholder="Ej: Compra de bombillos" /></div>
                             <div className="space-y-2"><Label htmlFor="expAmount">Monto (Bs.)</Label><Input id="expAmount" type="number" value={dialogAmount} onChange={(e) => setDialogAmount(e.target.value)} placeholder="0.00" /></div>
                             <div className="space-y-2"><Label htmlFor="receiptUpload">Soporte del Gasto (Opcional)</Label><Input id="receiptUpload" type="file" accept="image/png, image/jpeg" onChange={handleReceiptImageUpload} disabled={isSubmitting}/></div>
                             {dialogReceiptImage && <img src={dialogReceiptImage} alt="Vista previa del soporte" className="w-24 h-24 object-contain border rounded-md"/>}
                            <DialogFooter><Button variant="outline" onClick={resetDialog}>Cancelar</Button><Button onClick={() => handleSaveMovement('egreso')} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Gasto</Button></DialogFooter>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>
            <Dialog open={!!receiptToView} onOpenChange={() => setReceiptToView(null)}>
                <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Soporte de Gasto</DialogTitle></DialogHeader><div className="p-4 flex justify-center"><img src={receiptToView || ''} alt="Soporte de gasto" className="max-w-full max-h-[80vh] object-contain"/></div></DialogContent>
            </Dialog>
             <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Eliminación</DialogTitle>
                        <DialogDescription>
                            ¿Está seguro de que desea eliminar este ciclo de reposición? Se borrará el ingreso y todos los gastos asociados, incluyendo el egreso principal en la contabilidad. Esta acción no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={confirmDeleteReplenishment} disabled={isSubmitting}>
                             {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Sí, eliminar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

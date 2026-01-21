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
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, Timestamp, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, CalendarIcon, Wallet, TrendingDown, TrendingUp, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuthorization } from '@/hooks/use-authorization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Expense = {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    receiptUrl?: string; // Keep for potential future use, but hide UI for now
};

type Replenishment = {
    id: string;
    date: Timestamp;
    amount: number;
    description: string;
    expenses: Expense[];
};

type Transaction = {
    type: 'ingreso' | 'egreso';
    date: Timestamp;
    description: string;
    amount: number;
    id: string; // ID of the replenishment or the expense
    parentId?: string; // ID of the parent replenishment for an expense
    originalDoc: Replenishment | Expense;
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PettyCashPage() {
    const [replenishments, setReplenishments] = useState<Replenishment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    // New Dialog State
    const [dialogDate, setDialogDate] = useState<Date | undefined>(new Date());
    const [dialogAmount, setDialogAmount] = useState('');
    const [dialogDescription, setDialogDescription] = useState('');
    const [dialogSelectedRepId, setDialogSelectedRepId] = useState<string>('');


    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();

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
        return transactions.sort((a, b) => b.date.toMillis() - a.date.toMillis());
    }, [replenishments]);

    const totals = useMemo(() => {
        const totalIngresos = allTransactions.filter(t => t.type === 'ingreso').reduce((sum, t) => sum + t.amount, 0);
        const totalEgresos = allTransactions.filter(t => t.type === 'egreso').reduce((sum, t) => sum + t.amount, 0);
        const saldo = totalIngresos - totalEgresos;
        return { totalIngresos, totalEgresos, saldo };
    }, [allTransactions]);
    
    const resetDialog = () => {
        setIsDialogOpen(false);
        setDialogDate(new Date());
        setDialogAmount('');
        setDialogDescription('');
        setDialogSelectedRepId('');
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
                     await addDoc(collection(db, "petty_cash_replenishments"), {
                        date: Timestamp.fromDate(dialogDate),
                        amount: parseFloat(dialogAmount),
                        description: dialogDescription,
                        expenses: [],
                    });
                     // We also register this as a main expense for accounting consistency
                    await addDoc(collection(db, "expenses"), {
                        description: `Reposición Caja Chica: ${dialogDescription}`,
                        amount: parseFloat(dialogAmount),
                        category: "Reposición Caja Chica",
                        date: Timestamp.fromDate(dialogDate),
                        reference: `CCH-${Date.now()}`,
                        createdAt: serverTimestamp(),
                    });

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
                    // Also find and delete the corresponding main expense if possible
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

            <Card>
                <CardHeader>
                    <CardTitle>Historial de Movimientos</CardTitle>
                </CardHeader>
                <CardContent>
                     {loading ? (
                        <div className="flex justify-center items-center h-24"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Descripción / Concepto</TableHead>
                                    <TableHead className="text-right">Ingreso (Haber)</TableHead>
                                    <TableHead className="text-right">Egreso (Debe)</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allTransactions.map(tx => (
                                    <TableRow key={tx.id}>
                                        <TableCell>{format(tx.date.toDate(), 'dd/MM/yyyy', { locale: es })}</TableCell>
                                        <TableCell>{tx.description}</TableCell>
                                        <TableCell className="text-right text-green-600 font-medium">
                                            {tx.type === 'ingreso' ? `Bs. ${formatToTwoDecimals(tx.amount)}` : ''}
                                        </TableCell>
                                         <TableCell className="text-right text-red-600 font-medium">
                                            {tx.type === 'egreso' ? `Bs. ${formatToTwoDecimals(tx.amount)}` : ''}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteTransaction(tx)}>
                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                             <TableFooter>
                                <TableRow className="font-bold bg-muted/50">
                                    <TableCell colSpan={2} className="text-right">Totales</TableCell>
                                    <TableCell className="text-right text-green-600">Bs. {formatToTwoDecimals(totals.totalIngresos)}</TableCell>
                                    <TableCell className="text-right text-red-600">Bs. {formatToTwoDecimals(totals.totalEgresos)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                 <TableRow className="font-bold text-lg">
                                    <TableCell colSpan={3} className="text-right">Saldo Final</TableCell>
                                    <TableCell className="text-right text-blue-600" colSpan={2}>Bs. {formatToTwoDecimals(totals.saldo)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Dialog for New Movement */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Registrar Nuevo Movimiento</DialogTitle></DialogHeader>
                    <Tabs defaultValue="ingreso" className="w-full">
                         <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="ingreso"><TrendingUp className="mr-2 h-4 w-4 text-green-500"/> Ingreso</TabsTrigger>
                            <TabsTrigger value="egreso"><TrendingDown className="mr-2 h-4 w-4 text-red-500"/> Egreso</TabsTrigger>
                        </TabsList>
                        <TabsContent value="ingreso">
                            <div className="grid gap-4 py-4">
                                <DialogDescription>Registre una nueva reposición de fondos para la caja chica.</DialogDescription>
                                <div className="space-y-2">
                                    <Label htmlFor="repDate">Fecha de Reposición</Label>
                                    <Popover><PopoverTrigger asChild><Button id="repDate" variant={"outline"} className={cn("w-full justify-start", !dialogDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dialogDate ? format(dialogDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dialogDate} onSelect={setDialogDate} initialFocus locale={es} /></PopoverContent></Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="repAmount">Monto (Bs.)</Label>
                                    <Input id="repAmount" type="number" value={dialogAmount} onChange={(e) => setDialogAmount(e.target.value)} placeholder="0.00" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="repDescription">Descripción</Label>
                                    <Input id="repDescription" value={dialogDescription} onChange={(e) => setDialogDescription(e.target.value)} placeholder="Ej: Reposición Q1 2024" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
                                <Button onClick={() => handleSaveMovement('ingreso')} disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Ingreso
                                </Button>
                            </DialogFooter>
                        </TabsContent>
                        <TabsContent value="egreso">
                             <div className="grid gap-4 py-4">
                                 <DialogDescription>Registre un nuevo gasto realizado con fondos de la caja chica.</DialogDescription>
                                 <div className="space-y-2">
                                    <Label htmlFor="expDate">Fecha del Gasto</Label>
                                    <Popover><PopoverTrigger asChild><Button id="expDate" variant={"outline"} className={cn("w-full justify-start", !dialogDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dialogDate ? format(dialogDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dialogDate} onSelect={setDialogDate} initialFocus locale={es} /></PopoverContent></Popover>
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="expRepId">Fondo de Reposición</Label>
                                    <Select onValueChange={setDialogSelectedRepId} value={dialogSelectedRepId}>
                                        <SelectTrigger><SelectValue placeholder="Seleccione el fondo..." /></SelectTrigger>
                                        <SelectContent>
                                            {replenishments.map(rep => (
                                                <SelectItem key={rep.id} value={rep.id}>
                                                    {rep.description} ({format(rep.date.toDate(), "dd/MM/yy")})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="expDescription">Concepto del Gasto</Label>
                                    <Input id="expDescription" value={dialogDescription} onChange={(e) => setDialogDescription(e.target.value)} placeholder="Ej: Compra de bombillos" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="expAmount">Monto (Bs.)</Label>
                                    <Input id="expAmount" type="number" value={dialogAmount} onChange={(e) => setDialogAmount(e.target.value)} placeholder="0.00" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
                                <Button onClick={() => handleSaveMovement('egreso')} disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Gasto
                                </Button>
                            </DialogFooter>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>
        </div>
    );
}

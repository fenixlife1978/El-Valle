
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
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PlusCircle, Trash2, Loader2, CalendarIcon, Wallet, TrendingDown, TrendingUp, DollarSign, Download, Paperclip, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImageAsBlob } from '@/lib/utils';
import { useAuthorization } from '@/hooks/use-authorization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/use-auth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


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
                        receiptUrl: dialogReceiptImage,
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
        doc.text(companyInfo.rif, margin + 30, 25);
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
                            <CardTitle>Historial de Movimientos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Descripción / Concepto</TableHead><TableHead className="text-right">Ingreso (Haber)</TableHead><TableHead className="text-right">Egreso (Debe)</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {loading ? <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow> :
                                    allTransactions.map(tx => (
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
                                    <TableRow className="font-bold bg-muted/50"><TableCell colSpan={2} className="text-right">Totales</TableCell><TableCell className="text-right text-green-600">Bs. {formatToTwoDecimals(totals.totalIngresos)}</TableCell><TableCell className="text-right text-red-600">Bs. {formatToTwoDecimals(totals.totalEgresos)}</TableCell><TableCell></TableCell></TableRow>
                                    <TableRow className="font-bold text-lg"><TableCell colSpan={3} className="text-right">Saldo Final</TableCell><TableCell className="text-right text-blue-600" colSpan={2}>Bs. {formatToTwoDecimals(totals.saldo)}</TableCell></TableRow>
                                </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="replenishments">
                    <div className="space-y-4">
                        {replenishments.map(rep => {
                            const totalRepExpenses = rep.expenses.reduce((sum, exp) => sum + exp.amount, 0);
                            const repBalance = rep.amount - totalRepExpenses;
                            return (
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
                                                    {rep.expenses.map(exp => (
                                                        <TableRow key={exp.id}>
                                                            <TableCell>{format(exp.date.toDate(), 'dd/MM/yy')}</TableCell>
                                                            <TableCell>{exp.description}</TableCell>
                                                            <TableCell><Button variant="outline" size="sm" onClick={() => setReceiptToView(exp.receiptUrl || null)} disabled={!exp.receiptUrl}><Paperclip className="mr-2 h-4 w-4"/> Ver</Button></TableCell>
                                                            <TableCell className="text-right">Bs. {formatToTwoDecimals(exp.amount)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                                <TableFooter>
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="text-right font-bold">Total Gastado</TableCell>
                                                        <TableCell className="text-right font-bold">Bs. {formatToTwoDecimals(totalRepExpenses)}</TableCell>
                                                    </TableRow>
                                                     <TableRow>
                                                        <TableCell colSpan={3} className="text-right font-bold">Saldo Restante</TableCell>
                                                        <TableCell className="text-right font-bold text-primary">Bs. {formatToTwoDecimals(repBalance)}</TableCell>
                                                    </TableRow>
                                                </TableFooter>
                                            </Table>
                                        </CardContent>
                                        <CardFooter>
                                            <Button variant="secondary" onClick={() => handleGenerateReplenishmentPdf(rep)}><Download className="mr-2 h-4 w-4"/> Generar Relación de Gastos</Button>
                                        </CardFooter>
                                    </CollapsibleContent>
                                </Collapsible>
                            </Card>
                        )})}
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
        </div>
    );
}

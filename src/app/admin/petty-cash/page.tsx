
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, Timestamp, orderBy, query, getDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PlusCircle, Trash2, Loader2, CalendarIcon, ChevronDown, ChevronRight, Wallet, TrendingDown, TrendingUp, BadgeEuro, FileText, Paperclip, Eye, Upload, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';


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

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};


const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PettyCashPage() {
    const [replenishments, setReplenishments] = useState<Replenishment[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Replenishment Dialog
    const [isRepDialogOpen, setIsRepDialogOpen] = useState(false);
    const [repDate, setRepDate] = useState<Date | undefined>(new Date());
    const [repAmount, setRepAmount] = useState('');
    const [repDescription, setRepDescription] = useState('');
    
    // Expense Dialog
    const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
    const [expenseDate, setExpenseDate] = useState<Date | undefined>(new Date());
    const [expenseDescription, setExpenseDescription] = useState('');
    const [expenseAmount, setExpenseAmount] = useState('');
    const [currentRepId, setCurrentRepId] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingExpense, setUploadingExpense] = useState<{repId: string, expenseId: string} | null>(null);

    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const firestore = db();
        const storageInstance = storage();
        const fetchSettings = async () => {
             const settingsRef = doc(firestore, 'config', 'mainSettings');
             const docSnap = await getDoc(settingsRef);
             if (docSnap.exists()) {
                 setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
             }
        };
        fetchSettings();

        const q = query(collection(firestore, "petty_cash_replenishments"), orderBy("date", "desc"));
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

    const resetRepDialog = () => {
        setIsRepDialogOpen(false);
        setRepDate(new Date());
        setRepAmount('');
        setRepDescription('');
    };
    
    const resetExpenseDialog = () => {
        setIsExpenseDialogOpen(false);
        setCurrentRepId(null);
        setExpenseDate(new Date());
        setExpenseDescription('');
        setExpenseAmount('');
    };

    const handleSaveReplenishment = async () => {
        if (!repDate || !repAmount || parseFloat(repAmount) <= 0 || !repDescription) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Fecha, monto y descripción son obligatorios.' });
            return;
        }
        setIsSubmitting(true);
        try {
            await addDoc(collection(db(), "petty_cash_replenishments"), {
                date: Timestamp.fromDate(repDate),
                amount: parseFloat(repAmount),
                description: repDescription,
                expenses: [],
            });
            toast({ title: 'Reposición Guardada', description: 'El nuevo fondo de caja chica ha sido registrado.' });
            resetRepDialog();
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la reposición.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSaveExpense = async () => {
        if (!currentRepId || !expenseDate || !expenseAmount || parseFloat(expenseAmount) <= 0 || !expenseDescription) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Fecha, concepto y monto son obligatorios.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const repRef = doc(db(), 'petty_cash_replenishments', currentRepId);
            const newExpense: Omit<Expense, 'id'> & { id: string } = {
                id: `${Date.now()}-${Math.random()}`, // Unique ID for array element
                date: Timestamp.fromDate(expenseDate),
                description: expenseDescription,
                amount: parseFloat(expenseAmount),
            };
            await updateDoc(repRef, { expenses: arrayUnion(newExpense) });
            toast({ title: 'Gasto Guardado', description: 'El gasto ha sido añadido a la reposición.' });
            resetExpenseDialog();
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el gasto.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteExpense = async (repId: string, expense: Expense) => {
        if (!window.confirm('¿Está seguro de que desea eliminar este gasto?')) return;
        try {
            const repRef = doc(db(), 'petty_cash_replenishments', repId);
            await updateDoc(repRef, { expenses: arrayRemove(expense) });
            toast({ title: 'Gasto Eliminado' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el gasto.' });
        }
    };

    const handleDeleteReplenishment = async (repId: string) => {
        if (!window.confirm('¿Está seguro de que desea eliminar esta reposición y todos sus gastos asociados? Esta acción no se puede deshacer.')) return;
        try {
            await deleteDoc(doc(db(), 'petty_cash_replenishments', repId));
            toast({ title: 'Reposición Eliminada' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la reposición.' });
        }
    };

    const handleUploadClick = (repId: string, expenseId: string) => {
        setUploadingExpense({ repId, expenseId });
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !uploadingExpense) return;
        
        const file = e.target.files[0];
        const { repId, expenseId } = uploadingExpense;
        toast({ title: 'Subiendo soporte...', description: 'Por favor espere.' });

        try {
            const storageInstance = storage();
            const storageRef = ref(storageInstance, `petty_cash_receipts/${repId}/${expenseId}-${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            const repDocRef = doc(db(), 'petty_cash_replenishments', repId);
            const repDoc = await getDoc(repDocRef);

            if (repDoc.exists()) {
                const replenishment = repDoc.data() as Replenishment;
                const updatedExpenses = replenishment.expenses.map(exp => 
                    exp.id === expenseId ? { ...exp, receiptUrl: downloadURL } : exp
                );
                await updateDoc(repDocRef, { expenses: updatedExpenses });
                toast({ title: 'Soporte Subido', description: 'La imagen del recibo se ha guardado exitosamente.' });
            }

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error de subida', description: 'No se pudo subir la imagen.' });
        } finally {
            setUploadingExpense(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleGeneratePdf = async (rep: Replenishment) => {
        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Falta información', description: 'No se pudo cargar la información de la empresa.' });
            return;
        }
    
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 14;
    
        // --- Header ---
        if (companyInfo.logo) {
            try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
            catch (e) { console.error("Error adding logo:", e); }
        }
        
        const infoX = margin + 30;
        doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, infoX, margin + 8);
        doc.setFontSize(9).setFont('helvetica', 'normal');
        doc.text(companyInfo.rif, infoX, margin + 14);
        doc.text(companyInfo.address, infoX, margin + 19);
        
        const qrContent = JSON.stringify({ repId: rep.id, date: format(new Date(), 'yyyy-MM-dd') });
        const qrCodeUrl = await QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'M' });
        doc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - 30, margin, 30, 30);
    
        let startY = margin + 40;
        doc.setFontSize(16).setFont('helvetica', 'bold').text('Reporte de Gastos de Caja Chica', pageWidth / 2, startY, { align: 'center'});
        
        startY += 15;
        doc.setFontSize(10);
        doc.text(`Fecha de Emisión: ${format(new Date(), "dd/MM/yyyy")}`, margin, startY);
        doc.text(`Reposición: ${rep.description}`, pageWidth - margin, startY, { align: 'right' });
        startY += 8;
        
        doc.text(`Fecha de Reposición: ${format(rep.date.toDate(), 'dd/MM/yyyy', { locale: es })}`, margin, startY);
        startY += 8;
    
        const totalExpenses = rep.expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const balance = rep.amount - totalExpenses;
        
        (doc as any).autoTable({
            startY: startY,
            head: [['Concepto', 'Fecha', 'Monto (Bs.)']],
            body: rep.expenses.map(exp => [exp.description, format(exp.date.toDate(), 'dd/MM/yyyy'), formatToTwoDecimals(exp.amount)]),
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80] },
            columnStyles: { 2: { halign: 'right' } }
        });
    
        startY = (doc as any).lastAutoTable.finalY + 10;
        
        const summary = [
            ['Monto Total Repuesto:', `Bs. ${formatToTwoDecimals(rep.amount)}`],
            ['Total Gastado:', `Bs. ${formatToTwoDecimals(totalExpenses)}`],
            ['Saldo Restante:', `Bs. ${formatToTwoDecimals(balance)}`]
        ];
        
        (doc as any).autoTable({
            startY: startY,
            body: summary,
            theme: 'plain',
            styles: { fontSize: 11, fontStyle: 'bold' },
            columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right'} }
        });

        startY = (doc as any).lastAutoTable.finalY + 20;

        // --- Signature ---
        const signatureY = startY > pageHeight - 50 ? pageHeight - 50 : startY;
        const signatureWidth = 80;
        const signatureX = (pageWidth - signatureWidth) / 2;
        doc.setLineWidth(0.5);
        doc.line(signatureX, signatureY, signatureX + signatureWidth, signatureY);

        doc.setFontSize(8);
        doc.text("Juan A. García", pageWidth / 2, signatureY + 5, { align: 'center' });
        doc.text("Presidente de Condominio", pageWidth / 2, signatureY + 9, { align: 'center' });
        
        doc.save(`Reporte_CajaChica_${rep.id.substring(0, 5)}.pdf`);
    };

    return (
        <div className="space-y-8">
             <Button variant="outline" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Atrás
            </Button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*" />
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Caja Chica</h1>
                    <p className="text-muted-foreground">Registre reposiciones y gastos para mantener un control detallado.</p>
                </div>
                <Button onClick={() => setIsRepDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nueva Reposición
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            ) : replenishments.length === 0 ? (
                <Card>
                    <CardContent className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Wallet className="h-8 w-8"/>
                        <span>No hay reposiciones de caja chica registradas.</span>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {replenishments.map(rep => {
                        const totalExpenses = rep.expenses.reduce((sum, exp) => sum + exp.amount, 0);
                        const remainingAmount = rep.amount - totalExpenses;
                        return (
                            <Collapsible key={rep.id} className="border rounded-lg">
                                <Card>
                                     <div className="flex items-center p-4 hover:bg-muted/50 rounded-t-lg group">
                                         <CollapsibleTrigger asChild>
                                            <div className="flex items-center gap-4 text-left flex-grow cursor-pointer">
                                                <ChevronRight className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                                <div>
                                                    <p className="font-semibold text-primary">{rep.description}</p>
                                                    <p className="text-sm text-muted-foreground">{format(rep.date.toDate(), 'dd MMMM, yyyy', { locale: es })}</p>
                                                </div>
                                            </div>
                                        </CollapsibleTrigger>
                                        <div className="hidden md:flex gap-6 text-right">
                                            <div><p className="text-xs text-muted-foreground">Monto Repuesto</p><p className="font-bold text-success">Bs. {formatToTwoDecimals(rep.amount)}</p></div>
                                            <div><p className="text-xs text-muted-foreground">Gastado</p><p className="font-bold text-destructive">Bs. {formatToTwoDecimals(totalExpenses)}</p></div>
                                            <div><p className="text-xs text-muted-foreground">Saldo</p><p className="font-bold">Bs. {formatToTwoDecimals(remainingAmount)}</p></div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                             <Button size="sm" variant="outline" onClick={() => handleGeneratePdf(rep)}>
                                                <FileText className="mr-2 h-4 w-4"/>Reporte
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setCurrentRepId(rep.id); setIsExpenseDialogOpen(true); }}>
                                                <PlusCircle className="mr-2 h-4 w-4"/>Gasto
                                            </Button>
                                            <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteReplenishment(rep.id); }}>
                                                <Trash2 className="h-4 w-4"/>
                                            </Button>
                                        </div>
                                    </div>
                                    <CollapsibleContent>
                                        <div className="border-t p-4">
                                            {rep.expenses.length > 0 ? (
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Fecha del Gasto</TableHead>
                                                            <TableHead>Concepto</TableHead>
                                                            <TableHead className="text-right">Monto (Bs.)</TableHead>
                                                            <TableHead className="text-center w-[150px]">Acciones</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {rep.expenses.sort((a,b) => b.date.toMillis() - a.date.toMillis()).map(exp => (
                                                            <TableRow key={exp.id}>
                                                                <TableCell>{format(exp.date.toDate(), 'dd/MM/yyyy')}</TableCell>
                                                                <TableCell>{exp.description}</TableCell>
                                                                <TableCell className="text-right">{formatToTwoDecimals(exp.amount)}</TableCell>
                                                                <TableCell className="text-center">
                                                                     <div className="flex justify-center gap-2">
                                                                        {exp.receiptUrl ? (
                                                                            <Button size="icon" variant="outline" asChild>
                                                                                <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer">
                                                                                    <Eye className="h-4 w-4"/>
                                                                                </a>
                                                                            </Button>
                                                                        ) : (
                                                                            <Button size="icon" variant="outline" onClick={() => handleUploadClick(rep.id, exp.id)} disabled={!!uploadingExpense}>
                                                                                {uploadingExpense?.expenseId === exp.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Paperclip className="h-4 w-4"/>}
                                                                            </Button>
                                                                        )}
                                                                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDeleteExpense(rep.id, exp)}>
                                                                            <Trash2 className="h-4 w-4"/>
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <p className="text-sm text-center text-muted-foreground py-4">No hay gastos registrados para esta reposición.</p>
                                            )}
                                        </div>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                        );
                    })}
                </div>
            )}
            
            {/* New Replenishment Dialog */}
            <Dialog open={isRepDialogOpen} onOpenChange={setIsRepDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Nueva Reposición de Caja Chica</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="repDate">Fecha de Reposición</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button id="repDate" variant={"outline"} className={cn("w-full justify-start", !repDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{repDate ? format(repDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={repDate} onSelect={setRepDate} initialFocus locale={es} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="repAmount">Monto (Bs.)</Label>
                            <Input id="repAmount" type="number" value={repAmount} onChange={(e) => setRepAmount(e.target.value)} placeholder="0.00" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="repDescription">Descripción</Label>
                            <Input id="repDescription" value={repDescription} onChange={(e) => setRepDescription(e.target.value)} placeholder="Ej: Reposición Q1 2024" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={resetRepDialog}>Cancelar</Button>
                        <Button onClick={handleSaveReplenishment} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Reposición
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
             {/* New Expense Dialog */}
             <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Agregar Gasto de Caja Chica</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="expenseDate">Fecha del Gasto</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button id="expenseDate" variant={"outline"} className={cn("w-full justify-start", !expenseDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{expenseDate ? format(expenseDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={expenseDate} onSelect={setExpenseDate} initialFocus locale={es} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="expenseDescription">Concepto del Gasto</Label>
                            <Input id="expenseDescription" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} placeholder="Ej: Compra de bombillos" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="expenseAmount">Monto (Bs.)</Label>
                            <Input id="expenseAmount" type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0.00" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={resetExpenseDialog}>Cancelar</Button>
                        <Button onClick={handleSaveExpense} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Gasto
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

    
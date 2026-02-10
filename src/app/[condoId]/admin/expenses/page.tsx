
'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, addDoc, onSnapshot, deleteDoc, doc, 
    serverTimestamp, query, orderBy, Timestamp, writeBatch
} from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, Trash2, Building2, CreditCard, Save, FileDown, Banknote, Landmark, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


type Expense = {
    id: string;
    description: string;
    amount: number;
    category: string;
    date: Timestamp;
    reference: string;
    createdAt: Timestamp;
    paymentSource?: 'banco' | 'efectivo_bs' | 'efectivo_usd';
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const yearOptions = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));


function RegisterExpenseForm({ workingCondoId, onSave }: { workingCondoId: string | null, onSave: () => void }) {
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('');
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workingCondoId) {
        toast({ variant: "destructive", title: "Error", description: "No hay un condominio seleccionado." });
        return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const dateValue = formData.get("date") as string;
    const currentCategory = formData.get("category") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const description = (formData.get("description") as string).toUpperCase();
    const reference = (formData.get("reference") as string).toUpperCase();
    const paymentSource = currentCategory === 'Caja Chica' ? 'banco' : (formData.get("paymentSource") as string) || 'banco';
    const fullDate = new Date(`${dateValue}T00:00:00`);

    try {
      if (currentCategory === 'Caja Chica') {
        const batch = writeBatch(db);
        
        const expenseRef = doc(collection(db, "condominios", workingCondoId, "gastos"));
        batch.set(expenseRef, {
            description, amount, category: currentCategory, date: Timestamp.fromDate(fullDate),
            reference, createdAt: serverTimestamp(), paymentSource,
        });

        const replenishmentRef = doc(collection(db, "condominios", workingCondoId, "petty_cash_replenishments"));
        batch.set(replenishmentRef, {
            date: Timestamp.fromDate(fullDate), amount, description: `ASIGNACIÓN: ${description}`,
            expenses: [], sourceExpenseId: expenseRef.id 
        });

        const movementRef = doc(collection(db, "condominios", workingCondoId, "cajaChica_movimientos"));
        batch.set(movementRef, {
            date: Timestamp.fromDate(fullDate), description: `INGRESO POR ASIGNACIÓN: ${description}`,
            amount, type: 'ingreso', replenishmentId: replenishmentRef.id
        });

        await batch.commit();
        toast({ title: "Gasto y Fondo Registrados", description: `Se ha añadido un ingreso de Bs. ${amount} a la Caja Chica.` });
      } else {
        await addDoc(collection(db, "condominios", workingCondoId, "gastos"), {
          description, amount, category: currentCategory, date: Timestamp.fromDate(fullDate),
          reference, createdAt: serverTimestamp(), paymentSource,
        });
        toast({ title: "Gasto registrado correctamente" });
      }
      
      (e.target as HTMLFormElement).reset();
      setCategory('');
      onSave();
    } catch (error) {
      toast({ variant: "destructive", title: "Error al guardar", description: (error as Error).message });
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="bg-card border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
      <CardHeader className="bg-secondary/20 pb-8">
        <CardTitle className="flex items-center gap-3 text-foreground font-black uppercase italic">
            <PlusCircle className="text-primary h-6 w-6"/> Nuevo Registro de Egreso
        </CardTitle>
        <CardDescription className="font-bold text-muted-foreground">Complete los datos del comprobante o factura.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Descripción del Gasto</label>
                    <Input name="description" placeholder="Ej: PAGO DE VIGILANCIA" className="bg-input border-none h-14 rounded-2xl font-bold text-foreground" required />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Nº Factura / Referencia</label>
                    <Input name="reference" placeholder="000123" className="bg-input border-none h-14 rounded-2xl font-bold text-foreground" required />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Monto Bs.</label>
                    <Input name="amount" type="number" step="0.01" className="bg-input border-none h-14 rounded-2xl font-bold text-primary text-xl" required />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Fuente de Pago</label>
                    <Select name="paymentSource" required defaultValue="banco" disabled={category === 'Caja Chica'}>
                        <SelectTrigger className="bg-input border-none h-14 rounded-2xl font-bold text-foreground">
                            <SelectValue placeholder="Seleccione Fuente" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="banco">Banco</SelectItem>
                            <SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem>
                            <SelectItem value="efectivo_usd">Efectivo USD</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Categoría</label>
                    <Select name="category" onValueChange={setCategory} required>
                        <SelectTrigger className="bg-input border-none h-14 rounded-2xl font-bold text-foreground">
                            <SelectValue placeholder="Seleccione Categoría" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Servicios">Servicios (Luz, Agua, Aseo)</SelectItem>
                            <SelectItem value="Mantenimientos y Servicios">Mantenimientos y Servicios</SelectItem>
                            <SelectItem value="Nomina">Nómina / Sueldos</SelectItem>
                            <SelectItem value="Administracion">Gastos Administrativos</SelectItem>
                            <SelectItem value="Telefonia e Internet">Telefonia e Internet</SelectItem>
                            <SelectItem value="Gastos ExtraOrdinarios">Gastos ExtraOrdinarios</SelectItem>
                            <SelectItem value="Reparaciones Generales">Reparaciones Generales</SelectItem>
                            <SelectItem value="Caja Chica">Fondo de Caja Chica (Desde Banco)</SelectItem>
                            <SelectItem value="Otros Gastos">Otros Gastos</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Fecha del Movimiento</label>
                    <Input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="bg-input border-none h-14 rounded-2xl font-bold text-foreground" required />
                </div>
            </div>
        </CardContent>
        <CardFooter className="bg-secondary/20 p-8">
            <Button type="submit" disabled={loading || !workingCondoId} className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-2xl text-lg shadow-xl uppercase tracking-widest transition-all">
                {loading ? <Loader2 className="mr-2 h-6 w-6 animate-spin"/> : <Save className="mr-2 h-6 w-6"/>}
                Guardar Egreso
            </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

const ExpensesTable = ({ expenses, handleDelete }: { expenses: Expense[], handleDelete: (id: string) => void }) => {
    const totalAmount = useMemo(() => expenses.reduce((sum, exp) => sum + exp.amount, 0), [expenses]);

    return (
        <Table>
            <TableHeader className="bg-secondary/30">
                <TableRow className="h-16 hover:bg-transparent border-border/50">
                    <TableHead className="text-muted-foreground px-8 font-bold text-xs uppercase">Fecha</TableHead>
                    <TableHead className="text-muted-foreground font-bold text-xs uppercase">Descripción</TableHead>
                    <TableHead className="text-muted-foreground font-bold text-xs uppercase">Categoría</TableHead>
                    <TableHead className="text-right text-muted-foreground font-bold text-xs uppercase">Monto (Bs.)</TableHead>
                    <TableHead className="text-right text-muted-foreground px-8 font-bold text-xs uppercase">Acción</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {expenses.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={5} className="text-center py-20 text-muted-foreground/50 font-black uppercase italic tracking-widest">No hay egresos registrados para este período y fuente.</TableCell>
                    </TableRow>
                ) : (
                    expenses.map(expense => (
                        <TableRow key={expense.id} className="h-20 hover:bg-secondary/20 transition-colors border-b border-border/50">
                            <TableCell className="px-8 font-bold text-muted-foreground">
                                {expense.date ? format(expense.date.toDate(), 'dd/MM/yyyy') : '---'}
                            </TableCell>
                            <TableCell>
                                <p className="font-black text-foreground uppercase italic">{expense.description}</p>
                                <p className="text-[9px] text-muted-foreground font-bold">REF: {expense.reference}</p>
                            </TableCell>
                            <TableCell>
                                <Badge className="bg-primary/10 text-primary border-none shadow-none font-black text-[9px] uppercase px-3">
                                    {expense.category}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right font-black text-destructive text-xl italic tracking-tighter">
                                - Bs. {formatToTwoDecimals(expense.amount)}
                            </TableCell>
                            <TableCell className="text-right px-8">
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)} className="text-red-300/50 hover:text-red-500 hover:bg-destructive/10 rounded-full">
                                    <Trash2 className="h-5 w-5"/>
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))
                )}
            </TableBody>
            <CardFooter className="bg-secondary/10">
                <div className="flex justify-end items-center w-full p-4">
                    <span className="text-muted-foreground font-bold text-xs uppercase mr-4">Total del Período:</span>
                    <span className="font-black text-destructive text-2xl italic tracking-tighter">
                        - Bs. {formatToTwoDecimals(totalAmount)}
                    </span>
                </div>
            </CardFooter>
        </Table>
    );
}

export default function ExpensesPage() {
    const { user: currentUser, activeCondoId, companyInfo } = useAuth();
    const { toast } = useToast();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
    const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1));

    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const workingCondoId = (sId && currentUser?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;

    useEffect(() => {
        if (!workingCondoId) return;
        setLoading(true);
        const q = query(
            collection(db, "condominios", workingCondoId, "gastos"), 
            orderBy("date", "desc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
            setLoading(false);
        });
        return () => unsubscribe();
    }, [workingCondoId]);

    const filteredExpenses = useMemo(() => {
        return expenses.filter(expense => {
            const expenseDate = expense.date.toDate();
            return (
                expenseDate.getFullYear() === parseInt(filterYear) &&
                (expenseDate.getMonth() + 1) === parseInt(filterMonth)
            );
        });
    }, [expenses, filterYear, filterMonth]);
    
    const bankExpenses = useMemo(() => filteredExpenses.filter(e => e.paymentSource === 'banco'), [filteredExpenses]);
    const cashBsExpenses = useMemo(() => filteredExpenses.filter(e => e.paymentSource === 'efectivo_bs'), [filteredExpenses]);
    const cashUsdExpenses = useMemo(() => filteredExpenses.filter(e => e.paymentSource === 'efectivo_usd'), [filteredExpenses]);

    const handleDelete = async (id: string) => {
        if (!workingCondoId) return;
        if(window.confirm('¿Eliminar este registro de egreso permanentemente?')) {
            try {
                await deleteDoc(doc(db, "condominios", workingCondoId, "gastos", id));
                toast({ title: "Gasto eliminado" });
            } catch (error) {
                toast({ variant: "destructive", title: "Error al eliminar" });
            }
        }
    };

    const handleExportPDF = async () => {
        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Error', description: 'Información de la empresa no cargada.' });
            return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const headerHeight = 35;
        const margin = 14;

        doc.setFillColor(28, 43, 58);
        doc.rect(0, 0, pageWidth, headerHeight, 'F');
        doc.setTextColor(255, 255, 255);

        if (companyInfo?.logo) {
            try {
                doc.saveGraphicsState();
                doc.circle(margin + 10, 7 + 10, 10);
                doc.clip();
                doc.addImage(companyInfo.logo, 'PNG', margin, 7, 20, 20);
                doc.restoreGraphicsState();
            }
            catch(e) { console.error("Error adding logo:", e); }
        }

        doc.setFontSize(14).setFont('helvetica', 'bold');
        doc.text(companyInfo?.name || 'CONDOMINIO', margin + 25, 15);
        doc.setFontSize(9).setFont('helvetica', 'normal');
        doc.text(`RIF: ${companyInfo?.rif || 'N/A'}`, margin + 25, 22);

        const efasColor = '#F97316';
        const condoSysColor = '#FFFFFF';
        doc.setFont('helvetica', 'bolditalic');
        doc.setFontSize(10);
        const efasText = "EFAS", condoSysText = "CONDOSYS";
        const condoSysWidth = doc.getStringUnitWidth(condoSysText) * 10 / doc.internal.scaleFactor;
        doc.setTextColor(efasColor).text(efasText, pageWidth - margin - condoSysWidth - 1, 12, { align: 'right' });
        doc.setTextColor(condoSysColor).text(condoSysText, pageWidth - margin, 12, { align: 'right' });
        doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(200, 200, 200);
        doc.text('REPORTE DE EGRESOS', pageWidth - margin, 17, { align: 'right' });

        const canvas = document.createElement('canvas');
        const barcodeValue = `EGR-${filterYear}-${filterMonth}`;
        try {
            JsBarcode(canvas, barcodeValue, { format: "CODE128", height: 25, width: 1, displayValue: false, margin: 0, background: "#1c2b3a", lineColor: "#ffffff" });
            doc.addImage(canvas.toDataURL("image/png"), 'PNG', pageWidth - margin - 40, 20, 40, 10);
        } catch (e) { console.error("Barcode generation failed", e); }
        
        doc.setTextColor(0, 0, 0);
        let startY = headerHeight + 15;
        
        const selectedMonthLabel = monthOptions.find(m => m.value === filterMonth)?.label;
        const title = `Reporte de Egresos - ${selectedMonthLabel} ${filterYear}`;
        
        doc.setFontSize(18).text(title, 14, startY);
        doc.setFontSize(11).text(`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`, 190, startY, { align: 'right' });

        autoTable(doc, {
            startY: startY + 10,
            head: [['Fecha', 'Descripción', 'Referencia', 'Categoría', 'Fuente', 'Monto (Bs.)']],
            body: filteredExpenses.map(exp => [
                format(exp.date.toDate(), 'dd/MM/yyyy'),
                exp.description,
                exp.reference,
                exp.category,
                exp.paymentSource?.replace('_', ' ') || 'Banco',
                formatToTwoDecimals(exp.amount)
            ]),
            foot: [['', '', '', '', 'Total Egresos', formatToTwoDecimals(filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0))]],
            headStyles: { fillColor: [239, 68, 68] },
            footStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { textColor: [0, 0, 0] },
            columnStyles: { 5: { halign: 'right' } }
        });

        doc.save(`reporte_egresos_${filterYear}_${filterMonth}.pdf`);
    };
    
    return (
        <div className="space-y-10 p-8 max-w-7xl mx-auto">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Gestión de <span className="text-primary">Egresos</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Registro y control de todos los gastos del condominio.
                </p>
            </div>

            <RegisterExpenseForm workingCondoId={workingCondoId} onSave={() => {}} />

            <Card className="rounded-[2.5rem] shadow-2xl overflow-hidden border-none bg-card">
                <CardHeader className="border-b border-border/50 p-8">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                        <CardTitle className="text-foreground font-black uppercase italic flex items-center gap-2">
                            <CreditCard className="text-primary"/> Historial de Movimientos
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Select value={filterMonth} onValueChange={setFilterMonth}>
                                <SelectTrigger className="w-[180px] rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>{monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filterYear} onValueChange={setFilterYear}>
                                <SelectTrigger className="w-[120px] rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                            </Select>
                             <Button onClick={handleExportPDF} variant="outline" className="rounded-xl">
                                <FileDown className="h-4 w-4 mr-2" />
                                Exportar PDF
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                     {loading ? (
                        <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary"/></div>
                    ) : (
                        <Tabs defaultValue="banco">
                            <TabsList className="grid w-full grid-cols-3 bg-secondary/20 rounded-2xl h-auto p-1.5">
                                <TabsTrigger value="banco" className="rounded-xl h-12 text-xs md:text-sm font-black gap-2"><Landmark className="h-4 w-4"/> Banco</TabsTrigger>
                                <TabsTrigger value="efectivo_bs" className="rounded-xl h-12 text-xs md:text-sm font-black gap-2"><Banknote className="h-4 w-4"/> Efectivo Bs.</TabsTrigger>
                                <TabsTrigger value="efectivo_usd" className="rounded-xl h-12 text-xs md:text-sm font-black gap-2"><DollarSign className="h-4 w-4"/> Efectivo USD</TabsTrigger>
                            </TabsList>
                            <div className="mt-4">
                                <TabsContent value="banco"><ExpensesTable expenses={bankExpenses} handleDelete={handleDelete} /></TabsContent>
                                <TabsContent value="efectivo_bs"><ExpensesTable expenses={cashBsExpenses} handleDelete={handleDelete} /></TabsContent>
                                <TabsContent value="efectivo_usd"><ExpensesTable expenses={cashUsdExpenses} handleDelete={handleDelete} /></TabsContent>
                            </div>
                        </Tabs>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

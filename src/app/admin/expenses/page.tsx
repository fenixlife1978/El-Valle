
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
import { Loader2, PlusCircle, Trash2, Building2, CreditCard, Save, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Expense = {
    id: string;
    description: string;
    amount: number;
    category: string;
    date: Timestamp;
    reference: string;
    createdAt: Timestamp;
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
    const category = formData.get("category") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const description = (formData.get("description") as string).toUpperCase();
    const reference = (formData.get("reference") as string).toUpperCase();
    const fullDate = new Date(`${dateValue}T00:00:00`);

    try {
      if (category === 'Caja Chica') {
        const batch = writeBatch(db);
        
        // 1. Gasto general
        const expenseRef = doc(collection(db, "condominios", workingCondoId, "gastos"));
        batch.set(expenseRef, {
            description,
            amount,
            category,
            date: Timestamp.fromDate(fullDate),
            reference,
            createdAt: serverTimestamp(),
        });

        // 2. Ciclo de reposición en Caja Chica
        const replenishmentRef = doc(collection(db, "condominios", workingCondoId, "petty_cash_replenishments"));
        batch.set(replenishmentRef, {
            date: Timestamp.fromDate(fullDate),
            amount,
            description: `ASIGNACIÓN: ${description}`,
            expenses: [],
            sourceExpenseId: expenseRef.id 
        });

        // 3. Movimiento de INGRESO en el libro de Caja Chica
        const movementRef = doc(collection(db, "condominios", workingCondoId, "cajaChica_movimientos"));
        batch.set(movementRef, {
            date: Timestamp.fromDate(fullDate),
            description: `INGRESO POR ASIGNACIÓN: ${description}`,
            amount,
            type: 'ingreso',
            replenishmentId: replenishmentRef.id
        });

        await batch.commit();
        toast({ title: "Gasto y Fondo Registrados", description: `Se ha añadido un ingreso de Bs. ${amount} a la Caja Chica.` });
      } else {
        await addDoc(collection(db, "condominios", workingCondoId, "gastos"), {
          description,
          amount,
          category,
          date: Timestamp.fromDate(fullDate),
          reference,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Gasto registrado correctamente" });
      }
      
      (e.target as HTMLFormElement).reset();
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
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Categoría</label>
                    <Select name="category" required>
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
                            <SelectItem value="Caja Chica">Caja Chica</SelectItem>
                            <SelectItem value="Otros Gastos">Otros Gastos</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
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
    
    const totalFilteredAmount = useMemo(() => {
        return filteredExpenses.reduce((total, expense) => total + expense.amount, 0);
    }, [filteredExpenses]);


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

    const handleExportPDF = () => {
        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Error', description: 'Información de la empresa no cargada.' });
            return;
        }

        const doc = new jsPDF();
        const selectedMonth = monthOptions.find(m => m.value === filterMonth)?.label;
        const title = `Reporte de Egresos - ${selectedMonth} ${filterYear}`;
        
        doc.setFontSize(18).text(title, 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generado para: ${companyInfo.name}`, 14, 29);
        doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`, 190, 29, { align: 'right' });

        autoTable(doc, {
            startY: 40,
            head: [['Fecha', 'Descripción', 'Referencia', 'Categoría', 'Monto (Bs.)']],
            body: filteredExpenses.map(exp => [
                format(exp.date.toDate(), 'dd/MM/yyyy'),
                exp.description,
                exp.reference,
                exp.category,
                formatToTwoDecimals(exp.amount)
            ]),
            foot: [['', '', '', 'Total Egresos', formatToTwoDecimals(totalFilteredAmount)]],
            headStyles: { fillColor: [22, 163, 74] },
            footStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' }
        });

        doc.save(`reporte_egresos_${filterYear}_${filterMonth}.pdf`);
    };
    
    return (
        <div className="space-y-10 p-8 max-w-7xl mx-auto">
             <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Gestión de <span className="text-primary">Egresos</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
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
                <CardContent className="p-0">
                     {loading ? (
                        <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary"/></div>
                    ) : (
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
                                {filteredExpenses.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-20 text-muted-foreground/50 font-black uppercase italic tracking-widest">No hay egresos registrados para este período</TableCell>
                                    </TableRow>
                                ) : (
                                    filteredExpenses.map(expense => (
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
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    deleteDoc, 
    doc, 
    serverTimestamp, 
    query, 
    orderBy, 
    Timestamp,
    writeBatch
} from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth'; // Hook para obtener el condominio activo
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, Trash2, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

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

// Componente del Formulario integrado con workingCondoId
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
    const description = formData.get("description") as string;
    const reference = formData.get("reference") as string;
    const fullDate = new Date(`${dateValue}T00:00:00`);

    try {
      if (category === 'Reposición Caja Chica') {
        const batch = writeBatch(db);
        
        // 1. Create the main expense document that justifies the cash leaving the bank
        const expenseRef = doc(collection(db, "condominios", workingCondoId, "gastos"));
        batch.set(expenseRef, {
            description: description,
            amount: amount,
            category: category,
            date: Timestamp.fromDate(fullDate),
            reference: reference,
            createdAt: serverTimestamp(),
        });

        // 2. Create the replenishment document for the petty cash module
        const replenishmentRef = doc(collection(db, "condominios", workingCondoId, "petty_cash_replenishments"));
        batch.set(replenishmentRef, {
            date: Timestamp.fromDate(fullDate),
            amount: amount,
            description: `Fondo de reposición: ${description}`,
            expenses: [],
            sourceExpenseId: expenseRef.id 
        });

        await batch.commit();
        toast({ title: "Gasto y Fondo Registrados", description: "Se registró el egreso y se acreditó el fondo a Caja Chica." });
      } else {
        // Original logic for other expenses
        await addDoc(collection(db, "condominios", workingCondoId, "gastos"), {
          description: description,
          amount: amount,
          category: category,
          date: Timestamp.fromDate(fullDate),
          reference: reference,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Gasto registrado", description: "El egreso se guardó correctamente." });
      }
      
      (e.target as HTMLFormElement).reset();
      onSave();
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el gasto." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="bg-slate-900/40 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white"><PlusCircle className="text-[#0081c9]"/> Registrar Nuevo Egreso</CardTitle>
        <CardDescription className="text-slate-400">Añade un nuevo gasto al registro de este condominio.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="description" placeholder="Descripción del gasto" className="bg-slate-950 border-slate-800 text-white" required />
                <Input name="reference" placeholder="Nº Factura o Referencia" className="bg-slate-950 border-slate-800 text-white" required />
                <Input name="amount" type="number" step="0.01" placeholder="Monto Bs." className="bg-slate-950 border-slate-800 text-white" required />
                <Select name="category" required>
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                        <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                        <SelectItem value="Servicios">Servicios (Luz, Agua, Aseo)</SelectItem>
                        <SelectItem value="Mantenimientos y Servicios">Mantenimientos y Servicios</SelectItem>
                        <SelectItem value="Nomina">Nómina / Sueldos</SelectItem>
                        <SelectItem value="Administracion">Gastos Administrativos</SelectItem>
                        <SelectItem value="Telefonia e Internet">Telefonia e Internet</SelectItem>
                        <SelectItem value="Gastos ExtraOrdinarios">Gastos ExtraOrdinarios</SelectItem>
                        <SelectItem value="Reparaciones Generales">Reparaciones Generales</SelectItem>
                        <SelectItem value="Reposición Caja Chica">Reposición Caja Chica</SelectItem>
                        <SelectItem value="Otros Gastos">Otros Gastos</SelectItem>
                    </SelectContent>
                </Select>
                <Input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="bg-slate-950 border-slate-800 text-white" required />
            </div>
        </CardContent>
        <CardFooter>
            <Button type="submit" disabled={loading || !workingCondoId} className="w-full md:w-auto bg-[#0081c9] hover:bg-[#006bb3]">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                Guardar Gasto
            </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function ExpensesPage() {
    const { user: currentUser, activeCondoId } = useAuth();
    const { toast } = useToast();
    
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);

    // DETERMINAR ID DE TRABAJO (Soporte vallecondo@gmail.com)
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const workingCondoId = (sId && currentUser?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;

    useEffect(() => {
        if (!workingCondoId) return;

        setLoading(true);
        // CONSULTA SEGMENTADA AL CONDOMINIO ESPECÍFICO
        const q = query(
            collection(db, "condominios", workingCondoId, "gastos"), 
            orderBy("date", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
            setExpenses(expensesData);
            setLoading(false);
        }, (error) => {
            console.error("Error al cargar gastos:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [workingCondoId]);

    const handleDelete = async (id: string) => {
        if (!workingCondoId) return;
        if(window.confirm('¿Estás seguro de que quieres eliminar este gasto?')) {
            try {
                await deleteDoc(doc(db, "condominios", workingCondoId, "gastos", id));
                toast({ title: "Gasto eliminado" });
            } catch (error) {
                toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el gasto." });
            }
        }
    };
    
    return (
        <div className="space-y-8 p-6">
             <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">
                        Gestión de <span className="text-[#0081c9]">Egresos</span>
                    </h2>
                    <p className="text-slate-500 font-bold text-sm uppercase flex items-center gap-2 mt-1">
                        <Building2 className="h-4 w-4 text-amber-500"/>
                        ID Condominio: <span className="text-amber-500">{workingCondoId || "Seleccione uno"}</span>
                    </p>
                </div>
            </div>

            <RegisterExpenseForm workingCondoId={workingCondoId} onSave={() => {}} />

            <Card className="bg-slate-900/40 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Historial de Egresos</CardTitle>
                </CardHeader>
                <CardContent>
                     {loading ? (
                        <div className="flex justify-center items-center h-24"><Loader2 className="h-8 w-8 animate-spin text-[#0081c9]"/></div>
                    ) : (
                        <div className="rounded-md border border-slate-800 overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-950">
                                    <TableRow className="border-slate-800 hover:bg-slate-950">
                                        <TableHead className="text-slate-400">Fecha</TableHead>
                                        <TableHead className="text-slate-400">Descripción</TableHead>
                                        <TableHead className="text-slate-400">Referencia</TableHead>
                                        <TableHead className="text-slate-400">Categoría</TableHead>
                                        <TableHead className="text-right text-slate-400">Monto (Bs.)</TableHead>
                                        <TableHead className="text-right text-slate-400">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {expenses.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-10 text-slate-500">No hay gastos registrados para este condominio.</TableCell>
                                        </TableRow>
                                    ) : (
                                        expenses.map(expense => (
                                            <TableRow key={expense.id} className="border-slate-800 hover:bg-slate-800/50">
                                                <TableCell className="text-slate-300">
                                                    {expense.date ? format(expense.date.toDate(), 'dd/MM/yyyy', { locale: es }) : '---'}
                                                </TableCell>
                                                <TableCell className="text-white font-medium">{expense.description}</TableCell>
                                                <TableCell className="text-slate-400 text-xs uppercase">{expense.reference}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="border-slate-700 text-slate-300 bg-slate-800">
                                                        {expense.category}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-white">
                                                    Bs. {formatToTwoDecimals(expense.amount)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)} className="hover:bg-red-500/20 group">
                                                        <Trash2 className="h-4 w-4 text-slate-500 group-hover:text-red-400"/>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

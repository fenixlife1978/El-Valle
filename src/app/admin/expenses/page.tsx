
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

type Expense = {
    id: string;
    description: string;
    amount: number;
    category: 'Servicios' | 'Mantenimientos y Servicios' | 'Nomina' | 'Administracion' | 'Telefonia e Internet' | 'Gastos ExtraOrdinarios' | 'Reparaciones Generales' | 'Otros Gastos' | 'Reposición Caja Chica';
    date: Timestamp;
    reference: string;
    createdAt: Timestamp;
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function RegisterExpenseForm({ onSave }: { onSave: () => void }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const dateValue = formData.get("date") as string;

    if (!dateValue) {
        toast({ variant: "destructive", title: "Error", description: "La fecha es obligatoria." });
        setLoading(false);
        return;
    }

    try {
      await addDoc(collection(db, "expenses"), {
        description: formData.get("description"),
        amount: parseFloat(formData.get("amount") as string),
        category: formData.get("category"),
        date: Timestamp.fromDate(new Date(`${dateValue}T00:00:00`)), // Ensure it's start of day
        reference: formData.get("reference"),
        createdAt: serverTimestamp(),
      });

      toast({ title: "Gasto registrado", description: "El egreso se guardó correctamente." });
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PlusCircle/> Registrar Nuevo Egreso</CardTitle>
        <CardDescription>Añade un nuevo gasto al registro contable.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="description" placeholder="Descripción del gasto" required />
                <Input name="reference" placeholder="Nº Factura o Referencia" required />
                <Input name="amount" type="number" step="0.01" placeholder="Monto Bs." required />
                <Select name="category" required>
                <SelectTrigger>
                    <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
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
                <Input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} required />
            </div>
        </CardContent>
        <CardFooter>
            <Button type="submit" disabled={loading} className="w-full md:w-auto">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                Guardar Gasto
            </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, "expenses"), orderBy("date", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
            setExpenses(expensesData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleDelete = async (id: string) => {
        if(window.confirm('¿Estás seguro de que quieres eliminar este gasto?')) {
            try {
                await deleteDoc(doc(db, "expenses", id));
                toast({ title: "Gasto eliminado", description: "El registro ha sido borrado." });
            } catch (error) {
                toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el gasto." });
            }
        }
    };
    
    return (
        <div className="space-y-8">
             <div>
                <h1 className="text-3xl font-bold font-headline">Gestión de Egresos</h1>
                <p className="text-muted-foreground">Registre y consulte los gastos del condominio.</p>
            </div>
            <RegisterExpenseForm onSave={() => {}} />
            <Card>
                <CardHeader>
                    <CardTitle>Historial de Egresos</CardTitle>
                </CardHeader>
                <CardContent>
                     {loading ? (
                        <div className="flex justify-center items-center h-24"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead>Referencia</TableHead>
                                    <TableHead>Categoría</TableHead>
                                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {expenses.map(expense => (
                                    <TableRow key={expense.id}>
                                        <TableCell>{format(expense.date.toDate(), 'dd/MM/yyyy', { locale: es })}</TableCell>
                                        <TableCell>{expense.description}</TableCell>
                                        <TableCell>{expense.reference}</TableCell>
                                        <TableCell><Badge variant="secondary">{expense.category}</Badge></TableCell>
                                        <TableCell className="text-right font-medium">Bs. {formatToTwoDecimals(expense.amount)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

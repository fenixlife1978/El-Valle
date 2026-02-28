
'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, onSnapshot, doc, 
    serverTimestamp, query, orderBy, Timestamp, runTransaction,
    increment, getDocs, where
} from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, CreditCard, WalletCards } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

type Expense = {
    id: string;
    description: string;
    amount: number;
    category: string;
    date: Timestamp;
    reference: string;
    createdAt: Timestamp;
    paymentSource?: string;
    accountId?: string;
};

type Account = { id: string; nombre: string; saldoActual: number; tipo: string; };

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const yearOptions = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

function RegisterExpenseForm({ workingCondoId, onSave }: { workingCondoId: string | null, onSave: () => void }) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!workingCondoId) return;
    return onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), (snap) => {
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
    });
  }, [workingCondoId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workingCondoId) return;

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get("amount") as string);
    const description = (formData.get("description") as string).toUpperCase();
    const reference = (formData.get("reference") as string).toUpperCase();
    const accountId = formData.get("accountId") as string;
    const category = formData.get("category") as string;
    const dateValue = formData.get("date") as string;
    const date = Timestamp.fromDate(new Date(`${dateValue}T00:00:00`));

    const selectedAcc = accounts.find(a => a.id === accountId);
    if (!selectedAcc) {
        setLoading(false);
        return toast({ variant: "destructive", title: "Error", description: "Seleccione una cuenta válida." });
    }

    if (selectedAcc.saldoActual < amount) {
        setLoading(false);
        return toast({ variant: "destructive", title: "Saldo Insuficiente", description: `La cuenta ${selectedAcc.nombre} solo dispone de Bs. ${formatToTwoDecimals(selectedAcc.saldoActual)}` });
    }

    try {
      await runTransaction(db, async (transaction) => {
          const accountRef = doc(db, 'condominios', workingCondoId, 'cuentas', accountId);
          const accSnap = await transaction.get(accountRef);
          
          if (!accSnap.exists()) throw new Error("La cuenta seleccionada no existe.");
          
          const expenseRef = doc(collection(db, "condominios", workingCondoId, "gastos"));
          const transRef = doc(collection(db, 'condominios', workingCondoId, 'transacciones'));

          // 1. Registrar el Gasto
          transaction.set(expenseRef, {
              description, amount, category, date, reference, createdAt: serverTimestamp(), 
              paymentSource: selectedAcc.nombre, accountId: accountId
          });

          // 2. Descontar ÚNICAMENTE de la cuenta seleccionada (Atómico)
          transaction.update(accountRef, { saldoActual: increment(-amount) });

          // 3. Crear Asiento Único en el Libro Diario
          transaction.set(transRef, {
              monto: amount, tipo: 'egreso', cuentaId: accountId, nombreCuenta: selectedAcc.nombre,
              descripcion: `EGRESO: ${description}`, referencia: reference, fecha: date,
              createdAt: serverTimestamp(), createdBy: user?.email, sourceExpenseId: expenseRef.id
          });
      });

      toast({ title: "Gasto Procesado", description: "El monto ha sido descontado exclusivamente de la cuenta seleccionada." });
      (e.target as HTMLFormElement).reset();
      onSave();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Fallo Contable", description: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden">
      <CardHeader className="bg-slate-50 border-b p-8">
        <CardTitle className="text-slate-900 font-black uppercase italic flex items-center gap-3">
            <PlusCircle className="text-primary h-6 w-6"/> Registrar Egreso Real
        </CardTitle>
        <CardDescription className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">Afectación exclusiva a la cuenta de origen seleccionada.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Descripción</Label><Input name="description" className="h-12 rounded-xl bg-slate-50 text-slate-900 font-bold border-slate-200" required /></div>
            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Referencia / Factura</Label><Input name="reference" className="h-12 rounded-xl bg-slate-50 text-slate-900 font-bold border-slate-200" required /></div>
            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Monto Bs.</Label><Input name="amount" type="number" step="0.01" className="h-12 rounded-xl bg-slate-50 text-slate-900 font-black text-xl border-slate-200" required /></div>
            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Cuenta de Pago (Salida Unica)</Label><Select name="accountId" required><SelectTrigger className="h-12 rounded-xl bg-slate-50 text-slate-900 font-bold border-slate-200"><SelectValue placeholder="Seleccionar..." /></SelectTrigger><SelectContent className="bg-white">{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.nombre} (Bs. {formatToTwoDecimals(acc.saldoActual)})</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Categoría</Label><Select name="category" required><SelectTrigger className="h-12 rounded-xl bg-slate-50 text-slate-900 font-bold border-slate-200"><SelectValue placeholder="Categoría..." /></SelectTrigger><SelectContent className="bg-white"><SelectItem value="Servicios">Servicios</SelectItem><SelectItem value="Mantenimiento">Mantenimiento</SelectItem><SelectItem value="Nomina">Nómina</SelectItem><SelectItem value="Otros">Otros</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Fecha</Label><Input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="h-12 rounded-xl bg-slate-50 text-slate-900 font-bold border-slate-200" required /></div>
        </CardContent>
        <CardFooter className="bg-slate-50 p-8 border-t"><Button type="submit" disabled={loading} className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white font-black uppercase italic tracking-widest rounded-2xl shadow-xl">{loading ? <Loader2 className="animate-spin" /> : "Ejecutar Egreso y Asentar"}</Button></CardFooter>
      </form>
    </Card>
  );
}

export default function ExpensesPage() {
    const { activeCondoId } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
    const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1));

    useEffect(() => {
        if (!activeCondoId) return;
        setLoading(true);
        const q = query(collection(db, "condominios", activeCondoId, "gastos"), orderBy("date", "desc"));
        return onSnapshot(q, (snap) => {
            setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
            setLoading(false);
        });
    }, [activeCondoId]);

    const filteredExpenses = useMemo(() => expenses.filter(e => {
        const d = e.date.toDate();
        return d.getFullYear() === parseInt(filterYear) && (d.getMonth() + 1) === parseInt(filterMonth);
    }), [expenses, filterYear, filterMonth]);

    return (
        <div className="space-y-10 p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-[#0081c9]">Egresos</span></h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">Registro atómico de gastos con impacto exclusivo en Tesorería y Libros.</p>
            </div>

            <RegisterExpenseForm workingCondoId={activeCondoId} onSave={() => {}} />

            <Card className="rounded-[2.5rem] shadow-2xl overflow-hidden border-none bg-white mt-10">
                <CardHeader className="bg-slate-900 p-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <CardTitle className="text-white font-black uppercase italic flex items-center gap-2"><CreditCard className="text-primary"/> Historial de Egresos</CardTitle>
                        <div className="flex gap-2">
                            <Select value={filterMonth} onValueChange={setFilterMonth}><SelectTrigger className="w-36 bg-white/10 text-white border-white/20 font-bold"><SelectValue /></SelectTrigger><SelectContent className="bg-white">{monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select>
                            <Select value={filterYear} onValueChange={setFilterYear}><SelectTrigger className="w-24 bg-white/10 text-white border-white/20 font-bold"><SelectValue /></SelectTrigger><SelectContent className="bg-white">{yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50"><TableRow className="border-slate-100"><TableHead className="px-8 py-6 text-[10px] font-black uppercase text-slate-700">Fecha</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-700">Concepto</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-700">Cuenta de Salida</TableHead><TableHead className="text-right text-[10px] font-black uppercase pr-8 text-slate-700">Monto</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {loading ? <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto text-primary"/></TableCell></TableRow> : 
                             filteredExpenses.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-20 text-slate-400 font-bold italic">Sin movimientos en este período.</TableCell></TableRow> : 
                             filteredExpenses.map(exp => (
                                <TableRow key={exp.id} className="hover:bg-slate-50 border-slate-50">
                                    <TableCell className="px-8 font-bold text-slate-500 text-xs">{format(exp.date.toDate(), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>
                                        <div className="font-black text-slate-900 uppercase italic text-xs leading-tight">{exp.description}</div>
                                        <div className="text-[9px] font-black text-slate-400 mt-0.5 uppercase">REF: {exp.reference} • {exp.category}</div>
                                    </TableCell>
                                    <TableCell><Badge variant="outline" className="text-[9px] font-black uppercase text-slate-500 bg-slate-50">{exp.paymentSource}</Badge></TableCell>
                                    <TableCell className="text-right pr-8 font-black text-red-600 italic">Bs. {formatToTwoDecimals(exp.amount)}</TableCell>
                                </TableRow>
                             ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

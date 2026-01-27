
'use client';

import React, { useState, useEffect, useMemo } from 'react';
// Cambiamos @/ por rutas relativas para asegurar que TS los encuentre
import { useAuth } from '../../../hooks/use-auth';
import { db } from '../../../lib/firebase';
import { collection, onSnapshot, orderBy, query, Timestamp, where, getDocs } from 'firebase/firestore';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { useToast } from '../../../hooks/use-toast';
import { PlusCircle, Loader2, Eye, ArrowLeft, Landmark } from 'lucide-react';

export default function FinancialBalancePage() {
  const { activeCondoId } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState<any[]>([]);
  const [prevBalance, setPrevBalance] = useState(0);
  const [currentPayments, setCurrentPayments] = useState(0);

  useEffect(() => {
    if (!activeCondoId) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "condominios", activeCondoId, "financial_statements"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setStatements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [activeCondoId]);

  const fetchPeriodData = async () => {
    if (!activeCondoId) return;
    setLoading(true);
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

    try {
      const pQuery = query(
        collection(db, "condominios", activeCondoId, "payments"),
        where("status", "==", "aprobado"),
        where("paymentDate", ">=", Timestamp.fromDate(start)),
        where("paymentDate", "<=", Timestamp.fromDate(end))
      );
      const pSnap = await getDocs(pQuery);
      setCurrentPayments(pSnap.docs.reduce((sum, d) => sum + (d.data().totalAmount || 0), 0));
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al sincronizar datos' });
    } finally {
      setLoading(false);
    }
  };

  const totalLiquidez = useMemo(() => prevBalance + currentPayments, [prevBalance, currentPayments]);

  if (loading && view === 'list') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-blue-500 w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 text-slate-100">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black uppercase tracking-tighter">Balance <span className="text-blue-500">Financiero</span></h1>
        {view === 'list' && (
          <Button onClick={() => { setView('form'); fetchPeriodData(); }} className="bg-blue-600 hover:bg-blue-500 font-bold">
            <PlusCircle className="mr-2 h-4 w-4" /> NUEVO CIERRE
          </Button>
        )}
      </div>

      {view === 'list' ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Periodo</TableHead>
                  <TableHead className="text-right text-slate-400">Total Liquidez</TableHead>
                  <TableHead className="text-right text-slate-400">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-10 text-slate-500 italic">No hay cierres registrados.</TableCell>
                  </TableRow>
                ) : (
                  statements.map((s) => (
                    <TableRow key={s.id} className="border-slate-800">
                      <TableCell className="font-bold text-white">{s.id}</TableCell>
                      <TableCell className="text-right text-green-400 font-mono font-bold">Bs. {s.estadoFinanciero?.saldoNeto?.toLocaleString('es-VE')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Landmark className="text-blue-500" /> Ingresos del Mes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saldo Inicial</label>
                <Input 
                  type="number" 
                  value={prevBalance} 
                  onChange={(e) => setPrevBalance(Number(e.target.value))} 
                  className="bg-slate-950 border-slate-800 text-white" 
                />
              </div>
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest">Recaudación</p>
                <p className="text-2xl font-black text-white">Bs. {currentPayments.toLocaleString('es-VE')}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-blue-600 text-white border-none shadow-xl shadow-blue-900/20">
            <CardHeader>
              <CardTitle className="text-[10px] uppercase font-black tracking-widest opacity-80">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-black tracking-tighter">Bs. {totalLiquidez.toLocaleString('es-VE')}</p>
            </CardContent>
            <CardFooter>
              <Button onClick={() => setView('list')} variant="secondary" className="w-full font-bold uppercase text-xs">
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}

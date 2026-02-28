
'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Save, Plus, Trash2 } from "lucide-react";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function FinancialBalancePage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const { condoId: urlCondoId } = resolvedParams;
    const { userProfile, user } = useAuth();
    const { toast } = useToast();

    const workingCondoId = userProfile?.workingCondoId || userProfile?.condominioId || urlCondoId;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [saldoAnteriorBanco, setSaldoAnteriorBanco] = useState(0);
    const [ingresosOrdinariosBanco, setIngresosOrdinariosBanco] = useState(0);
    const [ingresosOrdinariosEfectivo, setIngresosOrdinariosEfectivo] = useState(0);
    const [otrosIngresos, setOtrosIngresos] = useState<{ concepto: string, monto: number }[]>([]);
    const [egresosBanco, setEgresosBanco] = useState<{ concepto: string, monto: number }[]>([]);
    
    const [cajaPrincipalBS, setCajaPrincipalBS] = useState(0);
    const [cajaChicaBS, setCajaChicaBS] = useState(0);
    const [notas, setNotas] = useState("");
    
    const [companyData, setCompanyData] = useState<any>(null);

    useEffect(() => {
        if (!workingCondoId) return;
        const configRef = doc(db, 'condominios', workingCondoId, 'config', 'mainSettings');
        getDoc(configRef).then(snap => { if (snap.exists()) setCompanyData(snap.data().companyInfo); });
    }, [workingCondoId]);

    // Escucha en tiempo real de las cuentas de tesorería para obtener los saldos dinámicos
    useEffect(() => {
        if (!workingCondoId) return;

        const unsubCuentas = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), (snap) => {
            const accounts = snap.docs.map(d => d.data());
            const cp = accounts.find(a => a.nombre?.toUpperCase() === 'CAJA PRINCIPAL');
            const cc = accounts.find(a => a.nombre?.toUpperCase() === 'CAJA CHICA');
            
            setCajaPrincipalBS(cp?.saldoActual || 0);
            setCajaChicaBS(cc?.saldoActual || 0);
        });

        return () => unsubCuentas();
    }, [workingCondoId]);

    useEffect(() => {
        if (!workingCondoId) return;

        const fetchAutomaticData = async () => {
            setLoading(true);
            try {
                const year = parseInt(selectedYear);
                const month = parseInt(selectedMonth) - 1;
                const fromDate = new Date(year, month, 1);
                const toDate = new Date(year, month + 1, 0, 23, 59, 59);

                const pQuery = query(
                    collection(db, 'condominios', workingCondoId, 'payments'),
                    where('paymentDate', '>=', fromDate),
                    where('paymentDate', '<=', toDate),
                    where('status', '==', 'aprobado')
                );
                const pSnap = await getDocs(pQuery);
                
                let totalBancario = 0;
                let totalEfectivo = 0;
                pSnap.forEach(doc => {
                    const data = doc.data();
                    if (['transferencia', 'movil'].includes(data.paymentMethod)) totalBancario += data.totalAmount;
                    else if (data.paymentMethod === 'efectivo_bs') totalEfectivo += data.totalAmount;
                });
                setIngresosOrdinariosBanco(totalBancario);
                setIngresosOrdinariosEfectivo(totalEfectivo);

                const eQuery = query(collection(db, 'condominios', workingCondoId, 'gastos'), where('date', '>=', fromDate), where('date', '<=', toDate), where('paymentSource', '==', 'banco'));
                const eSnap = await getDocs(eQuery);
                setEgresosBanco(eSnap.docs.map(d => ({ concepto: d.data().description, monto: d.data().amount })));

            } catch (error) { console.error(error); } finally { setLoading(false); }
        };
        fetchAutomaticData();
    }, [selectedMonth, selectedYear, workingCondoId]);

    const totalIngresosMes = useMemo(() => ingresosOrdinariosBanco + ingresosOrdinariosEfectivo + otrosIngresos.reduce((sum, i) => sum + i.monto, 0), [ingresosOrdinariosBanco, ingresosOrdinariosEfectivo, otrosIngresos]);
    const totalEgresosMes = useMemo(() => egresosBanco.reduce((sum, e) => sum + e.monto, 0), [egresosBanco]);
    const disponibilidadBancaria = (saldoAnteriorBanco + ingresosOrdinariosBanco + otrosIngresos.reduce((sum,i)=>sum+i.monto,0)) - totalEgresosMes;

    const handleSave = async () => {
        if (!workingCondoId) return;
        setSaving(true);
        try {
            const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
            await setDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', docId), {
                periodo: docId,
                saldoAnteriorBanco,
                ingresos: [
                    { concepto: 'BANCO (PAGO MÓVIL / TRANSF.)', monto: ingresosOrdinariosBanco },
                    { concepto: 'CAJA PRINCIPAL (EFECTIVO BS)', monto: ingresosOrdinariosEfectivo },
                    ...otrosIngresos
                ],
                egresos: egresosBanco,
                estadoFinanciero: { saldoNeto: disponibilidadBancaria, saldoCajaPrincipal: cajaPrincipalBS, saldoCajaChica: cajaChicaBS },
                notas, updatedAt: serverTimestamp()
            });
            toast({ title: "Balance Guardado" });
        } catch (e) { toast({ variant: 'destructive', title: "Error" }); } finally { setSaving(false); }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex justify-between items-end">
                <h1 className="text-3xl font-black uppercase italic tracking-tighter">Balance <span className="text-primary">Financiero</span></h1>
                <div className="flex gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{Array.from({length:12}, (_,i)=>(<SelectItem key={i+1} value={String(i+1)}>{format(new Date(2000,i), 'MMMM', {locale:es})}</SelectItem>))}</SelectContent>
                    </Select>
                    <Input className="w-24" type="number" value={selectedYear} onChange={(e)=>setSelectedYear(e.target.value)} />
                </div>
            </div>

            {loading ? <Loader2 className="animate-spin mx-auto h-10 w-10 text-primary" /> : <>
                <Card>
                    <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500">Ingresos del Período</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableBody>
                                <TableRow className="bg-blue-50/30">
                                    <TableCell className="font-bold">SALDO ANTERIOR BANCO</TableCell>
                                    <TableCell><Input type="number" className="text-right" value={saldoAnteriorBanco} onChange={e=>setSaldoAnteriorBanco(Number(e.target.value))}/></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>INGRESOS ORDINARIOS (BANCO)</TableCell>
                                    <TableCell className="text-right font-bold">Bs. {formatCurrency(ingresosOrdinariosBanco)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>INGRESOS ORDINARIOS (CAJA PRINCIPAL)</TableCell>
                                    <TableCell className="text-right font-bold text-amber-600">Bs. {formatCurrency(ingresosOrdinariosEfectivo)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-slate-900 text-white p-6 rounded-[2rem] border-none shadow-xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#F28705]">Saldo Disponible en Banco</p>
                        <p className="text-3xl font-black italic mt-2">Bs. {formatCurrency(disponibilidadBancaria)}</p>
                    </Card>
                    <div className="space-y-4">
                        <Card className="p-4 bg-amber-50 border-amber-200 rounded-2xl">
                            <p className="text-[10px] font-black uppercase text-amber-700">Saldo Dinámico Caja Principal (Bs.)</p>
                            <p className="text-xl font-black">Bs. {formatCurrency(cajaPrincipalBS)}</p>
                        </Card>
                        <Card className="p-4 bg-blue-50 border-blue-200 rounded-2xl">
                            <p className="text-[10px] font-black uppercase text-blue-700">Saldo Dinámico Caja Chica (Bs.)</p>
                            <p className="text-xl font-black">Bs. {formatCurrency(cajaChicaBS)}</p>
                        </Card>
                    </div>
                </div>

                <CardFooter className="flex justify-end p-0">
                    <Button onClick={handleSave} disabled={saving} className="bg-primary h-12 rounded-xl font-black uppercase px-8 text-white">
                        {saving ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar Balance del Mes
                    </Button>
                </CardFooter>
            </>}
        </div>
    );
}

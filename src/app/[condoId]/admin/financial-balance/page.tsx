'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Save, Plus, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth } from 'date-fns';
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
    const [egresosTesorería, setEgresosTesorería] = useState<{ concepto: string, monto: number }[]>([]);
    
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
                const fromDate = startOfMonth(new Date(year, month, 1));
                const toDate = endOfMonth(fromDate);

                // 1. Obtener Ingresos desde Pagos Aprobados
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

                // 2. Obtener Egresos desde Tesorería (Transacciones tipo 'egreso')
                const tQuery = query(
                    collection(db, 'condominios', workingCondoId, 'transacciones'), 
                    where('fecha', '>=', fromDate), 
                    where('fecha', '<=', toDate), 
                    where('tipo', '==', 'egreso'),
                    orderBy('fecha', 'desc')
                );
                const tSnap = await getDocs(tQuery);
                setEgresosTesorería(tSnap.docs.map(d => ({ 
                    concepto: d.data().descripcion, 
                    monto: d.data().monto 
                })));

            } catch (error) { 
                console.error("Error cargando datos del balance:", error); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchAutomaticData();
    }, [selectedMonth, selectedYear, workingCondoId]);

    const totalIngresosMes = useMemo(() => ingresosOrdinariosBanco + ingresosOrdinariosEfectivo + otrosIngresos.reduce((sum, i) => sum + i.monto, 0), [ingresosOrdinariosBanco, ingresosOrdinariosEfectivo, otrosIngresos]);
    const totalEgresosMes = useMemo(() => egresosTesorería.reduce((sum, e) => sum + e.monto, 0), [egresosTesorería]);
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
                egresos: egresosTesorería,
                estadoFinanciero: { saldoNeto: disponibilidadBancaria, saldoCajaPrincipal: cajaPrincipalBS, saldoCajaChica: cajaChicaBS },
                notas, updatedAt: serverTimestamp()
            });
            toast({ title: "Balance Guardado" });
        } catch (e) { toast({ variant: 'destructive', title: "Error" }); } finally { setSaving(false); }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex justify-between items-end">
                <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">Balance <span className="text-[#0081c9]">Financiero</span></h1>
                <div className="flex gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-32 bg-white text-slate-900 border-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent>{Array.from({length:12}, (_,i)=>(<SelectItem key={i+1} value={String(i+1)}>{format(new Date(2000,i), 'MMMM', {locale:es})}</SelectItem>))}</SelectContent>
                    </Select>
                    <Input className="w-24 bg-white text-slate-900 border-slate-200" type="number" value={selectedYear} onChange={(e)=>setSelectedYear(e.target.value)} />
                </div>
            </div>

            {loading ? <Loader2 className="animate-spin mx-auto h-10 w-10 text-[#0081c9]" /> : <>
                <Card className="rounded-[2rem] border-none shadow-sm overflow-hidden bg-white">
                    <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ingresos del Período</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableBody>
                                <TableRow className="bg-blue-50/30">
                                    <TableCell className="font-bold text-slate-900">SALDO ANTERIOR BANCO</TableCell>
                                    <TableCell><Input type="number" className="text-right bg-white font-bold" value={saldoAnteriorBanco} onChange={e=>setSaldoAnteriorBanco(Number(e.target.value))}/></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="text-slate-700">INGRESOS ORDINARIOS (BANCO)</TableCell>
                                    <TableCell className="text-right font-black text-slate-900">Bs. {formatCurrency(ingresosOrdinariosBanco)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="text-slate-700">INGRESOS ORDINARIOS (CAJA PRINCIPAL)</TableCell>
                                    <TableCell className="text-right font-black text-amber-600">Bs. {formatCurrency(ingresosOrdinariosEfectivo)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-slate-900 text-white p-8 rounded-[2rem] border-none shadow-xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#f59e0b]">Disponibilidad Estimada en Banco</p>
                        <p className="text-4xl font-black italic mt-2">Bs. {formatCurrency(disponibilidadBancaria)}</p>
                        <p className="text-[9px] font-bold text-slate-400 mt-4 uppercase">Calculado: (Saldo Ant. + Ingresos Banco) - Egresos Tesorería</p>
                    </Card>
                    <div className="space-y-4">
                        <Card className="p-6 bg-white border-none shadow-sm rounded-[2rem]">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Saldo Real Caja Principal (Bs.)</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">Bs. {formatCurrency(cajaPrincipalBS)}</p>
                        </Card>
                        <Card className="p-6 bg-white border-none shadow-sm rounded-[2rem]">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Saldo Real Caja Chica (Bs.)</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">Bs. {formatCurrency(cajaChicaBS)}</p>
                        </Card>
                    </div>
                </div>

                <Card className="rounded-[2rem] border-none shadow-sm overflow-hidden bg-white mt-6">
                    <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">Egresos Registrados en Tesorería</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-slate-700 font-black text-[10px]">CONCEPTO</TableHead>
                                    <TableHead className="text-right text-slate-700 font-black text-[10px]">MONTO (Bs.)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {egresosTesorería.length === 0 ? (
                                    <TableRow><TableCell colSpan={2} className="text-center py-10 text-slate-400 italic">No hay egresos registrados en este período.</TableCell></TableRow>
                                ) : egresosTesorería.map((egreso, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="text-slate-900 font-bold uppercase text-xs">{egreso.concepto}</TableCell>
                                        <TableCell className="text-right font-black text-red-600">Bs. {formatCurrency(egreso.monto)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow className="bg-slate-50">
                                    <TableCell className="font-black text-slate-900 text-xs">TOTAL EGRESOS DEL MES</TableCell>
                                    <TableCell className="text-right font-black text-red-700 text-lg">Bs. {formatCurrency(totalEgresosMes)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>

                <div className="space-y-2 mt-6">
                    <Label className="text-[10px] font-black uppercase text-slate-500 ml-4">Observaciones del Mes</Label>
                    <Textarea 
                        className="rounded-[2rem] bg-white border-slate-200 text-slate-900 font-medium p-6 min-h-[120px]" 
                        value={notas} 
                        onChange={e => setNotas(e.target.value)} 
                        placeholder="Escriba notas relevantes sobre el balance aquí..."
                    />
                </div>

                <CardFooter className="flex justify-end p-0 pt-6">
                    <Button onClick={handleSave} disabled={saving} className="bg-[#0081c9] hover:bg-[#006ba8] h-14 rounded-2xl font-black uppercase px-10 text-white shadow-lg shadow-blue-500/20">
                        {saving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-5 w-5" />} Guardar Balance del Período
                    </Button>
                </CardFooter>
            </>}
        </div>
    );
}

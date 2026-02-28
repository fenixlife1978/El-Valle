"use client";

import React, { useState, useEffect, useMemo, use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, Timestamp, writeBatch, where, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    PlusCircle, Trash2, FileText, Download, 
    TrendingUp, TrendingDown, Wallet, Calendar as CalendarIcon, 
    Loader2, Building2, Coins 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";

interface Transaction {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    type: 'ingreso' | 'egreso';
    source?: 'automatic' | 'manual';
    reference?: string;
}

const formatCurrency = (num: number) => {
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function MainCashManager({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const urlCondoId = resolvedParams.condoId;
    const { user, ownerData, companyInfo } = useAuth();
    const { toast } = useToast();
    const workingCondoId = ownerData?.workingCondoId || ownerData?.condominioId || urlCondoId;

    const [manualMovements, setManualMovements] = useState<Transaction[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Form states
    const [dialogDate, setDialogDate] = useState<Date | undefined>(new Date());
    const [dialogAmount, setDialogAmount] = useState('');
    const [dialogDescription, setDialogDescription] = useState('');

    const [filterMonth, setFilterMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());

    useEffect(() => {
        if (!workingCondoId) return;

        const unsubManual = onSnapshot(
            query(collection(db, 'condominios', workingCondoId, 'cajaPrincipal_movimientos'), orderBy('date', 'desc')),
            (snap) => setManualMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)))
        );

        const unsubPayments = onSnapshot(
            query(collection(db, 'condominios', workingCondoId, 'payments'), 
                  where('paymentMethod', '==', 'efectivo_bs'), 
                  where('status', '==', 'aprobado')),
            (snap) => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );

        setLoading(false);
        return () => { unsubManual(); unsubPayments(); };
    }, [workingCondoId]);

    const allTransactions = useMemo(() => {
        const autoIngresos: Transaction[] = payments.map(p => ({
            id: p.id,
            date: p.paymentDate,
            description: `PAGO DE: ${p.beneficiaries?.[0]?.ownerName || 'PROPIETARIO'}`,
            amount: p.totalAmount,
            type: 'ingreso',
            source: 'automatic',
            reference: p.reference
        }));

        return [...autoIngresos, ...manualMovements].sort((a, b) => b.date.toMillis() - a.date.toMillis());
    }, [payments, manualMovements]);

    const totals = useMemo(() => {
        const ingresos = allTransactions.filter(t => t.type === 'ingreso').reduce((acc, t) => acc + t.amount, 0);
        const egresos = allTransactions.filter(t => t.type === 'egreso').reduce((acc, t) => acc + t.amount, 0);
        return { ingresos, egresos, saldo: ingresos - egresos };
    }, [allTransactions]);

    const filteredTransactions = useMemo(() => {
        return allTransactions.filter(t => {
            const d = t.date.toDate();
            return (d.getMonth() + 1).toString().padStart(2, '0') === filterMonth && 
                   d.getFullYear().toString() === filterYear;
        }).sort((a, b) => a.date.toMillis() - b.date.toMillis());
    }, [allTransactions, filterMonth, filterYear]);

    const handleSaveExpense = async () => {
        if (!workingCondoId || !dialogAmount || !dialogDescription || !dialogDate) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'condominios', workingCondoId, 'cajaPrincipal_movimientos'), {
                date: Timestamp.fromDate(dialogDate),
                description: dialogDescription.toUpperCase(),
                amount: parseFloat(dialogAmount),
                type: 'egreso',
                source: 'manual',
                createdBy: user?.email
            });
            setIsDialogOpen(false);
            setDialogAmount('');
            setDialogDescription('');
            toast({ title: "Egreso Registrado" });
        } catch (e) {
            toast({ variant: 'destructive', title: "Error al guardar" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExportPdf = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("LIBRO DE CAJA PRINCIPAL (EFECTIVO BS)", 14, 20);
        
        autoTable(doc, {
            head: [['Fecha', 'Descripción', 'Referencia', 'Ingreso', 'Egreso']],
            body: filteredTransactions.map(t => [
                format(t.date.toDate(), 'dd/MM/yyyy'),
                t.description,
                t.reference || 'MANUAL',
                t.type === 'ingreso' ? formatCurrency(t.amount) : '',
                t.type === 'egreso' ? formatCurrency(t.amount) : '',
            ]),
            startY: 30,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42] }
        });

        doc.save(`Caja_Principal_${filterYear}_${filterMonth}.pdf`);
    };

    if (loading) return <div className="p-20 text-center animate-pulse">Cargando Caja Principal...</div>;

    return (
        <div className="space-y-8 p-4 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                        Caja <span className="text-[#F28705]">Principal</span>
                    </h2>
                    <p className="text-slate-500 font-bold mt-2 text-xs uppercase tracking-widest flex items-center gap-2">
                        <Coins className="h-4 w-4 text-[#F28705]" /> Libro de Efectivo en Bolívares
                    </p>
                </div>
                <Button onClick={() => setIsDialogOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-12 px-6 font-black uppercase italic text-xs">
                    <PlusCircle className="mr-2 h-4 w-4" /> Registrar Egreso Manual
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="rounded-[2rem] border-none shadow-xl bg-green-50">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-green-600">Total Ingresos</CardTitle></CardHeader>
                    <CardContent><p className="text-3xl font-black text-green-700">Bs. {formatCurrency(totals.ingresos)}</p></CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-xl bg-red-50">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-red-600">Total Egresos</CardTitle></CardHeader>
                    <CardContent><p className="text-3xl font-black text-red-700">Bs. {formatCurrency(totals.egresos)}</p></CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-xl bg-slate-900 text-white">
                    <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-[#F28705]">Saldo en Bóveda</CardTitle></CardHeader>
                    <CardContent><p className="text-3xl font-black italic">Bs. {formatCurrency(totals.saldo)}</p></CardContent>
                </Card>
            </div>

            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
                <CardHeader className="bg-slate-50 border-b p-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <CardTitle className="text-lg font-black uppercase italic">Movimientos del Período</CardTitle>
                        <div className="flex items-center gap-2">
                            <Select value={filterMonth} onValueChange={setFilterMonth}>
                                <SelectTrigger className="w-32 rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>{Array.from({length:12}, (_,i)=>(i+1).toString().padStart(2,'0')).map(m=><SelectItem key={m} value={m}>{format(new Date(2000, parseInt(m)-1), 'MMMM', {locale:es})}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input className="w-24 rounded-xl" type="number" value={filterYear} onChange={e=>setFilterYear(e.target.value)} />
                            <Button variant="outline" size="icon" onClick={handleExportPdf} className="rounded-xl h-10 w-10"><Download className="h-4 w-4"/></Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-100/50">
                                <TableHead className="font-black uppercase text-[10px] px-8">Fecha</TableHead>
                                <TableHead className="font-black uppercase text-[10px]">Descripción</TableHead>
                                <TableHead className="text-right font-black uppercase text-[10px]">Ingreso</TableHead>
                                <TableHead className="text-right font-black uppercase text-[10px]">Egreso</TableHead>
                                <TableHead className="text-right font-black uppercase text-[10px] pr-8">Saldo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTransactions.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-20 text-slate-400 font-bold italic">Sin movimientos en este período</TableCell></TableRow>
                            ) : (
                                filteredTransactions.map((t, idx) => (
                                    <TableRow key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                                        <TableCell className="px-8 font-bold text-slate-500 text-xs">{format(t.date.toDate(), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>
                                            <p className="font-black text-slate-900 uppercase text-xs italic">{t.description}</p>
                                            <p className="text-[9px] font-bold text-slate-400">{t.source === 'automatic' ? `REF: ${t.reference}` : 'MOVIMIENTO MANUAL'}</p>
                                        </TableCell>
                                        <TableCell className="text-right font-black text-green-600">{t.type === 'ingreso' ? `+ ${formatCurrency(t.amount)}` : '-'}</TableCell>
                                        <TableCell className="text-right font-black text-red-600">{t.type === 'egreso' ? `- ${formatCurrency(t.amount)}` : '-'}</TableCell>
                                        <TableCell className="text-right font-black pr-8">Bs. {formatCurrency(filteredTransactions.slice(0, idx+1).reduce((acc, curr) => curr.type === 'ingreso' ? acc + curr.amount : acc - curr.amount, 0))}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Registrar <span className="text-[#F28705]">Gasto de Caja</span></DialogTitle>
                        <DialogDescription>Este monto se descontará directamente del saldo físico disponible.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase ml-2">Fecha</Label>
                            <Popover>
                                <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start rounded-xl font-bold"><CalendarIcon className="mr-2 h-4 w-4"/> {dialogDate ? format(dialogDate, "PPP", {locale:es}) : "Seleccionar"}</Button></PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dialogDate} onSelect={setDialogDate} locale={es} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase ml-2">Monto del Egreso (Bs.)</Label>
                            <Input type="number" placeholder="0.00" value={dialogAmount} onChange={e=>setDialogAmount(e.target.value)} className="rounded-xl font-black text-lg h-12" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase ml-2">Descripción / Concepto</Label>
                            <Input placeholder="EJ: COMPRA DE BOMBILLOS" value={dialogDescription} onChange={e=>setDialogDescription(e.target.value)} className="rounded-xl font-bold uppercase h-12" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveExpense} disabled={isSubmitting} className="w-full bg-[#F28705] hover:bg-orange-600 text-white h-12 rounded-xl font-black uppercase italic">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Guardar Egreso"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

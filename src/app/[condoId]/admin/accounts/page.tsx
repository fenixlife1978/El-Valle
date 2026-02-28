
'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    runTransaction, 
    Timestamp, 
    where,
    addDoc,
    serverTimestamp,
    writeBatch
} from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    PlusCircle, 
    ArrowRightLeft, 
    Download, 
    Loader2, 
    TrendingUp, 
    TrendingDown, 
    Wallet, 
    Landmark, 
    History,
    Search,
    Trash2,
    Calendar as CalendarIcon,
    Building2,
    CheckCircle2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// --- Tipos ---
interface Account {
    id: string;
    nombre: string;
    saldoActual: number;
    tipo: 'banco' | 'efectivo' | 'otros';
}

interface Transaction {
    id: string;
    fecha: Timestamp;
    monto: number;
    tipo: 'ingreso' | 'egreso';
    cuentaId: string;
    nombreCuenta: string;
    descripcion: string;
    referencia?: string;
}

const formatCurrency = (num: number) => {
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AccountsPage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const condoId = resolvedParams.condoId;
    const { user, companyInfo } = useAuth();
    const { toast } = useToast();

    // Estados
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // UI States
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
    const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);

    // Form States
    const [accountForm, setAccountForm] = useState({ nombre: '', tipo: 'banco' as any, saldoInicial: '0' });
    const [transForm, setTransactionForm] = useState({
        monto: '',
        tipo: 'egreso' as 'ingreso' | 'egreso',
        cuentaId: '',
        descripcion: '',
        referencia: '',
        fecha: new Date()
    });
    const [transferForm, setTransferForm] = useState({
        origenId: '',
        destinoId: '',
        monto: '',
        descripcion: 'Transferencia entre cuentas'
    });

    const [dateRange, setDateRange] = useState({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });

    // --- Carga de Datos en Tiempo Real ---
    useEffect(() => {
        if (!condoId) return;

        const unsubAccounts = onSnapshot(
            collection(db, 'condominios', condoId, 'cuentas'),
            (snap) => {
                setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
                setLoading(false);
            }
        );

        const qTx = query(
            collection(db, 'condominios', condoId, 'transacciones'),
            orderBy('fecha', 'desc')
        );

        const unsubTx = onSnapshot(qTx, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
        });

        return () => { unsubAccounts(); unsubTx(); };
    }, [condoId]);

    // --- Lógica de Transacciones ---
    const handleSaveAccount = async () => {
        if (!accountForm.nombre) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'condominios', condoId, 'cuentas'), {
                nombre: accountForm.nombre.toUpperCase(),
                tipo: accountForm.tipo,
                saldoActual: parseFloat(accountForm.saldoInicial) || 0,
                createdAt: serverTimestamp()
            });
            toast({ title: "Cuenta creada" });
            setIsAccountDialogOpen(false);
            setAccountForm({ nombre: '', tipo: 'banco', saldoInicial: '0' });
        } catch (e) {
            toast({ variant: 'destructive', title: "Error al crear cuenta" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveTransaction = async () => {
        if (!transForm.cuentaId || !transForm.monto || !transForm.descripcion) return;
        setIsSubmitting(true);

        const montoNum = parseFloat(transForm.monto);
        const cuentaRef = doc(db, 'condominios', condoId, 'cuentas', transForm.cuentaId);
        const transColRef = collection(db, 'condominios', condoId, 'transacciones');

        try {
            await runTransaction(db, async (transaction) => {
                const accountDoc = await transaction.get(cuentaRef);
                if (!accountDoc.exists()) throw new Error("La cuenta no existe.");

                const currentSaldo = accountDoc.data().saldoActual || 0;
                const newSaldo = transForm.tipo === 'ingreso' ? currentSaldo + montoNum : currentSaldo - montoNum;

                if (transForm.tipo === 'egreso' && newSaldo < 0) {
                    throw new Error("Saldo insuficiente en la cuenta seleccionada.");
                }

                // 1. Crear transacción
                const newTransRef = doc(transColRef);
                transaction.set(newTransRef, {
                    monto: montoNum,
                    tipo: transForm.tipo,
                    cuentaId: transForm.cuentaId,
                    nombreCuenta: accountDoc.data().nombre,
                    descripcion: transForm.descripcion.toUpperCase(),
                    referencia: transForm.referencia.toUpperCase(),
                    fecha: Timestamp.fromDate(transForm.fecha),
                    createdBy: user?.email,
                    createdAt: serverTimestamp()
                });

                // 2. Actualizar Saldo Cuenta
                transaction.update(cuentaRef, { saldoActual: newSaldo });
            });

            toast({ title: "Transacción procesada con éxito" });
            setIsTransactionDialogOpen(false);
            setTransactionForm({ monto: '', tipo: 'egreso', cuentaId: '', descripcion: '', referencia: '', fecha: new Date() });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Fallo en transacción", description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTransfer = async () => {
        if (!transferForm.origenId || !transferForm.destinoId || !transferForm.monto) return;
        if (transferForm.origenId === transferForm.destinoId) {
            toast({ variant: 'destructive', title: "Error", description: "La cuenta de origen y destino no pueden ser iguales." });
            return;
        }

        setIsSubmitting(true);
        const montoNum = parseFloat(transferForm.monto);
        const batch = writeBatch(db);

        try {
            await runTransaction(db, async (transaction) => {
                const srcRef = doc(db, 'condominios', condoId, 'cuentas', transferForm.origenId);
                const destRef = doc(db, 'condominios', condoId, 'cuentas', transferForm.destinoId);
                
                const [srcSnap, destSnap] = await Promise.all([transaction.get(srcRef), transaction.get(destRef)]);
                
                if (!srcSnap.exists() || !destSnap.exists()) throw new Error("Una de las cuentas no existe.");
                
                const srcSaldo = srcSnap.data().saldoActual || 0;
                if (srcSaldo < montoNum) throw new Error("Saldo insuficiente en cuenta de origen.");

                const destSaldo = destSnap.data().saldoActual || 0;

                // Registro Salida
                const outRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                transaction.set(outRef, {
                    monto: montoNum,
                    tipo: 'egreso',
                    cuentaId: transferForm.origenId,
                    nombreCuenta: srcSnap.data().nombre,
                    descripcion: `TRANSFERENCIA ENVIADA: ${transferForm.descripcion.toUpperCase()}`,
                    fecha: Timestamp.now(),
                    category: 'transferencia'
                });

                // Registro Entrada
                const inRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                transaction.set(inRef, {
                    monto: montoNum,
                    tipo: 'ingreso',
                    cuentaId: transferForm.destinoId,
                    nombreCuenta: destSnap.data().nombre,
                    descripcion: `TRANSFERENCIA RECIBIDA: ${transferForm.descripcion.toUpperCase()}`,
                    fecha: Timestamp.now(),
                    category: 'transferencia'
                });

                // Actualizar Saldos
                transaction.update(srcRef, { saldoActual: srcSaldo - montoNum });
                transaction.update(destRef, { saldoActual: destSaldo + montoNum });
            });

            toast({ title: "Transferencia completada" });
            setIsTransferDialogOpen(false);
            setTransferForm({ origenId: '', destinoId: '', monto: '', descripcion: 'Transferencia entre cuentas' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Error en transferencia", description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Reporte PDF ---
    const handleGeneratePDF = async () => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        
        const doc = new jsPDF();
        const info = companyInfo || { name: 'EFAS CondoSys', rif: 'J-00000000-0' };

        // Header
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14).setFont('helvetica', 'bold').text(info.name.toUpperCase(), 14, 15);
        doc.setFontSize(8).text(`RIF: ${info.rif}`, 14, 22);
        doc.setFontSize(10).text("REPORTE DE MOVIMIENTOS Y TESORERÍA", 196, 18, { align: 'right' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12).text(`Período: ${format(dateRange.from, 'dd/MM/yyyy')} al ${format(dateRange.to, 'dd/MM/yyyy')}`, 14, 45);

        const filtered = transactions.filter(tx => {
            const d = tx.fecha.toDate();
            return d >= dateRange.from && d <= dateRange.to;
        }).sort((a,b) => a.fecha.toMillis() - b.fecha.toMillis());

        autoTable(doc, {
            startY: 55,
            head: [['FECHA', 'CUENTA', 'DESCRIPCIÓN', 'TIPO', 'MONTO']],
            body: filtered.map(t => [
                format(t.fecha.toDate(), 'dd/MM/yyyy'),
                t.nombreCuenta,
                t.descripcion,
                t.tipo.toUpperCase(),
                formatCurrency(t.monto)
            ]),
            headStyles: { fillColor: [15, 23, 42] }
        });

        doc.save(`Reporte_Tesoreria_${format(new Date(), 'yyyy_MM_dd')}.pdf`);
    };

    if (loading) return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-[#F28705]" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 animate-pulse italic">
                EFAS CONDOSYS: Actualizando Datos
            </p>
        </div>
    );

    return (
        <div className="space-y-8 p-4 md:p-8 min-h-screen bg-slate-50 font-montserrat">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                        Cuentas y <span className="text-[#F28705]">Tesorería</span>
                    </h2>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
                        <Wallet className="h-3 w-3" /> Control de Disponibilidad y Flujo de Caja
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleGeneratePDF} variant="outline" className="font-bold uppercase text-[10px] rounded-xl h-12">
                        <Download className="mr-2 h-4 w-4" /> Reporte Período
                    </Button>
                    <Button onClick={() => setIsTransferDialogOpen(true)} variant="secondary" className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-[10px] rounded-xl h-12">
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Transferir
                    </Button>
                    <Button onClick={() => setIsTransactionDialogOpen(true)} className="bg-[#F28705] hover:bg-[#d17504] text-white font-black uppercase text-[10px] rounded-xl h-12 shadow-lg shadow-orange-500/20">
                        <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Movimiento
                    </Button>
                </div>
            </div>

            {/* Resumen de Cuentas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {accounts.length === 0 ? (
                    <Card className="col-span-full p-8 border-dashed flex flex-col items-center justify-center">
                        <p className="text-slate-400 font-bold italic mb-4">No hay cuentas configuradas</p>
                        <Button onClick={() => setIsAccountDialogOpen(true)} variant="outline">Crear Primera Cuenta</Button>
                    </Card>
                ) : (
                    accounts.map(acc => (
                        <Card key={acc.id} className="rounded-[2rem] border-none shadow-sm hover:shadow-xl transition-all duration-300 group">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        {acc.tipo === 'banco' ? <Landmark className="h-3 w-3 text-sky-500" /> : <Wallet className="h-3 w-3 text-emerald-500" />}
                                        {acc.tipo}
                                    </span>
                                    <BadgeInfo className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm font-bold text-slate-500 uppercase truncate mb-1">{acc.nombre}</div>
                                <div className="text-2xl font-black italic tracking-tight text-slate-900">
                                    Bs. {formatCurrency(acc.saldoActual)}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
                {accounts.length > 0 && (
                    <Button 
                        variant="ghost" 
                        onClick={() => setIsAccountDialogOpen(true)}
                        className="h-full border-2 border-dashed rounded-[2rem] hover:bg-slate-100 flex flex-col items-center justify-center py-8"
                    >
                        <PlusCircle className="h-6 w-6 text-slate-300 mb-2" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nueva Cuenta</span>
                    </Button>
                )}
            </div>

            {/* Historial de Transacciones */}
            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
                <CardHeader className="bg-slate-900 text-white p-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <CardTitle className="text-xl font-black uppercase italic tracking-tight flex items-center gap-3">
                            <History className="text-[#F28705]" /> Historial Centralizado
                        </CardTitle>
                        <div className="flex items-center gap-2 bg-white/10 p-1 rounded-xl">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" className="h-9 text-[10px] font-bold text-white hover:bg-white/20">
                                        {format(dateRange.from, 'dd MMM', {locale: es})} - {format(dateRange.to, 'dd MMM', {locale: es})}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        selected={{ from: dateRange.from, to: dateRange.to }}
                                        onSelect={(range: any) => range && setDateRange({ from: range.from, to: range.to || range.from })}
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50 hover:bg-transparent">
                                    <TableHead className="text-[10px] font-black uppercase px-8 h-14">Fecha</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase">Cuenta</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase">Descripción</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase px-8">Monto (Bs.)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-20 text-slate-400 italic">No se registran movimientos</TableCell></TableRow>
                                ) : (
                                    transactions.map(tx => (
                                        <TableRow key={tx.id} className="hover:bg-slate-50 transition-colors border-b last:border-0">
                                            <TableCell className="px-8 py-5 font-bold text-slate-500 text-xs">
                                                {format(tx.fecha.toDate(), 'dd/MM/yy HH:mm')}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[9px] font-black uppercase bg-slate-100">{tx.nombreCuenta}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-black text-slate-900 uppercase italic text-xs">{tx.descripcion}</div>
                                                <div className="text-[9px] font-bold text-slate-400">REF: {tx.referencia || 'N/A'}</div>
                                            </TableCell>
                                            <TableCell className={cn("text-right font-black italic text-lg px-8", tx.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600')}>
                                                {tx.tipo === 'ingreso' ? '+' : '-'} {formatCurrency(tx.monto)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* --- Diálogos --- */}

            {/* Nueva Cuenta */}
            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Nueva <span className="text-[#F28705]">Cuenta</span></DialogTitle>
                        <DialogDescription>Añada una cuenta bancaria o caja física.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Cuenta</Label>
                            <Input placeholder="Ej: BANCO DE VENEZUELA" value={accountForm.nombre} onChange={e => setAccountForm({...accountForm, nombre: e.target.value})} className="rounded-xl h-12 font-bold" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Tipo</Label>
                                <Select value={accountForm.tipo} onValueChange={v => setAccountForm({...accountForm, tipo: v as any})}>
                                    <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="banco">Banco</SelectItem>
                                        <SelectItem value="efectivo">Efectivo</SelectItem>
                                        <SelectItem value="otros">Otros</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Saldo Inicial</Label>
                                <Input type="number" value={accountForm.saldoInicial} onChange={e => setAccountForm({...accountForm, saldoInicial: e.target.value})} className="rounded-xl h-12 font-bold" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveAccount} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black uppercase h-12 rounded-xl">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Crear Cuenta"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Nuevo Movimiento */}
            <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Registrar <span className="text-[#F28705]">Movimiento</span></DialogTitle>
                        <DialogDescription>Afecta el saldo de la cuenta de forma instantánea.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Tipo</Label>
                                <Select value={transForm.tipo} onValueChange={(v: any) => setTransactionForm({...transForm, tipo: v})}>
                                    <SelectTrigger className="rounded-xl h-12 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ingreso" className="text-green-600 font-bold">Ingreso (+)</SelectItem>
                                        <SelectItem value="egreso" className="text-red-600 font-bold">Egreso (-)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Cuenta Afectada</Label>
                                <Select value={transForm.cuentaId} onValueChange={v => setTransactionForm({...transForm, cuentaId: v})}>
                                    <SelectTrigger className="rounded-xl h-12 font-bold"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                    <SelectContent>
                                        {accounts.map(acc => (
                                            <SelectItem key={acc.id} value={acc.id}>{acc.nombre} (Bs. {formatCurrency(acc.saldoActual)})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Monto</Label>
                                <Input type="number" placeholder="0.00" value={transForm.monto} onChange={e => setTransactionForm({...transForm, monto: e.target.value})} className="rounded-xl h-12 font-black text-lg" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Fecha</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full h-12 rounded-xl justify-start font-bold">
                                            <CalendarIcon className="mr-2 h-4 w-4" /> {format(transForm.fecha, 'dd/MM/yyyy')}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={transForm.fecha} onSelect={(d: any) => d && setTransactionForm({...transForm, fecha: d})} locale={es}/></PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Descripción</Label>
                            <Input placeholder="Ej: Pago de servicios públicos" value={transForm.descripcion} onChange={e => setTransactionForm({...transForm, descripcion: e.target.value})} className="rounded-xl h-12 font-bold" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Referencia (Opcional)</Label>
                            <Input placeholder="Nº de comprobante" value={transForm.referencia} onChange={e => setTransactionForm({...transForm, referencia: e.target.value})} className="rounded-xl h-12" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveTransaction} disabled={isSubmitting} className="w-full bg-[#F28705] hover:bg-orange-600 text-white font-black uppercase h-14 rounded-2xl shadow-xl transition-all active:scale-95">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                            Procesar Movimiento
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Transferencia */}
            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Trasladar <span className="text-[#F28705]">Fondos</span></DialogTitle>
                        <DialogDescription>Mueve dinero entre tus cuentas de forma atómica.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Cuenta Origen</Label>
                                <Select value={transferForm.origenId} onValueChange={v => setTransferForm({...transferForm, origenId: v})}>
                                    <SelectTrigger className="rounded-xl h-12 font-bold"><SelectValue placeholder="Sale de..." /></SelectTrigger>
                                    <SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.nombre}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Cuenta Destino</Label>
                                <Select value={transferForm.destinoId} onValueChange={v => setTransferForm({...transferForm, destinoId: v})}>
                                    <SelectTrigger className="rounded-xl h-12 font-bold"><SelectValue placeholder="Entra a..." /></SelectTrigger>
                                    <SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.nombre}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Monto a Trasladar</Label>
                            <Input type="number" placeholder="0.00" value={transferForm.monto} onChange={e => setTransferForm({...transferForm, monto: e.target.value})} className="rounded-xl h-12 font-black text-xl" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Motivo / Descripción</Label>
                            <Input value={transferForm.descripcion} onChange={e => setTransferForm({...transferForm, descripcion: e.target.value})} className="rounded-xl h-12 font-bold" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleTransfer} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black uppercase h-14 rounded-2xl">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Ejecutar Traslado"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

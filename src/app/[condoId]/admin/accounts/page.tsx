
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
    addDoc,
    serverTimestamp,
    deleteDoc,
    updateDoc,
    increment,
    getDocs,
    where
} from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    PlusCircle, 
    ArrowRightLeft, 
    Download, 
    Loader2, 
    Wallet, 
    Landmark, 
    History,
    Trash2,
    Calendar as CalendarIcon,
    CheckCircle2,
    Edit,
    MoreVertical,
    ShieldCheck
} from 'lucide-react';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AccountsPage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const condoId = resolvedParams.condoId;
    const { user, companyInfo } = useAuth();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
    const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

    const [isEditTxDialogOpen, setIsEditTxDialogOpen] = useState(false);
    const [isDeleteTxDialogOpen, setIsDeleteTxDialogOpen] = useState(false);
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
    const [editTxData, setEditTxData] = useState({ descripcion: '', referencia: '' });

    const [accountForm, setAccountForm] = useState({ nombre: '', tipo: 'banco' as any, saldoInicial: '0' });
    const [transForm, setTransactionForm] = useState({ monto: '', tipo: 'egreso' as 'ingreso' | 'egreso', cuentaId: '', descripcion: '', referencia: '', fecha: new Date() });
    const [transferForm, setTransferForm] = useState({ origenId: '', destinoId: '', monto: '', descripcion: 'Transferencia entre cuentas' });

    const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });

    useEffect(() => {
        if (!condoId) return;
        const unsubAccounts = onSnapshot(collection(db, 'condominios', condoId, 'cuentas'), (snap) => {
            setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
            setLoading(false);
        });
        const qTx = query(collection(db, 'condominios', condoId, 'transacciones'), orderBy('fecha', 'desc'));
        const unsubTx = onSnapshot(qTx, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
        });
        return () => { unsubAccounts(); unsubTx(); };
    }, [condoId]);

    const handleSaveAccount = async () => {
        if (!accountForm.nombre) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'condominios', condoId, 'cuentas'), {
                nombre: accountForm.nombre.toUpperCase().trim(),
                tipo: accountForm.tipo,
                saldoActual: parseFloat(accountForm.saldoInicial) || 0,
                createdAt: serverTimestamp()
            });
            toast({ title: "Cuenta creada" });
            setIsAccountDialogOpen(false);
            setAccountForm({ nombre: '', tipo: 'banco', saldoInicial: '0' });
        } catch (e) { toast({ variant: 'destructive', title: "Error al crear cuenta" }); }
        finally { setIsSubmitting(false); }
    };

    const handleDeleteAccount = async () => {
        if (!accountToDelete || !condoId) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, 'condominios', condoId, 'cuentas', accountToDelete.id));
            toast({ title: "Cuenta eliminada correctamente" });
            setIsDeleteDialogOpen(false);
            setAccountToDelete(null);
        } catch (e) { toast({ variant: 'destructive', title: "Error al eliminar" }); }
        finally { setIsSubmitting(false); }
    };

    const handleSaveTransaction = async () => {
        if (!transForm.cuentaId || !transForm.monto || !transForm.descripcion) return;
        setIsSubmitting(true);
        const montoNum = parseFloat(transForm.monto);
        const cuentaRef = doc(db, 'condominios', condoId, 'cuentas', transForm.cuentaId);
        try {
            await runTransaction(db, async (transaction) => {
                const accountDoc = await transaction.get(cuentaRef);
                if (!accountDoc.exists()) throw new Error("La cuenta no existe.");
                
                const newTransRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                transaction.set(newTransRef, {
                    monto: montoNum, tipo: transForm.tipo, cuentaId: transForm.cuentaId,
                    nombreCuenta: accountDoc.data().nombre, descripcion: transForm.descripcion.toUpperCase(),
                    referencia: transForm.referencia.toUpperCase(), fecha: Timestamp.fromDate(transForm.fecha),
                    createdBy: user?.email, createdAt: serverTimestamp()
                });
                transaction.update(cuentaRef, { saldoActual: increment(transForm.tipo === 'ingreso' ? montoNum : -montoNum) });
            });
            toast({ title: "Movimiento procesado con éxito" });
            setIsTransactionDialogOpen(false);
            setTransactionForm({ monto: '', tipo: 'egreso', cuentaId: '', descripcion: '', referencia: '', fecha: new Date() });
        } catch (error: any) { toast({ variant: 'destructive', title: "Fallo en transacción", description: error.message }); }
        finally { setIsSubmitting(false); }
    };

    const handleDeleteTransaction = async () => {
        if (!selectedTx || !condoId) return;
        setIsSubmitting(true);
        try {
            await runTransaction(db, async (transaction) => {
                const txRef = doc(db, 'condominios', condoId, 'transacciones', selectedTx.id);
                const accRef = doc(db, 'condominios', condoId, 'cuentas', selectedTx.cuentaId);
                
                const adjustment = selectedTx.tipo === 'ingreso' ? -selectedTx.monto : selectedTx.monto;
                transaction.update(accRef, { saldoActual: increment(adjustment) });
                transaction.delete(txRef);
            });
            toast({ title: "Movimiento eliminado", description: "El saldo ha sido revertido automáticamente." });
            setIsDeleteTxDialogOpen(false);
            setSelectedTx(null);
        } catch (error: any) { toast({ variant: 'destructive', title: "Error", description: error.message }); }
        finally { setIsSubmitting(false); }
    };

    const handleUpdateTx = async () => {
        if (!selectedTx || !condoId || !editTxData.descripcion) return;
        setIsSubmitting(true);
        try {
            await updateDoc(doc(db, 'condominios', condoId, 'transacciones', selectedTx.id), {
                descripcion: editTxData.descripcion.toUpperCase(),
                referencia: editTxData.referencia.toUpperCase(),
                updatedAt: serverTimestamp()
            });
            toast({ title: "Movimiento actualizado" });
            setIsEditTxDialogOpen(false);
            setSelectedTx(null);
        } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
        finally { setIsSubmitting(false); }
    };

    const handleTransfer = async () => {
        if (!transferForm.origenId || !transferForm.destinoId || !transferForm.monto) return;
        setIsSubmitting(true);
        const montoNum = parseFloat(transferForm.monto);
        try {
            await runTransaction(db, async (transaction) => {
                const srcRef = doc(db, 'condominios', condoId, 'cuentas', transferForm.origenId);
                const destRef = doc(db, 'condominios', condoId, 'cuentas', transferForm.destinoId);
                const [srcSnap, destSnap] = await Promise.all([transaction.get(srcRef), transaction.get(destRef)]);
                
                if (!srcSnap.exists() || !destSnap.exists()) throw new Error("Cuenta no encontrada.");
                const srcSaldo = srcSnap.data().saldoActual || 0;
                if (srcSaldo < montoNum) throw new Error("Saldo insuficiente en cuenta origen.");

                const transferRef1 = doc(collection(db, 'condominios', condoId, 'transacciones'));
                const transferRef2 = doc(collection(db, 'condominios', condoId, 'transacciones'));

                transaction.set(transferRef1, {
                    monto: montoNum, tipo: 'egreso', cuentaId: transferForm.origenId,
                    nombreCuenta: srcSnap.data().nombre, descripcion: `TRASLADO A ${destSnap.data().nombre}: ${transferForm.descripcion.toUpperCase()}`,
                    fecha: Timestamp.now(), createdAt: serverTimestamp(), createdBy: user?.email
                });
                transaction.set(transferRef2, {
                    monto: montoNum, tipo: 'ingreso', cuentaId: transferForm.destinoId,
                    nombreCuenta: destSnap.data().nombre, descripcion: `RECEPCIÓN DESDE ${srcSnap.data().nombre}: ${transferForm.descripcion.toUpperCase()}`,
                    fecha: Timestamp.now(), createdAt: serverTimestamp(), createdBy: user?.email
                });

                transaction.update(srcRef, { saldoActual: increment(-montoNum) });
                transaction.update(destRef, { saldoActual: increment(montoNum) });
            });
            toast({ title: "Traslado completado" });
            setIsTransferDialogOpen(false);
            setTransferForm({ origenId: '', destinoId: '', monto: '', descripcion: 'Transferencia entre cuentas' });
        } catch (error: any) { toast({ variant: 'destructive', title: "Error", description: error.message }); }
        finally { setIsSubmitting(false); }
    };

    const handleGeneratePDF = async () => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const docPDF = new jsPDF();
        const info = companyInfo || { name: 'EFAS CondoSys', rif: 'J-00000000-0' };
        
        docPDF.setFillColor(15, 23, 42); docPDF.rect(0, 0, 210, 30, 'F');
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(14).setFont('helvetica', 'bold').text(info.name.toUpperCase(), 14, 15);
        docPDF.setFontSize(8).text(`RIF: ${info.rif}`, 14, 22);
        docPDF.setFontSize(10).text("REPORTE DE TESORERÍA", 196, 18, { align: 'right' });
        
        docPDF.setTextColor(0, 0, 0); 
        docPDF.setFontSize(12).text(`Período: ${format(dateRange.from, 'dd/MM/yyyy')} al ${format(dateRange.to, 'dd/MM/yyyy')}`, 14, 45);
        
        const filtered = transactions.filter(tx => { 
            const d = tx.fecha.toDate(); 
            return d >= dateRange.from && d <= dateRange.to; 
        }).sort((a,b) => a.fecha.toMillis() - b.fecha.toMillis());

        autoTable(docPDF, { 
            startY: 55, 
            head: [['FECHA', 'CUENTA', 'DESCRIPCIÓN', 'TIPO', 'MONTO (BS.)']], 
            body: filtered.map(t => [
                format(t.fecha.toDate(), 'dd/MM/yyyy'), 
                t.nombreCuenta, 
                t.descripcion, 
                t.tipo.toUpperCase(), 
                formatCurrency(t.monto)
            ]), 
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 8, textColor: [0, 0, 0] }
        });
        
        docPDF.save(`Reporte_Tesoreria_${format(new Date(), 'yyyy_MM_dd')}.pdf`);
    };

    if (loading) return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4 bg-slate-50">
            <Loader2 className="h-12 w-12 animate-spin text-[#F28705]" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 animate-pulse italic">EFAS CONDOSYS: Sincronizando Tesorería</p>
        </div>
    );

    return (
        <div className="space-y-8 p-4 md:p-8 min-h-screen bg-slate-50 font-montserrat">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Cuentas y <span className="text-[#F28705]">Tesorería</span></h2>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.3em] mt-3 flex items-center gap-2"><Wallet className="h-3 w-3" /> Control de Disponibilidad y Flujo de Caja Atómico</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleGeneratePDF} variant="outline" className="font-bold uppercase text-[10px] rounded-xl h-12 border-slate-300 text-slate-700 shadow-sm bg-white hover:bg-slate-50">
                        <Download className="mr-2 h-4 w-4" /> Reporte Período
                    </Button>
                    <Button onClick={() => setIsTransferDialogOpen(true)} variant="secondary" className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-[10px] rounded-xl h-12 shadow-md">
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Trasladar
                    </Button>
                    <Button onClick={() => setIsTransactionDialogOpen(true)} className="bg-[#F28705] hover:bg-[#d17504] text-white font-black uppercase text-[10px] rounded-xl h-12 shadow-lg shadow-orange-500/20">
                        <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Movimiento
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {accounts.map(acc => (
                    <Card key={acc.id} className="rounded-[2rem] border-none shadow-sm hover:shadow-xl transition-all group bg-white overflow-hidden relative border border-slate-100">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {acc.tipo === 'banco' ? <Landmark className="h-4 w-4 text-sky-500" /> : <Wallet className="h-4 w-4 text-emerald-500" />}
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{acc.tipo}</span>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full" onClick={() => { setAccountToDelete(acc); setIsDeleteDialogOpen(true); }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm font-black text-slate-700 uppercase truncate mb-1">{acc.nombre}</div>
                            <div className="text-2xl font-black italic tracking-tight text-slate-900">Bs. {formatCurrency(acc.saldoActual)}</div>
                        </CardContent>
                    </Card>
                ))}
                <Button variant="ghost" onClick={() => setIsAccountDialogOpen(true)} className="h-full border-2 border-dashed border-slate-200 rounded-[2rem] hover:bg-slate-100 flex flex-col items-center justify-center py-8 bg-white/50 group">
                    <PlusCircle className="h-6 w-6 text-slate-300 mb-2 group-hover:text-[#F28705] transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nueva Cuenta</span>
                </Button>
            </div>

            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
                <CardHeader className="bg-slate-900 text-white p-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <CardTitle className="text-xl font-black uppercase italic tracking-tight flex items-center gap-3"><History className="text-[#F28705]" /> Historial Centralizado</CardTitle>
                        <div className="flex items-center gap-2 bg-white/10 p-1 rounded-xl">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" className="h-9 text-[10px] font-bold text-white hover:bg-white/20">
                                        {format(dateRange.from, 'dd MMM', {locale: es})} - {format(dateRange.to, 'dd MMM', {locale: es})}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-white border-slate-200" align="end">
                                    <Calendar initialFocus mode="range" selected={{ from: dateRange.from, to: dateRange.to }} onSelect={(range: any) => range && setDateRange({ from: range.from, to: range.to || range.from })} locale={es}/>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50 hover:bg-transparent border-b border-slate-100">
                                    <TableHead className="text-[10px] font-black uppercase px-8 h-14 text-slate-700">Fecha</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-700">Cuenta</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-700">Descripción</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase px-8 text-slate-700">Monto (Bs.)</TableHead>
                                    <TableHead className="text-center text-[10px] font-black uppercase text-slate-700">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center py-20 text-slate-400 italic font-bold uppercase tracking-widest text-xs">No se registran movimientos</TableCell></TableRow>
                                ) : (
                                    transactions.map(tx => (
                                        <TableRow key={tx.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                                            <TableCell className="px-8 py-5 font-bold text-slate-500 text-xs">{format(tx.fecha.toDate(), 'dd/MM/yy HH:mm')}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-[9px] font-black uppercase bg-slate-100 text-slate-700 border-slate-200">{tx.nombreCuenta}</Badge></TableCell>
                                            <TableCell><div className="font-black text-slate-900 uppercase italic text-xs leading-tight">{tx.descripcion}</div><div className="text-[9px] font-bold text-slate-400 mt-0.5">REF: {tx.referencia || 'N/A'}</div></TableCell>
                                            <TableCell className={cn("text-right font-black italic text-lg px-8", tx.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600')}>
                                                {tx.tipo === 'ingreso' ? '+' : '-'} {formatCurrency(tx.monto)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900"><MoreVertical className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="rounded-xl border-slate-200 shadow-xl bg-white">
                                                        <DropdownMenuItem onClick={() => { setSelectedTx(tx); setEditTxData({ descripcion: tx.descripcion, referencia: tx.referencia || '' }); setIsEditTxDialogOpen(true); }} className="gap-2 font-black uppercase text-[10px] text-slate-700 p-3"><Edit className="h-3 w-3 text-sky-500" /> Editar</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => { setSelectedTx(tx); setIsDeleteTxDialogOpen(true); }} className="gap-2 font-black uppercase text-[10px] text-red-600 p-3"><Trash2 className="h-3 w-3" /> Eliminar</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Diálogos */}
            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Nueva <span className="text-[#F28705]">Cuenta</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nombre</Label><Input placeholder="BANCO DE VENEZUELA" value={accountForm.nombre} onChange={e => setAccountForm({...accountForm, nombre: e.target.value})} className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Tipo</Label><Select value={accountForm.tipo} onValueChange={v => setAccountForm({...accountForm, tipo: v as any})}><SelectTrigger className="rounded-xl h-12 bg-slate-50 border-slate-200 font-bold text-slate-900"><SelectValue /></SelectTrigger><SelectContent className="bg-white"><SelectItem value="banco" className="text-slate-900">Banco</SelectItem><SelectItem value="efectivo" className="text-slate-900">Efectivo</SelectItem><SelectItem value="otros" className="text-slate-900">Otros</SelectItem></SelectContent></Select></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Saldo Inicial</Label><Input type="number" value={accountForm.saldoInicial} onChange={e => setAccountForm({...accountForm, saldoInicial: e.target.value})} className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900" /></div>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveAccount} disabled={isSubmitting} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black uppercase h-12 rounded-xl">{isSubmitting ? <Loader2 className="animate-spin" /> : "Crear Cuenta"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Registrar <span className="text-[#F28705]">Movimiento</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Tipo</Label><Select value={transForm.tipo} onValueChange={(v: any) => setTransactionForm({...transForm, tipo: v})}><SelectTrigger className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900"><SelectValue /></SelectTrigger><SelectContent className="bg-white"><SelectItem value="ingreso" className="text-green-600 font-bold">Ingreso (+)</SelectItem><SelectItem value="egreso" className="text-red-600 font-bold">Egreso (-)</SelectItem></SelectContent></Select></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Cuenta</Label><Select value={transForm.cuentaId} onValueChange={v => setTransactionForm({...transForm, cuentaId: v})}><SelectTrigger className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900"><SelectValue placeholder="Seleccionar..." /></SelectTrigger><SelectContent className="bg-white">{accounts.map(acc => (<SelectItem key={acc.id} value={acc.id} className="text-slate-900">{acc.nombre} (Bs. {formatCurrency(acc.saldoActual)})</SelectItem>))}</SelectContent></Select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Monto Bs.</Label><Input type="number" placeholder="0.00" value={transForm.monto} onChange={e => setTransactionForm({...transForm, monto: e.target.value})} className="rounded-xl h-12 font-black text-lg bg-slate-50 border-slate-200 text-slate-900" /></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Fecha</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-12 rounded-xl justify-start font-bold bg-slate-50 border-slate-200 text-slate-900"><CalendarIcon className="mr-2 h-4 w-4" /> {format(transForm.fecha, 'dd/MM/yyyy')}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 bg-white border-slate-200 shadow-2xl rounded-2xl"><Calendar mode="single" selected={transForm.fecha} onSelect={(d: any) => d && setTransactionForm({...transForm, fecha: d})} locale={es}/></PopoverContent></Popover></div>
                        </div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Descripción</Label><Input placeholder="EJ: PAGO DE SERVICIOS" value={transForm.descripcion} onChange={e => setTransactionForm({...transForm, descripcion: e.target.value})} className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Referencia (Opcional)</Label><Input placeholder="EJ: 123456" value={transForm.referencia} onChange={e => setTransactionForm({...transForm, referencia: e.target.value})} className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveTransaction} disabled={isSubmitting} className="w-full bg-[#F28705] hover:bg-orange-600 text-white font-black uppercase h-14 rounded-2xl shadow-xl">{isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}Procesar Movimiento</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Trasladar <span className="text-[#F28705]">Fondos</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Cuenta Origen</Label><Select value={transferForm.origenId} onValueChange={v => setTransferForm({...transferForm, origenId: v})}><SelectTrigger className="rounded-xl h-12 bg-slate-50 font-bold border-slate-200 text-slate-900"><SelectValue placeholder="Desde..." /></SelectTrigger><SelectContent className="bg-white">{accounts.map(acc => (<SelectItem key={acc.id} value={acc.id} className="text-slate-900">{acc.nombre} (Bs. {formatCurrency(acc.saldoActual)})</SelectItem>))}</SelectContent></Select></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Cuenta Destino</Label><Select value={transferForm.destinoId} onValueChange={v => setTransferForm({...transferForm, destinoId: v})}><SelectTrigger className="rounded-xl h-12 bg-slate-50 font-bold border-slate-200 text-slate-900"><SelectValue placeholder="Hacia..." /></SelectTrigger><SelectContent className="bg-white">{accounts.map(acc => (<SelectItem key={acc.id} value={acc.id} disabled={acc.id === transferForm.origenId} className="text-slate-900">{acc.nombre}</SelectItem>))}</SelectContent></Select></div>
                        </div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Monto del Traslado (Bs.)</Label><Input type="number" placeholder="0.00" value={transferForm.monto} onChange={e => setTransferForm({...transferForm, monto: e.target.value})} className="rounded-xl h-12 font-black text-lg bg-slate-50 border-slate-200 text-slate-900" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Motivo / Notas</Label><Input placeholder="EJ: FONDEO DE CAJA CHICA" value={transferForm.descripcion} onChange={e => setTransferForm({...transferForm, descripcion: e.target.value})} className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleTransfer} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black uppercase h-14 rounded-2xl shadow-xl">{isSubmitting ? <Loader2 className="animate-spin mr-2" /> : "Ejecutar Traslado"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditTxDialogOpen} onOpenChange={setIsEditTxDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Editar <span className="text-sky-500">Movimiento</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Descripción</Label><Input value={editTxData.descripcion} onChange={e => setEditTxData({...editTxData, descripcion: e.target.value})} className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Referencia</Label><Input value={editTxData.referencia} onChange={e => setEditTxData({...editTxData, referencia: e.target.value})} className="rounded-xl h-12 font-bold bg-slate-50 border-slate-200 text-slate-900" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleUpdateTx} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black uppercase h-12 rounded-xl">Guardar Cambios</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteTxDialogOpen} onOpenChange={setIsDeleteTxDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-red-600">¿Eliminar Movimiento?</DialogTitle>
                        <DialogDescription className="font-bold text-slate-500">Esta acción revertirá automáticamente el saldo en la cuenta "{selectedTx?.nombreCuenta}".</DialogDescription>
                    </DialogHeader>
                    <div className="bg-red-50 p-4 rounded-2xl border border-red-100 mt-2">
                        <p className="text-xs font-bold text-red-800 uppercase tracking-tight">Atención: El monto de Bs. {formatCurrency(selectedTx?.monto || 0)} será {selectedTx?.tipo === 'ingreso' ? 'restado' : 'sumado'} del saldo actual.</p>
                    </div>
                    <DialogFooter className="gap-2 mt-4">
                        <Button variant="outline" onClick={() => setIsDeleteTxDialogOpen(false)} className="rounded-xl h-12 font-bold text-slate-900">Cancelar</Button>
                        <Button onClick={handleDeleteTransaction} disabled={isSubmitting} variant="destructive" className="rounded-xl h-12 font-black uppercase">Confirmar Eliminación</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-white text-slate-900">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-red-600">¿Eliminar Cuenta?</DialogTitle>
                        <DialogDescription className="font-bold text-slate-500">Se borrará la cuenta "{accountToDelete?.nombre}". Los movimientos históricos permanecerán en el sistema pero no estarán asociados a una cuenta activa.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 mt-4">
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-xl h-12 font-bold text-slate-900">Cancelar</Button>
                        <Button onClick={handleDeleteAccount} disabled={isSubmitting} variant="destructive" className="rounded-xl h-12 font-black uppercase">Eliminar Cuenta</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


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
    ShieldCheck,
    Save,
    AlertCircle
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
    
    // Diálogos de Cuentas
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
    const [isEditAccountDialogOpen, setIsEditAccountDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    // Diálogos de Movimientos
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
    const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
    const [isEditTxDialogOpen, setIsEditTxDialogOpen] = useState(false);
    const [isDeleteTxDialogOpen, setIsDeleteTxDialogOpen] = useState(false);

    // Estados de selección
    const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
    const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

    // Formularios
    const [accountForm, setAccountForm] = useState({ nombre: '', tipo: 'banco' as any, saldoInicial: '0' });
    const [editAccountForm, setEditAccountForm] = useState({ nombre: '', tipo: 'banco' as any, saldoActual: '0' });
    const [transForm, setTransactionForm] = useState({ monto: '', tipo: 'egreso' as 'ingreso' | 'egreso', cuentaId: '', descripcion: '', referencia: '', fecha: new Date() });
    const [transferForm, setTransferForm] = useState({ origenId: '', destinoId: '', monto: '', descripcion: 'Transferencia entre cuentas' });
    const [editTxData, setEditTxData] = useState({ descripcion: '', referencia: '' });

    const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });

    useEffect(() => {
        if (!condoId) return;
        const unsubAccounts = onSnapshot(collection(db, 'condominios', condoId, 'cuentas'), (snap) => {
            setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
            setLoading(false);
        });
        const qTx = query(collection(db, 'condominios', condoId, 'transacciones'), orderBy('fecha', 'desc'));
        const unsubTx = onSnapshot(qTx, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).map(tx => ({
                ...tx,
                descripcion: tx.descripcion || tx.description || 'SIN CONCEPTO'
            })));
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

    const handleOpenEditAccount = (acc: Account) => {
        setAccountToEdit(acc);
        setEditAccountForm({
            nombre: acc.nombre,
            tipo: acc.tipo,
            saldoActual: String(acc.saldoActual)
        });
        setIsEditAccountDialogOpen(true);
    };

    const handleUpdateAccount = async () => {
        if (!accountToEdit || !editAccountForm.nombre) return;
        setIsSubmitting(true);
        try {
            const accRef = doc(db, 'condominios', condoId, 'cuentas', accountToEdit.id);
            await updateDoc(accRef, {
                nombre: editAccountForm.nombre.toUpperCase().trim(),
                tipo: editAccountForm.tipo,
                saldoActual: parseFloat(editAccountForm.saldoActual) || 0,
                updatedAt: serverTimestamp()
            });
            toast({ title: "Cuenta Actualizada", description: "Los cambios se han guardado correctamente." });
            setIsEditAccountDialogOpen(false);
        } catch (e) {
            toast({ variant: 'destructive', title: "Error al actualizar" });
        } finally {
            setIsSubmitting(false);
        }
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
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4 bg-[#1A1D23]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 animate-pulse italic">EFAS CONDOSYS: Sincronizando Tesorería</p>
        </div>
    );

    return (
        <div className="space-y-8 p-4 md:p-8 min-h-screen bg-[#1A1D23] font-montserrat italic">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">Cuentas y <span className="text-primary">Tesorería</span></h2>
                    <p className="text-white/40 font-bold text-[10px] uppercase tracking-[0.3em] mt-3 flex items-center gap-2"><Wallet className="h-3 w-3" /> Control de Disponibilidad y Flujo de Caja Atómico</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleGeneratePDF} variant="outline" className="font-bold uppercase text-[10px] rounded-xl h-12 border-white/10 text-white shadow-sm bg-white/5 hover:bg-white/10">
                        <Download className="mr-2 h-4 w-4" /> Reporte Período
                    </Button>
                    <Button onClick={() => setIsTransferDialogOpen(true)} variant="secondary" className="bg-slate-800 hover:bg-slate-700 text-white font-black uppercase text-[10px] rounded-xl h-12 shadow-md">
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Trasladar
                    </Button>
                    <Button onClick={() => setIsTransactionDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[10px] rounded-xl h-12 shadow-lg">
                        <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Movimiento
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {accounts.map(acc => (
                    <Card key={acc.id} className="rounded-[2rem] border-none shadow-xl hover:shadow-primary/5 transition-all group bg-slate-900 overflow-hidden relative border border-white/5">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {acc.tipo === 'banco' ? <Landmark className="h-4 w-4 text-sky-500" /> : <Wallet className="h-4 w-4 text-emerald-500" />}
                                    <span className="text-[10px] font-black uppercase text-white/30 tracking-widest italic">{acc.tipo}</span>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/20 hover:text-primary hover:bg-primary/10 rounded-full" onClick={() => handleOpenEditAccount(acc)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full" onClick={() => { setAccountToDelete(acc); setIsDeleteDialogOpen(true); }}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm font-black text-white/60 uppercase truncate mb-1 italic">{acc.nombre}</div>
                            <div className="text-2xl font-black italic tracking-tight text-white">Bs. {formatCurrency(acc.saldoActual)}</div>
                        </CardContent>
                    </Card>
                ))}
                <Button variant="ghost" onClick={() => setIsAccountDialogOpen(true)} className="h-full border-2 border-dashed border-white/10 rounded-[2rem] hover:bg-white/5 flex flex-col items-center justify-center py-8 bg-white/5 group">
                    <PlusCircle className="h-6 w-6 text-white/20 mb-2 group-hover:text-primary transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30 italic">Nueva Cuenta</span>
                </Button>
            </div>

            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-slate-900 border border-white/5">
                <CardHeader className="bg-slate-950 text-white p-8 border-b border-white/5">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <CardTitle className="text-xl font-black uppercase italic tracking-tight flex items-center gap-3"><History className="text-primary" /> Historial Centralizado</CardTitle>
                        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" className="h-9 text-[10px] font-bold text-white hover:bg-white/10">
                                        {format(dateRange.from, 'dd MMM', {locale: es})} - {format(dateRange.to, 'dd MMM', {locale: es})}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10" align="end">
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
                                <TableRow className="bg-slate-950/50 hover:bg-transparent border-b border-white/5">
                                    <TableHead className="text-[10px] font-black uppercase px-8 h-14 text-white/40 italic">Fecha</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-white/40 italic">Cuenta</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-white/40 italic">Descripción</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase px-8 text-white/40 italic">Monto (Bs.)</TableHead>
                                    <TableHead className="text-center text-[10px] font-black uppercase text-white/40 italic">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow className="border-none"><TableCell colSpan={5} className="text-center py-20 text-white/20 italic font-black uppercase tracking-widest text-xs">No se registran movimientos</TableCell></TableRow>
                                ) : (
                                    transactions.map(tx => (
                                        <TableRow key={tx.id} className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                                            <TableCell className="px-8 py-5 font-bold text-white/40 text-xs">{format(tx.fecha.toDate(), 'dd/MM/yy HH:mm')}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-[9px] font-black uppercase bg-white/5 text-white/60 border-white/10 italic">{tx.nombreCuenta}</Badge></TableCell>
                                            <TableCell><div className="font-black text-white uppercase italic text-xs leading-tight">{tx.descripcion}</div><div className="text-[9px] font-bold text-white/20 mt-0.5">REF: {tx.referencia || 'N/A'}</div></TableCell>
                                            <TableCell className={cn("text-right font-black italic text-lg px-8", tx.tipo === 'ingreso' ? 'text-emerald-500' : 'text-red-500')}>
                                                {tx.tipo === 'ingreso' ? '+' : '-'} {formatCurrency(tx.monto)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-white/20 hover:text-white"><MoreVertical className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="rounded-xl border-white/10 shadow-2xl bg-slate-900 text-white italic">
                                                        <DropdownMenuItem onClick={() => { setSelectedTx(tx); setEditTxData({ descripcion: tx.descripcion, referencia: tx.referencia || '' }); setIsEditTxDialogOpen(true); }} className="gap-2 font-black uppercase text-[10px] text-white/80 p-3 hover:bg-white/5"><Edit className="h-3 w-3 text-sky-500" /> Editar</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => { setSelectedTx(tx); setIsDeleteTxDialogOpen(true); }} className="gap-2 font-black uppercase text-[10px] text-red-500 p-3 hover:bg-red-500/10"><Trash2 className="h-3 w-3" /> Eliminar</DropdownMenuItem>
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

            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Nueva <span className="text-primary">Cuenta</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Nombre</Label><Input placeholder="BANCO DE VENEZUELA" value={accountForm.nombre} onChange={e => setAccountForm({...accountForm, nombre: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Tipo</Label><Select value={accountForm.tipo} onValueChange={v => setAccountForm({...accountForm, tipo: v as any})}><SelectTrigger className="rounded-xl h-12 bg-white/5 border-none font-black text-white uppercase italic"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white italic"><SelectItem value="banco" className="font-black italic">BANCO</SelectItem><SelectItem value="efectivo" className="font-black italic">EFECTIVO</SelectItem><SelectItem value="otros" className="font-black italic">OTROS</SelectItem></SelectContent></Select></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Saldo Inicial (Bs.)</Label><Input type="number" value={accountForm.saldoInicial} onChange={e => setAccountForm({...accountForm, saldoInicial: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white italic" /></div>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveAccount} disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase h-12 rounded-xl italic">{isSubmitting ? <Loader2 className="animate-spin" /> : "Crear Cuenta"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditAccountDialogOpen} onOpenChange={setIsEditAccountDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Editar <span className="text-primary">Cuenta</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Nombre de la Cuenta</Label>
                            <Input value={editAccountForm.nombre} onChange={e => setEditAccountForm({...editAccountForm, nombre: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Tipo</Label>
                                <Select value={editAccountForm.tipo} onValueChange={v => setEditAccountForm({...editAccountForm, tipo: v as any})}>
                                    <SelectTrigger className="rounded-xl h-12 bg-white/5 border-none font-black text-white uppercase italic"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                        <SelectItem value="banco" className="font-black italic">BANCO</SelectItem>
                                        <SelectItem value="efectivo" className="font-black italic">EFECTIVO</SelectItem>
                                        <SelectItem value="otros" className="font-black italic">OTROS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-primary ml-2 italic">Saldo Actual (Bs.)</Label>
                                <Input type="number" value={editAccountForm.saldoActual} onChange={e => setEditAccountForm({...editAccountForm, saldoActual: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-emerald-500 text-lg italic" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUpdateAccount} disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase h-14 rounded-2xl shadow-xl italic">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-5 w-5" />} Guardar Cambios
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Registrar <span className="text-primary">Movimiento</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Tipo</Label><Select value={transForm.tipo} onValueChange={(v: any) => setTransactionForm({...transForm, tipo: v})}><SelectTrigger className="rounded-xl h-12 font-black bg-white/5 border-none text-white italic"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white italic"><SelectItem value="ingreso" className="text-emerald-500 font-black italic">INGRESO (+)</SelectItem><SelectItem value="egreso" className="text-red-500 font-black italic">EGRESO (-)</SelectItem></SelectContent></Select></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Cuenta</Label><Select value={transForm.cuentaId} onValueChange={v => setTransactionForm({...transForm, cuentaId: v})}><SelectTrigger className="rounded-xl h-12 font-black bg-white/5 border-none text-white italic"><SelectValue placeholder="Seleccionar..." /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white italic">{accounts.map(acc => (<SelectItem key={acc.id} value={acc.id} className="text-white font-black italic">{acc.nombre} (Bs. {formatCurrency(acc.saldoActual)})</SelectItem>))}</SelectContent></Select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Monto Bs.</Label><Input type="number" placeholder="0.00" value={transForm.monto} onChange={e => setTransactionForm({...transForm, monto: e.target.value})} className="rounded-xl h-12 font-black text-lg bg-white/5 border-none text-white italic" /></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Fecha</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-12 rounded-xl justify-start font-black bg-white/5 border-none text-white italic"><CalendarIcon className="mr-2 h-4 w-4 text-primary" /> {format(transForm.fecha, 'dd/MM/yyyy')}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 bg-slate-900 border-white/10 shadow-2xl rounded-2xl"><Calendar mode="single" selected={transForm.fecha} onSelect={(d: any) => d && setTransactionForm({...transForm, fecha: d})} locale={es}/></PopoverContent></Popover></div>
                        </div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Descripción</Label><Input placeholder="EJ: PAGO DE SERVICIOS" value={transForm.descripcion} onChange={e => setTransactionForm({...transForm, descripcion: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Referencia (Opcional)</Label><Input placeholder="EJ: 123456" value={transForm.referencia} onChange={e => setTransactionForm({...transForm, referencia: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveTransaction} disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase h-14 rounded-2xl shadow-xl italic">{isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}Procesar Movimiento</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Trasladar <span className="text-primary">Fondos</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Cuenta Origen</Label><Select value={transferForm.origenId} onValueChange={v => setTransferForm({...transferForm, origenId: v})}><SelectTrigger className="rounded-xl h-12 bg-white/5 border-none font-black text-white italic"><SelectValue placeholder="Desde..." /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white italic">{accounts.map(acc => (<SelectItem key={acc.id} value={acc.id} className="text-white font-black italic">{acc.nombre} (Bs. {formatCurrency(acc.saldoActual)})</SelectItem>))}</SelectContent></Select></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Cuenta Destino</Label><Select value={transferForm.destinoId} onValueChange={v => setTransferForm({...transferForm, destinoId: v})}><SelectTrigger className="rounded-xl h-12 bg-white/5 border-none font-black text-white italic"><SelectValue placeholder="Hacia..." /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white italic">{accounts.map(acc => (<SelectItem key={acc.id} value={acc.id} disabled={acc.id === transferForm.origenId} className="text-white font-black italic">{acc.nombre}</SelectItem>))}</SelectContent></Select></div>
                        </div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Monto del Traslado (Bs.)</Label><Input type="number" placeholder="0.00" value={transferForm.monto} onChange={e => setTransferForm({...transferForm, monto: e.target.value})} className="rounded-xl h-12 font-black text-lg bg-white/5 border-none text-white italic" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Motivo / Notas</Label><Input placeholder="EJ: FONDEO DE CAJA CHICA" value={transferForm.descripcion} onChange={e => setTransferForm({...transferForm, descripcion: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleTransfer} disabled={isSubmitting} className="w-full bg-white text-slate-900 hover:bg-slate-200 font-black uppercase h-14 rounded-2xl shadow-xl italic">{isSubmitting ? <Loader2 className="animate-spin mr-2" /> : "Ejecutar Traslado"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-red-500">¿Eliminar Cuenta?</DialogTitle>
                        <DialogDescription className="font-bold text-white/40 italic">Se borrará la cuenta "{accountToDelete?.nombre}". Los movimientos históricos permanecerán en el sistema pero no estarán asociados a una cuenta activa.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 mt-4">
                        <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-xl h-12 font-black uppercase text-white/60">Cancelar</Button>
                        <Button onClick={handleDeleteAccount} disabled={isSubmitting} variant="destructive" className="rounded-xl h-12 font-black uppercase italic shadow-lg shadow-red-500/20">Eliminar Cuenta</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIALOGO PARA EDITAR MOVIMIENTO DEL HISTORIAL */}
            <Dialog open={isEditTxDialogOpen} onOpenChange={setIsEditTxDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Editar <span className="text-primary">Movimiento</span></DialogTitle>
                        <DialogDescription className="text-white/40 font-bold text-xs uppercase">Actualización de glosa y referencia del asiento contable.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Descripción / Concepto</Label>
                            <Input value={editTxData.descripcion} onChange={e => setEditTxData({...editTxData, descripcion: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Referencia</Label>
                            <Input value={editTxData.referencia} onChange={e => setEditTxData({...editTxData, referencia: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUpdateTx} disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase h-14 rounded-2xl shadow-xl italic">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-5 w-5" />} Actualizar Registro
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIALOGO PARA ELIMINAR MOVIMIENTO DEL HISTORIAL */}
            <Dialog open={isDeleteTxDialogOpen} onOpenChange={setIsDeleteTxDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-red-500 flex items-center gap-2"><AlertCircle /> ¿Eliminar Movimiento?</DialogTitle>
                        <DialogDescription className="font-bold text-white/40 italic">
                            Esta acción revertirá automáticamente el saldo en la cuenta "{selectedTx?.nombreCuenta}". 
                            El monto de Bs. {formatCurrency(selectedTx?.monto || 0)} será recalculado.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 mt-4">
                        <Button variant="ghost" onClick={() => setIsDeleteTxDialogOpen(false)} className="rounded-xl h-12 font-black uppercase text-white/60">Cancelar</Button>
                        <Button onClick={handleDeleteTransaction} disabled={isSubmitting} variant="destructive" className="rounded-xl h-12 font-black uppercase italic shadow-lg shadow-red-500/20">Confirmar Reversión</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

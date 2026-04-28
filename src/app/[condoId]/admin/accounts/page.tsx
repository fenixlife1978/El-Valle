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
    where,
    getDoc
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
    AlertCircle,
    FileText,
    Eye,
    DollarSign
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadPDF } from '@/lib/print-pdf';

interface Account {
    id: string;
    nombre: string;
    saldoActual: number;
    tipo: 'banco' | 'efectivo' | 'otros' | 'dolares';
}

interface Transaction {
    id: string;
    fecha: Timestamp;
    monto: number;
    montoUSD?: number;
    tipo: 'ingreso' | 'egreso';
    cuentaId: string;
    nombreCuenta: string;
    descripcion: string;
    referencia?: string;
    tipoCuenta?: string;
}

interface ExtraordinaryCampaign {
    id: string;
    description: string;
    amountUSD: number;
    status: 'active' | 'closed';
    createdAt: Timestamp;
}

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AccountsPage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const condoId = resolvedParams.condoId;
    const { user, companyInfo } = useAuth();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [activeCampaigns, setActiveCampaigns] = useState<ExtraordinaryCampaign[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exchangeRate, setExchangeRate] = useState(0);
    
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
    const [isEditAccountDialogOpen, setIsEditAccountDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
    const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
    const [isEditTxDialogOpen, setIsEditTxDialogOpen] = useState(false);
    const [isDeleteTxDialogOpen, setIsDeleteTxDialogOpen] = useState(false);
    const [showHistoryDialog, setShowHistoryDialog] = useState(false);
    const [transferHistory, setTransferHistory] = useState<any[]>([]);
    const [condominioData, setCondominioData] = useState<any>(null);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
    const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

    const [accountForm, setAccountForm] = useState({ nombre: '', tipo: 'banco' as any, saldoInicial: '0' });
    const [editAccountForm, setEditAccountForm] = useState({ nombre: '', tipo: 'banco' as any, saldoActual: '0' });
    const [transForm, setTransactionForm] = useState({ 
        monto: '', 
        tipo: 'egreso' as 'ingreso' | 'egreso', 
        cuentaId: '', 
        descripcion: '', 
        referencia: '', 
        fecha: new Date(), 
        categoria: 'ordinaria',
        montoUSD: ''
    });
    const [transferForm, setTransferForm] = useState({ origenId: '', destinoId: '', monto: '', descripcion: 'Transferencia entre cuentas', fecha: new Date() });
    const [editTxData, setEditTxData] = useState({ descripcion: '', referencia: '' });
    const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });

    // Cargar tasa de cambio
    useEffect(() => {
        const loadRate = async () => {
            try {
                const configRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    setExchangeRate(data.exchangeRate || data.rate || 0);
                }
            } catch (e) {}
        };
        if (condoId && condoId !== "[condoId]") loadRate();
    }, [condoId]);

    // Cargar campañas activas
    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;
        const campaignsQuery = query(
            collection(db, 'condominios', condoId, 'extraordinary_campaigns'),
            where('status', '==', 'active')
        );
        const unsub = onSnapshot(campaignsQuery, (snap) => {
            setActiveCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtraordinaryCampaign)));
        });
        return () => unsub();
    }, [condoId]);

    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;
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
        
        const loadCondominioData = async () => {
            try {
                const docRef = doc(db, 'condominios', condoId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) setCondominioData(docSnap.data());
            } catch (e) {}
        };
        loadCondominioData();
        
        return () => { unsubAccounts(); unsubTx(); };
    }, [condoId]);

    const isCuentaDolares = (cuentaId: string) => {
        const cuenta = accounts.find(a => a.id === cuentaId);
        return cuenta?.tipo === 'dolares';
    };

    const handleSaveAccount = async () => {
        if (!accountForm.nombre) return;
        setIsSubmitting(true);
        try {
            const saldoInicial = parseFloat(accountForm.saldoInicial) || 0;
            await addDoc(collection(db, 'condominios', condoId, 'cuentas'), {
                nombre: accountForm.nombre.toUpperCase().trim(),
                tipo: accountForm.tipo,
                saldoActual: saldoInicial,
                moneda: accountForm.tipo === 'dolares' ? 'USD' : 'BS',
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
        setEditAccountForm({ nombre: acc.nombre, tipo: acc.tipo, saldoActual: String(acc.saldoActual) });
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
                moneda: editAccountForm.tipo === 'dolares' ? 'USD' : 'BS',
                updatedAt: serverTimestamp()
            });
            toast({ title: "Cuenta Actualizada" });
            setIsEditAccountDialogOpen(false);
        } catch (e) { toast({ variant: 'destructive', title: "Error al actualizar" }); }
        finally { setIsSubmitting(false); }
    };

    const handleDeleteAccount = async () => {
        if (!accountToDelete) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, 'condominios', condoId, 'cuentas', accountToDelete.id));
            toast({ title: "Cuenta eliminada" });
            setIsDeleteDialogOpen(false);
            setAccountToDelete(null);
        } catch (e) { toast({ variant: 'destructive', title: "Error al eliminar" }); }
        finally { setIsSubmitting(false); }
    };

    const handleSaveTransaction = async () => {
        if (!transForm.cuentaId || !transForm.monto || !transForm.descripcion) return;
        setIsSubmitting(true);
        
        const esDolares = isCuentaDolares(transForm.cuentaId);
        let montoNum = parseFloat(transForm.monto);
        let montoUSD = 0;
        
        // Obtener exchange rate para conversiones
        let currentExchangeRate = exchangeRate;
        if (!currentExchangeRate) {
            try {
                const configRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    currentExchangeRate = data.exchangeRate || data.rate || 0;
                }
            } catch (e) {}
        }
        
        if (esDolares) {
            // Cuenta en dólares: el monto principal ES en USD
            montoUSD = parseFloat(transForm.montoUSD || transForm.monto);
            montoNum = montoUSD * currentExchangeRate;
        } else {
            // Cuenta en Bs: calcular equivalente USD
            montoUSD = currentExchangeRate > 0 ? montoNum / currentExchangeRate : 0;
        }
        
        const cuentaRef = doc(db, 'condominios', condoId, 'cuentas', transForm.cuentaId);
        
        // Validación para movimientos extraordinarios
        if (transForm.categoria === 'extraordinaria' && !selectedCampaignId) {
            toast({ variant: 'destructive', title: "Error", description: "Debe seleccionar una campaña." });
            setIsSubmitting(false);
            return;
        }
        
        let campaignName = '';
        let campaignAmountUSD = 0;
        if (selectedCampaignId) {
            const campaign = activeCampaigns.find(c => c.id === selectedCampaignId);
            campaignName = campaign?.description || '';
            campaignAmountUSD = campaign?.amountUSD || 0;
        }
        
        try {
            await runTransaction(db, async (transaction) => {
                const accountDoc = await transaction.get(cuentaRef);
                if (!accountDoc.exists()) throw new Error("La cuenta no existe.");
                
                const newTransRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                
                // Determinar el saldo de la cuenta
                const saldoActual = accountDoc.data().saldoActual || 0;
                const nuevoSaldo = transForm.tipo === 'ingreso' 
                    ? saldoActual + (esDolares ? montoUSD : montoNum)
                    : saldoActual - (esDolares ? montoUSD : montoNum);
                
                transaction.set(newTransRef, {
                    categoria: transForm.categoria || 'ordinaria', 
                    monto: montoNum,
                    montoUSD: montoUSD,
                    tipo: transForm.tipo,
                    cuentaId: transForm.cuentaId,
                    nombreCuenta: accountDoc.data().nombre,
                    descripcion: transForm.descripcion.toUpperCase(),
                    referencia: transForm.referencia.toUpperCase(),
                    fecha: Timestamp.fromDate(transForm.fecha),
                    tipoCuenta: esDolares ? 'dolares' : 'bs',
                    exchangeRate: currentExchangeRate,
                    createdBy: user?.email,
                    createdAt: serverTimestamp()
                });
                
                // Guardar en extraordinary_funds si aplica
                if (transForm.categoria === 'extraordinaria') {
                    const extraordinaryRef = doc(collection(db, 'condominios', condoId, 'extraordinary_funds'));
                    transaction.set(extraordinaryRef, {
                        tipo: transForm.tipo,
                        monto: montoNum,
                        montoUSD: montoUSD,
                        exchangeRate: currentExchangeRate,
                        descripcion: transForm.descripcion.toUpperCase(),
                        referencia: transForm.referencia?.toUpperCase() || '',
                        fecha: Timestamp.fromDate(transForm.fecha),
                        categoria: 'extraordinaria',
                        sourceTransactionId: newTransRef.id,
                        createdBy: user?.email,
                        campaignId: selectedCampaignId,
                        campaignName: campaignName,
                        campaignAmountUSD: campaignAmountUSD,
                        tipoCuenta: esDolares ? 'dolares' : 'bs',
                        createdAt: serverTimestamp()
                    });
                }
                
                transaction.update(cuentaRef, { 
                    saldoActual: nuevoSaldo
                });
            });
            
            toast({ title: "Movimiento procesado con éxito" });
            setIsTransactionDialogOpen(false);
            setTransactionForm({ 
                monto: '', tipo: 'egreso', cuentaId: '', descripcion: '', 
                referencia: '', fecha: new Date(), categoria: 'ordinaria', montoUSD: '' 
            });
            setSelectedCampaignId('');
        } catch (error: any) { 
            toast({ variant: 'destructive', title: "Fallo en transacción", description: error.message }); 
        }
        finally { setIsSubmitting(false); }
    };

    const handleDeleteTransaction = async () => {
        if (!selectedTx || !condoId) return;
        setIsSubmitting(true);
        try {
            await runTransaction(db, async (transaction) => {
                const txRef = doc(db, 'condominios', condoId, 'transacciones', selectedTx.id);
                const accRef = doc(db, 'condominios', condoId, 'cuentas', selectedTx.cuentaId);
                const accSnap = await transaction.get(accRef);
                const esDolares = selectedTx.tipoCuenta === 'dolares';
                const saldoActual = accSnap.data()?.saldoActual || 0;
                
                const adjustment = selectedTx.tipo === 'ingreso' 
                    ? (esDolares ? -(selectedTx.montoUSD || 0) : -selectedTx.monto)
                    : (esDolares ? (selectedTx.montoUSD || 0) : selectedTx.monto);
                
                transaction.update(accRef, { saldoActual: saldoActual + adjustment });
                transaction.delete(txRef);
            });
            toast({ title: "Movimiento eliminado", description: "El saldo ha sido revertido." });
            setIsDeleteTxDialogOpen(false);
            setSelectedTx(null);
        } catch (e: any) { toast({ variant: 'destructive', title: "Error", description: e.message }); }
        finally { setIsSubmitting(false); }
    };

    const handleUpdateTx = async () => {
        if (!selectedTx || !editTxData.descripcion) return;
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

    const loadTransferHistory = async () => {
        if (!condoId) return;
        const q = query(
            collection(db, 'condominios', condoId, 'transacciones'),
            where('descripcion', '>=', 'TRASLADO'),
            where('descripcion', '<=', 'TRASLADO\uf8ff'),
            orderBy('fecha', 'desc')
        );
        const snapshot = await getDocs(q);
        setTransferHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    const handleTransfer = async () => {
        if (!transferForm.origenId || !transferForm.destinoId || !transferForm.monto) return;
        setIsSubmitting(true);
        const montoNum = parseFloat(transferForm.monto);
        const transferDate = Timestamp.fromDate(transferForm.fecha);
        
        try {
            await runTransaction(db, async (transaction) => {
                const srcRef = doc(db, 'condominios', condoId, 'cuentas', transferForm.origenId);
                const destRef = doc(db, 'condominios', condoId, 'cuentas', transferForm.destinoId);
                const [srcSnap, destSnap] = await Promise.all([transaction.get(srcRef), transaction.get(destRef)]);
                
                if (!srcSnap.exists() || !destSnap.exists()) throw new Error("Cuenta no encontrada.");
                
                const esOrigenDolares = srcSnap.data().tipo === 'dolares';
                const esDestinoDolares = destSnap.data().tipo === 'dolares';
                const srcSaldo = srcSnap.data().saldoActual || 0;
                
                // No permitir transferencias entre cuentas de distinta moneda
                if (esOrigenDolares !== esDestinoDolares) {
                    throw new Error("No se permiten transferencias entre cuentas de distinta moneda.");
                }
                
                const montoEfectivo = esOrigenDolares ? montoNum : montoNum;
                if (srcSaldo < montoEfectivo) throw new Error("Saldo insuficiente.");

                const transferRef1 = doc(collection(db, 'condominios', condoId, 'transacciones'));
                const transferRef2 = doc(collection(db, 'condominios', condoId, 'transacciones'));

                transaction.set(transferRef1, {
                    monto: montoNum, montoUSD: esOrigenDolares ? montoNum : 0,
                    tipo: 'egreso', cuentaId: transferForm.origenId,
                    nombreCuenta: srcSnap.data().nombre,
                    descripcion: `TRASLADO A ${destSnap.data().nombre}: ${transferForm.descripcion.toUpperCase()}`,
                    fecha: transferDate, tipoCuenta: esOrigenDolares ? 'dolares' : 'bs',
                    createdAt: serverTimestamp(), createdBy: user?.email
                });
                transaction.set(transferRef2, {
                    monto: montoNum, montoUSD: esDestinoDolares ? montoNum : 0,
                    tipo: 'ingreso', cuentaId: transferForm.destinoId,
                    nombreCuenta: destSnap.data().nombre,
                    descripcion: `RECEPCIÓN DESDE ${srcSnap.data().nombre}: ${transferForm.descripcion.toUpperCase()}`,
                    fecha: transferDate, tipoCuenta: esDestinoDolares ? 'dolares' : 'bs',
                    createdAt: serverTimestamp(), createdBy: user?.email
                });

                transaction.update(srcRef, { saldoActual: increment(-montoEfectivo) });
                transaction.update(destRef, { saldoActual: increment(montoEfectivo) });
            });
            toast({ title: "Traslado completado" });
            setIsTransferDialogOpen(false);
            setTransferForm({ origenId: '', destinoId: '', monto: '', descripcion: 'Transferencia entre cuentas', fecha: new Date() });
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
        
        docPDF.setTextColor(0, 0, 0);
        docPDF.setFontSize(12).text(`Período: ${format(dateRange.from, 'dd/MM/yyyy')} al ${format(dateRange.to, 'dd/MM/yyyy')}`, 14, 45);
        
        const filtered = transactions.filter(tx => { 
            const d = tx.fecha.toDate(); 
            return d >= dateRange.from && d <= dateRange.to; 
        }).sort((a,b) => a.fecha.toMillis() - b.fecha.toMillis());

        autoTable(docPDF, { 
            startY: 55, 
            head: [['FECHA', 'CUENTA', 'DESCRIPCIÓN', 'TIPO', 'MONTO BS.', 'USD $']], 
            body: filtered.map(t => [
                format(t.fecha.toDate(), 'dd/MM/yyyy'), 
                t.nombreCuenta, 
                t.descripcion, 
                t.tipo.toUpperCase(), 
                t.tipoCuenta === 'dolares' ? '$ ' + formatCurrency(t.montoUSD || 0) : 'Bs. ' + formatCurrency(t.monto),
                t.tipoCuenta === 'dolares' ? '$ ' + formatCurrency(t.montoUSD || t.monto) : '$ ' + formatCurrency(t.montoUSD || 0)
            ]), 
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 7, textColor: [0, 0, 0] }
        });
        
        docPDF.save(`Reporte_Tesoreria_${format(new Date(), 'yyyy_MM_dd')}.pdf`);
    };

    if (loading) return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4 bg-[#1A1D23]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 animate-pulse italic">Cargando Tesorería...</p>
        </div>
    );

    return (
        <div className="space-y-8 p-4 md:p-8 min-h-screen bg-[#1A1D23] font-montserrat italic">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">Cuentas y <span className="text-primary">Tesorería</span></h2>
                    <p className="text-white/40 font-bold text-[10px] uppercase tracking-[0.3em] mt-3 flex items-center gap-2"><Wallet className="h-3 w-3" /> Control de Disponibilidad y Flujo de Caja</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleGeneratePDF} variant="outline" className="font-bold uppercase text-[10px] rounded-xl h-12 border-white/10 text-white shadow-sm bg-white/5 hover:bg-white/10">
                        <Download className="mr-2 h-4 w-4" /> Reporte
                    </Button>
                    <Button onClick={() => setIsTransferDialogOpen(true)} variant="secondary" className="bg-slate-800 hover:bg-slate-700 text-white font-black uppercase text-[10px] rounded-xl h-12 shadow-md">
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Trasladar
                    </Button>
                    <Button onClick={() => setIsTransactionDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[10px] rounded-xl h-12 shadow-lg">
                        <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Movimiento
                    </Button>
                </div>
            </div>

            {/* TARJETAS DE CUENTAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {accounts.map(acc => (
                    <Card key={acc.id} className="rounded-[2rem] border-none shadow-xl hover:shadow-primary/5 transition-all group bg-slate-900 overflow-hidden relative border border-white/5">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {acc.tipo === 'banco' && <Landmark className="h-4 w-4 text-sky-500" />}
                                    {acc.tipo === 'efectivo' && <Wallet className="h-4 w-4 text-emerald-500" />}
                                    {acc.tipo === 'dolares' && <DollarSign className="h-4 w-4 text-yellow-500" />}
                                    <span className="text-[10px] font-black uppercase text-white/30 tracking-widest italic">{acc.tipo}</span>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/20 hover:text-primary rounded-full" onClick={() => handleOpenEditAccount(acc)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/20 hover:text-red-500 rounded-full" onClick={() => { setAccountToDelete(acc); setIsDeleteDialogOpen(true); }}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm font-black text-white/60 uppercase truncate mb-1 italic">{acc.nombre}</div>
                            <div className="text-2xl font-black italic tracking-tight text-white">
                                {acc.tipo === 'dolares' 
                                    ? `$ ${formatUSD(acc.saldoActual)} USD`
                                    : `Bs. ${formatCurrency(acc.saldoActual)}`
                                }
                            </div>
                            {acc.tipo === 'dolares' && (
                                <div className="text-xs text-white/30 mt-1">
                                    Equiv. Bs. {formatCurrency(acc.saldoActual * exchangeRate)}
                                </div>
                            )}
                            {acc.tipo !== 'dolares' && exchangeRate > 0 && (
                                <div className="text-xs text-white/30 mt-1">
                                    Equiv. $ {formatUSD(acc.saldoActual / exchangeRate)} USD
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
                <Button variant="ghost" onClick={() => setIsAccountDialogOpen(true)} className="h-full border-2 border-dashed border-white/10 rounded-[2rem] hover:bg-white/5 flex flex-col items-center justify-center py-8 bg-white/5 group">
                    <PlusCircle className="h-6 w-6 text-white/20 mb-2 group-hover:text-primary transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30 italic">Nueva Cuenta</span>
                </Button>
            </div>

            {/* HISTORIAL DE TRANSACCIONES */}
            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-slate-900 border border-white/5">
                <CardHeader className="bg-slate-950 text-white p-8 border-b border-white/5">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <CardTitle className="text-xl font-black uppercase italic tracking-tight flex items-center gap-3"><History className="text-primary" /> Historial Centralizado</CardTitle>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" className="h-9 text-[10px] font-bold text-white hover:bg-white/10">
                                    {format(dateRange.from, 'dd MMM', {locale: es})} - {format(dateRange.to, 'dd MMM', {locale: es})}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                                <Calendar initialFocus mode="range" selected={{ from: dateRange.from, to: dateRange.to }} onSelect={(range: any) => range && setDateRange({ from: range.from, to: range.to || range.from })} locale={es} fromYear={2020} toYear={2030} />
                            </PopoverContent>
                        </Popover>
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
                                    <TableHead className="text-right text-[10px] font-black uppercase text-white/40 italic">Monto</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase px-8 text-white/40 italic">USD $</TableHead>
                                    <TableHead className="text-center text-[10px] font-black uppercase text-white/40 italic">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="text-center py-20 text-white/20 italic font-black uppercase tracking-widest text-xs">No se registran movimientos</TableCell></TableRow>
                                ) : (
                                    transactions.map(tx => (
                                        <TableRow key={tx.id} className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                                            <TableCell className="px-8 py-5 font-bold text-white/40 text-xs">{format(tx.fecha.toDate(), 'dd/MM/yy HH:mm')}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[9px] font-black uppercase bg-white/5 text-white/60 border-white/10 italic">
                                                    {tx.tipoCuenta === 'dolares' && '💲 '}
                                                    {tx.nombreCuenta}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-black text-white uppercase italic text-xs leading-tight">{tx.descripcion}</div>
                                                <div className="text-[9px] font-bold text-white/20 mt-0.5">REF: {tx.referencia || 'N/A'}</div>
                                            </TableCell>
                                            <TableCell className={cn("text-right font-black italic text-lg", tx.tipo === 'ingreso' ? 'text-emerald-500' : 'text-red-500')}>
                                                {tx.tipoCuenta === 'dolares' 
                                                    ? `${tx.tipo === 'ingreso' ? '+' : '-'} $ ${formatUSD(tx.montoUSD || tx.monto)}`
                                                    : `${tx.tipo === 'ingreso' ? '+' : '-'} Bs. ${formatCurrency(tx.monto)}`
                                                }
                                            </TableCell>
                                            <TableCell className="text-right font-black text-sky-400 italic px-8">
                                                {tx.tipoCuenta === 'dolares' 
                                                    ? `$ ${formatUSD(tx.montoUSD || tx.monto)}`
                                                    : `$ ${formatUSD(tx.montoUSD || 0)}`
                                                }
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

            {/* DIÁLOGO NUEVA CUENTA */}
            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Nueva <span className="text-primary">Cuenta</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Nombre</Label><Input placeholder="CUENTA EN DÓLARES" value={accountForm.nombre} onChange={e => setAccountForm({...accountForm, nombre: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Tipo</Label>
                                <Select value={accountForm.tipo} onValueChange={v => setAccountForm({...accountForm, tipo: v as any})}>
                                    <SelectTrigger className="rounded-xl h-12 bg-white/5 border-none font-black text-white uppercase italic"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                        <SelectItem value="banco" className="font-black italic">BANCO</SelectItem>
                                        <SelectItem value="efectivo" className="font-black italic">EFECTIVO</SelectItem>
                                        <SelectItem value="dolares" className="font-black italic text-yellow-500">💲 DÓLARES (USD)</SelectItem>
                                        <SelectItem value="otros" className="font-black italic">OTROS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">
                                    Saldo Inicial {accountForm.tipo === 'dolares' ? '(USD $)' : '(Bs.)'}
                                </Label>
                                <Input type="number" value={accountForm.saldoInicial} onChange={e => setAccountForm({...accountForm, saldoInicial: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white italic" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveAccount} disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase h-12 rounded-xl italic">{isSubmitting ? <Loader2 className="animate-spin" /> : "Crear Cuenta"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIÁLOGO EDITAR CUENTA */}
            <Dialog open={isEditAccountDialogOpen} onOpenChange={setIsEditAccountDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Editar <span className="text-primary">Cuenta</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Nombre</Label><Input value={editAccountForm.nombre} onChange={e => setEditAccountForm({...editAccountForm, nombre: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Tipo</Label>
                                <Select value={editAccountForm.tipo} onValueChange={v => setEditAccountForm({...editAccountForm, tipo: v as any})}>
                                    <SelectTrigger className="rounded-xl h-12 bg-white/5 border-none font-black text-white uppercase italic"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                        <SelectItem value="banco" className="font-black italic">BANCO</SelectItem>
                                        <SelectItem value="efectivo" className="font-black italic">EFECTIVO</SelectItem>
                                        <SelectItem value="dolares" className="font-black italic text-yellow-500">💲 DÓLARES (USD)</SelectItem>
                                        <SelectItem value="otros" className="font-black italic">OTROS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-primary ml-2 italic">
                                    Saldo Actual {editAccountForm.tipo === 'dolares' ? '(USD $)' : '(Bs.)'}
                                </Label>
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

            {/* DIÁLOGO NUEVO MOVIMIENTO */}
            <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Registrar <span className="text-primary">Movimiento</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Categoría</Label>
                                <Select value={transForm.categoria || "ordinaria"} onValueChange={(v) => { setTransactionForm({...transForm, categoria: v}); setSelectedCampaignId(''); }}>
                                    <SelectTrigger className="rounded-xl h-12 font-black bg-white/5 border-none text-white italic"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                        <SelectItem value="ordinaria" className="font-black uppercase text-[10px] italic">General</SelectItem>
                                        <SelectItem value="extraordinaria" className="font-black uppercase text-[10px] italic">Fondo Extraordinario</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Tipo</Label>
                                <Select value={transForm.tipo} onValueChange={(v: any) => setTransactionForm({...transForm, tipo: v})}>
                                    <SelectTrigger className="rounded-xl h-12 font-black bg-white/5 border-none text-white italic"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                        <SelectItem value="ingreso" className="text-emerald-500 font-black italic">INGRESO (+)</SelectItem>
                                        <SelectItem value="egreso" className="text-red-500 font-black italic">EGRESO (-)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Cuenta</Label>
                                <Select value={transForm.cuentaId} onValueChange={v => {
                                    setTransactionForm({...transForm, cuentaId: v, montoUSD: ''});
                                }}>
                                    <SelectTrigger className="rounded-xl h-12 font-black bg-white/5 border-none text-white italic"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                        {accounts.map(acc => (
                                            <SelectItem key={acc.id} value={acc.id} className="text-white font-black italic">
                                                {acc.tipo === 'dolares' ? '💲 ' : ''}{acc.nombre} ({acc.tipo === 'dolares' ? `$ ${formatUSD(acc.saldoActual)}` : `Bs. ${formatCurrency(acc.saldoActual)}`})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {isCuentaDolares(transForm.cuentaId) ? (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Monto USD $</Label>
                                        <Input type="number" placeholder="0.00" value={transForm.montoUSD || ''} 
                                            onChange={e => {
                                                setTransactionForm({...transForm, montoUSD: e.target.value, monto: e.target.value});
                                            }} 
                                            className="rounded-xl h-12 font-black text-lg bg-white/5 border-none text-yellow-500 italic" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Equiv. Bs.</Label>
                                        <div className="h-12 rounded-xl bg-white/5 flex items-center justify-end px-4">
                                            <span className="text-white/60 font-black text-sm">
                                                Bs. {formatCurrency((parseFloat(transForm.montoUSD || '0') || 0) * exchangeRate)}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Monto Bs.</Label><Input type="number" placeholder="0.00" value={transForm.monto} onChange={e => setTransactionForm({...transForm, monto: e.target.value})} className="rounded-xl h-12 font-black text-lg bg-white/5 border-none text-white italic" /></div>
                            )}
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Fecha</Label>
                                <Popover>
                                    <PopoverTrigger asChild><Button variant="outline" className="w-full h-12 rounded-xl justify-start font-black bg-white/5 border-none text-white italic"><CalendarIcon className="mr-2 h-4 w-4 text-primary" /> {format(transForm.fecha, 'dd/MM/yyyy')}</Button></PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                                        <Calendar mode="single" selected={transForm.fecha} onSelect={(d: any) => d && setTransactionForm({...transForm, fecha: d})} locale={es} fromYear={2024} toYear={2026} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Descripción</Label><Input placeholder="EJ: PAGO CUOTA EN DÓLARES" value={transForm.descripcion} onChange={e => setTransactionForm({...transForm, descripcion: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Referencia (Opcional)</Label><Input placeholder="EJ: 123456" value={transForm.referencia} onChange={e => setTransactionForm({...transForm, referencia: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                        
                        {transForm.categoria === 'extraordinaria' && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Campaña del Fondo Extraordinario</Label>
                                <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                                    <SelectTrigger className="rounded-xl h-12 bg-white/5 border-none text-white font-black uppercase text-[10px]">
                                        <SelectValue placeholder="Seleccionar campaña..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        {activeCampaigns.map(c => (
                                            <SelectItem key={c.id} value={c.id} className="font-black uppercase text-[10px]">📁 {c.description}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter><Button onClick={handleSaveTransaction} disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase h-14 rounded-2xl shadow-xl italic">{isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}Procesar Movimiento</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIÁLOGO TRASLADO */}
            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex justify-between items-center">
                            <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Trasladar <span className="text-primary">Fondos</span></DialogTitle>
                            <Button variant="outline" size="sm" onClick={() => { loadTransferHistory(); setShowHistoryDialog(true); }} className="rounded-xl border-white/10 text-white font-black uppercase text-[10px]"><FileText className="mr-1 h-3 w-3" /> Ver Historial</Button>
                        </div>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Cuenta Origen</Label>
                                <Select value={transferForm.origenId} onValueChange={v => setTransferForm({...transferForm, origenId: v})}>
                                    <SelectTrigger className="rounded-xl h-12 bg-white/5 border-none font-black text-white italic"><SelectValue placeholder="Desde..." /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                        {accounts.map(acc => (
                                            <SelectItem key={acc.id} value={acc.id} className="text-white font-black italic">
                                                {acc.tipo === 'dolares' ? '💲 ' : ''}{acc.nombre} ({acc.tipo === 'dolares' ? `$ ${formatUSD(acc.saldoActual)}` : `Bs. ${formatCurrency(acc.saldoActual)}`})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Cuenta Destino</Label>
                                <Select value={transferForm.destinoId} onValueChange={v => setTransferForm({...transferForm, destinoId: v})}>
                                    <SelectTrigger className="rounded-xl h-12 bg-white/5 border-none font-black text-white italic"><SelectValue placeholder="Hacia..." /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white italic">
                                        {accounts.filter(a => {
                                            const origen = accounts.find(o => o.id === transferForm.origenId);
                                            if (!origen) return true;
                                            return a.tipo === origen.tipo && a.id !== transferForm.origenId;
                                        }).map(acc => (
                                            <SelectItem key={acc.id} value={acc.id} className="text-white font-black italic">
                                                {acc.tipo === 'dolares' ? '💲 ' : ''}{acc.nombre}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">
                                    Monto {isCuentaDolares(transferForm.origenId) ? 'USD $' : 'Bs.'}
                                </Label>
                                <Input type="number" placeholder="0.00" value={transferForm.monto} onChange={e => setTransferForm({...transferForm, monto: e.target.value})} className="rounded-xl h-12 font-black text-lg bg-white/5 border-none text-white italic" />
                            </div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Fecha</Label>
                                <Popover>
                                    <PopoverTrigger asChild><Button variant="outline" className="w-full h-12 rounded-xl justify-start font-black bg-white/5 border-none text-white italic"><CalendarIcon className="mr-2 h-4 w-4 text-primary" />{format(transferForm.fecha, 'dd/MM/yyyy')}</Button></PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                                        <Calendar mode="single" selected={transferForm.fecha} onSelect={(d: any) => d && setTransferForm({...transferForm, fecha: d})} locale={es} fromYear={2024} toYear={2026} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Motivo / Notas</Label><Input placeholder="EJ: FONDEO DE CAJA CHICA" value={transferForm.descripcion} onChange={e => setTransferForm({...transferForm, descripcion: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleTransfer} disabled={isSubmitting} className="w-full bg-white text-slate-900 hover:bg-slate-200 font-black uppercase h-14 rounded-2xl shadow-xl italic">{isSubmitting ? <Loader2 className="animate-spin mr-2" /> : "Ejecutar Traslado"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIÁLOGO HISTORIAL TRASLADOS */}
            <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Historial de Traslados</DialogTitle></DialogHeader>
                    <div className="py-4">
                        {transferHistory.length === 0 ? (
                            <div className="text-center py-10 text-white/40 font-black uppercase text-[10px]">No hay traslados registrados</div>
                        ) : (
                            <div className="space-y-3">
                                {transferHistory.map((tx) => (
                                    <div key={tx.id} className="p-4 bg-slate-800 rounded-xl border border-white/10">
                                        <p className="text-[10px] text-white/40">{tx.fecha?.toDate ? format(tx.fecha.toDate(), "dd/MM/yyyy HH:mm") : "N/A"}</p>
                                        <p className="font-black text-white text-sm uppercase mt-1">{tx.descripcion}</p>
                                        <p className="text-[10px] text-primary">Monto: {tx.tipoCuenta === 'dolares' ? `$ ${formatUSD(tx.montoUSD || tx.monto)}` : `Bs. ${formatCurrency(tx.monto)}`}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter><Button onClick={() => setShowHistoryDialog(false)} className="rounded-xl bg-primary text-slate-900 font-black uppercase text-[10px]">Cerrar</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIÁLOGO ELIMINAR CUENTA */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase italic text-red-500">¿Eliminar Cuenta?</DialogTitle></DialogHeader>
                    <DialogFooter className="gap-2 mt-4">
                        <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-xl h-12 font-black uppercase text-white/60">Cancelar</Button>
                        <Button onClick={handleDeleteAccount} disabled={isSubmitting} variant="destructive" className="rounded-xl h-12 font-black uppercase italic">Eliminar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIÁLOGO EDITAR MOVIMIENTO */}
            <Dialog open={isEditTxDialogOpen} onOpenChange={setIsEditTxDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Editar <span className="text-primary">Movimiento</span></DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Descripción</Label><Input value={editTxData.descripcion} onChange={e => setEditTxData({...editTxData, descripcion: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-white/40 ml-2 italic">Referencia</Label><Input value={editTxData.referencia} onChange={e => setEditTxData({...editTxData, referencia: e.target.value})} className="rounded-xl h-12 font-black bg-white/5 border-none text-white uppercase italic" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleUpdateTx} disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase h-14 rounded-2xl shadow-xl italic">{isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-5 w-5" />} Actualizar</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIÁLOGO ELIMINAR MOVIMIENTO */}
            <Dialog open={isDeleteTxDialogOpen} onOpenChange={setIsDeleteTxDialogOpen}>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white italic">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase italic text-red-500 flex items-center gap-2"><AlertCircle /> ¿Eliminar Movimiento?</DialogTitle></DialogHeader>
                    <DialogFooter className="gap-2 mt-4">
                        <Button variant="ghost" onClick={() => setIsDeleteTxDialogOpen(false)} className="rounded-xl h-12 font-black uppercase text-white/60">Cancelar</Button>
                        <Button onClick={handleDeleteTransaction} disabled={isSubmitting} variant="destructive" className="rounded-xl h-12 font-black uppercase italic">Confirmar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
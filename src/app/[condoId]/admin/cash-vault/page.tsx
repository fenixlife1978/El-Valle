'use client';

import React, { useState, useEffect, useMemo, use, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    addDoc, 
    serverTimestamp, 
    Timestamp, 
    writeBatch, 
    doc,
    where,
    getDoc
} from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    PlusCircle, 
    ArrowRightLeft, 
    FileText, 
    Loader2, 
    TrendingUp, 
    TrendingDown, 
    Wallet, 
    Banknote, 
    DollarSign,
    History,
    Download
} from 'lucide-react';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";

// --- Tipos ---
interface VaultMovement {
    id: string;
    date: Timestamp;
    description: string;
    amount: number;
    currency: 'Bs' | 'USD';
    type: 'ingreso' | 'egreso';
    category: 'manual' | 'transferencia';
}

const formatCurrency = (num: number) => {
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function CashVaultPage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const condoId = resolvedParams.condoId;
    const { user, companyInfo } = useAuth();
    const { toast } = useToast();

    // Estados
    const [loading, setLoading] = useState(true);
    const [movements, setMovements] = useState<VaultMovement[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Estados de Diálogos
    const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
    const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);

    // Formulario Manual
    const [formData, setFormData] = useState({
        description: '',
        amount: '',
        currency: 'USD' as 'Bs' | 'USD',
        type: 'ingreso' as 'ingreso' | 'egreso'
    });

    // Formulario Transferencia
    const [transferData, setTransferData] = useState({
        target: 'caja-chica',
        amount: '',
        currency: 'Bs' as 'Bs' | 'USD',
        description: 'Traslado de fondos'
    });

    // --- Carga de Datos en Tiempo Real ---
    useEffect(() => {
        if (!condoId) return;

        const q = query(
            collection(db, 'condominios', condoId, 'cash_flow_vault', 'movements'),
            orderBy('date', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VaultMovement));
            setMovements(data);
            setLoading(false);
        }, (error) => {
            console.error("Error en Bóveda:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [condoId]);

    // --- Cálculos de Saldos ---
    const balances = useMemo(() => {
        return movements.reduce((acc, mov) => {
            const val = mov.amount;
            if (mov.currency === 'Bs') {
                acc.bs = mov.type === 'ingreso' ? acc.bs + val : acc.bs - val;
            } else {
                acc.usd = mov.type === 'ingreso' ? acc.usd + val : acc.usd - val;
            }
            return acc;
        }, { bs: 0, usd: 0 });
    }, [movements]);

    // --- Acciones ---
    const handleSaveManual = async () => {
        if (!formData.description || !formData.amount) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'condominios', condoId, 'cash_flow_vault', 'movements'), {
                description: formData.description.toUpperCase(),
                amount: parseFloat(formData.amount),
                currency: formData.currency,
                type: formData.type,
                category: 'manual',
                date: Timestamp.now(),
                createdBy: user?.email
            });
            toast({ title: "Movimiento Registrado" });
            setIsManualDialogOpen(false);
            setFormData({ description: '', amount: '', currency: 'USD', type: 'ingreso' });
        } catch (e) {
            toast({ variant: 'destructive', title: "Error al guardar" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTransfer = async () => {
        if (!transferData.amount) return;
        setIsSubmitting(true);
        const batch = writeBatch(db);
        const amount = parseFloat(transferData.amount);

        try {
            // 1. Registro de Salida en Bóveda
            const vaultMovRef = doc(collection(db, 'condominios', condoId, 'cash_flow_vault', 'movements'));
            batch.set(vaultMovRef, {
                description: `TRANSFERENCIA A ${transferData.target.toUpperCase()}: ${transferData.description}`,
                amount: amount,
                currency: transferData.currency,
                type: 'egreso',
                category: 'transferencia',
                date: Timestamp.now(),
                createdBy: user?.email
            });

            // 2. Registro de Entrada en Destino
            if (transferData.target === 'caja-chica') {
                const pettyMovRef = doc(collection(db, 'condominios', condoId, 'cajaChica_movimientos'));
                batch.set(pettyMovRef, {
                    description: `INGRESO DESDE CAJA PRINCIPAL: ${transferData.description}`,
                    amount: amount,
                    type: 'ingreso',
                    date: Timestamp.now(),
                    category: 'transferencia',
                    vaultRef: vaultMovRef.id
                });
            } else {
                // Lógica para Banco (Generalmente se registraría como un pago de sistema o ajuste)
                // Aquí podrías añadir lógica si tienes una tabla de movimientos bancarios manuales
            }

            await batch.commit();
            toast({ title: "Transferencia Exitosa", description: `Se han trasladado ${transferData.currency} ${amount} a ${transferData.target}.` });
            setIsTransferDialogOpen(false);
        } catch (e) {
            toast({ variant: 'destructive', title: "Error en transferencia" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGeneratePDF = async () => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        
        const doc = new jsPDF();
        const now = new Date();
        const monthStart = startOfMonth(now);
        
        // Cargar Company Info
        const info = companyInfo || { name: 'EFAS CondoSys', rif: 'J-00000000-0' };

        // Calcular Saldo Anterior (Todo lo previo a este mes)
        const prevMovements = movements.filter(m => m.date.toDate() < monthStart);
        const prevBalanceBs = prevMovements.reduce((acc, m) => m.currency === 'Bs' ? (m.type === 'ingreso' ? acc + m.amount : acc - m.amount) : acc, 0);
        const prevBalanceUsd = prevMovements.reduce((acc, m) => m.currency === 'USD' ? (m.type === 'ingreso' ? acc + m.amount : acc - m.amount) : acc, 0);

        // Movimientos del Mes
        const currentMovements = movements.filter(m => m.date.toDate() >= monthStart);

        // PDF Header
        doc.setFillColor(15, 23, 42); // Slate-900
        doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14).setFont('helvetica', 'bold').text(info.name.toUpperCase(), 14, 15);
        doc.setFontSize(8).text(`RIF: ${info.rif}`, 14, 22);
        doc.setFontSize(10).text("REPORTE DE BÓVEDA DE EFECTIVO", 196, 18, { align: 'right' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12).text(`Período: ${format(now, 'MMMM yyyy', { locale: es }).toUpperCase()}`, 14, 45);

        // Tabla de Saldos Anteriores
        autoTable(doc, {
            startY: 50,
            head: [['CONCEPTO', 'SALDO BS.', 'SALDO USD']],
            body: [['SALDO ANTERIOR AL CIERRE', formatCurrency(prevBalanceBs), `$ ${formatCurrency(prevBalanceUsd)}`]],
            theme: 'grid',
            headStyles: { fillColor: [242, 135, 5] }
        });

        // Tabla de Movimientos
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['FECHA', 'DESCRIPCIÓN', 'TIPO', 'MONEDA', 'MONTO']],
            body: currentMovements.map(m => [
                format(m.date.toDate(), 'dd/MM/yyyy'),
                m.description,
                m.type.toUpperCase(),
                m.currency,
                formatCurrency(m.amount)
            ]),
            headStyles: { fillColor: [15, 23, 42] }
        });

        // Saldo Final
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFont('helvetica', 'bold');
        doc.text(`SALDO FINAL BS: ${formatCurrency(balances.bs)}`, 14, finalY);
        doc.text(`SALDO FINAL USD: $ ${formatCurrency(balances.usd)}`, 14, finalY + 7);

        doc.save(`Reporte_Boveda_${format(now, 'yyyy_MM')}.pdf`);
    };

    if (loading) {
        return (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-4 bg-slate-50">
                <Loader2 className="h-12 w-12 animate-spin text-[#F28705]" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 animate-pulse italic">
                    EFAS CONDOSYS: Actualizando Datos
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 p-4 md:p-8 min-h-screen bg-slate-50">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                        Bóveda de <span className="text-[#F28705]">Efectivo</span>
                    </h2>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
                        <Wallet className="h-3 w-3" /> Control de Caja Principal Multidivisa
                    </p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button onClick={handleGeneratePDF} variant="outline" className="flex-1 md:flex-none font-bold uppercase text-[10px] rounded-xl h-12">
                        <Download className="mr-2 h-4 w-4" /> Reporte Mensual
                    </Button>
                    <Button onClick={() => setIsTransferDialogOpen(true)} className="flex-1 md:flex-none bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-[10px] rounded-xl h-12">
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Traslado Fondos
                    </Button>
                    <Button onClick={() => setIsManualDialogOpen(true)} className="flex-1 md:flex-none bg-[#F28705] hover:bg-[#d17504] text-white font-black uppercase text-[10px] rounded-xl h-12 shadow-lg shadow-orange-500/20">
                        <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Asiento
                    </Button>
                </div>
            </div>

            {/* Balances */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-slate-900 text-white transition-transform hover:scale-[1.01]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-[#F28705] flex items-center gap-2">
                            <Banknote className="h-3 w-3" /> Saldo en Bolívares (Bs.)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-5xl font-black italic tracking-tighter">Bs. {formatCurrency(balances.bs)}</div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Disponibilidad Inmediata</p>
                    </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-white transition-transform hover:scale-[1.01]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-[#F28705] flex items-center gap-2">
                            <DollarSign className="h-3 w-3" /> Saldo en Dólares (USD)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-5xl font-black italic tracking-tighter text-slate-900">$ {formatCurrency(balances.usd)}</div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Efectivo en Bóveda</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabla de Movimientos */}
            <Card className="rounded-[2rem] border-none shadow-sm overflow-hidden bg-white">
                <CardHeader className="border-b bg-slate-50/50">
                    <CardTitle className="text-sm font-black uppercase italic tracking-tight flex items-center gap-2">
                        <History className="h-4 w-4 text-slate-400" /> Historial de Transacciones
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50 hover:bg-transparent">
                                    <TableHead className="text-[10px] font-black uppercase px-6 py-4">Fecha</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase">Descripción</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase">Categoría</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-right">Monto</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-center">Divisa</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {movements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-20 text-slate-400 font-bold uppercase text-[10px] italic">No se registran movimientos en la bóveda</TableCell>
                                    </TableRow>
                                ) : (
                                    movements.map((mov) => (
                                        <TableRow key={mov.id} className="hover:bg-slate-50 transition-colors border-b last:border-0">
                                            <TableCell className="px-6 py-5 font-bold text-slate-500 text-xs">
                                                {format(mov.date.toDate(), 'dd/MM/yyyy HH:mm')}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-black text-slate-900 uppercase italic text-xs">{mov.description}</div>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${mov.category === 'transferencia' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {mov.category}
                                                </span>
                                            </TableCell>
                                            <TableCell className={`text-right font-black italic text-lg ${mov.type === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                                                {mov.type === 'ingreso' ? '+' : '-'} {formatCurrency(mov.amount)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={`font-black text-xs ${mov.currency === 'USD' ? 'text-amber-600' : 'text-slate-600'}`}>
                                                    {mov.currency}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Diálogo Registro Manual */}
            <Dialog open={isManualDialogOpen} onOpenChange={setIsManualDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Registrar <span className="text-[#F28705]">Movimiento</span></DialogTitle>
                        <DialogDescription>Afecta directamente el saldo físico de la bóveda.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase">Tipo</Label>
                                <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v})}>
                                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ingreso">Ingreso (+)</SelectItem>
                                        <SelectItem value="egreso">Egreso (-)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase">Moneda</Label>
                                <Select value={formData.currency} onValueChange={(v: any) => setFormData({...formData, currency: v})}>
                                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Bs">Bolívares (Bs.)</SelectItem>
                                        <SelectItem value="USD">Dólares (USD)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase">Descripción</Label>
                            <Input 
                                placeholder="Ej: Pago de reparaciones menores" 
                                className="rounded-xl"
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase">Monto</Label>
                            <Input 
                                type="number" 
                                placeholder="0.00" 
                                className="rounded-xl font-bold text-lg h-12"
                                value={formData.amount}
                                onChange={e => setFormData({...formData, amount: e.target.value})}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveManual} disabled={isSubmitting} className="w-full bg-[#F28705] font-black uppercase h-12 rounded-xl">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : "Guardar Movimiento"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Diálogo Transferencia */}
            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Trasladar <span className="text-[#F28705]">Fondos</span></DialogTitle>
                        <DialogDescription>Mueve dinero entre cuentas del sistema.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase">Destino del Fondo</Label>
                            <Select value={transferData.target} onValueChange={(v: any) => setTransferData({...transferData, target: v})}>
                                <SelectTrigger className="rounded-xl h-12 font-bold"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="caja-chica">Caja Chica (Efectivo)</SelectItem>
                                    <SelectItem value="banco">Depósito Bancario</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase">Moneda</Label>
                                <Select value={transferData.currency} onValueChange={(v: any) => setTransferData({...transferData, currency: v})}>
                                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Bs">Bs.</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase">Monto a Enviar</Label>
                                <Input 
                                    type="number" 
                                    placeholder="0.00" 
                                    className="rounded-xl font-bold h-10"
                                    value={transferData.amount}
                                    onChange={e => setTransferData({...transferData, amount: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase">Motivo / Notas</Label>
                            <Input 
                                placeholder="Ej: Reposición quincenal" 
                                className="rounded-xl"
                                value={transferData.description}
                                onChange={e => setTransferData({...transferData, description: e.target.value})}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleTransfer} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black uppercase h-12 rounded-xl">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : "Ejecutar Transferencia"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useAuthorization } from '@/hooks/use-authorization';
import { CalendarIcon, DollarSign, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { doc, getDoc, collection, addDoc, serverTimestamp, runTransaction, increment, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateExchangeReceipt } from '@/lib/pdf-generator';

interface Account {
    id: string;
    nombre: string;
    saldoActual: number;
    tipo: 'banco' | 'efectivo' | 'otros' | 'dolares';
}

interface ExchangeOperationModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    condoId: string;
    onSuccess?: () => void;
}

export function ExchangeOperationModal({ isOpen, onOpenChange, condoId, onSuccess }: ExchangeOperationModalProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [operationType, setOperationType] = useState<'compra' | 'venta'>('compra');
    const [counterpartyName, setCounterpartyName] = useState('');
    const [counterpartyId, setCounterpartyId] = useState('');
    const [usdAmount, setUsdAmount] = useState<number>(0);
    const [exchangeRate, setExchangeRate] = useState<number>(0);
    const [operationDate, setOperationDate] = useState<Date>(new Date());
    const [observations, setObservations] = useState('');
    const [selectedCuentaBs, setSelectedCuentaBs] = useState<string>('');
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [cuentaUsdId, setCuentaUsdId] = useState<string>('');
    
    // Cargar cuentas
    useEffect(() => {
        if (!condoId) return;
        const loadAccounts = async () => {
            const accountsSnap = await getDocs(collection(db, 'condominios', condoId, 'cuentas'));
            const allAccounts: Account[] = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account));
            setAccounts(allAccounts);
            
            // Buscar cuenta en dólares
            const usdAccount = allAccounts.find(a => a.tipo === 'dolares');
            if (usdAccount) setCuentaUsdId(usdAccount.id);
            
            // Buscar Caja Principal por defecto
            const cajaPrincipal = allAccounts.find(a => a.nombre === 'CAJA PRINCIPAL');
            if (cajaPrincipal) setSelectedCuentaBs(cajaPrincipal.id);
        };
        loadAccounts();
    }, [condoId]);

    // Cargar tasa de cambio activa (solo como referencia, el usuario puede cambiarla)
    useEffect(() => {
        if (!condoId) return;
        const fetchRate = async () => {
            const settingsSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            if (settingsSnap.exists()) {
                const activeRate = (settingsSnap.data().exchangeRates || []).find((r: any) => r.active);
                if (activeRate) setExchangeRate(activeRate.rate);
            }
        };
        fetchRate();
    }, [condoId]);
    
    const bsAmount = usdAmount * exchangeRate;
    
    // Filtrar cuentas en bolívares (tipo banco o efectivo, excluyendo dolares)
    const cuentasBs = accounts.filter(a => a.tipo !== 'dolares' && a.tipo !== 'otros');
    
    const handleSubmit = async () => {
        if (!counterpartyName || usdAmount <= 0 || exchangeRate <= 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Complete todos los campos' });
            return;
        }
        
        if (!selectedCuentaBs) {
            toast({ variant: 'destructive', title: 'Error', description: 'Seleccione la cuenta en Bolívares' });
            return;
        }
        
        if (!cuentaUsdId) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se encontró una cuenta en Dólares' });
            return;
        }
        
        requestAuthorization(async () => {
            setIsSubmitting(true);
            try {
                const receiptNumber = `USD-${Date.now().toString(36).toUpperCase()}`;
                const settingsSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
                const companyInfo = settingsSnap.exists() ? settingsSnap.data().companyInfo : null;
                
                const cuentaBsRef = doc(db, 'condominios', condoId, 'cuentas', selectedCuentaBs);
                const cuentaUsdRef = doc(db, 'condominios', condoId, 'cuentas', cuentaUsdId);
                const monthId = format(operationDate, 'yyyy-MM');
                const cuentaBsData = accounts.find(a => a.id === selectedCuentaBs);
                const cuentaUsdData = accounts.find(a => a.id === cuentaUsdId);
                
                await runTransaction(db, async (transaction) => {
                    // Registrar operación de cambio
                    const exchangeRef = doc(collection(db, 'condominios', condoId, 'exchange_operations'));
                    transaction.set(exchangeRef, {
                        operationType,
                        counterpartyName,
                        counterpartyId: counterpartyId || null,
                        usdAmount,
                        bsAmount,
                        exchangeRate,
                        cuentaBsId: selectedCuentaBs,
                        cuentaUsdId,
                        operationDate: Timestamp.fromDate(operationDate),
                        observations: observations || null,
                        receiptNumber,
                        createdBy: user?.email,
                        createdAt: serverTimestamp(),
                        status: 'completado'
                    });
                    
                    // Actualizar saldos de cuentas
                    if (operationType === 'compra') {
                        // COMPRA: sale Bs de la cuenta seleccionada, entran USD
                        transaction.update(cuentaBsRef, { saldoActual: increment(-bsAmount) });
                        transaction.update(cuentaUsdRef, { saldoActual: increment(usdAmount) });
                    } else {
                        // VENTA: salen USD, entran Bs a la cuenta seleccionada
                        transaction.update(cuentaUsdRef, { saldoActual: increment(-usdAmount) });
                        transaction.update(cuentaBsRef, { saldoActual: increment(bsAmount) });
                    }
                    
                    // Registrar transacción de egreso/ingreso en el libro diario
                    const transRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                    transaction.set(transRef, {
                        monto: bsAmount,
                        montoUSD: usdAmount,
                        tipo: operationType === 'compra' ? 'egreso' : 'ingreso',
                        tipoCuenta: 'cambio',
                        cuentaId: operationType === 'compra' ? selectedCuentaBs : cuentaUsdId,
                        nombreCuenta: operationType === 'compra' ? cuentaBsData?.nombre : cuentaUsdData?.nombre,
                        descripcion: operationType === 'compra' 
                            ? `COMPRA DE USD: ${usdAmount} USD a ${counterpartyName} - Tasa Bs. ${exchangeRate}`
                            : `VENTA DE USD: ${usdAmount} USD a ${counterpartyName} - Tasa Bs. ${exchangeRate}`,
                        referencia: receiptNumber,
                        fecha: Timestamp.fromDate(operationDate),
                        exchangeOperationId: exchangeRef.id,
                        createdAt: serverTimestamp(),
                        createdBy: user?.email
                    });
                    
                    // Registrar transacción complementaria
                    const transRef2 = doc(collection(db, 'condominios', condoId, 'transacciones'));
                    transaction.set(transRef2, {
                        monto: bsAmount,
                        montoUSD: usdAmount,
                        tipo: operationType === 'compra' ? 'ingreso' : 'egreso',
                        tipoCuenta: 'cambio',
                        cuentaId: operationType === 'compra' ? cuentaUsdId : selectedCuentaBs,
                        nombreCuenta: operationType === 'compra' ? cuentaUsdData?.nombre : cuentaBsData?.nombre,
                        descripcion: operationType === 'compra' 
                            ? `INGRESO POR COMPRA DE USD: ${usdAmount} USD`
                            : `EGRESO POR VENTA DE USD: ${usdAmount} USD`,
                        referencia: receiptNumber,
                        fecha: Timestamp.fromDate(operationDate),
                        exchangeOperationId: exchangeRef.id,
                        createdAt: serverTimestamp(),
                        createdBy: user?.email
                    });
                    
                    // Actualizar estadísticas
                    const statsRef = doc(db, 'condominios', condoId, 'financial_stats', monthId);
                    transaction.set(statsRef, {
                        periodo: monthId,
                        totalOperacionesCambioBs: increment(bsAmount),
                        totalOperacionesCambioUsd: increment(usdAmount),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                });
                
                // Generar comprobante PDF
                const receiptData = {
                    condoName: companyInfo?.name || 'CONDOMINIO',
                    rif: companyInfo?.rif || 'J-40587208-0',
                    receiptNumber,
                    operationType,
                    counterpartyName,
                    counterpartyId: counterpartyId || undefined,
                    usdAmount,
                    bsAmount,
                    exchangeRate,
                    operationDate: format(operationDate, 'dd/MM/yyyy HH:mm'),
                    observations: observations || undefined,
                    authorizedBy: user?.email || 'Administrador',
                    deliveredBy: user?.email || 'Administrador',
                    receivedBy: counterpartyName
                };
                
                await generateExchangeReceipt(receiptData, companyInfo?.logo || null, 'download');
                
                toast({ 
                    title: operationType === 'compra' ? 'Compra de USD registrada' : 'Venta de USD registrada',
                    description: `${usdAmount} USD ${operationType === 'compra' ? 'comprados' : 'vendidos'} a ${counterpartyName} a Bs. ${exchangeRate} por USD`
                });
                
                // Limpiar formulario
                setCounterpartyName('');
                setCounterpartyId('');
                setUsdAmount(0);
                setExchangeRate(0);
                setObservations('');
                onOpenChange(false);
                if (onSuccess) onSuccess();
            } catch (error: any) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo registrar la operación' });
            } finally {
                setIsSubmitting(false);
            }
        });
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase italic flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-emerald-400" />
                        Operación de Cambio (USD Efectivo)
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 text-[10px] uppercase">
                        Registre compra o venta de dólares en efectivo
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 py-4">
                    {/* Tipo de operación */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Tipo de Operación</Label>
                        <div className="flex gap-3">
                            <Button 
                                type="button" 
                                variant={operationType === 'compra' ? 'default' : 'outline'} 
                                onClick={() => setOperationType('compra')} 
                                className={cn("flex-1 rounded-xl font-black uppercase text-[10px]", operationType === 'compra' ? "bg-emerald-600 hover:bg-emerald-700" : "border-white/10")}
                            >
                                COMPRA USD
                            </Button>
                            <Button 
                                type="button" 
                                variant={operationType === 'venta' ? 'default' : 'outline'} 
                                onClick={() => setOperationType('venta')} 
                                className={cn("flex-1 rounded-xl font-black uppercase text-[10px]", operationType === 'venta' ? "bg-amber-600 hover:bg-amber-700" : "border-white/10")}
                            >
                                VENTA USD
                            </Button>
                        </div>
                        <p className="text-[8px] text-slate-500 mt-1">
                            {operationType === 'compra' 
                                ? '💰 El condominio COMPRA dólares: sale Bs. de la cuenta seleccionada, ingresan USD a Cuenta Dólar'
                                : '💵 El condominio VENDE dólares: salen USD de Cuenta Dólar, ingresan Bs. a la cuenta seleccionada'}
                        </p>
                    </div>
                    
                    {/* Contraparte */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Contraparte</Label>
                        <Input 
                            placeholder="Nombre completo" 
                            value={counterpartyName} 
                            onChange={(e) => setCounterpartyName(e.target.value)} 
                            className="rounded-xl bg-slate-800 border-none text-white" 
                        />
                        <Input 
                            placeholder="Cédula/RIF (opcional)" 
                            value={counterpartyId} 
                            onChange={(e) => setCounterpartyId(e.target.value)} 
                            className="rounded-xl bg-slate-800 border-none text-white mt-2" 
                        />
                    </div>
                    
                    {/* Selección de cuenta en Bolívares */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400">
                            {operationType === 'compra' ? 'Cuenta de origen (Bs.)' : 'Cuenta de destino (Bs.)'}
                        </Label>
                        <Select value={selectedCuentaBs} onValueChange={setSelectedCuentaBs}>
                            <SelectTrigger className="rounded-xl bg-slate-800 border-none text-white font-black uppercase text-[10px]">
                                <SelectValue placeholder="Seleccionar cuenta..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                {cuentasBs.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id} className="font-black uppercase text-[10px] italic">
                                        {acc.nombre} (Bs.)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[8px] text-slate-500">
                            {operationType === 'compra' 
                                ? '➜ De esta cuenta saldrán los Bolívares para comprar los USD'
                                : '➜ A esta cuenta ingresarán los Bolívares de la venta de USD'}
                        </p>
                    </div>
                    
                    {/* Montos */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Monto USD</Label>
                            <Input 
                                type="number" 
                                step="0.01" 
                                placeholder="0.00" 
                                value={usdAmount || ''} 
                                onChange={(e) => setUsdAmount(parseFloat(e.target.value) || 0)} 
                                className="rounded-xl bg-slate-800 border-none text-white font-black" 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Precio (Bs. por USD)</Label>
                            <Input 
                                type="number" 
                                step="0.01" 
                                placeholder="0.00" 
                                value={exchangeRate || ''} 
                                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)} 
                                className="rounded-xl bg-slate-800 border-none text-white font-black" 
                            />
                        </div>
                    </div>
                    
                    {/* Total en Bolívares */}
                    <div className="bg-slate-800/50 p-4 rounded-xl text-center">
                        <p className="text-[8px] font-black uppercase text-slate-400">Total en Bolívares</p>
                        <p className="text-2xl font-black text-emerald-400 italic">
                            Bs. {bsAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                    
                    {/* Fecha */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Fecha de Operación</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full rounded-xl bg-slate-800 border-none text-white justify-start">
                                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                                    {format(operationDate, 'PPP', { locale: es })}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="bg-slate-900 border-white/10">
                                <Calendar 
                                    mode="single" 
                                    selected={operationDate} 
                                    onSelect={(d) => d && setOperationDate(d)} 
                                    locale={es} 
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    
                    {/* Observaciones */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Observaciones</Label>
                        <Textarea 
                            placeholder="Motivo de la operación..." 
                            value={observations} 
                            onChange={(e) => setObservations(e.target.value)} 
                            className="rounded-xl bg-slate-800 border-none text-white" 
                            rows={2} 
                        />
                    </div>
                </div>
                
                <DialogFooter className="gap-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-black uppercase text-[10px]">
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || !counterpartyName || usdAmount <= 0 || exchangeRate <= 0 || !selectedCuentaBs} 
                        className={cn("rounded-xl font-black uppercase text-[10px] flex-1", operationType === 'compra' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700")}
                    >
                        {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <DollarSign className="mr-2 h-4 w-4" />}
                        {operationType === 'compra' ? 'REGISTRAR COMPRA' : 'REGISTRAR VENTA'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
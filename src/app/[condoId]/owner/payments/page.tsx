'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, CheckCircle2, DollarSign, FileText, Hash, Loader2, Banknote, Info, Save, FileUp, UserPlus, Trash2, Search, XCircle, Calculator, Receipt, ArrowLeft } from 'lucide-react';
import { format, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';

type Owner = {
    id: string;
    name: string;
    email?: string;
    properties: { street: string, house: string }[];
};

type BeneficiaryRow = {
    id: string;
    owner: Owner | null;
    searchTerm: string;
    amount: string;
    selectedProperty: { street: string, house: string } | null;
};

type PaymentMethod = 'movil' | 'transferencia' | 'efectivo_bs' | '';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function ReportPaymentComponent() {
    const { toast } = useToast();
    const params = useParams();
    const condoId = (params?.condoId as string) || "";
    const { user: authUser, ownerData: authOwnerData } = useAuth();
    const router = useRouter();
    
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('movil');
    const [paymentCategory, setPaymentCategory] = useState<string>('ordinaria');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [amountUSD, setAmountUSD] = useState<string>('');
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);

    const isCashPayment = paymentMethod === 'efectivo_bs';
    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
        return () => unsubscribe();
    }, [condoId, ownersCollectionName]);
    
    useEffect(() => {
         if (authOwnerData && authUser) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: { id: authUser.uid, name: authOwnerData.name, properties: authOwnerData.properties, email: authUser.email || undefined },
                searchTerm: '',
                amount: '',
                selectedProperty: authOwnerData.properties?.[0] || null
            }]);
        }
    }, [authOwnerData, authUser]);

    useEffect(() => {
        if (!condoId) return;
        const fetchRate = async () => {
             try {
                const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    if (paymentDate) {
                        setExchangeRate(null);
                        setExchangeRateMessage('Buscando tasa...');
                        const allRates = (settings.exchangeRates || []) as any[];
                        const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                        const applicableRates = allRates.filter(r => r.date <= paymentDateString).sort((a, b) => b.date.localeCompare(a.date));
                        if (applicableRates.length > 0) {
                             setExchangeRate(applicableRates[0].rate);
                             setExchangeRateMessage('');
                        } else {
                            setExchangeRateMessage('No hay tasa para esta fecha.');
                        }
                    } else {
                        setExchangeRate(null);
                        setExchangeRateMessage('');
                    }
                } else {
                     setExchangeRateMessage('No hay configuraciones.');
                }
            } catch (e) {
                 setExchangeRateMessage('Error al buscar tasa.');
                 console.error(e);
            }
        }
        fetchRate();
    }, [paymentDate, condoId]);
    
    useEffect(() => {
        if (isCashPayment) {
            setBank('Efectivo');
            setReference('EFECTIVO');
        } else {
            if (bank === 'Efectivo') setBank('');
            if (reference === 'EFECTIVO') setReference('');
        }
    }, [isCashPayment]);

    useEffect(() => {
        const bs = parseFloat(totalAmount);
        if (!isNaN(bs) && exchangeRate && exchangeRate > 0) {
            setAmountUSD((bs / exchangeRate).toFixed(2));
        } else {
            setAmountUSD('');
        }
    }, [totalAmount, exchangeRate]);

    const resetForm = () => {
        setPaymentDate(new Date());
        setPaymentMethod('movil');
        setBank('');
        setOtherBank('');
        setReference('');
        setTotalAmount('');
        setReceiptImage(null);
        setAmountUSD('');
        if (authOwnerData && authUser) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: { id: authUser.uid, name: authOwnerData.name, properties: authOwnerData.properties, email: authUser.email || undefined },
                searchTerm: '',
                amount: '',
                selectedProperty: authOwnerData.properties?.[0] || null
            }]);
        }
    }

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const compressedBase64 = await compressImage(file, 800, 800);
            setReceiptImage(compressedBase64);
            toast({ title: 'Comprobante cargado', description: 'La imagen se ha optimizado y está lista para ser enviada.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error de imagen', description: 'No se pudo procesar la imagen.' });
        } finally {
            setLoading(false);
        }
    };
    
    const assignedTotal = beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
    const balance = (Number(totalAmount) || 0) - assignedTotal;

    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });
    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => {
        if (beneficiaryRows.length > 1) {
            setBeneficiaryRows(rows => rows.filter(row => row.id !== id));
        } else {
             toast({ variant: "destructive", title: "Acción no permitida", description: "Debe haber al menos un beneficiario." });
        }
    };

    const getFilteredOwnersFn = (searchTerm: string) => {
        if (!searchTerm || searchTerm.length < 2) return [];
        return allOwners.filter(owner => 
            owner.name?.toLowerCase().includes(searchTerm.toLowerCase()) && 
            owner.email?.toLowerCase() !== 'vallecondo@gmail.com'
        );
    };

    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        if (!paymentDate || !exchangeRate || !paymentMethod || !totalAmount || Number(totalAmount) <= 0) {
            return { isValid: false, error: 'Por favor, complete los campos de fecha, tasa, método y monto.' };
        }
        if (!isCashPayment && (!bank || reference.length < 4)) {
            return { isValid: false, error: 'Complete el banco y la referencia (mín. 4 dígitos) para pagos bancarios.' };
        }
        if (beneficiaryRows.some(row => !row.owner || !row.amount || Number(row.amount) <= 0 || !row.selectedProperty)) {
            return { isValid: false, error: 'Complete la información para cada beneficiario (propietario, propiedad y monto).' };
        }
        if (Math.abs(balance) > 0.01) {
            return { isValid: false, error: 'El monto total no coincide con la suma de los montos asignados a los beneficiarios.' };
        }
        if (!condoId) return { isValid: false, error: "No se encontró un condominio activo." };
        
        if (!isCashPayment) {
            try {
                const q = query(collection(db, "condominios", condoId, "payments"), where("reference", "==", reference), where("totalAmount", "==", Number(totalAmount)), where("paymentDate", "==", Timestamp.fromDate(paymentDate)));
                if (!(await getDocs(q)).empty) {
                    return { isValid: false, error: 'Ya existe un reporte de pago con esta misma referencia, monto y fecha.' };
                }
            } catch (dbError) {
                 return { isValid: false, error: "No se pudo verificar si el pago ya existe. Intente de nuevo." };
            }
        }
        return { isValid: true };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const validation = await validateForm();
        if (!validation.isValid) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: validation.error, duration: 6000 });
            setIsSubmitting(false);
            return;
        }

        if (!authUser || !authOwnerData || !condoId) {
            toast({ variant: 'destructive', title: 'Error de Autenticación'});
            setIsSubmitting(false);
            return;
        }

        try {
            const beneficiaries = beneficiaryRows.map(row => ({
                ownerId: row.owner!.id,
                ownerName: row.owner!.name,
                ...(row.selectedProperty && { street: row.selectedProperty.street, house: row.selectedProperty.house }),
                amount: Number(row.amount)
            }));

            const paymentData: any = {
                paymentCategory,
                paymentDate: Timestamp.fromDate(paymentDate!),
                exchangeRate: exchangeRate,
                paymentMethod: paymentMethod,
                bank: isCashPayment ? 'Efectivo' : (bank === 'Otro' ? otherBank : bank),
                reference: isCashPayment ? 'EFECTIVO' : reference,
                totalAmount: Number(totalAmount),
                beneficiaries: beneficiaries,
                beneficiaryIds: Array.from(new Set(beneficiaries.map(b => b.ownerId))),
                status: 'pendiente',
                reportedAt: serverTimestamp(),
                reportedBy: authUser.uid,
                receiptUrl: receiptImage || null,
            };
            
            const paymentRef = await addDoc(collection(db, "condominios", condoId, "payments"), paymentData);
            
            const q = query(collection(db, 'condominios', condoId, ownersCollectionName), where('role', '==', 'administrador'));
            const adminSnapshot = await getDocs(q);

            const batch = writeBatch(db);
            adminSnapshot.forEach(adminDoc => {
                const notificationsRef = doc(collection(db, `condominios/${condoId}/${ownersCollectionName}/${adminDoc.id}/notifications`));
                batch.set(notificationsRef, {
                    title: "Nuevo Pago Reportado",
                    body: `${authOwnerData?.name || 'Un propietario'} ha reportado un nuevo pago por Bs. ${formatCurrency(Number(totalAmount))}.`,
                    createdAt: serverTimestamp(),
                    read: false,
                    href: `/${condoId}/admin/payments?tab=verify`,
                    paymentId: paymentRef.id
                });
            });
            await batch.commit();

            resetForm();
            setIsInfoDialogOpen(true);

        } catch (error) {
            console.error("Error submitting payment: ", error);
            toast({ variant: "destructive", title: "Error Inesperado", description: "No se pudo enviar el reporte. Por favor, intente de nuevo." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            {/* HEADER */}
            <div className="mb-10">
                <div className="flex items-center justify-between">
                    <Button 
                        variant="outline" 
                        onClick={() => router.push(`/${condoId}/owner/dashboard`)}
                        className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Dashboard
                    </Button>
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            Reportar <span className="text-primary">Pago</span>
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                        <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                            Completa el formulario para notificar tu pago a la administración.
                        </p>
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={() => router.push(`/${condoId}/owner/payments/calculator`)}
                        className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic"
                    >
                        <Calculator className="mr-2 h-4 w-4" /> Usar Calculadora
                    </Button>
                </div>
            </div>

            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden">
                <CardHeader className="bg-white/5 p-8 border-b border-white/5">
                    <CardTitle className="text-white font-black uppercase italic text-2xl tracking-tighter">1. Detalles de la <span className="text-primary">Transacción</span></CardTitle>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="p-8 space-y-10">
                        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
                            {/* Método de Pago */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Método de Pago</Label>
                                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} disabled={isSubmitting}>
                                    <SelectTrigger className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black uppercase text-xs">
                                        <FileText className="mr-3 h-5 w-5 text-primary" />
                                        <SelectValue placeholder="Seleccione un método..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="transferencia" className="font-black uppercase text-[10px] italic">Transferencia</SelectItem>
                                        <SelectItem value="movil" className="font-black uppercase text-[10px] italic">Pago Móvil</SelectItem>
                                        <SelectItem value="efectivo_bs" className="font-black uppercase text-[10px] italic">Efectivo Bs.</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Categoría */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Categoría</Label>
                                <Select value={paymentCategory} onValueChange={setPaymentCategory}>
                                    <SelectTrigger className="h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs">
                                        <SelectValue placeholder="Seleccionar categoría..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="ordinaria" className="font-black uppercase text-[10px] italic">Cuota de Condominio</SelectItem>
                                        <SelectItem value="extraordinaria" className="font-black uppercase text-[10px] italic">Cuota Extraordinaria</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Fecha del Pago */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Fecha del Pago</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-14 rounded-2xl bg-slate-800 border-none text-white uppercase italic text-xs hover:bg-slate-800", !paymentDate && "text-muted-foreground")} disabled={isSubmitting}>
                                            <CalendarIcon className="mr-3 h-5 w-5 text-primary" />
                                            {paymentDate ? format(paymentDate, "PPP", { locale: es }) : "Seleccione una fecha"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10">
                                        <Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Tasa BCV (solo lectura) */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Tasa BCV</Label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                                    <Input 
                                        type="text" 
                                        value={exchangeRate ? formatCurrency(exchangeRate) : exchangeRateMessage || 'Seleccione fecha'} 
                                        readOnly 
                                        className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic text-right pr-6"
                                    />
                                </div>
                            </div>

                            {/* Banco Emisor */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Banco Emisor</Label>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    className="w-full justify-start text-left font-normal h-14 rounded-2xl bg-slate-800 border-none text-white uppercase italic text-xs hover:bg-slate-800"
                                    onClick={() => setIsBankModalOpen(true)} 
                                    disabled={isSubmitting || isCashPayment}
                                >
                                    <Banknote className="mr-3 h-5 w-5 text-primary" />
                                    {isCashPayment ? 'No Aplica' : (bank || "Seleccione un banco...")}
                                </Button>
                            </div>

                            {bank === 'Otro' && !isCashPayment && (
                                <div className="space-y-2 md:col-span-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Nombre del Otro Banco</Label>
                                    <div className="relative">
                                        <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                                        <Input 
                                            value={otherBank} 
                                            onChange={(e) => setOtherBank(e.target.value)} 
                                            className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic"
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Referencia */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Referencia</Label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                                    <Input 
                                        value={reference} 
                                        onChange={(e) => setReference(e.target.value.replace(/\D/g, '').slice(0, 6))} 
                                        maxLength={6} 
                                        className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic text-center text-xl tracking-widest"
                                        placeholder="######" 
                                        disabled={isSubmitting || isCashPayment} 
                                    />
                                </div>
                            </div>

                            {/* Monto Bs. */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Monto Bs.</Label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                                    <Input 
                                        type="number" 
                                        value={totalAmount} 
                                        onChange={(e) => setTotalAmount(e.target.value)} 
                                        className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black text-2xl italic text-right pr-6" 
                                        placeholder="0,00" 
                                        disabled={isSubmitting} 
                                    />
                                </div>
                            </div>

                            {/* Equivalente USD */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Equivalente USD</Label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-500" />
                                    <Input 
                                        type="text" 
                                        value={amountUSD ? `$ ${amountUSD}` : ''} 
                                        readOnly 
                                        className="pl-12 h-14 rounded-2xl bg-slate-800/50 border-none text-emerald-500 font-black text-xl italic text-right pr-6" 
                                    />
                                </div>
                            </div>

                            {/* Adjuntar Comprobante */}
                            <div className="space-y-2 md:col-span-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Adjuntar Comprobante (Opcional)</Label>
                                <div className="relative">
                                    <FileUp className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                                    <Input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={handleImageUpload} 
                                        className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-bold file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-slate-900 hover:file:bg-primary/90" 
                                        disabled={isSubmitting} 
                                    />
                                </div>
                                {receiptImage && (
                                    <p className="text-[10px] font-black text-emerald-500 flex items-center gap-2 mt-2">
                                        <CheckCircle2 className="h-3 w-3" /> Comprobante cargado correctamente.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* ASIGNACIÓN DE BENEFICIARIOS */}
                        <div className="space-y-6">
                            <Label className="text-[10px] font-black uppercase text-primary tracking-widest ml-2">Asignación de Beneficiarios</Label>
                            
                            {beneficiaryRows.map((row, index) => (
                                <Card key={row.id} className="p-8 bg-white/5 border border-white/5 rounded-[2rem] relative">
                                    <div className="grid md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            {!row.owner ? (
                                                <div className="relative">
                                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                                                    <Input 
                                                        placeholder="Buscar Residente..." 
                                                        className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black uppercase text-xs" 
                                                        value={row.searchTerm} 
                                                        onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} 
                                                    />
                                                    {row.searchTerm.length >= 2 && getFilteredOwnersFn(row.searchTerm).length > 0 && (
                                                        <Card className="absolute z-50 w-full mt-2 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                                                            <ScrollArea className="h-48">
                                                                {getFilteredOwnersFn(row.searchTerm).map(owner => (
                                                                    <div 
                                                                        key={owner.id} 
                                                                        onClick={() => handleOwnerSelect(row.id, owner)} 
                                                                        className="p-4 hover:bg-white/5 cursor-pointer font-black text-sm uppercase text-white border-b border-white/5"
                                                                    >
                                                                        {owner.name}
                                                                    </div>
                                                                ))}
                                                            </ScrollArea>
                                                        </Card>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="p-5 bg-slate-800 rounded-2xl border border-white/5 flex justify-between items-center">
                                                    <div>
                                                        <p className="font-black text-primary uppercase text-xs italic">{row.owner.name}</p>
                                                        {row.selectedProperty && (
                                                            <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                                                                {row.selectedProperty.street} - {row.selectedProperty.house}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Button 
                                                        type="button" 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        onClick={() => removeBeneficiaryRow(row.id)} 
                                                        className="text-red-500 hover:bg-red-500/10 rounded-full"
                                                    >
                                                        <XCircle className="h-5 w-5" />
                                                    </Button>
                                                </div>
                                            )}
                                            
                                            {row.owner && row.owner.properties && row.owner.properties.length > 0 && (
                                                <Select 
                                                    onValueChange={(v) => {
                                                        const found = row.owner?.properties.find(p => `${p.street}-${p.house}` === v);
                                                        updateBeneficiaryRow(row.id, { selectedProperty: found || null });
                                                    }} 
                                                    value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}
                                                >
                                                    <SelectTrigger className="h-12 bg-slate-800 rounded-xl border-none text-white font-bold uppercase text-[10px]">
                                                        <SelectValue placeholder="Seleccionar propiedad..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 text-white border-white/10 italic">
                                                        {row.owner.properties.map((p, idx) => (
                                                            <SelectItem key={idx} value={`${p.street}-${p.house}`} className="text-[10px] font-black uppercase italic">
                                                                {p.street} - {p.house}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label className="text-[9px] font-black uppercase text-slate-500 ml-2">Monto Individual (Bs.)</Label>
                                            <Input 
                                                type="number" 
                                                value={row.amount} 
                                                onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} 
                                                className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black text-xl italic text-right pr-6" 
                                                placeholder="0,00" 
                                            />
                                        </div>
                                    </div>
                                </Card>
                            ))}
                            
                            <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                onClick={addBeneficiaryRow} 
                                className="rounded-xl font-black uppercase text-[10px] border-white/10 text-slate-400 hover:bg-white/5"
                            >
                                <UserPlus className="mr-2 h-4 w-4 text-primary" /> Añadir Beneficiario
                            </Button>
                        </div>
                    </CardContent>
                    
                    <CardFooter className="bg-white/5 p-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className={cn("font-black text-2xl italic tracking-tighter uppercase", balance !== 0 ? 'text-red-500' : 'text-emerald-500')}>
                            Diferencia: Bs. {formatCurrency(balance)}
                        </div>
                        <Button 
                            type="submit" 
                            disabled={isSubmitting || Math.abs(balance) > 0.01 || beneficiaryRows.length === 0} 
                            className="h-16 px-12 rounded-2xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <Save className="mr-2 h-5 w-5" />}
                            REGISTRAR PAGO Y ASENTAR
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(value) => { setBank(value); if (value !== 'Otro') setOtherBank(''); setIsBankModalOpen(false); }} />
            
            <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-2xl font-black uppercase italic">
                            <Info className="h-6 w-6 text-primary" />
                            Reporte Enviado para Revisión
                        </DialogTitle>
                        <div className="pt-4 text-sm text-slate-400 space-y-4">
                            <p>¡Gracias! Hemos recibido tu reporte de pago. El tiempo máximo para la aprobación es de <strong className="text-primary">24 horas</strong>.</p>
                            <p>Te invitamos a ingresar nuevamente después de este lapso para:</p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>Verificar si el monto enviado cubrió completamente tu deuda.</li>
                                <li>Descargar tu recibo de pago una vez que sea aprobado.</li>
                            </ul>
                        </div>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setIsInfoDialogOpen(false)} className="bg-primary text-slate-900 font-black uppercase text-[10px] h-12 rounded-xl italic">
                            Entendido
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function PaymentsPage() {
    return (
        <ReportPaymentComponent />
    );
}

export default function PaymentsPageWrapper() {
    return (
        <Suspense fallback={<div className="flex h-64 items-center justify-center bg-[#1A1D23]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <PaymentsPage />
        </Suspense>
    );
}


'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Check, CheckCircle2, DollarSign, FileText, Hash, Loader2, Upload, Banknote, Info, X, Save, FileUp, UserPlus, Trash2, XCircle, Search, ChevronDown, Minus, Equal, Receipt, Calculator } from 'lucide-react';
import { format, isBefore, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


// --- TYPES AND CONSTANTS ---

type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
};

type ExchangeRate = {
    id: string;
    date: string; // Stored as 'yyyy-MM-dd'
    rate: number;
    active: boolean;
};

type BeneficiaryRow = {
    id: string;
    owner: Owner | null;
    searchTerm: string;
    amount: string;
    selectedProperty: { street: string, house: string } | null;
};

type PaymentMethod = 'movil' | 'transferencia' | '';

const ADMIN_USER_ID = 'valle-admin-main-account';

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
};

type PaymentDetails = {
    paymentMethod: 'movil' | 'transferencia' | '';
    bank: string;
    otherBank: string;
    reference: string;
};

const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'tesoro', label: 'Banco del Tesoro' },
    { value: 'otro', label: 'Otro' },
];

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};


// --- COMPONENT: REPORT PAYMENT FORM ---

function ReportPaymentComponent() {
    const { toast } = useToast();
    const { user: authUser, ownerData: authOwnerData, activeCondoId } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('movil');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [amountUSD, setAmountUSD] = useState<string>('');
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
    const [openSections, setOpenSections] = useState({ details: true, beneficiaries: true });

    useEffect(() => {
        if (!activeCondoId) return;
        const q = query(collection(db, "condominios", activeCondoId, "owners"), where("role", "==", "propietario"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
        return () => unsubscribe();
    }, [activeCondoId]);
    
    useEffect(() => {
         if (authOwnerData && authUser) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: { id: authUser.uid, name: authOwnerData.name, properties: authOwnerData.properties },
                searchTerm: '',
                amount: '',
                selectedProperty: authOwnerData.properties?.[0] || null
            }]);
        }
    }, [authOwnerData, authUser]);

    useEffect(() => {
        if (!activeCondoId) return;
        const fetchRate = async () => {
             try {
                const settingsRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    if (paymentDate) {
                        setExchangeRate(null);
                        setExchangeRateMessage('Buscando tasa...');
                        const allRates = (settings.exchangeRates || []) as ExchangeRate[];
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
    }, [paymentDate, activeCondoId]);

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
                owner: { id: authUser.uid, name: authOwnerData.name, properties: authOwnerData.properties },
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
    
    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balance = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);

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
    const getFilteredOwners = (searchTerm: string) => {
        if (!searchTerm || searchTerm.length < 2) return [];
        return allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    };


    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        if (!paymentDate || !exchangeRate || !paymentMethod || !bank || !totalAmount || Number(totalAmount) <= 0 || reference.length < 4) {
             return { isValid: false, error: 'Por favor, complete todos los campos de la transacción (referencia min. 4 dígitos).' };
        }
        if (!receiptImage) {
            return { isValid: false, error: 'Debe adjuntar una imagen del comprobante de pago.' };
        }
        if (beneficiaryRows.some(row => !row.owner || !row.amount || Number(row.amount) <= 0 || !row.selectedProperty)) {
            return { isValid: false, error: 'Complete la información para cada beneficiario (propietario, propiedad y monto).' };
        }
        if (Math.abs(balance) > 0.01) {
            return { isValid: false, error: 'El monto total no coincide con la suma de los montos asignados a los beneficiarios.' };
        }
        if (!activeCondoId) return { isValid: false, error: "No se encontró un condominio activo." };
        try {
            const q = query(collection(db, "condominios", activeCondoId, "payments"), where("reference", "==", reference), where("totalAmount", "==", Number(totalAmount)), where("paymentDate", "==", Timestamp.fromDate(paymentDate)));
            if (!(await getDocs(q)).empty) {
                return { isValid: false, error: 'Ya existe un reporte de pago con esta misma referencia, monto y fecha.' };
            }
        } catch (dbError) {
             return { isValid: false, error: "No se pudo verificar si el pago ya existe. Intente de nuevo." };
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

        if (!authUser || !authOwnerData || !activeCondoId) {
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
                paymentDate: Timestamp.fromDate(paymentDate!),
                exchangeRate: exchangeRate,
                paymentMethod: paymentMethod,
                bank: bank === 'Otro' ? otherBank : bank,
                reference: reference,
                totalAmount: Number(totalAmount),
                beneficiaries: beneficiaries,
                beneficiaryIds: Array.from(new Set(beneficiaries.map(b => b.ownerId))),
                status: 'pendiente' as 'pendiente',
                reportedAt: serverTimestamp(),
                reportedBy: authUser.uid,
                receiptUrl: receiptImage,
            };
            
            const paymentRef = await addDoc(collection(db, "condominios", activeCondoId, "payments"), paymentData);
            
            const q = query(collection(db, 'condominios', activeCondoId, 'owners'), where('role', '==', 'administrador'));
            const adminSnapshot = await getDocs(q);

            const batch = writeBatch(db);
            adminSnapshot.forEach(adminDoc => {
                const notificationsRef = doc(collection(db, `condominios/${activeCondoId}/owners/${adminDoc.id}/notifications`));
                batch.set(notificationsRef, {
                    title: "Nuevo Pago Reportado",
                    body: `${authOwnerData?.name || 'Un propietario'} ha reportado un nuevo pago por Bs. ${totalAmount}.`,
                    createdAt: serverTimestamp(),
                    read: false,
                    href: `/admin/payments?tab=verify`,
                    paymentId: paymentRef.id
                });
            });
            await batch.commit();

            resetForm();
            setIsInfoDialogOpen(true);

        } catch (error) {
            console.error("Error submitting payment: ", error);
            const errorMessage = "No se pudo enviar el reporte. Por favor, intente de nuevo.";
            toast({ variant: "destructive", title: "Error Inesperado", description: errorMessage });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Card className="w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl mx-auto">
            <CardHeader className="bg-primary text-primary-foreground p-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                    <Banknote className="w-7 h-7" />
                    <CardTitle className="text-2xl font-bold tracking-wider">REPORTAR PAGO</CardTitle>
                </div>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 grid grid-cols-1 gap-y-6">
                    <Collapsible open={openSections.details} onOpenChange={(isOpen) => setOpenSections(prev => ({...prev, details: isOpen}))}>
                        <Card className="border-none bg-background/5">
                            <CollapsibleTrigger className="w-full">
                                <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                                    <CardTitle>1. Detalles de la Transacción</CardTitle>
                                    <ChevronDown className={`h-5 w-5 transition-transform ${openSections.details ? 'rotate-180' : ''}`} />
                                </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <CardContent className="grid md:grid-cols-2 gap-x-8 gap-y-6 pt-4">
                                    <div className="space-y-2">
                                        <Label className="text-primary uppercase text-xs font-bold tracking-wider">Método de Pago</Label>
                                        <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} disabled={isSubmitting}>
                                            <SelectTrigger className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base focus:ring-primary">
                                                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                <SelectValue placeholder="Seleccione un método..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="transferencia">Transferencia</SelectItem>
                                                <SelectItem value="movil">Pago Móvil</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-primary uppercase text-xs font-bold tracking-wider">Banco Emisor</Label>
                                        <Button type="button" variant="outline" className="w-full justify-start text-left font-normal pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base hover:bg-input" onClick={() => setIsBankModalOpen(true)} disabled={isSubmitting}>
                                            <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                            {bank || "Seleccione un banco..."}
                                        </Button>
                                    </div>
                                    {bank === 'Otro' && (
                                        <div className="space-y-2">
                                            <Label className="text-primary uppercase text-xs font-bold tracking-wider">Nombre del Otro Banco</Label>
                                            <div className="relative flex items-center">
                                            <Banknote className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                            <Input value={otherBank} onChange={(e) => setOtherBank(e.target.value)} className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base" placeholder="Especifique el banco" disabled={isSubmitting}/>
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label className="text-primary uppercase text-xs font-bold tracking-wider">Referencia</Label>
                                        <div className="relative flex items-center">
                                            <Hash className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                            <Input value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base" placeholder="Últimos 6 dígitos" disabled={isSubmitting}/>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-primary uppercase text-xs font-bold tracking-wider">Fecha del Pago</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base hover:bg-input", !paymentDate && "text-muted-foreground")} disabled={isSubmitting}>
                                                    <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                    {paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} /></PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label className="text-primary uppercase text-xs font-bold tracking-wider">Adjuntar Comprobante</Label>
                                        <div className="relative flex items-center">
                                            <FileUp className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                            <Input id="receipt" type="file" onChange={handleImageUpload} className="pl-12 pr-4 py-4 bg-input border-border rounded-2xl text-base file:text-muted-foreground file:text-sm" disabled={isSubmitting} />
                                        </div>
                                        {receiptImage && <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/>Comprobante cargado.</p>}
                                    </div>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                    
                    <Collapsible open={openSections.beneficiaries} onOpenChange={(isOpen) => setOpenSections(prev => ({...prev, beneficiaries: isOpen}))}>
                         <Card className="border-none bg-background/5">
                            <CollapsibleTrigger className="w-full">
                                <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                                    <CardTitle>2. Monto y Beneficiarios</CardTitle>
                                    <ChevronDown className={`h-5 w-5 transition-transform ${openSections.beneficiaries ? 'rotate-180' : ''}`} />
                                </CardHeader>
                            </CollapsibleTrigger>
                           <CollapsibleContent>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label className="text-primary uppercase text-xs font-bold tracking-wider">Monto Total del Pago (Bs.)</Label>
                                            <Input id="totalAmount" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" disabled={loading} className="py-6 bg-input/80 rounded-2xl"/>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-primary uppercase text-xs font-bold tracking-wider">Monto Equivalente (USD)</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input type="text" value={amountUSD} readOnly className="pl-9 bg-muted/50 py-6 rounded-2xl" placeholder="0.00" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4"><Label className="font-semibold">Asignación de Montos</Label>
                                        {beneficiaryRows.map((row, index) => (
                                            <Card key={row.id} className="p-4 bg-muted/50 relative">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2"><Label htmlFor={`search-${row.id}`}>Beneficiario {index + 1}</Label>
                                                        {!row.owner ? (<><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id={`search-${row.id}`} placeholder="Buscar por nombre..." className="pl-9" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} disabled={loading} /></div>{row.searchTerm.length >= 2 && getFilteredOwners(row.searchTerm).length > 0 && <Card className="border rounded-md"><ScrollArea className="h-32">{getFilteredOwners(row.searchTerm).map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(row.id, owner)} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium text-sm">{owner.name}</p></div>))}</ScrollArea></Card>}</>)
                                                        : (<div className="p-3 bg-background rounded-md flex items-center justify-between"><div><p className="font-semibold text-primary">{row.owner.name}</p></div><Button variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading || beneficiaryRows.length === 1}><XCircle className="h-5 w-5 text-destructive" /></Button></div>)}
                                                    </div>
                                                    <div className="space-y-2"><Label htmlFor={`amount-${row.id}`}>Monto Asignado (Bs.)</Label><Input id={`amount-${row.id}`} type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={loading || !row.owner} /></div>
                                                </div>
                                                {row.owner && (
                                                  <div className="mt-4 space-y-2">
                                                    <Label>Asignar a Propiedad</Label>
                                                    <Select 
                                                      onValueChange={(v) => {
                                                        const props = Array.isArray(row.owner?.properties) ? row.owner.properties : [];
                                                        const found = props.find(p => `${p.street}-${p.house}` === v);
                                                        updateBeneficiaryRow(row.id, { selectedProperty: found || null });
                                                      }} 
                                                      value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''} 
                                                      disabled={loading || !row.owner || !Array.isArray(row.owner.properties)}
                                                    >
                                                      <SelectTrigger className="rounded-xl">
                                                        <SelectValue 
                                                          placeholder={
                                                            Array.isArray(row.owner.properties) && row.owner.properties.length > 0
                                                              ? "Seleccione una propiedad..." 
                                                              : "Usuario sin propiedades"
                                                          } 
                                                        />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        {Array.isArray(row.owner?.properties) && row.owner.properties.length > 0 ? (
                                                          row.owner.properties.map((p, pIdx) => (
                                                            <SelectItem 
                                                              key={`${p.street}-${p.house}-${pIdx}`} 
                                                              value={`${p.street}-${p.house}`}
                                                            >
                                                              {`${p.street} - ${p.house}`}
                                                            </SelectItem>
                                                          ))
                                                        ) : (
                                                          <SelectItem value="none" disabled>
                                                            No hay propiedades disponibles
                                                          </SelectItem>
                                                        )}
                                                      </SelectContent>
                                                    </Select>
                                                  </div>
                                                )}
                                                {beneficiaryRows.length > 1 && <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading}><Trash2 className="h-4 w-4"/></Button>}
                                            </Card>
                                        ))}
                                        <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} disabled={loading}><UserPlus className="mr-2 h-4 w-4"/>Añadir Otro Beneficiario</Button>
                                        <CardFooter className="p-4 bg-background/50 rounded-lg space-y-2 mt-4 flex-col items-stretch">
                                            <div className="flex justify-between text-sm font-medium"><span>Monto Total del Pago:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                            <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div><hr className="my-1 border-border"/><div className={cn("flex justify-between text-base font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                                        </CardFooter>
                                    </div>
                                </CardContent>
                               </CollapsibleContent>
                            </Card>
                        </Collapsible>
                    </CardContent>

                <CardFooter className="bg-background/10 p-6 flex justify-end gap-4">
                    <Button type="button" variant="ghost" className="text-muted-foreground hover:text-white" onClick={resetForm} disabled={isSubmitting}>
                        CANCELAR
                    </Button>
                    <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-6 text-base font-bold rounded-xl" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                        Enviar Reporte
                    </Button>
                </CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(value) => { setBank(value); if (value !== 'Otro') setOtherBank(''); setIsBankModalOpen(false); }} />
            <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-6 w-6 text-primary" />
                            Reporte Enviado para Revisión
                        </DialogTitle>
                         <div className="pt-4 text-sm text-muted-foreground space-y-4">
                           <p>¡Gracias! Hemos recibido tu reporte de pago. El tiempo máximo para la aprobación es de <strong>24 horas</strong>.</p>
                           <p>Te invitamos a ingresar nuevamente después de este lapso para:</p>
                           <ul className="list-disc list-inside space-y-1">
                               <li>Verificar si el monto enviado cubrió completamente tu deuda.</li>
                               <li>Descargar tu recibo de pago una vez que sea aprobado.</li>
                           </ul>
                        </div>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setIsInfoDialogOpen(false)}>Entendido</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// --- COMPONENT: PAYMENT CALCULATOR ---

function PaymentCalculatorComponent() {
    const { user, ownerData, loading: authLoading, activeCondoId } = useAuth();
    const router = useRouter();
    const [ownerDebts, setOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({ paymentMethod: '', bank: '', otherBank: '', reference: '' });

    const [now, setNow] = useState<Date | null>(null);
    const { toast } = useToast();
    
    useEffect(() => {
        setNow(new Date());
    }, []);

    useEffect(() => {
        if (authLoading || !user || !ownerData || !activeCondoId) {
            if(!authLoading) setLoadingDebts(false);
            return;
        };

        const settingsRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCondoFee(settings.condoFee || 0);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) setActiveRate(activeRateObj.rate);
                else if (rates.length > 0) {
                    const sortedRates = [...rates].sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setActiveRate(sortedRates[0].rate);
                }
            }
        });
        
        const debtsQuery = query(collection(db, "condominios", activeCondoId, "debts"), where("ownerId", "==", user.uid));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData: Debt[] = [];
            snapshot.forEach(d => debtsData.push({ id: d.id, ...d.data() } as Debt));
            setOwnerDebts(debtsData.sort((a, b) => a.year - b.year || a.month - b.month));
            setLoadingDebts(false);
        });

        return () => {
            settingsUnsubscribe();
            debtsUnsubscribe();
        };

    }, [user, ownerData, authLoading, activeCondoId]);
    
    const paymentCalculator = useMemo(() => {
        if (!ownerData) return { totalToPay: 0, hasSelection: false, dueMonthsCount: 0, advanceMonthsCount: 0, totalDebtBs: 0, balanceInFavor: 0 };
        const pendingDebts = ownerDebts.filter(d => d.status === 'pending' || d.status === 'vencida');
        const dueMonthsTotalUSD = pendingDebts.filter(debt => selectedPendingDebts.includes(debt.id)).reduce((sum, debt) => sum + debt.amountUSD, 0);
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalDebtUSD = dueMonthsTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - (ownerData.balance || 0));
        return { totalToPay, hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0, dueMonthsCount: selectedPendingDebts.length, advanceMonthsCount: selectedAdvanceMonths.length, totalDebtBs, balanceInFavor: ownerData.balance || 0, condoFee };
    }, [selectedPendingDebts, selectedAdvanceMonths, ownerDebts, activeRate, condoFee, ownerData]);

    if (authLoading || loadingDebts) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }
    
    return <PaymentCalculatorUI owner={ownerData} debts={ownerDebts} activeRate={activeRate} condoFee={condoFee} />;
}


// --- UI for Calculator (reused) ---
function PaymentCalculatorUI({ owner, debts, activeRate, condoFee }: { owner: any; debts: Debt[]; activeRate: number; condoFee: number }) {
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    const now = new Date();
    
    const pendingDebts = useMemo(() => debts.filter(d => d.status === 'pending' || d.status === 'vencida').sort((a,b) => a.year - b.year || a.month - b.month), [debts]);
    const futureMonths = useMemo(() => {
        const paidAdvanceMonths = debts.filter(d => d.status === 'paid' && d.description.includes('Adelantado')).map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);
        return Array.from({ length: 12 }, (_, i) => {
            const date = addMonths(now, i);
            const value = format(date, 'yyyy-MM');
            return { value, label: format(date, 'MMMM yyyy', { locale: es }), disabled: paidAdvanceMonths.includes(value) };
        });
    }, [debts, now]);

    const paymentCalculator = useMemo(() => {
        const dueMonthsTotalUSD = pendingDebts.filter(d => selectedPendingDebts.includes(d.id)).reduce((sum, debt) => sum + debt.amountUSD, 0);
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalDebtUSD = dueMonthsTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - (owner.balance || 0));
        return { totalToPay, hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0, dueMonthsCount: selectedPendingDebts.length, advanceMonthsCount: selectedAdvanceMonths.length, totalDebtBs, balanceInFavor: owner.balance || 0, condoFee };
    }, [selectedPendingDebts, selectedAdvanceMonths, pendingDebts, activeRate, condoFee, owner]);
    
    const formatCurrency = (num: number) => {
        if (typeof num !== 'number' || isNaN(num)) return '0,00';
        return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-4">
                <Card>
                    <CardHeader><CardTitle>1. Deudas Pendientes</CardTitle></CardHeader>
                    <CardContent className="p-0">
                       <Table>
                            <TableHeader><TableRow><TableHead className="w-[50px] text-center">Pagar</TableHead><TableHead>Período</TableHead><TableHead>Concepto</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Monto (Bs.)</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {pendingDebts.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center"><Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />No tiene deudas pendientes.</TableCell></TableRow> : 
                                 pendingDebts.map((debt) => {
                                    const debtMonthDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                    const isOverdue = isBefore(debtMonthDate, startOfMonth(now));
                                    const status = debt.status === 'vencida' || (debt.status === 'pending' && isOverdue) ? 'Vencida' : 'Pendiente';
                                    return <TableRow key={debt.id} data-state={selectedPendingDebts.includes(debt.id) ? 'selected' : ''}>
                                            <TableCell className="text-center"><Checkbox onCheckedChange={() => setSelectedPendingDebts(p => p.includes(debt.id) ? p.filter(id=>id!==debt.id) : [...p, debt.id])} checked={selectedPendingDebts.includes(debt.id)} /></TableCell>
                                            <TableCell className="font-medium">{monthsLocale[debt.month]} {debt.year}</TableCell>
                                            <TableCell>{debt.description}</TableCell>
                                            <TableCell><Badge variant={status === 'Vencida' ? 'destructive' : 'warning'}>{status}</Badge></TableCell>
                                            <TableCell className="text-right">Bs. {formatCurrency(debt.amountUSD * activeRate)}</TableCell>
                                        </TableRow>
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>2. Pagar Meses por Adelantado</CardTitle><CardDescription>Cuota mensual actual: ${condoFee.toFixed(2)}</CardDescription></CardHeader>
                    <CardContent><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{futureMonths.map(month => <Button key={month.value} type="button" variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'} className="flex items-center justify-center gap-2 capitalize" onClick={() => setSelectedAdvanceMonths(p => p.includes(month.value) ? p.filter(m=>m!==month.value) : [...p, month.value])} disabled={month.disabled}>{selectedAdvanceMonths.includes(month.value) && <Check className="h-4 w-4" />} {month.label}</Button>)}</div></CardContent>
                </Card>
            </div>
            <div className="lg:sticky lg:top-20">
                 {paymentCalculator.hasSelection && <Card>
                     <CardHeader><CardTitle className="flex items-center"><Calculator className="mr-2 h-5 w-5"/> 3. Resumen de Pago</CardTitle><CardDescription>Cálculo basado en su selección.</CardDescription></CardHeader>
                    <CardContent className="space-y-3">
                        {paymentCalculator.dueMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.dueMonthsCount} mes(es) adeudado(s) seleccionado(s).</p>}
                        {paymentCalculator.advanceMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.advanceMonthsCount} mes(es) por adelanto seleccionado(s) x ${(paymentCalculator.condoFee ?? 0).toFixed(2)} c/u.</p>}
                        <hr className="my-2"/><div className="flex justify-between items-center text-lg"><span className="text-muted-foreground">Sub-Total Deuda:</span><span className="font-medium">Bs. {formatCurrency(paymentCalculator.totalDebtBs)}</span></div>
                        <div className="flex justify-between items-center text-md"><span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span><span className="font-medium text-green-500">Bs. {formatCurrency(paymentCalculator.balanceInFavor)}</span></div>
                        <hr className="my-2"/><div className="flex justify-between items-center text-2xl font-bold"><span className="flex items-center"><Equal className="mr-2 h-5 w-5"/> TOTAL A PAGAR:</span><span className="text-primary">Bs. {formatCurrency(paymentCalculator.totalToPay)}</span></div>
                    </CardContent>
                    <CardFooter><Button className="w-full" asChild disabled={!paymentCalculator.hasSelection || paymentCalculator.totalToPay <= 0}><Link href="/owner/payments?tab=report"><Receipt className="mr-2 h-4 w-4"/>Proceder al Reporte de Pago</Link></Button></CardFooter>
                </Card>}
            </div>
        </div>
    );
}

function PaymentsPage() {
    const searchParams = useSearchParams();
    const defaultTab = searchParams?.get('tab') || 'report';
    
    return (
        <div className="space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Gestión de <span className="text-primary">Pagos</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Reporta tus pagos y calcula tus deudas pendientes.
                </p>
            </div>
            <Tabs defaultValue={defaultTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="report">Reportar Pago</TabsTrigger>
                    <TabsTrigger value="calculator">Calculadora de Pagos</TabsTrigger>
                </TabsList>
                <TabsContent value="report" className="mt-6">
                    <ReportPaymentComponent />
                </TabsContent>
                <TabsContent value="calculator" className="mt-6">
                    <PaymentCalculatorComponent />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <PaymentsPage />
        </Suspense>
    );
}


'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, CheckCircle2, DollarSign, FileText, Hash, Loader2, Upload, Banknote, Info, X, Save, FileUp, UserPlus, Trash2, XCircle, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';

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

export default function ReportPaymentPage() {
    const { toast } = useToast();
    const { user: authUser, ownerData: authOwnerData } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Form State ---
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

    // --- Data Fetching ---
    useEffect(() => {
        const q = query(collection(db, "owners"), where("role", "==", "propietario"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
        return () => unsubscribe();
    }, []);
    
    useEffect(() => {
         if (authOwnerData) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: { id: authUser!.uid, name: authOwnerData.name, properties: authOwnerData.properties },
                searchTerm: '',
                amount: '',
                selectedProperty: authOwnerData.properties?.[0] || null
            }]);
        }
    }, [authOwnerData, authUser]);

    useEffect(() => {
        const fetchRate = async () => {
             try {
                const settingsRef = doc(db, 'config', 'mainSettings');
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
    }, [paymentDate]);

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
        if (authOwnerData) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: { id: authUser!.uid, name: authOwnerData.name, properties: authOwnerData.properties },
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
        try {
            const q = query(collection(db, "payments"), where("reference", "==", reference), where("totalAmount", "==", Number(totalAmount)), where("paymentDate", "==", Timestamp.fromDate(paymentDate)));
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

        if (!authUser || !authOwnerData) {
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
            
            const paymentRef = await addDoc(collection(db, "payments"), paymentData);
            
            const adminDocRef = doc(db, 'owners', ADMIN_USER_ID);
            const notificationsRef = doc(collection(adminDocRef, "notifications"));
            await setDoc(notificationsRef, {
              title: "Nuevo Pago Reportado",
              body: `${authOwnerData?.name || 'Un propietario'} ha reportado un nuevo pago de Bs. ${totalAmount}.`,
              createdAt: serverTimestamp(),
              read: false,
              href: `/admin/payments?tab=verify`,
              paymentId: paymentRef.id
            });

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
        <div className="flex items-center justify-center p-4">
            <Card className="w-full max-w-4xl bg-background border-4 border-white rounded-3xl overflow-hidden shadow-2xl">
                <CardHeader className="bg-primary text-primary-foreground p-4 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Banknote className="w-7 h-7" />
                        <CardTitle className="text-2xl font-bold tracking-wider">REPORTAR PAGO</CardTitle>
                    </div>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="p-8 grid grid-cols-1 gap-y-6">
                        <Card className="border-none bg-background/5">
                            <CardHeader><CardTitle>1. Detalles de la Transacción</CardTitle></CardHeader>
                            <CardContent className="grid md:grid-cols-2 gap-x-8 gap-y-6">
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
                                    {receiptImage && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/>Comprobante cargado.</p>}
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="border-none bg-background/5">
                            <CardHeader><CardTitle>2. Monto y Beneficiarios</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
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
                                <div className="space-y-4">
                                    <Label className="font-semibold">Asignación de Montos</Label>
                                    {beneficiaryRows.map((row, index) => (
                                        <Card key={row.id} className="p-4 bg-muted/50 relative">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2"><Label htmlFor={`search-${row.id}`}>Beneficiario {index + 1}</Label>
                                                    {!row.owner ? (<><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id={`search-${row.id}`} placeholder="Buscar por nombre..." className="pl-9" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} disabled={loading} /></div>{row.searchTerm.length >= 2 && getFilteredOwners(row.searchTerm).length > 0 && <Card className="border rounded-md"><ScrollArea className="h-32">{getFilteredOwners(row.searchTerm).map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(row.id, owner)} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium text-sm">{owner.name}</p></div>))}</ScrollArea></Card>}</>)
                                                    : (<div className="p-3 bg-background rounded-md flex items-center justify-between"><div><p className="font-semibold text-primary">{row.owner.name}</p></div><Button variant="ghost" size="icon" onClick={() => updateBeneficiaryRow(row.id, { owner: null, selectedProperty: null })} disabled={loading}><XCircle className="h-5 w-5 text-destructive" /></Button></div>)}
                                                </div>
                                                <div className="space-y-2"><Label htmlFor={`amount-${row.id}`}>Monto Asignado (Bs.)</Label><Input id={`amount-${row.id}`} type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={loading || !row.owner} /></div>
                                            </div>
                                            {row.owner && <div className="mt-4 space-y-2"><Label>Asignar a Propiedad</Label><Select onValueChange={(v) => updateBeneficiaryRow(row.id, { selectedProperty: row.owner!.properties.find(p => `${p.street}-${p.house}` === v) || null })} value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''} disabled={loading || !row.owner}><SelectTrigger><SelectValue placeholder="Seleccione una propiedad..." /></SelectTrigger><SelectContent>{row.owner.properties.map(p => (<SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{`${p.street} - ${p.house}`}</SelectItem>))}</SelectContent></Select></div>}
                                            {index > 0 && <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading}><Trash2 className="h-4 w-4"/></Button>}
                                        </Card>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} disabled={loading}><UserPlus className="mr-2 h-4 w-4"/>Añadir Otro Beneficiario</Button>
                                    <CardFooter className="p-4 bg-background/50 rounded-lg space-y-2 mt-4 flex-col items-stretch">
                                        <div className="flex justify-between text-sm font-medium"><span>Monto Total del Pago:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div><hr className="my-1 border-border"/><div className={cn("flex justify-between text-base font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                                    </CardFooter>
                                </div>
                            </CardContent>
                        </Card>
                    </CardContent>

                    <CardFooter className="bg-background/10 p-6 flex justify-end gap-4">
                        <Button type="button" variant="ghost" className="text-muted-foreground hover:text-white" onClick={resetForm} disabled={isSubmitting}>
                            CANCELAR
                        </Button>
                        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-6 py-6 text-base font-bold" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                            Enviar Reporte
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(value) => { setBank(value); if (value !== 'Otro') setOtherBank(''); setIsBankModalOpen(false); }} />
            
            <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-6 w-6 text-blue-500" />
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
        </div>
    );
}

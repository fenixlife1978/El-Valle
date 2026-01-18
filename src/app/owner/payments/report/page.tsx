
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
import { CalendarIcon, CheckCircle2, DollarSign, FileText, Hash, Loader2, Upload, Banknote, Info, X, Save, FileUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';


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
    const [selectedProperty, setSelectedProperty] = useState<{ street: string, house: string } | null>(null);
    const [amountUSD, setAmountUSD] = useState<string>('');

    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false); 

    // --- Data Fetching ---
    useEffect(() => {
        if (authOwnerData && authOwnerData.properties && authOwnerData.properties.length > 0) {
            setSelectedProperty(authOwnerData.properties[0]);
        }
    }, [authOwnerData]);
    
    useEffect(() => {
        const fetchRateAndFee = async () => {
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
                        const applicableRates = allRates
                            .filter(r => r.date <= paymentDateString)
                            .sort((a, b) => b.date.localeCompare(a.date));

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
        fetchRateAndFee();
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
        setExchangeRate(null);
        setExchangeRateMessage('');
        setPaymentMethod('movil');
        setBank('');
        setOtherBank('');
        setReference('');
        setTotalAmount('');
        setReceiptImage(null);
        setAmountUSD('');
        if (authOwnerData && authOwnerData.properties && authOwnerData.properties.length > 0) {
            setSelectedProperty(authOwnerData.properties[0]);
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

    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        if (!paymentDate || !exchangeRate || !paymentMethod || !bank || !totalAmount || Number(totalAmount) <= 0 || !reference) {
             return { isValid: false, error: 'Por favor, complete todos los campos de la transacción.' };
        }
        if (reference.length < 4) {
            return { isValid: false, error: 'La referencia debe tener al menos 4 dígitos.' };
        }
        if (!receiptImage) {
            return { isValid: false, error: 'Debe adjuntar una imagen del comprobante de pago.' };
        }
        
        try {
            const q = query(collection(db, "payments"), where("reference", "==", reference), where("totalAmount", "==", Number(totalAmount)), where("paymentDate", "==", Timestamp.fromDate(paymentDate)));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
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
            const paymentData: any = {
                paymentDate: Timestamp.fromDate(paymentDate!),
                exchangeRate: exchangeRate,
                paymentMethod: paymentMethod,
                bank: bank === 'Otro' ? otherBank : bank,
                reference: reference,
                totalAmount: Number(totalAmount),
                beneficiaries: [{ 
                    ownerId: authUser.uid,
                    ownerName: authOwnerData.name,
                    ...(selectedProperty && { street: selectedProperty.street, house: selectedProperty.house }),
                    amount: Number(totalAmount)
                }],
                beneficiaryIds: [authUser.uid],
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
            <Card className="w-full max-w-4xl bg-background border-none rounded-3xl overflow-hidden shadow-2xl">
                <CardHeader className="bg-primary text-primary-foreground p-4 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Banknote className="w-7 h-7" />
                        <CardTitle className="text-2xl font-bold tracking-wider">REPORTAR PAGO</CardTitle>
                    </div>
                    <Button variant="ghost" size="icon" className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/20">
                        <X className="w-6 h-6" />
                    </Button>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {/* Columna Izquierda */}
                        <div className="space-y-6">
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
                                <Label className="text-primary uppercase text-xs font-bold tracking-wider">Referencia</Label>
                                <div className="relative flex items-center">
                                    <Hash className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        value={reference}
                                        onChange={(e) => setReference(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        maxLength={6}
                                        className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base"
                                        placeholder="Últimos 6 dígitos"
                                        disabled={isSubmitting}
                                    />
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
                        </div>

                        {/* Columna Derecha */}
                        <div className="space-y-6">
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
                                <Label className="text-primary uppercase text-xs font-bold tracking-wider">Adjuntar Comprobante</Label>
                                <div className="relative flex items-center">
                                    <FileUp className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                    <Input id="receipt" type="file" onChange={handleImageUpload} className="pl-12 pr-4 py-4 bg-input border-border rounded-2xl text-base file:text-muted-foreground file:text-sm" disabled={isSubmitting} />
                                </div>
                                 {receiptImage && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/>Comprobante cargado.</p>}
                            </div>
                        </div>

                        {/* Sección de Montos */}
                        <div className="md:col-span-2 space-y-4 bg-input/50 rounded-2xl p-4">
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                               <div className="space-y-2">
                                    <Label className="text-primary uppercase text-xs font-bold tracking-wider">Monto Total en Bs</Label>
                                    <div className="relative flex items-center">
                                        <span className="absolute left-4 font-bold text-background bg-white/90 text-black px-1 py-0.5 rounded-md">Bs</span>
                                        <Input
                                            type="number"
                                            value={totalAmount}
                                            onChange={(e) => setTotalAmount(e.target.value)}
                                            className="pl-12 pr-4 py-6 bg-white/90 border-transparent rounded-2xl text-base font-extrabold text-black"
                                            placeholder="0.00"
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-primary uppercase text-xs font-bold tracking-wider">Tasa de Cambio (BCV)</Label>
                                     <div className="relative flex items-center">
                                        <span className="absolute left-4 font-bold text-muted-foreground">Bs</span>
                                        <Input type="text" value={exchangeRate ? exchangeRate.toFixed(2) : exchangeRateMessage || 'N/A'} readOnly className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base font-bold" />
                                    </div>
                                </div>
                               <div className="space-y-2">
                                    <Label className="text-primary uppercase text-xs font-bold tracking-wider">Monto Equivalente (USD)</Label>
                                    <div className="relative flex items-center">
                                        <DollarSign className="absolute left-4 h-5 w-5 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            value={amountUSD}
                                            readOnly
                                            className="pl-12 pr-4 py-6 bg-input border-border rounded-2xl text-base font-bold"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                             </div>
                        </div>
                    </CardContent>

                    <CardFooter className="bg-background/10 p-6 flex justify-end gap-4">
                        <Button type="button" variant="ghost" className="text-muted-foreground hover:text-white" onClick={resetForm} disabled={isSubmitting}>
                            CANCELAR
                        </Button>
                        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-6 py-6 text-base font-bold" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                            ENVIAR REPORTE
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

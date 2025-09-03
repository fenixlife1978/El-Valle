
'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Upload, CheckCircle2, Trash2, PlusCircle, Loader2, Search, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

// --- Static Data ---
const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' },
    { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' },
    { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' },
    { value: 'tesoro', label: 'Banco del Tesoro' },
    { value: 'otro', label: 'Otro' },
];

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

// --- Type Definitions ---
type BeneficiaryType = 'propio' | 'terceros';
type PaymentMethod = 'movil' | 'transferencia' | '';
type BeneficiarySplit = { property: { street: string, house: string }; amount: number | string; };
type FormErrors = { [key: string]: string | undefined };

export default function UnifiedPaymentsPage() {
    const { toast } = useToast();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const receiptFileRef = useRef<HTMLInputElement>(null);

    // --- Form State ---
    const [paymentDate, setPaymentDate] = useState<Date | undefined>();
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [condoFee, setCondoFee] = useState<number | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>('propio');
    const [totalAmount, setTotalAmount] = useState<number | string>('');
    
    // State for the new beneficiary selection flow
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [beneficiarySplits, setBeneficiarySplits] = useState<BeneficiarySplit[]>([]);

    const [errors, setErrors] = useState<FormErrors>({});

    // --- Data Fetching ---
    useEffect(() => {
        const q = query(collection(db, "owners"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const ownersData: Owner[] = [];
            querySnapshot.forEach((doc) => {
                ownersData.push({ id: doc.id, ...doc.data() } as Owner);
            });
            setOwners(ownersData.sort((a, b) => a.name.localeCompare(b.name)));
        }, (error) => {
            console.error("Error fetching owners: ", error);
            toast({ variant: 'destructive', title: 'Error de Conexión', description: 'No se pudieron cargar los propietarios.' });
        });

        return () => unsubscribe();
    }, [toast]);
    
    useEffect(() => {
        const fetchRateAndFee = async () => {
             try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    setCondoFee(settings.condoFee || 0);

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
                     setExchangeRateMessage('No hay configuraciones. Contacte al administrador.');
                }
            } catch (e) {
                 setExchangeRateMessage('Error al buscar tasa.');
                 console.error(e);
            }
        }
        fetchRateAndFee();
    }, [paymentDate]);

    // --- Derived State & Calculations ---
    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        const lowerCaseSearch = searchTerm.toLowerCase();
        return owners.filter(owner => {
            const ownerName = owner.name.toLowerCase();
            const propertiesMatch = owner.properties?.some(p => 
                (p.house && String(p.house).toLowerCase().includes(lowerCaseSearch)) ||
                (p.street && String(p.street).toLowerCase().includes(lowerCaseSearch))
            );
            return ownerName.includes(lowerCaseSearch) || propertiesMatch;
        });
    }, [searchTerm, owners]);

    const assignedTotal = useMemo(() => {
        return beneficiarySplits.reduce((acc, split) => acc + (Number(split.amount) || 0), 0);
    }, [beneficiarySplits]);

    const balance = useMemo(() => {
        return (Number(totalAmount) || 0) - assignedTotal;
    }, [totalAmount, assignedTotal]);


    // --- Handlers & Effects ---
    const resetForm = () => {
        setPaymentDate(undefined);
        setExchangeRate(null);
        setExchangeRateMessage('');
        setPaymentMethod('');
        setBank('');
        setOtherBank('');
        setReference('');
        setReceiptFile(null);
        if(receiptFileRef.current) receiptFileRef.current.value = '';
        setBeneficiaryType('propio');
        setTotalAmount('');
        setSearchTerm('');
        setSelectedOwner(null);
        setBeneficiarySplits([]);
        setErrors({});
        setUploadProgress(0);
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (!allowedTypes.includes(file.type)) {
                toast({ variant: 'destructive', title: 'Archivo no permitido', description: 'El tipo de archivo debe ser JPG, PNG o PDF.' });
                return;
            }
            if (file.size > maxSize) {
                toast({ variant: 'destructive', title: 'Archivo demasiado grande', description: 'El tamaño del archivo no debe exceder los 5MB.' });
                return;
            }
            setReceiptFile(file);
        }
    };
    
    const handleOwnerSelect = (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
        if (owner.properties && owner.properties.length > 0) {
            setBeneficiarySplits([{ property: owner.properties[0], amount: '' }]);
        } else {
             toast({ variant: 'destructive', title: 'Propietario sin Propiedades', description: 'Este propietario no tiene propiedades asignadas y no puede recibir pagos.' });
            setBeneficiarySplits([]);
        }
    };

    const resetOwnerSelection = () => {
        setSelectedOwner(null);
        setBeneficiarySplits([]);
        setSearchTerm('');
    };

    const addSplit = () => {
        if (!selectedOwner) return;
        const availableProps = selectedOwner.properties.filter(
            p => !beneficiarySplits.some(s => s.property.street === p.street && s.property.house === p.house)
        );
        if (availableProps.length > 0) {
            setBeneficiarySplits([...beneficiarySplits, { property: availableProps[0], amount: '' }]);
        }
    };

    const removeSplit = (index: number) => {
        if (beneficiarySplits.length > 1) {
            setBeneficiarySplits(beneficiarySplits.filter((_, i) => i !== index));
        }
    };

    const handleSplitChange = (index: number, field: 'property' | 'amount', value: any) => {
        const newSplits = [...beneficiarySplits];
        if (field === 'property') {
            newSplits[index].property = value;
        } else {
            newSplits[index].amount = value;
        }
        setBeneficiarySplits(newSplits);
    };

    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        const newErrors: FormErrors = {};

        // Level 1: Mandatory fields validation
        if (!paymentDate) newErrors.paymentDate = 'La fecha es obligatoria.';
        if (!exchangeRate || exchangeRate <= 0) newErrors.exchangeRate = 'Se requiere una tasa de cambio válida para la fecha.';
        if (!paymentMethod) newErrors.paymentMethod = 'Seleccione un tipo de pago.';
        if (!bank) newErrors.bank = 'Seleccione un banco.';
        if (!receiptFile) newErrors.receiptFile = 'El comprobante es obligatorio.';
        if (!totalAmount || Number(totalAmount) <= 0) newErrors.totalAmount = 'El monto debe ser mayor a cero.';
        if (!selectedOwner) newErrors.beneficiary = 'Debe seleccionar un beneficiario.';
        if (beneficiarySplits.length === 0) newErrors.splits = 'Debe asignar el monto a al menos una propiedad.';
        if (beneficiarySplits.some(s => !s.property || !s.amount || Number(s.amount) <= 0)) newErrors.splits = 'Debe completar un monto válido para cada propiedad.';
        
        // Level 2: Format validation
        if (Math.abs(balance) > 0.01) newErrors.balance = 'El monto total debe coincidir con el total asignado.';
        if (!/^\d{6,}$/.test(reference)) newErrors.reference = 'La referencia debe tener al menos 6 dígitos.';
        if (bank === 'otro' && !otherBank) newErrors.otherBank = 'Especifique el nombre del banco.';
        
        setErrors(newErrors);
        if (Object.keys(newErrors).length > 0) {
            const firstErrorKey = Object.keys(newErrors)[0] as keyof FormErrors;
            return { isValid: false, error: newErrors[firstErrorKey] };
        }

        // Level 3: Duplicate validation
        try {
            const q = query(collection(db, "payments"), 
                where("reference", "==", reference),
                where("totalAmount", "==", Number(totalAmount)),
                where("paymentDate", "==", Timestamp.fromDate(paymentDate!))
            );
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                return { isValid: false, error: "Ya existe un reporte de pago con estos mismos datos." };
            }
        } catch (error) {
            console.error("Error validando duplicado:", error);
            return { isValid: false, error: "Error al verificar duplicados. Intente de nuevo." };
        }

        return { isValid: true };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setUploadProgress(0);

        const validationResult = await validateForm();
        if (!validationResult.isValid) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: validationResult.error });
            setLoading(false);
            return;
        }
        
        // At this point, validation passed, receiptFile is guaranteed to be non-null
        const fileToUpload = receiptFile!;
        
        try {
            const receiptFileName = `${Date.now()}_${fileToUpload.name}`;
            const fileRef = storageRef(storage, `receipts/${receiptFileName}`);
            const uploadTask = uploadBytesResumable(fileRef, fileToUpload);

            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(progress);
                },
                (error) => {
                    console.error("Upload failed:", error);
                    toast({ variant: "destructive", title: "Error de Subida", description: "No se pudo subir el comprobante. Por favor, intente de nuevo." });
                    setLoading(false);
                },
                async () => {
                    try {
                        const receiptFileUrl = await getDownloadURL(uploadTask.snapshot.ref);

                        const paymentData = {
                            paymentDate: Timestamp.fromDate(paymentDate!),
                            exchangeRate: exchangeRate,
                            paymentMethod: paymentMethod,
                            bank: bank === 'otro' ? otherBank : bank,
                            reference: reference,
                            totalAmount: Number(totalAmount),
                            beneficiaryType: beneficiaryType,
                            beneficiaries: beneficiarySplits.map(s => ({
                                ownerId: selectedOwner!.id,
                                ownerName: selectedOwner!.name,
                                street: s.property.street,
                                house: s.property.house,
                                amount: Number(s.amount)
                            })),
                            receiptFileName: fileToUpload.name,
                            receiptFileUrl: receiptFileUrl,
                            status: 'pendiente' as 'pendiente',
                            reportedAt: serverTimestamp(),
                            reportedBy: beneficiaryType === 'propio' ? selectedOwner!.id : 'admin_user',
                        };

                        await addDoc(collection(db, "payments"), paymentData);

                        toast({ title: 'Reporte Enviado', description: 'Tu reporte ha sido enviado para revisión.', className: 'bg-green-100 border-green-400 text-green-800' });
                        resetForm();
                    } catch (dbError) {
                        console.error("Error saving payment to Firestore: ", dbError);
                        toast({ variant: "destructive", title: "Error de Guardado", description: "El comprobante se subió, pero no se pudo guardar el reporte. Por favor, contacte a soporte." });
                    } finally {
                        setLoading(false);
                    }
                }
            );

        } catch (error) {
            console.error("Error initiating payment submission: ", error);
            toast({ variant: "destructive", title: "Error Inesperado", description: "No se pudo iniciar el proceso de envío." });
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Reporte de Pagos</h1>
                <p className="text-muted-foreground">Formulario único para registrar pagos propios o a terceros.</p>
            </div>
            
            <form onSubmit={handleSubmit}>
                <Card className="mb-6">
                    <CardHeader><CardTitle>Detalles de la Transacción</CardTitle></CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                             <Label htmlFor="paymentDate">1. Fecha del Pago</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button id="paymentDate" variant={"outline"} className={cn("w-full justify-start", !paymentDate && "text-muted-foreground", errors.paymentDate && "border-destructive")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} /></PopoverContent>
                            </Popover>
                             {errors.paymentDate && <p className="text-sm text-destructive">{errors.paymentDate}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>2. Tasa de Cambio (Bs. por USD)</Label>
                            <Input type="text" value={exchangeRate ? `Bs. ${exchangeRate.toFixed(2)}` : exchangeRateMessage || 'Seleccione una fecha'} readOnly className={cn("bg-muted/50", errors.exchangeRate && "border-destructive")} />
                            {errors.exchangeRate && <p className="text-sm text-destructive">{errors.exchangeRate}</p>}
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="paymentMethod">3. Tipo de Pago</Label>
                           <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                                <SelectTrigger id="paymentMethod" className={cn(errors.paymentMethod && "border-destructive")}><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                <SelectContent><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem></SelectContent>
                           </Select>
                           {errors.paymentMethod && <p className="text-sm text-destructive">{errors.paymentMethod}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bank">4. Banco Emisor</Label>
                             <Select value={bank} onValueChange={setBank}>
                                <SelectTrigger id="bank" className={cn(errors.bank && "border-destructive")}><SelectValue placeholder="Seleccione un banco..." /></SelectTrigger>
                                <SelectContent>{venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                            </Select>
                            {errors.bank && <p className="text-sm text-destructive">{errors.bank}</p>}
                        </div>
                        {bank === 'otro' && (
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="otherBank">Nombre del Otro Banco</Label>
                                <Input id="otherBank" value={otherBank} onChange={(e) => setOtherBank(e.target.value)} className={cn(errors.otherBank && "border-destructive")} />
                                {errors.otherBank && <p className="text-sm text-destructive">{errors.otherBank}</p>}
                            </div>
                        )}
                        <div className="space-y-2">
                             <Label htmlFor="reference">5. Referencia (Últimos 6 dígitos o más)</Label>
                             <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))} className={cn(errors.reference && "border-destructive")} />
                             {errors.reference && <p className="text-sm text-destructive">{errors.reference}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="receiptFile">6. Comprobante de Pago</Label>
                            <div className="flex items-center gap-4">
                                <Button type="button" variant="outline" onClick={() => receiptFileRef.current?.click()} className="flex-1">
                                    <Upload className="mr-2 h-4 w-4"/>{receiptFile ? 'Cambiar archivo' : 'Subir archivo'}
                                </Button>
                                {receiptFile && <p className="text-sm text-muted-foreground truncate">{receiptFile.name}</p>}
                            </div>
                            <input type="file" ref={receiptFileRef} onChange={handleFileChange} accept="image/jpeg,image/png,application/pdf" className="hidden"/>
                            {errors.receiptFile && <p className="text-sm text-destructive">{errors.receiptFile}</p>}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Detalles de los Beneficiarios</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <Label>7. Tipo de Pago</Label>
                                <RadioGroup value={beneficiaryType} onValueChange={(v) => setBeneficiaryType(v as BeneficiaryType)} className="flex gap-4">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="propio" id="r-propio" /><Label htmlFor="r-propio">Pago Propio</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="terceros" id="r-terceros" /><Label htmlFor="r-terceros">Pago a Terceros</Label></div>
                                </RadioGroup>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="totalAmount">8. Monto Total del Pago (Bs.)</Label>
                                <Input id="totalAmount" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" className={cn(errors.totalAmount && "border-destructive")} />
                                {errors.totalAmount && <p className="text-sm text-destructive">{errors.totalAmount}</p>}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="font-semibold">9. Asignación de Montos</Label>
                            {!selectedOwner ? (
                                <div className='space-y-2'>
                                    <Label htmlFor="owner-search">Buscar Beneficiario</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input id="owner-search" placeholder="Buscar por nombre o casa (mín. 3 caracteres)..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                    </div>
                                    {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                        <Card className="border rounded-md">
                                            <ScrollArea className="h-48">{filteredOwners.map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p><p className="text-sm text-muted-foreground">{owner.properties?.map(p => `${p.street}-${p.house}`).join(', ')}</p></div>))}</ScrollArea>
                                        </Card>
                                    )}
                                    {errors.beneficiary && <p className="text-sm text-destructive">{errors.beneficiary}</p>}
                                </div>
                            ) : (
                                <Card className="bg-muted/50 p-4 space-y-4">
                                    <div className='flex items-center justify-between'>
                                        <div><p className="font-semibold text-primary">{selectedOwner.name}</p><p className="text-sm text-muted-foreground">{selectedOwner.properties?.map(p => `${p.street}-${p.house}`).join(', ')}</p></div>
                                        <Button variant="ghost" size="icon" onClick={resetOwnerSelection}><XCircle className="h-5 w-5 text-destructive"/></Button>
                                    </div>

                                    {beneficiarySplits.map((split, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <Select onValueChange={(v) => handleSplitChange(index, 'property', selectedOwner.properties.find(p => `${p.street}-${p.house}` === v))} value={`${split.property.street}-${split.property.house}`}>
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>{selectedOwner.properties.map(p => (<SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`} disabled={beneficiarySplits.some(s => s.property.street === p.street && s.property.house === p.house && s.property !== split.property)}>{`${p.street} - ${p.house}`}</SelectItem>))}</SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-40"><Input type="number" placeholder="Monto (Bs.)" value={split.amount} onChange={(e) => handleSplitChange(index, 'amount', e.target.value)} /></div>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSplit(index)} disabled={beneficiarySplits.length <= 1}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                        </div>
                                    ))}
                                    {selectedOwner.properties && selectedOwner.properties.length > beneficiarySplits.length && (
                                        <Button type="button" variant="outline" size="sm" onClick={addSplit}><PlusCircle className="mr-2 h-4 w-4"/>Asignar a otra propiedad</Button>
                                    )}

                                    <div className="p-4 bg-background/50 rounded-lg space-y-2 mt-4">
                                        <div className="flex justify-between text-sm font-medium"><span>Monto Total:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div>
                                        <div className={cn("flex justify-between text-sm font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                                    </div>
                                    {errors.splits && <p className="text-sm text-destructive">{errors.splits}</p>}
                                    {errors.balance && <p className="text-sm text-destructive">{errors.balance}</p>}
                                </Card>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="flex-col items-end gap-2">
                         <Button type="submit" className="w-full md:w-auto" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}
                            Enviar Reporte
                        </Button>
                        {loading && (
                            <div className="w-full md:w-[200px] space-y-1">
                                <Progress value={uploadProgress} className="h-2 w-full" />
                                <p className="text-xs text-muted-foreground text-center">Subiendo... {Math.round(uploadProgress)}%</p>
                            </div>
                        )}
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}

    
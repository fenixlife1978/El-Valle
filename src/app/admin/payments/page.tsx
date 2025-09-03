
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

export default function UnifiedPaymentsPage() {
    const { toast } = useToast();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const receiptFileRef = useRef<HTMLInputElement>(null);

    // --- Form State ---
    const [paymentDate, setPaymentDate] = useState<Date | undefined>();
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>('propio');
    const [totalAmount, setTotalAmount] = useState<number | string>('');
    const [uploadProgress, setUploadProgress] = useState(0);
    
    // State for the new beneficiary selection flow
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [beneficiarySplits, setBeneficiarySplits] = useState<BeneficiarySplit[]>([]);

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
        // Level A: Required fields validation
        if (!paymentDate) return { isValid: false, error: 'La fecha del pago es obligatoria.' };
        if (!exchangeRate || exchangeRate <= 0) return { isValid: false, error: 'Se requiere una tasa de cambio válida para la fecha seleccionada.' };
        if (!paymentMethod) return { isValid: false, error: 'Debe seleccionar un tipo de pago.' };
        if (!bank) return { isValid: false, error: 'Debe seleccionar un banco.' };
        if (bank === 'otro' && !otherBank.trim()) return { isValid: false, error: 'Debe especificar el nombre del otro banco.' };
        if (!totalAmount || Number(totalAmount) <= 0) return { isValid: false, error: 'El monto total debe ser mayor a cero.' };
        if (!receiptFile) return { isValid: false, error: 'El comprobante de pago es obligatorio.' };
        if (!selectedOwner) return { isValid: false, error: 'Debe seleccionar un beneficiario.' };
        if (beneficiarySplits.length === 0) return { isValid: false, error: 'Debe asignar el monto a al menos una propiedad.' };
        if (beneficiarySplits.some(s => !s.property || !s.amount || Number(s.amount) <= 0)) return { isValid: false, error: 'Debe completar un monto válido para cada propiedad.' };
        if (Math.abs(balance) > 0.01) return { isValid: false, error: 'El monto total no coincide con la suma de los montos asignados.' };
        
        // Level B: Format validation
        if (!/^\d{6,}$/.test(reference)) {
            return { isValid: false, error: 'La referencia debe tener al menos 6 dígitos.' };
        }
        
        // Level C: Duplicate validation
        try {
            const q = query(collection(db, "payments"), 
                where("reference", "==", reference),
                where("totalAmount", "==", Number(totalAmount)),
                where("paymentDate", "==", Timestamp.fromDate(paymentDate))
            );
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                return { isValid: false, error: 'Ya existe un reporte de pago con esta misma referencia, monto y fecha.' };
            }
        } catch (dbError) {
             console.error("Error checking for duplicates:", dbError);
             return { isValid: false, error: "No se pudo verificar si el pago ya existe. Intente de nuevo." };
        }

        return { isValid: true };
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setUploadProgress(0);

        try {
             // 1. Validate form before doing anything else
            const validation = await validateForm();
            if (!validation.isValid) {
                toast({ variant: 'destructive', title: 'Error de Validación', description: validation.error });
                setLoading(false);
                return;
            }
            
            // 2. Upload file with progress tracking
            const receiptFileName = `${Date.now()}_${receiptFile!.name}`;
            const fileRef = storageRef(storage, `receipts/${receiptFileName}`);
            const uploadTask = uploadBytesResumable(fileRef, receiptFile!);

            const receiptFileUrl = await new Promise<string>((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setUploadProgress(progress);
                    },
                    (error) => {
                        console.error("Upload failed:", error);
                        reject("Falló la subida del comprobante.");
                    },
                    async () => {
                        try {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            resolve(downloadURL);
                        } catch (error) {
                            reject("No se pudo obtener la URL del archivo.");
                        }
                    }
                );
            });

            // 3. Prepare and save data to Firestore
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
                receiptFileName: receiptFile!.name,
                receiptFileUrl: receiptFileUrl,
                status: 'pendiente' as 'pendiente',
                reportedAt: serverTimestamp(),
                reportedBy: beneficiaryType === 'propio' ? selectedOwner!.id : 'admin_user',
            };
            
            await addDoc(collection(db, "payments"), paymentData);
            
            // 4. Success feedback and form reset
            toast({ 
                title: 'Reporte Enviado', 
                description: 'Tu reporte ha sido enviado para revisión.', 
                className: 'bg-green-100 border-green-400 text-green-800' 
            });
            resetForm();

        } catch (error) {
            console.error("Error submitting payment: ", error);
            const errorMessage = typeof error === 'string' ? error : "No se pudo enviar el reporte. Por favor, intente de nuevo.";
            toast({ variant: "destructive", title: "Error Inesperado", description: errorMessage });
        } finally {
            setLoading(false);
            setUploadProgress(0);
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
                                    <Button id="paymentDate" variant={"outline"} className={cn("w-full justify-start", !paymentDate && "text-muted-foreground")} disabled={loading}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label>2. Tasa de Cambio (Bs. por USD)</Label>
                            <Input type="text" value={exchangeRate ? `Bs. ${exchangeRate.toFixed(2)}` : exchangeRateMessage || 'Seleccione una fecha'} readOnly className={cn("bg-muted/50")} />
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="paymentMethod">3. Tipo de Pago</Label>
                           <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} disabled={loading}>
                                <SelectTrigger id="paymentMethod"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                <SelectContent><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem></SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bank">4. Banco Emisor</Label>
                             <Select value={bank} onValueChange={setBank} disabled={loading}>
                                <SelectTrigger id="bank"><SelectValue placeholder="Seleccione un banco..." /></SelectTrigger>
                                <SelectContent>{venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {bank === 'otro' && (
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="otherBank">Nombre del Otro Banco</Label>
                                <Input id="otherBank" value={otherBank} onChange={(e) => setOtherBank(e.target.value)} disabled={loading}/>
                            </div>
                        )}
                        <div className="space-y-2">
                             <Label htmlFor="reference">5. Referencia (Últimos 6 dígitos o más)</Label>
                             <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))} disabled={loading}/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="receiptFile">6. Comprobante de Pago</Label>
                            <div className="flex items-center gap-4">
                                <Button type="button" variant="outline" onClick={() => receiptFileRef.current?.click()} className="flex-1" disabled={loading}>
                                    <Upload className="mr-2 h-4 w-4"/>{receiptFile ? 'Cambiar archivo' : 'Subir archivo'}
                                </Button>
                                {receiptFile && <p className="text-sm text-muted-foreground truncate">{receiptFile.name}</p>}
                            </div>
                            <input type="file" ref={receiptFileRef} onChange={handleFileChange} accept="image/jpeg,image/png,application/pdf" className="hidden"/>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Detalles de los Beneficiarios</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <Label>7. Tipo de Pago</Label>
                                <RadioGroup value={beneficiaryType} onValueChange={(v) => setBeneficiaryType(v as BeneficiaryType)} className="flex gap-4" disabled={loading}>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="propio" id="r-propio" /><Label htmlFor="r-propio">Pago Propio</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="terceros" id="r-terceros" /><Label htmlFor="r-terceros">Pago a Terceros</Label></div>
                                </RadioGroup>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="totalAmount">8. Monto Total del Pago (Bs.)</Label>
                                <Input id="totalAmount" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" disabled={loading}/>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="font-semibold">9. Asignación de Montos</Label>
                            {!selectedOwner ? (
                                <div className='space-y-2'>
                                    <Label htmlFor="owner-search">Buscar Beneficiario</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input id="owner-search" placeholder="Buscar por nombre o casa (mín. 3 caracteres)..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} disabled={loading}/>
                                    </div>
                                    {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                        <Card className="border rounded-md">
                                            <ScrollArea className="h-48">{filteredOwners.map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p><p className="text-sm text-muted-foreground">{owner.properties?.map(p => `${p.street}-${p.house}`).join(', ')}</p></div>))}</ScrollArea>
                                        </Card>
                                    )}
                                </div>
                            ) : (
                                <Card className="bg-muted/50 p-4 space-y-4">
                                    <div className='flex items-center justify-between'>
                                        <div><p className="font-semibold text-primary">{selectedOwner.name}</p><p className="text-sm text-muted-foreground">{selectedOwner.properties?.map(p => `${p.street}-${p.house}`).join(', ')}</p></div>
                                        <Button variant="ghost" size="icon" onClick={resetOwnerSelection} disabled={loading}><XCircle className="h-5 w-5 text-destructive"/></Button>
                                    </div>

                                    {beneficiarySplits.map((split, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <Select onValueChange={(v) => handleSplitChange(index, 'property', selectedOwner.properties.find(p => `${p.street}-${p.house}` === v))} value={`${split.property.street}-${split.property.house}`} disabled={loading}>
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>{selectedOwner.properties.map(p => (<SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`} disabled={beneficiarySplits.some(s => s.property.street === p.street && s.property.house === p.house && s.property !== split.property)}>{`${p.street} - ${p.house}`}</SelectItem>))}</SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-40"><Input type="number" placeholder="Monto (Bs.)" value={split.amount} onChange={(e) => handleSplitChange(index, 'amount', e.target.value)} disabled={loading}/></div>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSplit(index)} disabled={beneficiarySplits.length <= 1 || loading}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                        </div>
                                    ))}
                                    {selectedOwner.properties && selectedOwner.properties.length > beneficiarySplits.length && (
                                        <Button type="button" variant="outline" size="sm" onClick={addSplit} disabled={loading}><PlusCircle className="mr-2 h-4 w-4"/>Asignar a otra propiedad</Button>
                                    )}

                                    <div className="p-4 bg-background/50 rounded-lg space-y-2 mt-4">
                                        <div className="flex justify-between text-sm font-medium"><span>Monto Total:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div>
                                        <div className={cn("flex justify-between text-sm font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                                    </div>
                                </Card>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className='flex flex-col items-end gap-4'>
                        {loading && (
                            <div className="w-full space-y-2 text-center">
                                <Progress value={uploadProgress} className="w-full" />
                                <p className="text-sm text-muted-foreground">Subiendo comprobante... {Math.round(uploadProgress)}%</p>
                            </div>
                         )}
                         <Button type="submit" className="w-full md:w-auto" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}
                            {loading ? 'Enviando...' : 'Enviar Reporte'}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}

    
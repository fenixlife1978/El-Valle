
'use client';
import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, CheckCircle2, Trash2, PlusCircle, Loader2, Search, XCircle, Wand2, UserPlus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { inferPaymentDetails } from '@/ai/flows/infer-payment-details';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';


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
type PaymentMethod = 'movil' | 'transferencia' | 'pago-historico' | '';
type BeneficiaryRow = {
    id: string;
    owner: Owner | null;
    searchTerm: string;
    amount: string;
    selectedProperty: { street: string, house: string } | null;
};


const OWNER_USER_ID = 'valle-admin-main-account';

export default function UnifiedPaymentsPage() {
    const { toast } = useToast();
    const { user: authUser, ownerData: authOwnerData } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);

    // --- Form State ---
    const [paymentDate, setPaymentDate] = useState<Date | undefined>();
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>('propio');
    const [totalAmount, setTotalAmount] = useState<string>('');
    
    // State for the AI feature
    const [aiPrompt, setAiPrompt] = useState('');
    const [isInferring, setIsInferring] = useState(false);

    // State for the new beneficiary selection flow
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);


    // --- Data Fetching ---
    useEffect(() => {
        const q = query(collection(db, "owners"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const ownersData: Owner[] = [];
            querySnapshot.forEach((doc) => {
                ownersData.push({ id: doc.id, ...doc.data() } as Owner);
            });
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
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
    
    // Reset beneficiaries when type changes
    useEffect(() => {
        if(beneficiaryType === 'propio' && authOwnerData) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: authOwnerData,
                searchTerm: '',
                amount: '',
                selectedProperty: authOwnerData.properties?.[0] || null
            }]);
        } else {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: null,
                searchTerm: '',
                amount: '',
                selectedProperty: null
            }]);
        }
    }, [beneficiaryType, authOwnerData]);

    // --- Derived State & Calculations ---
    const assignedTotal = useMemo(() => {
        return beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
    }, [beneficiaryRows]);

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
        setBeneficiaryType('propio');
        setTotalAmount('');
        setAiPrompt('');
        if (beneficiaryType === 'propio' && authOwnerData) {
            setBeneficiaryRows([{
                id: Date.now().toString(),
                owner: authOwnerData,
                searchTerm: '',
                amount: '',
                selectedProperty: authOwnerData.properties?.[0] || null
            }]);
        } else {
             setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
        }
    }
    
    // --- Beneficiary Row Management ---
    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => {
        setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    };
    
    const handleOwnerSelect = (rowId: string, owner: Owner) => {
        const firstProperty = owner.properties && owner.properties.length > 0 ? owner.properties[0] : null;
        updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: firstProperty });
    };
    
    const addBeneficiaryRow = () => {
        setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    };

    const removeBeneficiaryRow = (id: string) => {
        if (beneficiaryRows.length > 1) {
            setBeneficiaryRows(rows => rows.filter(row => row.id !== id));
        } else {
             setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
        }
    };


     const handleInferDetails = async () => {
        if (!aiPrompt.trim()) {
            toast({ variant: 'destructive', title: 'Texto Vacío', description: 'Por favor, ingrese una descripción del pago.' });
            return;
        }
        setIsInferring(true);
        try {
            const result = await inferPaymentDetails({ text: aiPrompt });
            setTotalAmount(String(result.totalAmount));
            setReference(result.reference);
            setPaymentMethod(result.paymentMethod as PaymentMethod);
            setBank(result.bank);
            // Dates from AI are 'yyyy-MM-dd', parseISO handles this without timezone shifts.
            setPaymentDate(parseISO(result.paymentDate));

            toast({ title: 'Datos Extraídos', description: 'Los campos del formulario han sido actualizados.', className: 'bg-green-100 border-green-400 text-green-800' });
        } catch (error) {
            console.error("Error inferring payment details:", error);
            toast({ variant: 'destructive', title: 'Error de IA', description: 'No se pudieron extraer los detalles. Por favor, llene los campos manualmente.' });
        } finally {
            setIsInferring(false);
        }
    };
    
    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        // Level A: Required fields validation
        if (!paymentDate) return { isValid: false, error: 'La fecha del pago es obligatoria.' };
        if (!exchangeRate || exchangeRate <= 0) return { isValid: false, error: 'Se requiere una tasa de cambio válida para la fecha seleccionada.' };
        if (!paymentMethod) return { isValid: false, error: 'Debe seleccionar un tipo de pago.' };
        if (!bank) return { isValid: false, error: 'Debe seleccionar un banco.' };
        if (bank === 'otro' && !otherBank.trim()) return { isValid: false, error: 'Debe especificar el nombre del otro banco.' };
        if (!totalAmount || Number(totalAmount) <= 0) return { isValid: false, error: 'El monto total debe ser mayor a cero.' };
        if (beneficiaryRows.some(row => !row.owner)) return { isValid: false, error: 'Debe seleccionar un beneficiario para cada fila.' };
        if (beneficiaryRows.some(row => !row.amount || Number(row.amount) <= 0)) return { isValid: false, error: 'Debe completar un monto válido para cada beneficiario.' };
        if (beneficiaryType === 'propio' && beneficiaryRows.some(row => !row.selectedProperty)) return { isValid: false, error: 'Debe seleccionar una propiedad para cada monto.' };
        
        if (Math.abs(balance) > 0.01) {
             return { isValid: false, error: `El monto total (Bs. ${Number(totalAmount).toFixed(2)}) no coincide con la suma de los montos asignados (Bs. ${assignedTotal.toFixed(2)}).` };
        }
        
        if (!/^\d{6,}$/.test(reference)) {
            return { isValid: false, error: 'La referencia debe tener al menos 6 dígitos.' };
        }
        
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

        try {
            const validation = await validateForm();
            if (!validation.isValid) {
                toast({ variant: 'destructive', title: 'Error de Validación', description: validation.error, duration: 6000 });
                setLoading(false);
                return;
            }

            const beneficiaries = beneficiaryRows.map(row => {
                const owner = row.owner!;
                const property = beneficiaryType === 'propio' ? row.selectedProperty : (owner.properties && owner.properties[0]);
                 return {
                    ownerId: owner.id,
                    ownerName: owner.name,
                    ...(property ? { street: property.street, house: property.house } : {}),
                    amount: Number(row.amount)
                };
            });

            const paymentData = {
                paymentDate: Timestamp.fromDate(paymentDate!),
                exchangeRate: exchangeRate,
                paymentMethod: paymentMethod,
                bank: bank === 'otro' ? otherBank : bank,
                reference: reference,
                totalAmount: Number(totalAmount),
                beneficiaries: beneficiaries,
                beneficiaryIds: Array.from(new Set(beneficiaries.map(b => b.ownerId))),
                status: 'pendiente' as 'pendiente',
                reportedAt: serverTimestamp(),
                reportedBy: authUser?.uid || 'unknown',
            };
            
            await addDoc(collection(db, "payments"), paymentData);
            
            toast({ 
                title: 'Reporte Enviado Exitosamente', 
                description: 'El reporte de pago ha sido enviado para revisión.', 
                className: 'bg-green-100 border-green-400 text-green-800' 
            });
            resetForm();

        } catch (error) {
            console.error("Error submitting payment: ", error);
            const errorMessage = typeof error === 'string' ? error : "No se pudo enviar el reporte. Por favor, intente de nuevo.";
            toast({ variant: "destructive", title: "Error Inesperado", description: errorMessage });
        } finally {
            setLoading(false);
        }
    };
    
    // Filtered owners for a specific search term in a row
    const getFilteredOwners = (searchTerm: string) => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return allOwners.filter(owner =>
            owner.name && owner.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Reportar un Pago</h1>
                <p className="text-muted-foreground">Formulario para registrar pagos propios o a terceros.</p>
            </div>
            
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wand2 />
                        Asistente de IA para Llenado Rápido
                    </CardTitle>
                    <CardDescription>
                        Pega aquí los detalles de un pago (ej. de un capture o mensaje de WhatsApp) y la IA llenará los campos por ti.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Textarea
                        placeholder="Ej: Pago móvil Banesco por 4500 Bs con ref 012345 del día de ayer."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="mb-4"
                        rows={3}
                        disabled={isInferring || loading}
                    />
                    <Button onClick={handleInferDetails} disabled={isInferring || loading}>
                        {isInferring ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4"/>}
                        Analizar con IA
                    </Button>
                </CardContent>
            </Card>

            <form onSubmit={handleSubmit}>
                <Card className="mb-6">
                    <CardHeader><CardTitle>1. Detalles de la Transacción</CardTitle></CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                             <Label htmlFor="paymentDate">Fecha del Pago</Label>
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
                            <Label>Tasa de Cambio (Bs. por USD)</Label>
                            <Input type="text" value={exchangeRate ? `Bs. ${exchangeRate.toFixed(2)}` : exchangeRateMessage || 'Seleccione una fecha'} readOnly className={cn("bg-muted/50")} />
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="paymentMethod">Tipo de Pago</Label>
                           <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} disabled={loading}>
                                <SelectTrigger id="paymentMethod"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="movil">Pago Móvil</SelectItem>
                                </SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bank">Banco Emisor</Label>
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
                        <div className="space-y-2 md:col-span-2">
                             <Label htmlFor="reference">Referencia (Últimos 6 dígitos o más)</Label>
                             <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))} disabled={loading}/>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>2. Detalles de los Beneficiarios</CardTitle>
                        <CardDescription>Asigne el monto total del pago entre uno o más beneficiarios.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                             <div className="space-y-2">
                                <Label htmlFor="totalAmount">Monto Total del Pago (Bs.)</Label>
                                <Input id="totalAmount" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" disabled={loading}/>
                            </div>
                            <div className="space-y-3">
                                <Label>Tipo de Pago</Label>
                                <RadioGroup value={beneficiaryType} onValueChange={(v) => setBeneficiaryType(v as BeneficiaryType)} className="flex gap-4" disabled={loading}>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="propio" id="r-propio" /><Label htmlFor="r-propio">Pago Propio</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="terceros" id="r-terceros" /><Label htmlFor="r-terceros">Pago a Terceros</Label></div>
                                </RadioGroup>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="font-semibold">Asignación de Montos</Label>
                             {beneficiaryRows.map((row, index) => (
                                <Card key={row.id} className="p-4 bg-muted/50 relative">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor={`search-${row.id}`}>
                                                {beneficiaryType === 'propio' ? 'Beneficiario' : `Beneficiario ${index + 1}`}
                                            </Label>
                                            {!row.owner ? (
                                                <>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <Input id={`search-${row.id}`} placeholder="Buscar por nombre (mín. 3 caracteres)..." className="pl-9" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} disabled={loading || (beneficiaryType === 'propio' && index > 0)} />
                                                    </div>
                                                    {row.searchTerm.length >= 3 && getFilteredOwners(row.searchTerm).length > 0 && (
                                                        <Card className="border rounded-md">
                                                            <ScrollArea className="h-32">
                                                                {getFilteredOwners(row.searchTerm).map(owner => (
                                                                    <div key={owner.id} onClick={() => handleOwnerSelect(row.id, owner)} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                                                        <p className="font-medium text-sm">{owner.name}</p>
                                                                    </div>
                                                                ))}
                                                            </ScrollArea>
                                                        </Card>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="p-3 bg-background rounded-md flex items-center justify-between">
                                                    <div>
                                                        <p className="font-semibold text-primary">{row.owner.name}</p>
                                                        <p className="text-sm text-muted-foreground">{row.owner.properties?.map(p => `${p.street}-${p.house}`).join(', ')}</p>
                                                    </div>
                                                    <Button variant="ghost" size="icon" onClick={() => updateBeneficiaryRow(row.id, { owner: null, selectedProperty: null })} disabled={loading || (beneficiaryType === 'propio' && index > 0)}>
                                                        <XCircle className="h-5 w-5 text-destructive" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor={`amount-${row.id}`}>Monto Asignado (Bs.)</Label>
                                            <Input id={`amount-${row.id}`} type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={loading || !row.owner} />
                                        </div>
                                    </div>
                                    {beneficiaryType === 'propio' && row.owner && (
                                        <div className="mt-4 space-y-2">
                                            <Label>Asignar a Propiedad</Label>
                                             <Select 
                                                onValueChange={(v) => updateBeneficiaryRow(row.id, { selectedProperty: row.owner!.properties.find(p => `${p.street}-${p.house}` === v) || null })} 
                                                value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}
                                                disabled={loading || !row.owner}
                                            >
                                                <SelectTrigger><SelectValue placeholder="Seleccione una propiedad..." /></SelectTrigger>
                                                <SelectContent>
                                                    {row.owner.properties.map(p => (
                                                        <SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{`${p.street} - ${p.house}`}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {beneficiaryType === 'terceros' && (
                                        <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading}><Trash2 className="h-4 w-4"/></Button>
                                    )}
                                </Card>
                            ))}
                           
                            {beneficiaryType === 'terceros' && (
                                <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} disabled={loading}><UserPlus className="mr-2 h-4 w-4"/>Añadir Otro Beneficiario</Button>
                            )}

                            <CardFooter className="p-4 bg-background/50 rounded-lg space-y-2 mt-4 flex-col items-stretch">
                                <div className="flex justify-between text-sm font-medium"><span>Monto Total del Pago:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div>
                                <hr className="my-1 border-border"/>
                                <div className={cn("flex justify-between text-base font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                            </CardFooter>
                        </div>
                    </CardContent>
                    <CardFooter className='flex flex-col items-end gap-4'>
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

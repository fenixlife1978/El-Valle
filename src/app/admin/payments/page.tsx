'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Upload, CircleAlert, CheckCircle2, Trash2, PlusCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// --- Mock Data ---
// In a real app, this would come from Firestore
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
    id: string; // Firestore IDs are strings
    name: string;
    street: string;
    house: string;
    email?: string;
    balance?: number;
    role: 'propietario' | 'administrador';
};

// --- Type Definitions ---
type BeneficiaryType = 'propio' | 'terceros' | 'global';
type PaymentMethod = 'movil' | 'transferencia' | '';
type GlobalSplit = { ownerId: string; amount: number | string };
type FormErrors = { [key: string]: string | undefined };

export default function UnifiedPaymentsPage() {
    const { toast } = useToast();
    const [owners, setOwners] = useState<Owner[]>([]);

    // --- Form State ---
    const [paymentDate, setPaymentDate] = useState<Date | undefined>();
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const receiptFileRef = useRef<HTMLInputElement>(null);
    const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>('propio');
    const [totalAmount, setTotalAmount] = useState<number | string>('');
    const [thirdPartyBeneficiary, setThirdPartyBeneficiary] = useState('');
    const [globalSplits, setGlobalSplits] = useState<GlobalSplit[]>([{ ownerId: '', amount: '' }]);
    const [errors, setErrors] = useState<FormErrors>({});

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
    
    // --- Effects ---
    useEffect(() => {
        if (paymentDate) {
            // Mock fetching exchange rate from Firestore
            setExchangeRate(null);
            setExchangeRateMessage('Buscando tasa...');
            setTimeout(() => {
                if (paymentDate.getDate() % 5 === 0) { // Simulate no rate found
                    setExchangeRate(null);
                    setExchangeRateMessage('No hay tasa registrada para esta fecha. Contacte al administrador.');
                } else {
                    const rate = 36.50 + (paymentDate.getDate() / 10);
                    setExchangeRate(rate);
                    setExchangeRateMessage('');
                }
            }, 1000);
        } else {
            setExchangeRate(null);
            setExchangeRateMessage('');
        }
    }, [paymentDate]);

    // --- Derived State & Calculations ---
    const globalSplitTotal = globalSplits.reduce((acc, split) => acc + (Number(split.amount) || 0), 0);
    const globalBalance = (Number(totalAmount) || 0) - globalSplitTotal;

    // --- Handlers ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
            const maxSize = 5 * 1024 * 1024; // 5MB

            if (!allowedTypes.includes(file.type)) {
                toast({ variant: 'destructive', title: 'Archivo no permitido', description: 'Por favor, sube un archivo JPG, PNG o PDF.' });
                return;
            }
            if (file.size > maxSize) {
                toast({ variant: 'destructive', title: 'Archivo demasiado grande', description: 'El tamaño máximo es 5MB.' });
                return;
            }
            setReceiptFile(file);
        }
    };
    
    const addGlobalSplit = () => {
        setGlobalSplits([...globalSplits, { ownerId: '', amount: '' }]);
    };

    const removeGlobalSplit = (index: number) => {
        if(globalSplits.length > 1) {
            setGlobalSplits(globalSplits.filter((_, i) => i !== index));
        }
    };

    const handleGlobalSplitChange = (index: number, field: 'ownerId' | 'amount', value: string | number) => {
        const newSplits = [...globalSplits];
        (newSplits[index] as any)[field] = value;
        setGlobalSplits(newSplits);
    };


    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!paymentDate) newErrors.paymentDate = 'La fecha es obligatoria.';
        else if (paymentDate > new Date()) newErrors.paymentDate = 'La fecha no puede ser futura.';
        if (!exchangeRate) newErrors.exchangeRate = 'Se requiere una tasa de cambio válida.';
        if (!paymentMethod) newErrors.paymentMethod = 'Seleccione un tipo de pago.';
        if (!bank) newErrors.bank = 'Seleccione un banco.';
        if (bank === 'otro' && !otherBank) newErrors.otherBank = 'Especifique el nombre del banco.';
        if (!/^\d{6}$/.test(reference)) newErrors.reference = 'La referencia debe tener 6 dígitos.';
        if (!receiptFile) newErrors.receiptFile = 'El comprobante es obligatorio.';
        if (!totalAmount || Number(totalAmount) <= 0) newErrors.totalAmount = 'El monto debe ser mayor a cero.';

        if (beneficiaryType === 'terceros' && !thirdPartyBeneficiary) {
            newErrors.thirdPartyBeneficiary = 'Debe seleccionar un beneficiario.';
        }
        if (beneficiaryType === 'global') {
            if (globalSplits.some(s => !s.ownerId || !s.amount)) {
                 newErrors.globalSplits = 'Todos los campos de beneficiario y monto deben estar completos.';
            }
            if (Math.abs(globalBalance) > 0.01) {
                newErrors.globalBalance = 'La suma de los montos asignados debe ser igual al monto total del pago.';
            }
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            toast({
                variant: 'destructive',
                title: 'Error de validación',
                description: 'Por favor, corrija los errores en el formulario.',
            });
            return;
        }

        // Mock submission to Firestore
        console.log({
            paymentDate,
            exchangeRate,
            paymentMethod,
            bank: bank === 'otro' ? otherBank : bank,
            reference,
            totalAmount,
            beneficiaryType,
            beneficiaries: beneficiaryType === 'propio' 
                ? 'current-user-uid' 
                : beneficiaryType === 'terceros' 
                ? thirdPartyBeneficiary 
                : globalSplits,
            receiptFileName: receiptFile?.name,
            status: 'pendiente',
            reportedAt: new Date().toISOString()
        });

        toast({
            title: 'Reporte Enviado',
            description: 'Tu reporte de pago ha sido enviado para revisión.',
            className: 'bg-green-100 border-green-400 text-green-800'
        });
        
        // Reset form state here
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Reporte de Pagos</h1>
                <p className="text-muted-foreground">Formulario único para registrar pagos propios, a terceros o globales.</p>
            </div>
            
            <form onSubmit={handleSubmit}>
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Detalles de la Transacción</CardTitle>
                        <CardDescription>Completa la información del pago realizado.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                        {/* --- Fila 1 --- */}
                        <div className="space-y-2">
                             <Label htmlFor="paymentDate">1. Fecha del Pago</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                    id="paymentDate"
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !paymentDate && "text-muted-foreground",
                                        errors.paymentDate && "border-destructive"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={paymentDate}
                                        onSelect={setPaymentDate}
                                        initialFocus
                                        locale={es}
                                        disabled={(date) => date > new Date() || date < new Date("2020-01-01")}
                                    />
                                </PopoverContent>
                            </Popover>
                             {errors.paymentDate && <p className="text-sm text-destructive">{errors.paymentDate}</p>}
                        </div>

                         <div className="space-y-2">
                            <Label>2. Tasa de Cambio (Bs. por USD)</Label>
                            <Input 
                                type="text"
                                value={exchangeRate ? `Bs. ${exchangeRate.toFixed(2)}` : exchangeRateMessage || 'Seleccione una fecha'}
                                readOnly
                                className={cn("bg-muted/50", errors.exchangeRate && "border-destructive")}
                            />
                            {errors.exchangeRate && <p className="text-sm text-destructive">{errors.exchangeRate}</p>}
                        </div>

                        {/* --- Fila 2 --- */}
                        <div className="space-y-2">
                           <Label htmlFor="paymentMethod">3. Tipo de Pago</Label>
                           <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                                <SelectTrigger id="paymentMethod" className={cn(errors.paymentMethod && "border-destructive")}>
                                    <SelectValue placeholder="Seleccione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="movil">Pago Móvil</SelectItem>
                                </SelectContent>
                           </Select>
                           {errors.paymentMethod && <p className="text-sm text-destructive">{errors.paymentMethod}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="bank">4. Banco Emisor</Label>
                             <Select value={bank} onValueChange={setBank}>
                                <SelectTrigger id="bank" className={cn(errors.bank && "border-destructive")}>
                                    <SelectValue placeholder="Seleccione un banco..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {errors.bank && <p className="text-sm text-destructive">{errors.bank}</p>}
                        </div>
                        
                        {bank === 'otro' && (
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="otherBank">Nombre del Otro Banco</Label>
                                <Input 
                                    id="otherBank" 
                                    value={otherBank} 
                                    onChange={(e) => setOtherBank(e.target.value)} 
                                    placeholder="Ej: Banco del Sur"
                                    className={cn(errors.otherBank && "border-destructive")}
                                />
                                {errors.otherBank && <p className="text-sm text-destructive">{errors.otherBank}</p>}
                            </div>
                        )}

                        {/* --- Fila 3 --- */}
                        <div className="space-y-2">
                             <Label htmlFor="reference">5. Referencia (Últimos 6 dígitos)</Label>
                             <Input 
                                id="reference" 
                                value={reference} 
                                onChange={(e) => setReference(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                maxLength={6}
                                placeholder="123456"
                                className={cn(errors.reference && "border-destructive")}
                             />
                             {errors.reference && <p className="text-sm text-destructive">{errors.reference}</p>}
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="receiptFile">6. Comprobante de Pago</Label>
                            <div className="flex items-center gap-4">
                                <Button type="button" variant="outline" onClick={() => receiptFileRef.current?.click()} className="flex-1">
                                    <Upload className="mr-2 h-4 w-4"/>
                                    {receiptFile ? 'Cambiar archivo' : 'Subir archivo'}
                                </Button>
                                {receiptFile && <p className="text-sm text-muted-foreground truncate">{receiptFile.name}</p>}
                            </div>
                            <input type="file" ref={receiptFileRef} onChange={handleFileChange} accept="image/jpeg,image/png,application/pdf" className="hidden"/>
                            {errors.receiptFile && <p className="text-sm text-destructive">{errors.receiptFile}</p>}
                        </div>

                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Detalles de los Beneficiarios</CardTitle>
                        <CardDescription>Indica para quién es este pago y el monto correspondiente.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                        {/* --- Beneficiary Type --- */}
                        <div className="space-y-3">
                            <Label>7. Tipo de Pago</Label>
                            <RadioGroup value={beneficiaryType} onValueChange={(v) => setBeneficiaryType(v as BeneficiaryType)} className="flex flex-col sm:flex-row gap-4">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="propio" id="r-propio" />
                                    <Label htmlFor="r-propio">Pago Propio</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="terceros" id="r-terceros" />
                                    <Label htmlFor="r-terceros">Pago a Terceros</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="global" id="r-global" />
                                    <Label htmlFor="r-global">Pago Global</Label>
                                </div>
                            </RadioGroup>
                        </div>
                        
                        {/* --- Total Amount --- */}
                        <div className="space-y-2">
                            <Label htmlFor="totalAmount">8. Monto Total del Pago (Bs.)</Label>
                            <Input
                                id="totalAmount"
                                type="number"
                                value={totalAmount}
                                onChange={(e) => setTotalAmount(e.target.value)}
                                placeholder="0.00"
                                step="0.01"
                                className={cn(errors.totalAmount && "border-destructive")}
                            />
                            {errors.totalAmount && <p className="text-sm text-destructive">{errors.totalAmount}</p>}
                        </div>
                        
                        {/* --- Conditional Beneficiary Section --- */}
                        <div className="md:col-span-2 space-y-4">
                            <Label className="font-semibold">9. Asignación de Montos</Label>
                            
                            {beneficiaryType === 'propio' && (
                                <div className="p-4 bg-muted/50 rounded-lg flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-green-600"/>
                                    <p className="text-sm text-muted-foreground">El monto total se asignará a tu unidad: <strong>Juan Perez (Propietario)</strong>.</p>
                                </div>
                            )}

                            {beneficiaryType === 'terceros' && (
                                <div className="space-y-2">
                                    <Label htmlFor="third-party-beneficiary">Beneficiario</Label>
                                    <Select value={thirdPartyBeneficiary} onValueChange={setThirdPartyBeneficiary}>
                                        <SelectTrigger id="third-party-beneficiary" className={cn(errors.thirdPartyBeneficiary && "border-destructive")}>
                                            <SelectValue placeholder="Seleccione un propietario..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name} ({o.house})</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    {errors.thirdPartyBeneficiary && <p className="text-sm text-destructive">{errors.thirdPartyBeneficiary}</p>}
                                </div>
                            )}

                            {beneficiaryType === 'global' && (
                                <div className="space-y-4">
                                    {globalSplits.map((split, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="flex-1">
                                                 <Select value={split.ownerId} onValueChange={(v) => handleGlobalSplitChange(index, 'ownerId', v)}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleccione beneficiario..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {owners.map(o => (
                                                            <SelectItem 
                                                                key={o.id} 
                                                                value={o.id}
                                                                disabled={globalSplits.some(s => s.ownerId === o.id && s.ownerId !== split.ownerId)}
                                                            >
                                                                {o.name} ({o.house})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-40">
                                                <Input 
                                                    type="number" 
                                                    placeholder="Monto (Bs.)" 
                                                    value={split.amount}
                                                    onChange={(e) => handleGlobalSplitChange(index, 'amount', e.target.value)}
                                                />
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeGlobalSplit(index)} disabled={globalSplits.length <= 1}>
                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                            </Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={addGlobalSplit}>
                                        <PlusCircle className="mr-2 h-4 w-4"/>
                                        Agregar Beneficiario
                                    </Button>

                                    <div className="p-4 bg-muted/50 rounded-lg space-y-2 mt-4">
                                        <div className="flex justify-between text-sm font-medium">
                                            <span>Monto Total:</span>
                                            <span>Bs. {Number(totalAmount || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span>Total Asignado:</span>
                                            <span>Bs. {globalSplitTotal.toFixed(2)}</span>
                                        </div>
                                        <div className={cn("flex justify-between text-sm font-bold", globalBalance !== 0 ? 'text-destructive' : 'text-green-600')}>
                                            <span>Balance:</span>
                                            <span>Bs. {globalBalance.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    {errors.globalSplits && <p className="text-sm text-destructive">{errors.globalSplits}</p>}
                                    {errors.globalBalance && <p className="text-sm text-destructive">{errors.globalBalance}</p>}
                                </div>
                            )}

                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button type="submit" className="w-full md:w-auto ml-auto">
                            <CheckCircle2 className="mr-2 h-4 w-4"/>
                            Enviar Reporte
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}

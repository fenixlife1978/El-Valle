
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from '@/hooks/use-toast';
import { Upload, Save, Calendar as CalendarIcon, PlusCircle, Loader2, AlertTriangle, Wand2, MoreHorizontal, Edit, FileCog, UserCircle, RefreshCw } from 'lucide-react';
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot, writeBatch, collection, query, where, getDocs, serverTimestamp, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { ThemeSwitcher } from '@/components/theme-switcher';


type AdminProfile = {
    name: string;
    email: string;
    avatar: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type ExchangeRate = {
    id: string;
    date: string; // Stored as 'yyyy-MM-dd'
    rate: number;
    active: boolean;
};

type Settings = {
    adminProfile: AdminProfile;
    companyInfo: CompanyInfo;
    condoFee: number;
    exchangeRates: ExchangeRate[];
    lastCondoFee?: number; // To track the previous fee for adjustment logic
    bcvLogo?: string;
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number; // Amount at which the debt was paid
    paymentDate?: Timestamp;
    property: { street: string; house: string; };
};


const emptyAdminProfile: AdminProfile = {
    name: 'Administrador',
    email: 'admin@condominio.com',
    avatar: ''
};

const defaultLogo = "data:image/png;base64,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"

const emptyCompanyInfo: CompanyInfo = {
    name: 'Nombre de la Empresa',
    address: '',
    rif: '',
    phone: '',
    email: '',
    logo: "data:image/png;base64,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"
};


export default function SettingsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [adminProfile, setAdminProfile] = useState<AdminProfile>(emptyAdminProfile);
    const [adminAvatarPreview, setAdminAvatarPreview] = useState<string | null>(null);

    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(emptyCompanyInfo);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [bcvLogo, setBcvLogo] = useState<string>('');
    const [bcvLogoPreview, setBcvLogoPreview] = useState<string | null>(null);
    
    const [condoFee, setCondoFee] = useState(0);
    const [lastCondoFee, setLastCondoFee] = useState(0); // This is the fee stored in the DB
    const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
    
    // State for adding a new rate
    const [newRateDate, setNewRateDate] = useState<Date | undefined>(new Date());
    const [newRateAmount, setNewRateAmount] = useState('');

    // State for editing a rate
    const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
    const [rateToEdit, setRateToEdit] = useState<ExchangeRate | null>(null);
    const [editRateDate, setEditRateDate] = useState<Date | undefined>();
    const [editRateAmount, setEditRateAmount] = useState('');
    
    const [isFeeChanged, setIsFeeChanged] = useState(false);
    const [isAdjustmentRunning, setIsAdjustmentRunning] = useState(false);
    const [progress, setProgress] = useState(0);


    useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data() as Settings;
                setAdminProfile(settings.adminProfile || emptyAdminProfile);
                setAdminAvatarPreview(settings.adminProfile?.avatar);
                setCompanyInfo(settings.companyInfo || emptyCompanyInfo);
                setLogoPreview(settings.companyInfo?.logo || defaultLogo);
                setBcvLogo(settings.bcvLogo || '');
                setBcvLogoPreview(settings.bcvLogo ?? null);
                setCondoFee(settings.condoFee);
                setLastCondoFee(settings.condoFee); // Set the last known fee from DB
                setExchangeRates(settings.exchangeRates || []);
            } else {
                const initialRate: ExchangeRate = {
                    id: new Date().toISOString(),
                    date: format(new Date(), 'yyyy-MM-dd'),
                    rate: 0,
                    active: true
                };
                setDoc(settingsRef, {
                    adminProfile: emptyAdminProfile,
                    companyInfo: emptyCompanyInfo,
                    condoFee: 25.00,
                    lastCondoFee: 25.00,
                    exchangeRates: [initialRate]
                });
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching settings:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las configuraciones.' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);

    const handleInfoChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'admin' | 'company') => {
        if (target === 'admin') {
            setAdminProfile({ ...adminProfile, [e.target.name]: e.target.value });
        } else {
            setCompanyInfo({ ...companyInfo, [e.target.name]: e.target.value });
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'avatar' | 'logo' | 'bcvLogo') => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 1 * 1024 * 1024) { // 1MB limit
                 toast({ variant: 'destructive', title: 'Archivo muy grande', description: 'La imagen no debe pesar más de 1MB.' });
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (target === 'avatar') {
                    setAdminAvatarPreview(result);
                    setAdminProfile({ ...adminProfile, avatar: result });
                } else if (target === 'logo') {
                    setLogoPreview(result);
                    setCompanyInfo({ ...companyInfo, logo: result });
                } else {
                    setBcvLogoPreview(result);
                    setBcvLogo(result);
                }
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleAddRate = async () => {
        if(!newRateDate || !newRateAmount) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, complete la fecha y el monto de la tasa.' });
            return;
        }
        
        const newRate: ExchangeRate = {
            id: new Date().toISOString(), // simple unique id
            date: format(newRateDate, 'yyyy-MM-dd'),
            rate: parseFloat(newRateAmount),
            active: false
        };
        
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            await updateDoc(settingsRef, {
                exchangeRates: arrayUnion(newRate)
            });
            setNewRateDate(new Date());
            setNewRateAmount('');
            toast({ title: 'Tasa Agregada', description: 'La nueva tasa de cambio ha sido añadida al historial.' });
        } catch (error) {
            console.error("Error adding rate:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo agregar la nueva tasa.' });
        }
    };

    const handleActivateRate = async (rateToActivate: ExchangeRate) => {
        const updatedRates = exchangeRates.map(r => ({...r, active: r.id === rateToActivate.id }));
        
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            await updateDoc(settingsRef, { exchangeRates: updatedRates });
            toast({ title: 'Tasa Activada', description: `La tasa de ${rateToActivate.rate.toFixed(2)} ahora es la activa.` });
        } catch (error) {
            console.error("Error activating rate:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo activar la tasa.' });
        }
    }
    
    const openEditRateDialog = (rate: ExchangeRate) => {
        setRateToEdit(rate);
        setEditRateDate(parseISO(rate.date));
        setEditRateAmount(String(rate.rate));
        setIsRateDialogOpen(true);
    };

    const handleEditRate = async () => {
        if (!rateToEdit || !editRateDate || !editRateAmount) {
            toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos para editar la tasa.' });
            return;
        }
        const updatedRates = exchangeRates.map(r => 
            r.id === rateToEdit.id 
            ? { ...r, date: format(editRateDate, 'yyyy-MM-dd'), rate: parseFloat(editRateAmount) }
            : r
        );
        
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            await updateDoc(settingsRef, { exchangeRates: updatedRates });
            toast({ title: 'Tasa Actualizada', description: 'La tasa de cambio ha sido modificada.' });
        } catch (error) {
            console.error("Error editing rate:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo modificar la tasa.' });
        } finally {
            setIsRateDialogOpen(false);
            setRateToEdit(null);
        }
    };
    
    const handleCondoFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFee = parseFloat(e.target.value) || 0;
        setCondoFee(newFee);
        if(newFee !== lastCondoFee) {
            setIsFeeChanged(true);
        } else {
            setIsFeeChanged(false);
        }
    }

    const handleSaveChanges = async () => {
        setSaving(true);
        setProgress(0);
        const newCondoFee = Number(condoFee);
    
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
    
            await new Promise(resolve => setTimeout(() => { setProgress(30); resolve(null); }, 300));
    
            const safeCompanyInfo: CompanyInfo = {
                name: companyInfo?.name || '',
                address: companyInfo?.address || '',
                rif: companyInfo?.rif || '',
                phone: companyInfo?.phone || '',
                email: companyInfo?.email || '',
                logo: companyInfo?.logo || '',
            };
    
            const dataToSave: Partial<Settings> = {
                adminProfile: {
                    name: adminProfile.name || '',
                    email: adminProfile.email || '',
                    avatar: adminProfile.avatar || '',
                },
                companyInfo: safeCompanyInfo,
                condoFee: newCondoFee,
                lastCondoFee: lastCondoFee,
                bcvLogo: bcvLogo,
            };
    
            await updateDoc(settingsRef, dataToSave);
    
            await new Promise(resolve => setTimeout(() => { setProgress(100); resolve(null); }, 500));
    
            toast({
                title: 'Cambios Guardados',
                description: 'La configuración ha sido actualizada exitosamente.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });
    
            if (isFeeChanged) {
                 toast({
                    title: 'Cuota Actualizada',
                    description: 'Puede proceder a ajustar las deudas por adelantado si es necesario.',
                    className: 'bg-blue-100 border-blue-400 text-blue-800'
                });
            }
             setLastCondoFee(newCondoFee);
             
        } catch(error) {
             console.error("Error saving settings:", error);
             toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios. ' + (error as Error).message });
        } finally {
            await new Promise(resolve => setTimeout(() => { setSaving(false); setProgress(0); }, 700));
        }
    };
    
    const handleFeeAdjustment = async () => {
        setIsAdjustmentRunning(true);
        toast({ title: 'Iniciando ajuste...', description: 'Buscando pagos adelantados para ajustar.' });

        const newCondoFee = Number(condoFee);
        const firestore = db;
        try {
            const paidAdvanceQuery = query(
                collection(firestore, "debts"),
                where("status", "==", "paid"),
                where("description", "==", "Cuota de Condominio (Pagada por adelantado)")
            );
            const advanceDebtsSnapshot = await getDocs(paidAdvanceQuery);
            
            const adjustmentQuery = query(
                collection(firestore, "debts"),
                where("description", "==", "Ajuste por aumento de cuota")
            );
            const adjustmentDebtsSnapshot = await getDocs(adjustmentQuery);
            const existingAdjustments = new Set(
                adjustmentDebtsSnapshot.docs.map(d => `${d.data().ownerId}-${d.data().year}-${d.data().month}`)
            );
            
            if (advanceDebtsSnapshot.empty) {
                toast({ title: 'No se requieren ajustes', description: 'No se encontraron pagos por adelantado.' });
                setIsAdjustmentRunning(false);
                return;
            }
                       
            const batch = writeBatch(firestore);
            let adjustmentsCreated = 0;
            
            for (const debtDoc of advanceDebtsSnapshot.docs) {
                const debt = { id: debtDoc.id, ...debtDoc.data() } as Debt;
                const paidAmount = debt.paidAmountUSD || debt.amountUSD;
                const adjustmentKey = `${debt.ownerId}-${debt.year}-${debt.month}`;
                if (paidAmount < newCondoFee && !existingAdjustments.has(adjustmentKey)) {
                    const difference = newCondoFee - paidAmount;
                    const adjustmentDebtRef = doc(collection(firestore, "debts"));
                    
                    batch.set(adjustmentDebtRef, {
                        ownerId: debt.ownerId,
                        property: debt.property,
                        year: debt.year,
                        month: debt.month,
                        amountUSD: difference,
                        description: "Ajuste por aumento de cuota",
                        status: "pending",
                        createdAt: serverTimestamp()
                    });
                    adjustmentsCreated++;
                }
            }

            if (adjustmentsCreated > 0) {
                await batch.commit();
                toast({
                    title: 'Ajuste Completado',
                    description: `Se han generado ${adjustmentsCreated} nuevas deudas por ajuste de cuota.`,
                    className: 'bg-green-100 border-green-400 text-green-800'
                });
            } else {
                toast({ title: 'No se requieren nuevos ajustes', description: 'Todos los pagos por adelantado ya están al día o ajustados.' });
            }

        } catch (error) {
            console.error("Error during fee adjustment: ", error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error en el Ajuste', description: errorMessage });
        } finally {
            setIsAdjustmentRunning(false);
            setIsFeeChanged(false);
        }
    };


    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            
            <div>
                <h1 className="text-3xl font-bold font-headline">Configuración General</h1>
                <p className="text-muted-foreground">Gestiona la información de la comunidad y las reglas de negocio.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Apariencia</CardTitle>
                            <CardDescription>
                                Personaliza el aspecto de la aplicación para todos los usuarios.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ThemeSwitcher />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Perfil de Administrador</CardTitle>
                            <CardDescription>Edita tus datos personales.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-6">
                                <Avatar className="w-24 h-24 text-lg">
                                    <AvatarImage src={adminAvatarPreview || ''} alt="Admin Avatar" />
                                    <AvatarFallback><UserCircle className="h-12 w-12"/></AvatarFallback>
                                </Avatar>
                                <div className="space-y-2">
                                     <Label htmlFor="avatar-upload">Foto de Perfil</Label>
                                     <div className="flex items-center gap-2">
                                        <Input id="avatar-upload" type="file" className="hidden" onChange={(e) => handleImageChange(e, 'avatar')} accept="image/png, image/jpeg" />
                                        <Button type="button" variant="outline" onClick={() => document.getElementById('avatar-upload')?.click()}>
                                            <Upload className="mr-2 h-4 w-4"/> Cambiar Foto
                                        </Button>
                                     </div>
                                     <p className="text-xs text-muted-foreground">PNG o JPG. Recomendado 200x200px, max 1MB.</p>
                                </div>
                             </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="admin-name">Nombre</Label>
                                    <Input id="admin-name" name="name" value={adminProfile.name} onChange={(e) => handleInfoChange(e, 'admin')} />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="admin-email">Email</Label>
                                    <Input id="admin-email" name="email" type="email" value={adminProfile.email} onChange={(e) => handleInfoChange(e, 'admin')} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader>
                            <CardTitle>Información de la Empresa</CardTitle>
                            <CardDescription>Edita los datos principales de la comunidad o empresa gestora.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex items-center gap-6">
                                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center overflow-hidden border p-1">
                                   <img src={logoPreview || ''} alt="Logo" className="w-full h-full object-contain" />
                                </div>
                                <div className="space-y-2">
                                     <Label htmlFor="logo-upload">Logo de la Empresa</Label>
                                     <div className="flex items-center gap-2">
                                        <Input id="logo-upload" type="file" className="hidden" onChange={(e) => handleImageChange(e, 'logo')} accept="image/png, image/jpeg" />
                                        <Button type="button" variant="outline" onClick={() => document.getElementById('logo-upload')?.click()}>
                                            <Upload className="mr-2 h-4 w-4"/> Subir Logo
                                        </Button>
                                     </div>
                                     <p className="text-xs text-muted-foreground">PNG o JPG. Recomendado 200x200px, max 1MB.</p>
                                </div>
                             </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre</Label>
                                    <Input id="name" name="name" value={companyInfo.name} onChange={(e) => handleInfoChange(e, 'company')} />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="rif">RIF</Label>
                                    <Input id="rif" name="rif" value={companyInfo.rif} onChange={(e) => handleInfoChange(e, 'company')} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="address">Dirección</Label>
                                    <Input id="address" name="address" value={companyInfo.address} onChange={(e) => handleInfoChange(e, 'company')} />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="phone">Teléfono</Label>
                                    <Input id="phone" name="phone" type="tel" value={companyInfo.phone} onChange={(e) => handleInfoChange(e, 'company')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Correo Electrónico</Label>
                                    <Input id="email" name="email" type="email" value={companyInfo.email} onChange={(e) => handleInfoChange(e, 'company')} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestión de Logos</CardTitle>
                            <CardDescription>Personaliza los logos que aparecen en la aplicación.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-6">
                                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center overflow-hidden border p-1">
                                    {bcvLogoPreview && <img src={bcvLogoPreview} alt="BCV Logo Preview" className="w-full h-full object-contain" />}
                                </div>
                                <div className="space-y-2">
                                     <Label htmlFor="bcv-logo-upload">Logo de Tasa BCV</Label>
                                     <div className="flex items-center gap-2">
                                        <Input id="bcv-logo-upload" type="file" className="hidden" onChange={(e) => handleImageChange(e, 'bcvLogo')} accept="image/png, image/jpeg" />
                                        <Button type="button" variant="outline" onClick={() => document.getElementById('bcv-logo-upload')?.click()}>
                                            <Upload className="mr-2 h-4 w-4"/> Cambiar Logo BCV
                                        </Button>
                                     </div>
                                     <p className="text-xs text-muted-foreground">PNG o JPG. Recomendado 200x200px, max 1MB.</p>
                                </div>
                             </div>
                        </CardContent>
                    </Card>

                </div>

                <div className="lg:col-span-1 space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestión de Cuota Condominial</CardTitle>
                        </CardHeader>
                        <CardContent>
                           <div className="space-y-2 flex-grow">
                                <Label htmlFor="condoFee">Monto de la Cuota Mensual (USD)</Label>
                                <Input 
                                    id="condoFee" 
                                    type="number" 
                                    value={condoFee} 
                                    onChange={handleCondoFeeChange}
                                    placeholder="0.00"
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="flex-col items-stretch gap-2">
                            <Button onClick={handleFeeAdjustment} disabled={!isFeeChanged || isAdjustmentRunning} variant="outline">
                                {isAdjustmentRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                                Ajustar Deudas por Aumento
                            </Button>
                            <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2 text-xs text-muted-foreground">
                                <AlertTriangle className="h-4 w-4 mt-0.5 text-orange-500 shrink-0"/>
                                <p>Use "Ajustar Deudas" si cambia la cuota para generar cargos por diferencia a quienes pagaron por adelantado.</p>
                            </div>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Gestión Manual de Tasa</CardTitle>
                            <CardDescription>Historial de tasas y activación para los cálculos.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Agregar Nueva Tasa</Label>
                                <div className="flex items-center gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-[140px] justify-start text-left font-normal", !newRateDate && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {newRateDate ? format(newRateDate, "dd/MM/yy") : <span>Fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={newRateDate} onSelect={setNewRateDate} initialFocus locale={es} /></PopoverContent>
                                    </Popover>
                                    <Input type="number" placeholder="Monto" value={newRateAmount} onChange={(e) => setNewRateAmount(e.target.value)} />
                                    <Button size="icon" onClick={handleAddRate}><PlusCircle className="h-4 w-4"/></Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Historial de Tasas</Label>
                                <div className="border rounded-md max-h-64 overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead>Tasa (Bs.)</TableHead>
                                                <TableHead className="text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {exchangeRates.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(rate => (
                                                <TableRow key={rate.id} data-state={rate.active ? 'selected' : 'unselected'}>
                                                    <TableCell>{format(parseISO(rate.date), "dd/MM/yyyy")}</TableCell>
                                                    <TableCell className={cn(rate.active && "font-bold text-primary")}>{rate.rate.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                                    <span className="sr-only">Abrir menú</span>
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => handleActivateRate(rate)} disabled={rate.active}>
                                                                    {rate.active ? 'Activa' : 'Activar'}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => openEditRateDialog(rate)}>
                                                                    <Edit className="mr-2 h-4 w-4" />
                                                                    Editar
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
                <Button onClick={handleSaveChanges} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Guardar Cambios
                </Button>
                {saving && <Progress value={progress} className="w-full max-w-xs" />}
            </div>

            {/* Edit Rate Dialog */}
            <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Editar Tasa de Cambio</DialogTitle>
                        <DialogDescription>
                            Modifique la fecha o el monto de la tasa seleccionada.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                             <Label htmlFor="edit-rate-date">Fecha</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button id="edit-rate-date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !editRateDate && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {editRateDate ? format(editRateDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editRateDate} onSelect={setEditRateDate} initialFocus locale={es} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-rate-amount">Monto de la Tasa (Bs.)</Label>
                            <Input id="edit-rate-amount" type="number" value={editRateAmount} onChange={(e) => setEditRateAmount(e.target.value)} placeholder="0.00" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleEditRate}>Guardar Cambios</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}

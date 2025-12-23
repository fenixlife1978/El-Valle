

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
import { Upload, Save, Calendar as CalendarIcon, PlusCircle, Loader2, AlertTriangle, Wand2, MoreHorizontal, Edit, FileCog, UserCircle, RefreshCw, Trash2, Circle, Square } from 'lucide-react';
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot, writeBatch, collection, query, where, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';


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
    bankName: string;
    accountNumber: string;
};

type ExchangeRate = {
    id: string;
    date: string; // Stored as 'yyyy-MM-dd'
    rate: number;
    active: boolean;
};

type FrameStyle = 'circle' | 'soft' | 'rounded' | 'square';


type Settings = {
    id?: string;
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

const emptyCompanyInfo: CompanyInfo = {
    name: 'Nombre de la Empresa',
    address: '',
    rif: '',
    phone: '',
    email: '',
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAAA1BMVEX///+nxBvIAAAASElEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+BsNEAAG8Vkk/AAAAAElFTkSuQmCC',
    bankName: '',
    accountNumber: ''
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

    const [isDeleteRateDialogOpen, setIsDeleteRateDialogOpen] = useState(false);
    const [rateToDelete, setRateToDelete] = useState<ExchangeRate | null>(null);


    useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data() as Settings;
                setAdminProfile(settings.adminProfile || emptyAdminProfile);
                setCompanyInfo(settings.companyInfo || emptyCompanyInfo);
                setLogoPreview(settings.companyInfo?.logo);
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
                    exchangeRates: [initialRate],
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

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'logo' | 'bcvLogo') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (target === 'logo') {
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
        const rateAmount = Number(newRateAmount); 
        
        if(!newRateDate || isNaN(rateAmount) || rateAmount <= 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, complete la fecha y el monto de la tasa con un valor positivo.' });
            return;
        }
        
        const newRate: ExchangeRate = {
            id: new Date().toISOString(), // simple unique id
            date: format(newRateDate, 'yyyy-MM-dd'),
            rate: rateAmount, 
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
        const editedRateAmount = Number(editRateAmount);
        
        if (!rateToEdit || !editRateDate || isNaN(editedRateAmount) || editedRateAmount <= 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos o el monto es inválido para editar la tasa.' });
            return;
        }
        const updatedRates = exchangeRates.map(r => 
            r.id === rateToEdit.id 
            ? { ...r, date: format(editRateDate, 'yyyy-MM-dd'), rate: editedRateAmount } 
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
    
    const handleDeleteRate = async () => {
        if (!rateToDelete) return;

        if (rateToDelete.active) {
            toast({ variant: 'destructive', title: 'Acción no permitida', description: 'No se puede eliminar la tasa activa. Active otra tasa primero.' });
            setIsDeleteRateDialogOpen(false);
            return;
        }

        const updatedRates = exchangeRates.filter(r => r.id !== rateToDelete.id);

        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            await updateDoc(settingsRef, { exchangeRates: updatedRates });
            toast({ title: 'Tasa Eliminada', description: 'La tasa ha sido eliminada del historial.' });
        } catch (error) {
            console.error("Error deleting rate:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la tasa.' });
        } finally {
            setIsDeleteRateDialogOpen(false);
            setRateToDelete(null);
        }
    };
    
    const handleCondoFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFee = parseFloat(e.target.value) || 0;
        setCondoFee(newFee);
        setIsFeeChanged(newFee !== lastCondoFee);
    }

    const handleSaveChanges = async () => {
        setSaving(true);
        const newCondoFee = Number(condoFee);

        try {
            const settingsRef = doc(db, 'config', 'mainSettings');

            // Save companyInfo separately to avoid nested entity errors
            await updateDoc(settingsRef, {
                companyInfo: {
                    name: companyInfo?.name || '',
                    address: companyInfo?.address || '',
                    rif: companyInfo?.rif || '',
                    phone: companyInfo?.phone || '',
                    email: companyInfo?.email || '',
                    logo: companyInfo?.logo || '',
                    bankName: companyInfo?.bankName || '',
                    accountNumber: companyInfo?.accountNumber || '',
                },
                adminProfile: {
                    name: adminProfile.name || '',
                    email: adminProfile.email || '',
                    avatar: companyInfo.logo,
                },
                condoFee: newCondoFee,
                lastCondoFee: lastCondoFee,
                bcvLogo: bcvLogo,
            });

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
            setSaving(false);
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
                
                const paidAmount = Number(debt.paidAmountUSD || debt.amountUSD); 
                
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
                            <CardTitle>Gestión de Logos</CardTitle>
                            <CardDescription>Personaliza los logos de la aplicación.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <Label>Logo de la Empresa</Label>
                                    <div className="w-32 h-32 flex items-center justify-center overflow-hidden rounded-full bg-white p-1">
                                        <div className="w-full h-full flex items-center justify-center">
                                             {logoPreview && <img src={logoPreview} alt="Company Logo Preview" className="w-full h-full object-contain" />}
                                         </div>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('logo-upload')?.click()}>
                                        <Upload className="mr-2 h-4 w-4"/> Subir Logo
                                    </Button>
                                    <Input id="logo-upload" type="file" className="hidden" onChange={(e) => handleImageChange(e, 'logo')} accept="image/png, image/jpeg" />
                                </div>
                                 <div className="space-y-4">
                                     <Label>Logo de Tasa BCV</Label>
                                     <div className="w-32 h-32 flex items-center justify-center overflow-hidden rounded-full bg-white p-1">
                                         <div className="w-full h-full flex items-center justify-center">
                                             {bcvLogoPreview && <img src={bcvLogoPreview} alt="BCV Logo Preview" className="w-full h-full object-contain" />}
                                         </div>
                                     </div>
                                     <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('bcv-logo-upload')?.click()}>
                                        <Upload className="mr-2 h-4 w-4"/> Cambiar Logo BCV
                                     </Button>
                                     <Input id="bcv-logo-upload" type="file" className="hidden" onChange={(e) => handleImageChange(e, 'bcvLogo')} accept="image/png, image/jpeg" />
                                 </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Información del Condominio</CardTitle>
                            <CardDescription>Edita los datos principales que se mostrarán en la aplicación y en los reportes.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                                <div className="space-y-2">
                                    <Label htmlFor="bankName">Nombre del Banco</Label>
                                    <Input id="bankName" name="bankName" value={companyInfo.bankName} onChange={(e) => handleInfoChange(e, 'company')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="accountNumber">Número de Cuenta</Label>
                                    <Input id="accountNumber" name="accountNumber" value={companyInfo.accountNumber} onChange={(e) => handleInfoChange(e, 'company')} />
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
                           {isFeeChanged && (
                                <div className="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 rounded-md">
                                    <AlertTriangle className="inline h-4 w-4 mr-2"/>
                                    **Cambio Detectado:** Debes guardar los cambios y considerar ejecutar el ajuste de deudas.
                                </div>
                           )}
                        </CardContent>
                        <CardFooter className="flex flex-col space-y-3">
                            <Button 
                                onClick={handleSaveChanges} 
                                disabled={saving} 
                                className="w-full"
                            >
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </Button>
                             {condoFee > lastCondoFee && isFeeChanged && !isAdjustmentRunning && (
                                <Button 
                                    onClick={handleFeeAdjustment} 
                                    disabled={isAdjustmentRunning}
                                    variant="outline"
                                    className="w-full text-blue-600 border-blue-600 hover:bg-blue-50"
                                >
                                    <Wand2 className="mr-2 h-4 w-4"/> 
                                    Ajustar Deudas Adelantadas
                                </Button>
                            )}
                            {isAdjustmentRunning && (
                                <div className="w-full space-y-2">
                                    <Label className="text-sm text-muted-foreground">Procesando ajuste...</Label>
                                    <Progress value={progress} className="w-full"/>
                                </div>
                            )}
                        </CardFooter>
                    </Card>
                    
                    <Card>
                         <CardHeader>
                            <CardTitle>Historial de Tasa de Cambio (BCV)</CardTitle>
                            <CardDescription>Establece y gestiona las tasas de cambio históricas.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex space-x-2">
                                <div className="space-y-2 flex-1">
                                    <Label htmlFor="newRateAmount">Monto (BsD/USD)</Label>
                                    <Input 
                                        id="newRateAmount" 
                                        type="number" 
                                        value={newRateAmount} 
                                        onChange={(e) => setNewRateAmount(e.target.value)} 
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Fecha</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                    "w-full justify-start text-left font-normal",
                                                    !newRateDate && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {newRateDate ? format(newRateDate, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={newRateDate}
                                                onSelect={setNewRateDate}
                                                initialFocus
                                                locale={es}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            <Button onClick={handleAddRate} className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4"/> Agregar Tasa
                            </Button>
                            
                            <h3 className="text-lg font-semibold mt-6 border-b pb-1">Tasas Registradas</h3>
                            
                            <div className="max-h-60 overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]">Fecha</TableHead>
                                            <TableHead>Tasa (BsD)</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {exchangeRates
                                            .slice()
                                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                            .map((rate) => (
                                            <TableRow key={rate.id} className={rate.active ? 'bg-green-50/50 hover:bg-green-50' : ''}>
                                                <TableCell>{format(parseISO(rate.date), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell className="font-medium">{rate.rate.toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <span className={cn(
                                                        'px-2 py-1 text-xs rounded-full font-semibold',
                                                        rate.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                                    )}>
                                                        {rate.active ? 'Activa' : 'Inactiva'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Abrir menú</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            {!rate.active && (
                                                                <DropdownMenuItem onClick={() => handleActivateRate(rate)}>
                                                                    <RefreshCw className="mr-2 h-4 w-4" /> Activar
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem onClick={() => openEditRateDialog(rate)}>
                                                                <Edit className="mr-2 h-4 w-4" /> Editar
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem 
                                                                className="text-red-600 focus:text-red-600"
                                                                onClick={() => { setRateToDelete(rate); setIsDeleteRateDialogOpen(true); }}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {exchangeRates.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-muted-foreground">No hay tasas registradas.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            {/* Diálogo de Edición de Tasa */}
            <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Tasa de Cambio</DialogTitle>
                        <DialogDescription>Modifica la fecha y el monto de la tasa seleccionada.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="editRateAmount">Monto (BsD/USD)</Label>
                            <Input 
                                id="editRateAmount" 
                                type="number" 
                                value={editRateAmount} 
                                onChange={(e) => setEditRateAmount(e.target.value)} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fecha</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !editRateDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {editRateDate ? format(editRateDate, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={editRateDate}
                                        onSelect={setEditRateDate}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleEditRate}>Guardar Cambios</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Diálogo de Confirmación de Eliminación */}
            <Dialog open={isDeleteRateDialogOpen} onOpenChange={setIsDeleteRateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Eliminación</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro de que deseas eliminar la tasa de {rateToDelete?.rate.toFixed(2)} del {rateToDelete?.date}?<br/>
                            **Esta acción no se puede deshacer.**
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteRateDialogOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDeleteRate}>Eliminar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

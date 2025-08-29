
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
import { Upload, Save, Calendar as CalendarIcon, PlusCircle, Loader2, AlertTriangle, Wand2, MoreHorizontal, Edit, FileCog, UserCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot, writeBatch, collection, query, where, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';


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
    logo: string; // Will store as data URL for simplicity
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
    logo: '/logo-placeholder.png' // A default placeholder
};

export default function SettingsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [adminProfile, setAdminProfile] = useState<AdminProfile>(emptyAdminProfile);
    const [adminAvatarPreview, setAdminAvatarPreview] = useState<string | null>(null);

    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(emptyCompanyInfo);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    
    const [condoFee, setCondoFee] = useState(0);
    const [lastCondoFee, setLastCondoFee] = useState(0);
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

    useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data() as Settings;
                setAdminProfile(settings.adminProfile || emptyAdminProfile);
                setAdminAvatarPreview(settings.adminProfile?.avatar);
                setCompanyInfo(settings.companyInfo);
                setLogoPreview(settings.companyInfo.logo);
                setCondoFee(settings.condoFee);
                setLastCondoFee(settings.lastCondoFee ?? settings.condoFee);
                setExchangeRates(settings.exchangeRates || []);
            } else {
                // Initialize with new rate if document doesn't exist
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

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'avatar' | 'logo') => {
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
                } else {
                    setLogoPreview(result);
                    setCompanyInfo({ ...companyInfo, logo: result });
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
        // Dates are stored as 'yyyy-MM-dd', parseISO handles this correctly without timezone shifts.
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

    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const dataToUpdate: Partial<Settings> = {
                adminProfile,
                companyInfo,
                condoFee: Number(condoFee),
            }
            if (isFeeChanged) {
                dataToUpdate.lastCondoFee = Number(lastCondoFee);
            }

            await updateDoc(settingsRef, dataToUpdate);
            
            toast({
                title: 'Cambios Guardados',
                description: 'La configuración ha sido actualizada exitosamente.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });
            if(isFeeChanged) setLastCondoFee(condoFee);
            setIsFeeChanged(false);

        } catch(error) {
             console.error("Error saving settings:", error);
             toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setSaving(false);
        }
    };

    const handleCondoFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFee = parseFloat(e.target.value) || 0;
        setCondoFee(newFee);
        if(newFee !== lastCondoFee) {
            setIsFeeChanged(true);
        }
    }
    
    const runFeeAdjustment = async () => {
        setIsAdjustmentRunning(true);
        
        const feeDifference = condoFee - lastCondoFee;
        if (feeDifference === 0) {
            toast({variant: 'destructive', title: 'Sin cambios', description: 'El ajuste solo se ejecuta si la nueva cuota es diferente a la anterior.'});
            setIsAdjustmentRunning(false);
            return;
        }

        try {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;
            
            const q = query(
                collection(db, "debts"), 
                where("status", "==", "paid"),
                where("description", "==", "Cuota de Condominio (Pagada por adelantado)"),
            );
            const querySnapshot = await getDocs(q);

            const batch = writeBatch(db);
            let adjustmentsCount = 0;
            const ownersToUpdate: { [key: string]: number } = {};

            querySnapshot.forEach(doc => {
                const debt = doc.data() as Debt;
                const isCurrentOrFutureDebt = debt.year > currentYear || (debt.year === currentYear && debt.month >= currentMonth);

                if (isCurrentOrFutureDebt) {
                    const adjustmentAmount = feeDifference;
                    
                    if (adjustmentAmount > 0) { // Fee increased
                        const adjustmentDebtRef = doc(collection(db, "debts"));
                        batch.set(adjustmentDebtRef, {
                            ownerId: debt.ownerId,
                            year: debt.year,
                            month: debt.month,
                            amountUSD: adjustmentAmount,
                            description: `Ajuste por aumento de cuota`,
                            status: 'pending'
                        });
                        // Aggregate negative adjustments for owner balance
                        ownersToUpdate[debt.ownerId] = (ownersToUpdate[debt.ownerId] || 0) - adjustmentAmount;
                    } else { // Fee decreased
                        // Aggregate positive adjustments for owner balance
                        ownersToUpdate[debt.ownerId] = (ownersToUpdate[debt.ownerId] || 0) - adjustmentAmount; // Subtracting a negative number
                    }
                    adjustmentsCount++;
                }
            });

            // Update owner balances
            for (const ownerId in ownersToUpdate) {
                const ownerRef = doc(db, "owners", ownerId);
                const ownerSnap = await getDoc(ownerRef);
                if (ownerSnap.exists()) {
                    const currentBalance = ownerSnap.data().balance || 0;
                    batch.update(ownerRef, { balance: currentBalance + ownersToUpdate[ownerId] });
                }
            }


            if (adjustmentsCount > 0) {
                await batch.commit();
                toast({title: 'Ajuste Completado', description: `${adjustmentsCount} deudas por ajuste han sido generadas y/o saldos actualizados.`});
            } else {
                toast({title: 'Sin Ajustes', description: 'No se encontraron cuotas pagadas por adelantado que requieran ajuste.'});
            }

            const settingsRef = doc(db, 'config', 'mainSettings');
            await updateDoc(settingsRef, { lastCondoFee: condoFee, condoFee: condoFee });
            setIsFeeChanged(false);

        } catch (error) {
             console.error("Error running fee adjustment:", error);
             toast({ variant: 'destructive', title: 'Error en el Proceso', description: 'No se pudo completar el ajuste de cuotas.' });
        } finally {
            setIsAdjustmentRunning(false);
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
                <h1 className="text-3xl font-bold font-headline">Configuración del Sistema</h1>
                <p className="text-muted-foreground">Gestiona la información de la comunidad y las reglas de negocio.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    
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
                                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
                                   {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" /> : <span className="text-sm text-muted-foreground">Logo</span>}
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
                            <CardTitle>Gestión de Cuota Condominial</CardTitle>
                            <CardDescription>Define el monto y las reglas de vencimiento de la cuota mensual.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
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
                        <CardFooter className="flex-col items-start gap-4">
                            <div className="p-4 bg-muted/50 rounded-lg flex items-start gap-3 text-sm text-muted-foreground w-full">
                                <AlertTriangle className="h-5 w-5 mt-0.5 text-orange-500 shrink-0"/>
                                <div>
                                    <p><strong>Regla de Vencimiento:</strong> La cuota del mes en curso vence los <strong>días 5 de cada mes</strong>.</p>
                                    <p className="mt-1">El día 6, el sistema debería generar automáticamente la deuda a los propietarios que no hayan cancelado. Esta automatización requiere configuración en el servidor (backend).</p>
                                </div>
                            </div>
                            <Button onClick={runFeeAdjustment} disabled={!isFeeChanged || condoFee === lastCondoFee || isAdjustmentRunning}>
                                {isAdjustmentRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileCog className="mr-2 h-4 w-4"/>}
                                Ejecutar Ajuste por Cambio de Cuota
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Esta acción genera deudas o créditos a quienes pagaron meses por adelantado con una cuota anterior. 
                                Úselo después de guardar un cambio en la cuota.
                            </p>
                        </CardFooter>
                    </Card>
                </div>

                <div className="lg:col-span-1 space-y-8">
                     <Card>
                        <CardHeader>
                            <CardTitle>Conversión Automática Bs/$</CardTitle>
                            <CardDescription>Integración con la tasa oficial BCV.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-sm text-blue-800">
                                <Wand2 className="h-5 w-5 mt-0.5 shrink-0"/>
                                <div>
                                    <p>Para automatizar la tasa de cambio, se debe conectar este sistema a la API del Banco Central de Venezuela (BCV).</p>
                                    <p className="mt-2">Esto requiere una función en el servidor que se ejecute diariamente para obtener y guardar la nueva tasa.</p>
                                </div>
                            </div>
                        </CardContent>
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
            
            <div className="flex justify-end">
                <Button onClick={handleSaveChanges} disabled={saving || isAdjustmentRunning}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Guardar Cambios
                </Button>
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

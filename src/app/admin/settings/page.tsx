
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
import { Upload, Save, Calendar as CalendarIcon, PlusCircle, Loader2, AlertTriangle, Wand2, MoreHorizontal, Edit, FileCog, UserCircle, RefreshCw, Trash2, Circle, Square, RoundedSquare, Sparkles, Church, CandyCane } from 'lucide-react';
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

type FrameStyle = 'circle' | 'soft' | 'rounded' | 'square' | 'carnaval' | 'semana-santa' | 'navidad';


type Settings = {
    adminProfile: AdminProfile;
    companyInfo: CompanyInfo;
    condoFee: number;
    exchangeRates: ExchangeRate[];
    lastCondoFee?: number; // To track the previous fee for adjustment logic
    bcvLogo?: string;
    companyLogoFrame?: FrameStyle;
    bcvLogoFrame?: FrameStyle;
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
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAAgVBMVEX///8BAQEAAAAtLS0QEBCGhoYxMTEzMzN4eHhISEihoaFlZWVCQkKVlZWrq6vo6Ojt7e3X19fOzs57e3vAwMDJycn39/fk5OTw8PCtra1OTk6rq6uurq4WFhYyMjLT09NcXFw/Pz/a2tqenp7FxcVdXV0nJycXFxdAQEC+vr5MTEwCAgLJSSgdAAADVUlEQVR4nO2byXKaQBCGcwIqIIoCiqIi6q4d7/+M8wgmE6aZpDfZae/1LzFjZn9SdybT0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFsH04P2XjD98+nN9mD6Y9M+3L/aY6A2W/tJ/d67eD1s9wK/fT/P8+u93g8Ywz/C84/vH2s4q2+K3/Qz/jG84d+Kz1S4L5gP5t6d6d7pM+Yf0r+nP5v6r+v/tP5m/rX+e/1v/h/6H/2n/k39h/xL/Wf8R/wn/B/9j/xP/af8S/3/4r/Sf8S/4P/Mf+z/g3/A/9j/5L/m/w5/2n/S/9T/2X/S/9L/wn/F/8x/1f/Of+z/yX/U/8Z/xn/Of+L/3n/Y//S//p/1L/if8Z/yP/C/4r/kf+j/wP/C/5b/gv+A/7P/Af9P/xf/i/wB/xf/K/8L/xP/S/4L/xP/G/9L/wv/A/8r/2P/Af8r/xn/G/8z/wn/U/85/3P/Cf8z/yP/M/8r/xP/A/8j/zP/M/8L/wP/Q/8r/yv/I/8T/xP/I/8T/wP/E/8j/yv/M/8z/wP/S/8j/yv/K/8z/zP/A/8T/wv/K/8r/yv/I/8T/xv/K/9T/1P/M/8T/yP/M/8z/yv/U/9T/wv/I/8T/xv/K/9T/zP/K/8T/xv/I/8L/xP/I/8j/wv/M/8T/xv/M/8r/wv/M/8j/xv/E/8z/wv/G/8r/xP/K/8z/yP/E/8j/yv/U/9T/wv/K/9T/1P/S/9L/yP/U/8L/yv/C/8L/yP/U/8T/yP/E/8T/xv/C/8z/yP/U/8r/yP/I/8T/yP/M/8j/xP/C/8D/yP/E/8T/wv/K/8r/yP/I/8L/xP/C/8T/wv/A/8L/yv/A/8T/xv/K/8D/yv/E/8j/xP/E/8r/xP/C/8z/xv/I/8T/wv/C/8T/xP/E/8j/wv/K/8j/yP/C/8D/yP/G/8D/yP/I/8L/yv/I/8L/yv/E/8j/xP/A/8L/wv/I/8D/xv/E/8D/yv/G/8j/xv/G/8j/xv/G/8L/yv/K/8j/xv/G/8L/yv/K/8j/yP/A/8D/wP/C/8L/xv/I/8j/yP/K/8L/yP/C/8L/yP/C/8L/yP/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArF+d0dD63+v+vY83wAAAAAAAAAAAuAsoXUn6/8i8kAAAAABJRU5ErkJggg=='
};

const frameStyles: Record<FrameStyle, string> = {
    circle: 'rounded-full',
    soft: 'rounded-lg',
    rounded: 'rounded-2xl',
    square: 'rounded-none',
    carnaval: 'p-1 bg-gradient-to-br from-purple-500 via-green-500 to-yellow-500 rounded-lg',
    'semana-santa': 'p-1 bg-gradient-to-br from-purple-800 to-yellow-600 rounded-lg',
    navidad: 'p-1 bg-gradient-to-r from-red-600 via-white to-green-600 rounded-lg',
};

const frameOptions: {value: FrameStyle, label: string, icon: React.ElementType}[] = [
    { value: 'circle', label: 'Círculo', icon: Circle },
    { value: 'soft', label: 'Suave', icon: RoundedSquare },
    { value: 'square', label: 'Cuadrado', icon: Square },
    { value: 'carnaval', label: 'Carnaval', icon: Sparkles },
    { value: 'semana-santa', label: 'Semana Santa', icon: Church },
    { value: 'navidad', label: 'Navidad', icon: CandyCane },
];


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

    // New state for logo frames
    const [companyLogoFrame, setCompanyLogoFrame] = useState<FrameStyle>('circle');
    const [bcvLogoFrame, setBcvLogoFrame] = useState<FrameStyle>('circle');


    useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data() as Settings;
                setAdminProfile(settings.adminProfile || emptyAdminProfile);
                setAdminAvatarPreview(settings.adminProfile?.avatar);
                setCompanyInfo(settings.companyInfo || emptyCompanyInfo);
                setLogoPreview(settings.companyInfo?.logo);
                setBcvLogo(settings.bcvLogo || '');
                setBcvLogoPreview(settings.bcvLogo ?? null);
                setCondoFee(settings.condoFee);
                setLastCondoFee(settings.condoFee); // Set the last known fee from DB
                setExchangeRates(settings.exchangeRates || []);
                setCompanyLogoFrame(settings.companyLogoFrame || 'circle');
                setBcvLogoFrame(settings.bcvLogoFrame || 'circle');
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
                    companyLogoFrame: 'circle',
                    bcvLogoFrame: 'circle'
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
                companyLogoFrame: companyLogoFrame,
                bcvLogoFrame: bcvLogoFrame,
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
    
    const FrameSelector = ({ title, onSelect, currentFrame }: { title: string, onSelect: (frame: FrameStyle) => void, currentFrame: FrameStyle }) => (
        <div>
            <Label className="font-semibold">{title}</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
                {frameOptions.map(({ value, label, icon: Icon }) => (
                    <Button
                        key={value}
                        variant={currentFrame === value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => onSelect(value)}
                        className="flex-col h-auto py-2"
                    >
                        <Icon className="h-5 w-5 mb-1" />
                        <span className="text-xs">{label}</span>
                    </Button>
                ))}
            </div>
        </div>
    );

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
                            <CardTitle>Gestión de Logos</CardTitle>
                            <CardDescription>Personaliza los logos y sus marcos en la aplicación.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <Label>Logo de la Empresa</Label>
                                    <div className={cn("w-32 h-32 flex items-center justify-center overflow-hidden border", frameStyles[companyLogoFrame])}>
                                         <div className="w-full h-full bg-white flex items-center justify-center p-1">
                                            {logoPreview && <img src={logoPreview} alt="Company Logo Preview" className="w-full h-full object-contain" />}
                                        </div>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('logo-upload')?.click()}>
                                        <Upload className="mr-2 h-4 w-4"/> Subir Logo
                                    </Button>
                                    <Input id="logo-upload" type="file" className="hidden" onChange={(e) => handleImageChange(e, 'logo')} accept="image/png, image/jpeg" />
                                    <FrameSelector title="Marco del Logo de la Empresa" currentFrame={companyLogoFrame} onSelect={setCompanyLogoFrame} />
                                </div>
                                 <div className="space-y-4">
                                    <Label>Logo de Tasa BCV</Label>
                                    <div className={cn("w-32 h-32 flex items-center justify-center overflow-hidden border", frameStyles[bcvLogoFrame])}>
                                        <div className="w-full h-full bg-white flex items-center justify-center p-1">
                                            {bcvLogoPreview && <img src={bcvLogoPreview} alt="BCV Logo Preview" className="w-full h-full object-contain" />}
                                        </div>
                                    </div>
                                     <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('bcv-logo-upload')?.click()}>
                                        <Upload className="mr-2 h-4 w-4"/> Cambiar Logo BCV
                                    </Button>
                                    <Input id="bcv-logo-upload" type="file" className="hidden" onChange={(e) => handleImageChange(e, 'bcvLogo')} accept="image/png, image/jpeg" />
                                     <FrameSelector title="Marco del Logo BCV" currentFrame={bcvLogoFrame} onSelect={setBcvLogoFrame} />
                                </div>
                            </div>
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
                                                            <DropdownMenuItem className="text-destructive" onClick={() => { setRateToDelete(rate); setIsDeleteRateDialogOpen(true); }}>
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Eliminar
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
                <Button onClick={handleSaveChanges} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Guardar Cambios y Aplicar a la App
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

            {/* Delete Rate Confirmation Dialog */}
            <Dialog open={isDeleteRateDialogOpen} onOpenChange={setIsDeleteRateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Eliminación</DialogTitle>
                        <DialogDescription>
                            ¿Está seguro de que desea eliminar esta tasa? No se puede eliminar una tasa activa.
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

    
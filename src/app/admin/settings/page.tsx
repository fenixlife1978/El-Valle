
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
import { Upload, Save, Calendar as CalendarIcon, PlusCircle, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
// In a real production app, use Firebase Storage for uploads
// import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
    date: string;
    rate: number;
    active: boolean;
};

type Settings = {
    companyInfo: CompanyInfo;
    condoFee: number;
    exchangeRates: ExchangeRate[];
}

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
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(emptyCompanyInfo);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [condoFee, setCondoFee] = useState(0);
    const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
    const [newRateDate, setNewRateDate] = useState<Date | undefined>();
    const [newRateAmount, setNewRateAmount] = useState('');

    useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data() as Settings;
                setCompanyInfo(settings.companyInfo);
                setLogoPreview(settings.companyInfo.logo);
                setCondoFee(settings.condoFee);
                setExchangeRates(settings.exchangeRates || []);
            } else {
                // Initialize with default/empty values if no settings doc exists
                setDoc(settingsRef, {
                    companyInfo: emptyCompanyInfo,
                    condoFee: 25.00,
                    exchangeRates: []
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

    const handleInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCompanyInfo({ ...companyInfo, [e.target.name]: e.target.value });
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 1 * 1024 * 1024) { // 1MB limit
                 toast({ variant: 'destructive', title: 'Archivo muy grande', description: 'El logo no debe pesar más de 1MB.' });
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setLogoPreview(result);
                setCompanyInfo({ ...companyInfo, logo: result });
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
            // No need to set state here, onSnapshot will do it
            setNewRateDate(undefined);
            setNewRateAmount('');
            toast({ title: 'Tasa Agregada', description: 'La nueva tasa de cambio ha sido añadida.' });
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
             // No need to set state here, onSnapshot will do it
             toast({ title: 'Tasa Activada', description: 'La tasa seleccionada ahora es la activa.' });
        } catch (error) {
            console.error("Error activating rate:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo activar la tasa.' });
        }
    }
    
    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            await updateDoc(settingsRef, {
                companyInfo,
                condoFee
            });
            toast({
                title: 'Cambios Guardados',
                description: 'La configuración ha sido actualizada exitosamente.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });
        } catch(error) {
             console.error("Error saving settings:", error);
             toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setSaving(false);
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
                {/* Columna Izquierda: Info y Cuota */}
                <div className="lg:col-span-2 space-y-8">
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
                                        <Input id="logo-upload" type="file" className="hidden" onChange={handleLogoChange} accept="image/png, image/jpeg" />
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
                                    <Input id="name" name="name" value={companyInfo.name} onChange={handleInfoChange} />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="rif">RIF</Label>
                                    <Input id="rif" name="rif" value={companyInfo.rif} onChange={handleInfoChange} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="address">Dirección</Label>
                                    <Input id="address" name="address" value={companyInfo.address} onChange={handleInfoChange} />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="phone">Teléfono</Label>
                                    <Input id="phone" name="phone" type="tel" value={companyInfo.phone} onChange={handleInfoChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Correo Electrónico</Label>
                                    <Input id="email" name="email" type="email" value={companyInfo.email} onChange={handleInfoChange} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestión de Cuota Condominial</CardTitle>
                            <CardDescription>Define el monto y las reglas de vencimiento de la cuota mensual.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="condoFee">Monto de la Cuota Mensual (USD)</Label>
                                <Input 
                                    id="condoFee" 
                                    type="number" 
                                    value={condoFee} 
                                    onChange={(e) => setCondoFee(parseFloat(e.target.value) || 0)} 
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg flex items-center gap-3 text-sm text-muted-foreground">
                                <p><strong>Regla de Vencimiento:</strong> La cuota del mes en curso vence los <strong>días 5 de cada mes</strong>. El día 6, se generará automáticamente la deuda a los propietarios que no hayan cancelado.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Columna Derecha: Tasa de Cambio */}
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestión de Tasa de Cambio</CardTitle>
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
                                                <TableHead>Acción</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {exchangeRates.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(rate => (
                                                <TableRow key={rate.id}>
                                                    <TableCell>{format(new Date(rate.date), "dd/MM/yyyy")}</TableCell>
                                                    <TableCell>{rate.rate.toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        <Button variant={rate.active ? 'secondary' : 'outline'} size="sm" disabled={rate.active} onClick={() => handleActivateRate(rate)}>
                                                            {rate.active ? 'Activa' : 'Activar'}
                                                        </Button>
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
                <Button onClick={handleSaveChanges} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Guardar Todos los Cambios
                </Button>
            </div>
        </div>
    );
}

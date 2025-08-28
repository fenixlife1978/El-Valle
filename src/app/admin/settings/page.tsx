
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from '@/hooks/use-toast';
import { Upload, Save, Calendar as CalendarIcon, Edit, PlusCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Mock Data
const initialCompanyInfo = {
    name: 'Residencias El Valle',
    address: 'Calle 123, Urbanización El Valle, Caracas, Venezuela',
    rif: 'J-12345678-9',
    phone: '+58 212-555-1234',
    email: 'vallecondo@gmail.com',
    logo: '/logo-placeholder.png'
};

const initialExchangeRates = [
    { id: 1, date: '2023-11-03', rate: 37.15, active: false },
    { id: 2, date: '2023-11-04', rate: 37.20, active: false },
    { id: 3, date: '2023-11-05', rate: 37.22, active: true },
];

export default function SettingsPage() {
    const { toast } = useToast();
    const [companyInfo, setCompanyInfo] = useState(initialCompanyInfo);
    const [logoPreview, setLogoPreview] = useState<string | null>(initialCompanyInfo.logo);
    const [condoFee, setCondoFee] = useState(25.00); // Monto en USD
    const [exchangeRates, setExchangeRates] = useState(initialExchangeRates);
    const [newRateDate, setNewRateDate] = useState<Date | undefined>();
    const [newRateAmount, setNewRateAmount] = useState('');

    const handleInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCompanyInfo({ ...companyInfo, [e.target.name]: e.target.value });
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
                // In a real app, you'd upload this file and save the URL
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleAddRate = () => {
        if(!newRateDate || !newRateAmount) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, complete la fecha y el monto de la tasa.' });
            return;
        }
        const newRate = {
            id: exchangeRates.length + 1,
            date: format(newRateDate, 'yyyy-MM-dd'),
            rate: parseFloat(newRateAmount),
            active: false
        };
        setExchangeRates([...exchangeRates, newRate]);
        setNewRateDate(undefined);
        setNewRateAmount('');
        toast({ title: 'Tasa Agregada', description: 'La nueva tasa de cambio ha sido añadida.' });
    };
    
    const handleSaveChanges = () => {
        // Mock saving to Firestore
        console.log('Saving settings:', { companyInfo, condoFee, exchangeRates });
        toast({
            title: 'Cambios Guardados',
            description: 'La configuración ha sido actualizada exitosamente.',
            className: 'bg-green-100 border-green-400 text-green-800'
        });
    };

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
                                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                                   {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" /> : <span>Logo</span>}
                                </div>
                                <div className="space-y-2">
                                     <Label htmlFor="logo-upload">Logo de la Empresa</Label>
                                     <div className="flex items-center gap-2">
                                        <Input id="logo-upload" type="file" className="hidden" onChange={handleLogoChange} accept="image/png, image/jpeg" />
                                        <Button type="button" variant="outline" onClick={() => document.getElementById('logo-upload')?.click()}>
                                            <Upload className="mr-2 h-4 w-4"/> Subir Logo
                                        </Button>
                                     </div>
                                     <p className="text-xs text-muted-foreground">PNG o JPG, recomendado 200x200px.</p>
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
                                    placeholder="25.00"
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
                                                        <Button variant={rate.active ? 'secondary' : 'outline'} size="sm" disabled={rate.active}>
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
                <Button onClick={handleSaveChanges}>
                    <Save className="mr-2 h-4 w-4"/>
                    Guardar Todos los Cambios
                </Button>
            </div>
        </div>
    );
}

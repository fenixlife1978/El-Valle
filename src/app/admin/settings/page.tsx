
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Loader2, Save, Building2, Upload, DollarSign, KeyRound, LogIn, History, PlusCircle } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import { useAuthorization } from '@/hooks/use-authorization';

// --- FUNCIONALIDAD DE COMPRESIÓN ---
const compressImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                
                // Convertimos a JPG con calidad 0.7 (muy ligero)
                // Incluso si el original era PNG, esto lo vuelve JPG ligero
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

type CompanyInfo = {
    name: string; address: string; phone: string; email: string;
    logo: string; website: string; rif: string; bankName: string; accountNumber: string;
};

type Settings = {
    companyInfo: CompanyInfo;
    exchangeRates: any[];
    condoFee: number;
    loginSettings: { ownerLoginEnabled: boolean; disabledMessage: string; };
};

const defaultSettings: Settings = {
    companyInfo: { name: '', address: '', phone: '', email: '', logo: '', website: '', rif: '', bankName: '', accountNumber: '' },
    exchangeRates: [],
    condoFee: 0,
    loginSettings: { ownerLoginEnabled: true, disabledMessage: 'Mantenimiento.' }
};

export default function SettingsPage() {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [newRate, setNewRate] = useState({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });
    const [newAuthKey, setNewAuthKey] = useState('');

    useEffect(() => {
        async function fetchSettings() {
            try {
                const docRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSettings(prev => ({ ...prev, ...docSnap.data() }));
                }
            } catch (error) {
                toast({ variant: "destructive", title: "Error de carga" });
            } finally { setLoading(false); }
        }
        fetchSettings();
    }, [toast]);

    const handleSave = async (section: string, dataToSave: Partial<Settings>) => {
        setSaving(prev => ({ ...prev, [section]: true }));
        try {
            await updateDoc(doc(db, 'config', 'mainSettings'), dataToSave);
            toast({ title: "Guardado correctamente" });
        } catch (error) {
            toast({ variant: "destructive", title: "Error al guardar" });
        } finally { 
            setSaving(prev => ({ ...prev, [section]: false }));
        }
    };
    
    const handleSaveSecurity = async (key: string) => {
        requestAuthorization(async () => {
             setSaving(prev => ({ ...prev, security: true }));
             try {
                await updateDoc(doc(db, 'config', 'authorization'), { key });
                toast({ title: "Clave de autorización actualizada" });
                setNewAuthKey('');
             } catch (error) {
                toast({ variant: "destructive", title: "Error al guardar la clave" });
             } finally {
                setSaving(prev => ({ ...prev, security: false }));
             }
        });
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                setSaving(prev => ({...prev, company: true }));
                const compressedBase64 = await compressImage(file, 180, 180);
                setSettings(prev => ({
                    ...prev, 
                    companyInfo: { ...prev.companyInfo, logo: compressedBase64 }
                }));
                toast({ title: "Imagen optimizada", description: "El logo se ha reducido para ahorrar espacio." });
            } catch (error) {
                toast({ variant: "destructive", title: "Error al procesar imagen" });
            } finally {
                setSaving(prev => ({...prev, company: false }));
            }
        }
    };

    const handleAddRate = () => {
        const rateValue = parseFloat(newRate.rate);
        if (isNaN(rateValue) || rateValue <= 0) return;
        const updatedRates = [...settings.exchangeRates];
        updatedRates.forEach(r => r.active = false);
        const newRateEntry = { id: `${newRate.date}-${Date.now()}`, date: newRate.date, rate: rateValue, active: true };
        updatedRates.push(newRateEntry);
        updatedRates.sort((a, b) => b.date.localeCompare(a.date));
        handleSave('rates', { exchangeRates: updatedRates });
        setSettings(prev => ({...prev, exchangeRates: updatedRates}));
        setNewRate({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
            <header><h1 className="text-3xl font-bold">Configuración</h1></header>
            <Tabs defaultValue="company">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="company">Empresa</TabsTrigger>
                    <TabsTrigger value="rates">Tasas</TabsTrigger>
                    <TabsTrigger value="fees">Acceso</TabsTrigger>
                    <TabsTrigger value="security">Seguridad</TabsTrigger>
                </TabsList>

                <TabsContent value="company">
                    <Card>
                        <CardHeader className="bg-primary text-primary-foreground"><CardTitle>Información</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-4">
                                {settings.companyInfo.logo && <img src={settings.companyInfo.logo} alt="Logo" className="w-20 h-20 object-contain"/>}
                                <Input id="logo" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                                <Button variant="outline" onClick={() => document.getElementById('logo')?.click()}>
                                    <Upload className="mr-2 h-4 w-4"/>Subir Logo (PNG/JPG)
                                </Button>
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="companyName">Nombre de la Empresa</Label>
                                    <Input id="companyName" placeholder="Nombre" value={settings.companyInfo.name} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, name: e.target.value}})} />
                                </div>
                                <div>
                                    <Label htmlFor="companyRif">RIF</Label>
                                    <Input id="companyRif" placeholder="RIF" value={settings.companyInfo.rif} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, rif: e.target.value}})} />
                                </div>
                                <div className="md:col-span-2">
                                     <Label htmlFor="companyAddress">Dirección Fiscal</Label>
                                     <Textarea id="companyAddress" placeholder="Dirección Fiscal Completa" value={settings.companyInfo.address} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, address: e.target.value}})} />
                                </div>
                                <div>
                                    <Label htmlFor="companyEmail">Email</Label>
                                    <Input id="companyEmail" placeholder="Email" value={settings.companyInfo.email} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, email: e.target.value}})} />
                                </div>
                                <div>
                                    <Label htmlFor="companyPhone">Teléfono</Label>
                                    <Input id="companyPhone" placeholder="Teléfono" value={settings.companyInfo.phone} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, phone: e.target.value}})} />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button onClick={() => handleSave('company', { companyInfo: settings.companyInfo })} disabled={saving['company']}>
                                {saving['company'] ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                Guardar Información
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="rates">
                    <Card>
                        <CardHeader className="bg-primary text-primary-foreground">
                            <CardTitle>Historial y Gestión de Tasas de Cambio</CardTitle>
                            <CardDescription className="text-primary-foreground/90">Agregue la tasa de cambio del BCV para el día. La más reciente se usará como activa.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-4 mb-4 items-end">
                                <div className="space-y-2 flex-1">
                                    <Label htmlFor="newRateDate">Fecha</Label>
                                    <Input id="newRateDate" type="date" value={newRate.date} onChange={e => setNewRate({...newRate, date: e.target.value})} />
                                </div>
                                <div className="space-y-2 flex-1">
                                    <Label htmlFor="newRateValue">Tasa (Bs.)</Label>
                                    <Input id="newRateValue" type="number" placeholder="Ej: 36.33" value={newRate.rate} onChange={e => setNewRate({...newRate, rate: e.target.value})} />
                                </div>
                                <Button onClick={handleAddRate} disabled={saving['rates']}>
                                    {saving['rates'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                                    <span className="ml-2 hidden sm:inline">Agregar Tasa</span>
                                </Button>
                            </div>
                            <Table>
                                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tasa</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {settings.exchangeRates.map((r: any) => (
                                        <TableRow key={r.id}>
                                            <TableCell>{format(parseISO(r.date), 'PPP', { locale: es })}</TableCell>
                                            <TableCell>Bs. {r.rate}</TableCell>
                                            <TableCell>{r.active ? <Badge>Activa</Badge> : <Badge variant="outline">Histórica</Badge>}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="fees">
                    <Card>
                        <CardHeader className="bg-primary text-primary-foreground">
                            <CardTitle>Cuotas y Acceso</CardTitle>
                            <CardDescription className="text-primary-foreground/90">Gestione los montos de cuotas y el acceso de los propietarios a la plataforma.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="condoFee">Cuota Condominial Mensual (USD)</Label>
                                <div className="flex gap-2 items-center">
                                    <DollarSign className="h-5 w-5 text-muted-foreground"/>
                                    <Input
                                        id="condoFee"
                                        type="number"
                                        className="max-w-xs"
                                        value={settings.condoFee || ''}
                                        onChange={e => setSettings({...settings, condoFee: parseFloat(e.target.value) || 0})}
                                        placeholder="Ej: 25.00"
                                    />
                                </div>
                            </div>
                             <div className="space-y-4 rounded-lg border p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label htmlFor="ownerLoginEnabled" className="text-base">Acceso de Propietarios</Label>
                                        <p className="text-sm text-muted-foreground">Habilita o deshabilita el inicio de sesión para los propietarios.</p>
                                    </div>
                                    <Switch
                                        id="ownerLoginEnabled"
                                        checked={settings.loginSettings?.ownerLoginEnabled}
                                        onCheckedChange={checked => setSettings({...settings, loginSettings: {...settings.loginSettings, ownerLoginEnabled: checked}})}
                                    />
                                </div>
                                {!settings.loginSettings?.ownerLoginEnabled && (
                                    <div className="space-y-2">
                                        <Label htmlFor="disabledMessage">Mensaje de Deshabilitación</Label>
                                        <Textarea
                                            id="disabledMessage"
                                            value={settings.loginSettings?.disabledMessage}
                                            onChange={e => setSettings({...settings, loginSettings: {...settings.loginSettings, disabledMessage: e.target.value}})}
                                            placeholder="Ej: El sistema está en mantenimiento. Intente más tarde."
                                        />
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter>
                             <Button onClick={() => handleSave('fees', { condoFee: settings.condoFee, loginSettings: settings.loginSettings })} disabled={saving['fees']}>
                                {saving['fees'] ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                Guardar Ajustes de Acceso
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>
                
                <TabsContent value="security">
                     <Card>
                        <CardHeader className="bg-primary text-primary-foreground">
                            <CardTitle>Seguridad</CardTitle>
                            <CardDescription className="text-primary-foreground/90">Gestione la clave de autorización para acciones críticas.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="authKey">Nueva Clave de Autorización</Label>
                                <Input
                                    id="authKey"
                                    type="password"
                                    value={newAuthKey}
                                    onChange={e => setNewAuthKey(e.target.value)}
                                    placeholder="Ingrese una nueva clave segura"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Esta clave se solicitará para realizar operaciones delicadas como eliminar datos o cambiar configuraciones importantes.
                                </p>
                            </div>
                        </CardContent>
                        <CardFooter>
                             <Button onClick={() => handleSaveSecurity(newAuthKey)} disabled={!newAuthKey || saving['security']}>
                                {saving['security'] ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <KeyRound className="mr-2 h-4 w-4"/>}
                                Cambiar Clave
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>
                
            </Tabs>
        </div>
    );
}

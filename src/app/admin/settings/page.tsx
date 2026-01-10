
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
import { Loader2, Save, Building2, Globe, Mail, Phone, Upload, DollarSign, KeyRound, Lock, LogIn, History, PlusCircle, Trash2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import { useAuthorization } from '@/hooks/use-authorization';


type CompanyInfo = {
    name: string;
    address: string;
    phone: string;
    email: string;
    logo: string;
    website: string;
    rif: string;
    bankName: string;
    accountNumber: string;
};

type ExchangeRate = {
    id: string;
    date: string;
    rate: number;
    active: boolean;
};

type LoginSettings = {
    ownerLoginEnabled: boolean;
    disabledMessage: string;
};

type Settings = {
    companyInfo: CompanyInfo;
    exchangeRates: ExchangeRate[];
    condoFee: number;
    loginSettings: LoginSettings;
};

const defaultSettings: Settings = {
    companyInfo: {
        name: '', address: '', phone: '', email: '', logo: '', website: '', rif: '', bankName: '', accountNumber: ''
    },
    exchangeRates: [],
    condoFee: 0,
    loginSettings: {
        ownerLoginEnabled: true,
        disabledMessage: 'El inicio de sesión para propietarios está deshabilitado temporalmente por mantenimiento.'
    }
};

export default function SettingsPage() {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [newRate, setNewRate] = useState({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });
    const [newAuthKey, setNewAuthKey] = useState('');

    useEffect(() => {
        async function fetchSettings() {
            try {
                const docRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    // Merge fetched data with defaults to prevent crashes if fields are missing
                    setSettings(prev => ({
                        ...prev,
                        ...data,
                        companyInfo: { ...prev.companyInfo, ...data.companyInfo },
                        loginSettings: { ...prev.loginSettings, ...data.loginSettings },
                    }));
                }
            } catch (error) {
                console.error("Error al cargar configuración:", error);
                toast({ variant: "destructive", title: "Error de carga" });
            } finally {
                setLoading(false);
            }
        }
        fetchSettings();
    }, [toast]);

    const handleSave = async (dataToSave: Partial<Settings>) => {
        setSaving(true);
        try {
            const docRef = doc(db, 'config', 'mainSettings');
            await updateDoc(docRef, dataToSave);
            toast({ title: "Configuración guardada", description: "Los cambios se han guardado con éxito." });
        } catch (error) {
            console.error("Error al guardar:", error);
            toast({ variant: "destructive", title: "Error al guardar" });
        } finally {
            setSaving(false);
        }
    };
    
    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setSettings(prev => ({...prev, companyInfo: {...prev.companyInfo, logo: result }}));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAddRate = () => {
        if (!newRate.date || !newRate.rate) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe ingresar una fecha y una tasa.' });
            return;
        }

        const rateValue = parseFloat(newRate.rate);
        if (isNaN(rateValue) || rateValue <= 0) {
            toast({ variant: 'destructive', title: 'Tasa inválida', description: 'La tasa debe ser un número mayor a cero.' });
            return;
        }
        
        const updatedRates = [...settings.exchangeRates];
        // Deactivate all other rates
        updatedRates.forEach(rate => rate.active = false);

        const newRateEntry: ExchangeRate = {
            id: `${newRate.date}-${Date.now()}`,
            date: newRate.date,
            rate: rateValue,
            active: true,
        };

        const existingIndex = updatedRates.findIndex(r => r.date === newRate.date);
        if (existingIndex > -1) {
            updatedRates[existingIndex] = newRateEntry; // Replace if date exists
        } else {
            updatedRates.push(newRateEntry); // Add if new date
        }
        
        updatedRates.sort((a, b) => b.date.localeCompare(a.date));

        handleSave({ exchangeRates: updatedRates });
        setSettings(prev => ({...prev, exchangeRates: updatedRates}));
        setNewRate({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });
    };
    
    const handleSaveAuthKey = () => {
        if (newAuthKey.length < 6) {
            toast({ variant: 'destructive', title: 'Clave muy corta', description: 'La clave de autorización debe tener al menos 6 caracteres.' });
            return;
        }
        requestAuthorization(async () => {
            setSaving(true);
            try {
                const docRef = doc(db, 'config', 'authorization');
                await updateDoc(docRef, { key: newAuthKey });
                toast({ title: 'Clave Actualizada', description: 'La nueva clave de autorización se ha guardado.' });
                setNewAuthKey('');
            } catch(e) {
                console.error(e);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la clave.' });
            } finally {
                setSaving(false);
            }
        });
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse">Cargando configuración...</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight text-primary">Configuración General</h1>
                <p className="text-muted-foreground">Administra la identidad, finanzas y seguridad del condominio.</p>
            </header>

            <Tabs defaultValue="company" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
                    <TabsTrigger value="company">Empresa</TabsTrigger>
                    <TabsTrigger value="rates">Tasas de Cambio</TabsTrigger>
                    <TabsTrigger value="fees">Cuotas y Acceso</TabsTrigger>
                    <TabsTrigger value="security">Seguridad</TabsTrigger>
                </TabsList>
                
                <TabsContent value="company">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Building2 />Información del Condominio</CardTitle>
                            <CardDescription>Esta información se reflejará en los documentos oficiales.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <div className="flex items-center gap-6">
                                <Avatar className="w-24 h-24 text-lg">
                                    <AvatarImage src={settings.companyInfo.logo || undefined} alt="Logo" />
                                    <AvatarFallback><Building2 className="h-12 w-12"/></AvatarFallback>
                                </Avatar>
                                <div className="space-y-2">
                                    <Label htmlFor="logo-upload">Logo del Condominio</Label>
                                    <Input id="logo-upload" type="file" className="hidden" onChange={handleAvatarChange} accept="image/png,image/jpeg" />
                                    <Button type="button" variant="outline" onClick={() => document.getElementById('logo-upload')?.click()}><Upload className="mr-2 h-4 w-4"/> Cambiar Logo</Button>
                                    <p className="text-xs text-muted-foreground">PNG o JPG. Recomendado 200x200px.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre Legal</Label>
                                    <Input id="name" value={settings.companyInfo.name} onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, name: e.target.value}})}/>
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="rif">RIF</Label>
                                    <Input id="rif" value={settings.companyInfo.rif} onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, rif: e.target.value}})}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Correo Electrónico</Label>
                                    <Input id="email" type="email" value={settings.companyInfo.email} onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, email: e.target.value}})}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Teléfono</Label>
                                    <Input id="phone" value={settings.companyInfo.phone} onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, phone: e.target.value}})}/>
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="bankName">Nombre del Banco</Label>
                                    <Input id="bankName" value={settings.companyInfo.bankName} onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, bankName: e.target.value}})}/>
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="accountNumber">Número de Cuenta</Label>
                                    <Input id="accountNumber" value={settings.companyInfo.accountNumber} onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, accountNumber: e.target.value}})}/>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">Dirección</Label>
                                <Textarea id="address" value={settings.companyInfo.address} onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, address: e.target.value}})}/>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button onClick={() => handleSave({ companyInfo: settings.companyInfo })} disabled={saving}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Información
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="rates">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><History />Historial de Tasas de Cambio</CardTitle>
                            <CardDescription>La tasa activa (la más reciente) se usará para todos los cálculos.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="grid md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg">
                                <div className="space-y-2">
                                    <Label htmlFor="rate-date">Fecha de la Tasa</Label>
                                    <Input id="rate-date" type="date" value={newRate.date} onChange={e => setNewRate({...newRate, date: e.target.value})}/>
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="rate-value">Valor de la Tasa (Bs.)</Label>
                                    <Input id="rate-value" type="number" placeholder="Ej: 36.50" value={newRate.rate} onChange={e => setNewRate({...newRate, rate: e.target.value})}/>
                                </div>
                                 <div className="flex items-end">
                                    <Button onClick={handleAddRate} disabled={saving} className="w-full">
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Añadir/Actualizar Tasa
                                    </Button>
                                </div>
                             </div>
                             <Table>
                                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tasa (Bs.)</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {settings.exchangeRates.map(rate => (
                                        <TableRow key={rate.id}>
                                            <TableCell>{format(parseISO(rate.date), 'dd MMMM, yyyy', {locale: es})}</TableCell>
                                            <TableCell>{rate.rate.toFixed(2)}</TableCell>
                                            <TableCell>{rate.active ? <Badge>Activa</Badge> : <Badge variant="outline">Histórica</Badge>}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                 <TabsContent value="fees">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><DollarSign />Cuota Condominial y Acceso</CardTitle>
                            <CardDescription>Define el monto de la cuota mensual y gestiona el acceso de los propietarios.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                             <div className="space-y-2">
                                <Label htmlFor="condoFee">Monto de la Cuota Mensual Fija (USD)</Label>
                                <Input id="condoFee" type="number" value={settings.condoFee} onChange={e => setSettings({...settings, condoFee: parseFloat(e.target.value) || 0})}/>
                                <p className="text-xs text-muted-foreground">Este monto se usará para generar las deudas mensuales automáticas.</p>
                            </div>
                            <div className="p-4 border rounded-lg space-y-4">
                                <div className="flex flex-row items-center justify-between">
                                    <div className="space-y-0.5">
                                        <h4 className="font-semibold flex items-center gap-2"><LogIn /> Acceso de Propietarios</h4>
                                        <p className="text-sm text-muted-foreground">Habilita o deshabilita el inicio de sesión para todos los propietarios.</p>
                                    </div>
                                    <Switch checked={settings.loginSettings.ownerLoginEnabled} onCheckedChange={checked => setSettings(prev => ({...prev, loginSettings: {...prev.loginSettings, ownerLoginEnabled: checked}}))} />
                                </div>
                                {!settings.loginSettings.ownerLoginEnabled && (
                                     <div className="space-y-2">
                                        <Label htmlFor="disabledMessage">Mensaje a mostrar si el acceso está deshabilitado</Label>
                                        <Textarea id="disabledMessage" value={settings.loginSettings.disabledMessage} onChange={e => setSettings(prev => ({...prev, loginSettings: {...prev.loginSettings, disabledMessage: e.target.value}}))} />
                                    </div>
                                )}
                            </div>
                        </CardContent>
                         <CardFooter>
                            <Button onClick={() => handleSave({ condoFee: settings.condoFee, loginSettings: settings.loginSettings })} disabled={saving}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Ajustes de Cuotas y Acceso
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="security">
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><KeyRound />Seguridad</CardTitle>
                            <CardDescription>Gestiona la clave de autorización para acciones críticas.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="auth-key">Nueva Clave de Autorización</Label>
                                <Input id="auth-key" type="password" placeholder="Mínimo 6 caracteres" value={newAuthKey} onChange={e => setNewAuthKey(e.target.value)}/>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button onClick={handleSaveAuthKey} disabled={saving}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Actualizar Clave
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

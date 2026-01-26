'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { Loader2, Save, Upload, DollarSign, KeyRound, PlusCircle, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAuth } from '@/hooks/use-auth'; 

// --- DEFINICIONES DE TIPOS (ESTO REPARA LOS ERRORES DE TYPESCRIPT) ---
type CompanyInfo = {
    name: string; address: string; phone: string; email: string; logo: string; rif: string;
};

type ExchangeRate = {
    id: string; date: string; rate: number; active: boolean;
};

type LoginSettings = {
    ownerLoginEnabled: boolean; disabledMessage: string;
};

type Settings = {
    companyInfo: CompanyInfo;
    exchangeRates: ExchangeRate[];
    condoFee: number;
    loginSettings: LoginSettings;
};

const defaultSettings: Settings = {
    companyInfo: { name: '', address: '', phone: '', email: '', logo: '', rif: '' },
    exchangeRates: [],
    condoFee: 0,
    loginSettings: { ownerLoginEnabled: true, disabledMessage: 'Mantenimiento.' }
};

const compressImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width; let height = img.height;
                if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } }
                else { if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

export default function SettingsPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [newRate, setNewRate] = useState({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });
    const [newAuthKey, setNewAuthKey] = useState('');

    // Casteo de seguridad para evitar error de TypeScript en condominioId
    const condoId = (user as any)?.condominioId;

    useEffect(() => {
        async function fetchSettings() {
            if (!condoId) return;
            try {
                const docSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
                if (docSnap.exists()) {
                    setSettings(prev => ({ ...prev, ...(docSnap.data() as Settings) }));
                } else {
                    await setDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'), defaultSettings);
                }
            } catch (error) { 
                toast({ variant: "destructive", title: "Error de carga" }); 
            } finally { 
                setLoading(false); 
            }
        }
        fetchSettings();
    }, [condoId, toast]);

    const handleSave = async (section: string, dataToSave: Partial<Settings>) => {
        if (!condoId) return;
        setSaving(prev => ({ ...prev, [section]: true }));
        try {
            await setDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'), dataToSave, { merge: true });
            toast({ title: "Guardado correctamente" });
        } catch (e) { 
            toast({ variant: "destructive", title: "Error al guardar" }); 
        } finally { 
            setSaving(prev => ({ ...prev, [section]: false })); 
        }
    };

    const handleSaveSecurity = async (key: string) => {
        if (!condoId) return;
        requestAuthorization(async () => {
             setSaving(prev => ({ ...prev, security: true }));
             try {
                await setDoc(doc(db, 'condominios', condoId, 'config', 'authorization'), { 
                    key, updatedAt: new Date().toISOString() 
                }, { merge: true });
                toast({ title: "PIN actualizado" });
                setNewAuthKey('');
             } catch (e) { 
                toast({ variant: "destructive", title: "Error" }); 
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
                const base64 = await compressImage(file, 200, 200);
                const updatedInfo = { ...settings.companyInfo, logo: base64 };
                setSettings(prev => ({ ...prev, companyInfo: updatedInfo }));
                await handleSave('company', { companyInfo: updatedInfo });
            } catch (e) { toast({ variant: "destructive", title: "Error imagen" }); }
            finally { setSaving(prev => ({...prev, company: false })); }
        }
    };

    const handleAddRate = () => {
        const val = parseFloat(newRate.rate);
        if (isNaN(val)) return;
        const newEntry: ExchangeRate = { id: Date.now().toString(), date: newRate.date, rate: val, active: true };
        const updatedRates = [newEntry, ...settings.exchangeRates.map(r => ({ ...r, active: false }))];
        setSettings(prev => ({ ...prev, exchangeRates: updatedRates }));
        handleSave('rates', { exchangeRates: updatedRates });
        setNewRate({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-6 pb-24">
            <header className="flex items-center gap-4">
                <div className="bg-[#0081c9] p-3 rounded-2xl shadow-lg shadow-blue-200"><Building2 className="text-white h-8 w-8" /></div>
                <h1 className="text-4xl font-black italic uppercase text-[#0081c9] tracking-tighter">Panel de Control</h1>
            </header>
            
            <Tabs defaultValue="company" className="w-full">
                <TabsList className="grid w-full grid-cols-4 h-14 bg-slate-100 p-1 rounded-2xl">
                    <TabsTrigger value="company" className="rounded-xl font-bold uppercase text-xs">Empresa</TabsTrigger>
                    <TabsTrigger value="rates" className="rounded-xl font-bold uppercase text-xs">Tasas BCV</TabsTrigger>
                    <TabsTrigger value="fees" className="rounded-xl font-bold uppercase text-xs">Acceso</TabsTrigger>
                    <TabsTrigger value="security" className="rounded-xl font-bold uppercase text-xs">Seguridad</TabsTrigger>
                </TabsList>

                <TabsContent value="company" className="mt-6">
                    <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden">
                        <CardHeader className="bg-[#0081c9] text-white p-8">
                            <CardTitle className="text-2xl font-black italic uppercase tracking-tight">Información de Identidad</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 space-y-8">
                            <div className="flex flex-col md:flex-row items-center gap-8">
                                <div className="relative">
                                    <div className="w-32 h-32 rounded-full border-4 border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center">
                                        {settings.companyInfo?.logo ? <img src={settings.companyInfo.logo} className="w-full h-full object-cover" /> : <Upload className="text-slate-300 h-10 w-10" />}
                                    </div>
                                    <Button size="icon" className="absolute bottom-0 right-0 rounded-full shadow-lg" onClick={() => document.getElementById('logo-input')?.click()}><Upload className="h-4 w-4" /></Button>
                                    <input id="logo-input" type="file" className="hidden" onChange={handleAvatarChange} accept="image/*" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                                    <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nombre Comercial</Label><Input className="rounded-xl" value={settings.companyInfo?.name || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, name: e.target.value}})} /></div>
                                    <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400 ml-2">RIF Jurídico</Label><Input className="rounded-xl" value={settings.companyInfo?.rif || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, rif: e.target.value}})} /></div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400 ml-2">Correo Electrónico</Label><Input className="rounded-xl" value={settings.companyInfo?.email || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, email: e.target.value}})} /></div>
                                <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400 ml-2">Teléfono de Contacto</Label><Input className="rounded-xl" value={settings.companyInfo?.phone || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, phone: e.target.value}})} /></div>
                                <div className="md:col-span-2 space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400 ml-2">Dirección Fiscal</Label><Textarea className="rounded-xl min-h-[100px]" value={settings.companyInfo?.address || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, address: e.target.value}})} /></div>
                            </div>
                        </CardContent>
                        <CardFooter className="p-8 bg-slate-50 flex justify-end">
                            <Button className="bg-[#0081c9] hover:bg-[#006da8] rounded-full px-8 font-bold" onClick={() => handleSave('company', { companyInfo: settings.companyInfo })} disabled={saving['company']}>
                                {saving['company'] ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Actualizar Datos
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="rates" className="mt-6">
                    <Card className="rounded-[2.5rem] border-none shadow-xl">
                        <CardHeader className="bg-[#0081c9] text-white p-8"><CardTitle className="text-2xl font-black italic uppercase">Gestión de Divisas</CardTitle></CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="flex gap-4 items-end bg-slate-50 p-6 rounded-3xl border border-dashed">
                                <div className="flex-1 space-y-1"><Label className="text-[10px] font-black ml-2">Fecha de Tasa</Label><Input type="date" className="rounded-xl" value={newRate.date} onChange={e => setNewRate({...newRate, date: e.target.value})} /></div>
                                <div className="flex-1 space-y-1"><Label className="text-[10px] font-black ml-2">Valor BCV (Bs.)</Label><Input type="number" className="rounded-xl" value={newRate.rate} onChange={e => setNewRate({...newRate, rate: e.target.value})} /></div>
                                <Button className="bg-[#0081c9] rounded-xl h-10" onClick={handleAddRate}><PlusCircle className="h-4 w-4 mr-2" /> Agregar</Button>
                            </div>
                            <Table>
                                <TableHeader><TableRow className="border-none bg-slate-100 rounded-xl"><TableHead className="font-black italic">FECHA</TableHead><TableHead className="font-black italic">TASA</TableHead><TableHead className="font-black italic text-right">ESTADO</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {settings.exchangeRates.map((r) => (
                                        <TableRow key={r.id} className="border-slate-50">
                                            <TableCell className="font-medium">{format(parseISO(r.date), 'PPP', { locale: es })}</TableCell>
                                            <TableCell className="font-bold">Bs. {r.rate}</TableCell>
                                            <TableCell className="text-right">{r.active ? <Badge className="bg-green-500 rounded-full">Activa</Badge> : <Badge variant="outline" className="rounded-full">Historial</Badge>}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="fees" className="mt-6">
                    <Card className="rounded-[2.5rem] border-none shadow-xl">
                        <CardHeader className="bg-[#0081c9] text-white p-8"><CardTitle className="text-2xl font-black italic uppercase">Administración de Acceso</CardTitle></CardHeader>
                        <CardContent className="p-8 space-y-8">
                            <div className="space-y-2">
                                <Label className="text-sm font-bold ml-2">Cuota Condominial (USD)</Label>
                                <div className="flex gap-2 items-center">
                                    <div className="bg-slate-100 p-2 rounded-xl"><DollarSign className="h-6 w-6 text-slate-500"/></div>
                                    <Input type="number" className="max-w-[200px] text-xl font-bold rounded-xl" value={settings.condoFee || ''} onChange={e => setSettings({...settings, condoFee: parseFloat(e.target.value) || 0})} />
                                </div>
                            </div>
                            <div className="p-6 rounded-3xl bg-slate-50 border flex items-center justify-between">
                                <div><h3 className="font-black italic uppercase text-slate-700">Acceso Propietarios</h3><p className="text-xs text-slate-400">Permite a los vecinos entrar a la App.</p></div>
                                <Switch checked={settings.loginSettings?.ownerLoginEnabled} onCheckedChange={c => setSettings({...settings, loginSettings: {...settings.loginSettings, ownerLoginEnabled: c}})} />
                            </div>
                        </CardContent>
                        <CardFooter className="p-8 bg-slate-50 flex justify-end">
                            <Button className="bg-[#0081c9] rounded-full px-8 font-bold" onClick={() => handleSave('fees', { condoFee: settings.condoFee, loginSettings: settings.loginSettings })}>Guardar Ajustes</Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="security" className="mt-6">
                    <Card className="rounded-[2.5rem] border-none shadow-xl">
                        <CardHeader className="bg-red-500 text-white p-8"><CardTitle className="text-2xl font-black italic uppercase">Control de Seguridad (PIN)</CardTitle></CardHeader>
                        <CardContent className="p-8 space-y-4">
                            <div className="space-y-2"><Label className="text-sm font-bold ml-2">Nuevo PIN de Autorización</Label><Input type="password" placeholder="••••••" className="rounded-xl text-center text-2xl tracking-[1em]" value={newAuthKey} onChange={e => setNewAuthKey(e.target.value)} /></div>
                            <p className="text-[10px] text-slate-400 uppercase font-black text-center">Este PIN será requerido para acciones críticas como eliminación de datos.</p>
                        </CardContent>
                        <CardFooter className="p-8 bg-slate-50 flex justify-end">
                            <Button className="bg-red-500 hover:bg-red-600 rounded-full px-8 font-bold text-white" onClick={() => handleSaveSecurity(newAuthKey)} disabled={!newAuthKey}><KeyRound className="mr-2 h-4 w-4"/> Actualizar PIN</Button>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

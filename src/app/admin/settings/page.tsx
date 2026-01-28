'use client';



import React, { useState, useEffect } from 'react';

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

import { useToast } from "@/hooks/use-toast";

import { db } from '@/lib/firebase';

import { doc, getDoc, setDoc } from 'firebase/firestore';

import { Loader2, Save, Upload, DollarSign, KeyRound, PlusCircle, Building2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Badge } from "@/components/ui/badge";

import { format, parseISO } from 'date-fns';

import { es } from 'date-fns/locale';

import { Switch } from '@/components/ui/switch';

import { useAuthorization } from '@/hooks/use-authorization';

import { useAuth } from '@/hooks/use-auth';



// --- DEFINICIONES DE TIPOS ---

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

    const { user, activeCondoId } = useAuth();

    const { requestAuthorization } = useAuthorization();

    const [loading, setLoading] = useState(true);

    const [saving, setSaving] = useState<Record<string, boolean>>({});

    const [settings, setSettings] = useState<Settings>(defaultSettings);

    const [newRate, setNewRate] = useState({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });

    const [newAuthKey, setNewAuthKey] = useState('');



    const condoId = activeCondoId || (user as any)?.condominioId || "condo_01";



    // ESTILO COMÚN PARA INPUTS (FUERZA TEXTO OSCURO)

    const inputStyle = "rounded-xl h-12 bg-slate-100 border-none font-bold text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500";



    useEffect(() => {

        async function fetchSettings() {

            if (!condoId) return;

            try {

                const docSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));

                if (docSnap.exists()) {

                    const data = docSnap.data();

                    setSettings({

                        companyInfo: { ...defaultSettings.companyInfo, ...data.companyInfo },

                        exchangeRates: data.exchangeRates || [],

                        condoFee: data.condoFee || 0,

                        loginSettings: { ...defaultSettings.loginSettings, ...data.loginSettings }

                    });

                }

            } catch (error) {

                toast({ variant: "destructive", title: "Error de carga" });

            } finally {

                setLoading(false);

            }

        }

        fetchSettings();

    }, [condoId, toast]);



    const handleSave = async (section: string, dataToUpdate: Partial<Settings>) => {

        if (!condoId) return;

        setSaving(prev => ({ ...prev, [section]: true }));

        try {

            await setDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'), dataToUpdate, { merge: true });

            toast({ title: "Guardado", description: "Configuración actualizada." });

        } catch (e) {

            toast({ variant: "destructive", title: "Error" });

        } finally {

            setSaving(prev => ({ ...prev, [section]: false }));

        }

    };



    const handleSaveSecurity = async (key: string) => {

        if (!condoId) return;

        requestAuthorization(async () => {

             setSaving(prev => ({ ...prev, security: true }));

             try {

                await setDoc(doc(db, 'condominios', condoId, 'config', 'authorization'), { key, updatedAt: new Date().toISOString() }, { merge: true });

                toast({ title: "PIN Seguro actualizado" });

                setNewAuthKey('');

             } catch (e) { toast({ variant: "destructive", title: "Error" }); }

             finally { setSaving(prev => ({ ...prev, security: false })); }

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

        const newEntry = { id: Date.now().toString(), date: newRate.date, rate: val, active: true };

        const updatedRates = [newEntry, ...(settings.exchangeRates || []).map(r => ({ ...r, active: false }))];

        setSettings(prev => ({ ...prev, exchangeRates: updatedRates }));

        handleSave('rates', { exchangeRates: updatedRates });

        setNewRate({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });

    };



    if (loading) return <div className="flex h-[80vh] items-center justify-center"><Loader2 className="animate-spin text-blue-500 h-12 w-12" /></div>;



    return (

        <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-6 pb-24 text-slate-900">

            <header className="mb-10">

                <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900">

                    Configuración <span className="text-blue-600">General</span>

                </h2>

                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full" />

            </header>

           

            <Tabs defaultValue="company" className="w-full">

                <TabsList className="grid w-full grid-cols-4 h-14 bg-slate-200 p-1 rounded-2xl">

                    <TabsTrigger value="company" className="rounded-xl font-black uppercase text-[10px] md:text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600">Empresa</TabsTrigger>

                    <TabsTrigger value="rates" className="rounded-xl font-black uppercase text-[10px] md:text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600">Tasas</TabsTrigger>

                    <TabsTrigger value="fees" className="rounded-xl font-black uppercase text-[10px] md:text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600">Acceso</TabsTrigger>

                    <TabsTrigger value="security" className="rounded-xl font-black uppercase text-[10px] md:text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600">Seguridad</TabsTrigger>

                </TabsList>



                <TabsContent value="company" className="mt-6">

                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">

                        <CardHeader className="bg-slate-900 text-white p-8">

                            <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3"><Building2 className="text-blue-400" /> Identidad Visual y Legal</CardTitle>

                        </CardHeader>

                        <CardContent className="p-8 space-y-8">

                            <div className="flex flex-col md:flex-row items-center gap-8">

                                <div className="relative">

                                    <div className="w-32 h-32 rounded-full border-4 border-slate-100 overflow-hidden bg-slate-100 flex items-center justify-center">

                                        {settings.companyInfo?.logo ? <img src={settings.companyInfo.logo} className="w-full h-full object-cover" /> : <Upload className="text-slate-400 h-8 w-8" />}

                                    </div>

                                    <Button size="icon" className="absolute bottom-0 right-0 rounded-full bg-blue-600 hover:bg-blue-700 h-10 w-10 shadow-lg" onClick={() => document.getElementById('logo-input')?.click()}><Upload className="h-4 w-4" /></Button>

                                    <input id="logo-input" type="file" className="hidden" onChange={handleAvatarChange} accept="image/*" />

                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 w-full">

                                    <div className="space-y-1">

                                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nombre Comercial</Label>

                                        <Input className={inputStyle} value={settings.companyInfo?.name || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, name: e.target.value}})} />

                                    </div>

                                    <div className="space-y-1">

                                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">RIF / Identificación</Label>

                                        <Input className={inputStyle} value={settings.companyInfo?.rif || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, rif: e.target.value}})} />

                                    </div>

                                </div>

                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                <div className="space-y-1">

                                    <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Email</Label>

                                    <Input className={inputStyle} value={settings.companyInfo?.email || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, email: e.target.value}})} />

                                </div>

                                <div className="space-y-1">

                                    <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Teléfono</Label>

                                    <Input className={inputStyle} value={settings.companyInfo?.phone || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, phone: e.target.value}})} />

                                </div>

                                <div className="md:col-span-2 space-y-1">

                                    <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Dirección</Label>

                                    <Textarea className="rounded-2xl min-h-[100px] bg-slate-100 border-none font-bold text-slate-900" value={settings.companyInfo?.address || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, address: e.target.value}})} />

                                </div>

                            </div>

                        </CardContent>

                        <CardFooter className="p-8 bg-slate-50 flex justify-end">

                            <Button className="bg-blue-600 hover:bg-blue-700 rounded-full px-10 h-12 font-black shadow-lg" onClick={() => handleSave('company', { companyInfo: settings.companyInfo })} disabled={saving['company']}>

                                {saving['company'] ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />} GUARDAR CAMBIOS

                            </Button>

                        </CardFooter>

                    </Card>

                </TabsContent>



                <TabsContent value="rates" className="mt-6">

                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white">

                        <CardHeader className="bg-slate-900 text-white p-8"><CardTitle className="text-xl font-black uppercase">Tasas de Cambio (BCV)</CardTitle></CardHeader>

                        <CardContent className="p-8 space-y-6">

                            <div className="flex flex-col md:flex-row gap-4 items-end bg-slate-50 p-6 rounded-3xl border border-slate-200">

                                <div className="flex-1 w-full space-y-1"><Label className="text-[10px] font-black text-slate-500">Fecha</Label><Input type="date" className={inputStyle} value={newRate.date} onChange={e => setNewRate({...newRate, date: e.target.value})} /></div>

                                <div className="flex-1 w-full space-y-1"><Label className="text-[10px] font-black text-slate-500">Monto Bs.</Label><Input type="number" className={inputStyle} value={newRate.rate} onChange={e => setNewRate({...newRate, rate: e.target.value})} /></div>

                                <Button className="bg-blue-600 hover:bg-blue-700 rounded-xl h-12 px-8 font-black w-full md:w-auto text-white" onClick={handleAddRate}><PlusCircle className="h-5 w-5 mr-2" /> AGREGAR</Button>

                            </div>

                            <div className="rounded-2xl border border-slate-100 overflow-hidden">

                                <Table>

                                    <TableHeader className="bg-slate-100"><TableRow><TableHead className="font-black text-slate-600">FECHA</TableHead><TableHead className="font-black text-slate-600">TASA</TableHead><TableHead className="font-black text-slate-600 text-right">ESTADO</TableHead></TableRow></TableHeader>

                                    <TableBody>

                                        {settings.exchangeRates?.map((r) => (

                                            <TableRow key={r.id} className="hover:bg-slate-50 transition-colors border-slate-50">

                                                <TableCell className="font-bold text-slate-700">{format(parseISO(r.date), 'PPP', { locale: es })}</TableCell>

                                                <TableCell className="font-black text-slate-900 text-lg">Bs. {r.rate}</TableCell>

                                                <TableCell className="text-right">{r.active ? <Badge className="bg-green-600">ACTIVA</Badge> : <Badge variant="outline" className="text-slate-400">HISTORIAL</Badge>}</TableCell>

                                            </TableRow>

                                        ))}

                                    </TableBody>

                                </Table>

                            </div>

                        </CardContent>

                    </Card>

                </TabsContent>



                <TabsContent value="fees" className="mt-6">

                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white">

                        <CardHeader className="bg-slate-900 text-white p-8"><CardTitle className="text-xl font-black uppercase">Cuotas y Acceso</CardTitle></CardHeader>

                        <CardContent className="p-8 space-y-8">

                            <div className="space-y-4">

                                <Label className="text-[10px] font-black uppercase text-slate-500">Cuota Mensual Sugerida</Label>

                                <div className="flex gap-4 items-center bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100">

                                    <div className="bg-blue-600 p-4 rounded-2xl shadow-lg"><DollarSign className="h-8 w-8 text-white"/></div>

                                    <div className="flex-1">

                                        <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Dólares (USD)</p>

                                        <Input type="number" className="text-4xl h-14 bg-transparent border-none font-black text-slate-900 focus-visible:ring-0 p-0" value={settings.condoFee || ''} onChange={e => setSettings({...settings, condoFee: parseFloat(e.target.value) || 0})} />

                                    </div>

                                </div>

                            </div>

                            <div className="p-8 rounded-[2rem] bg-slate-100 border border-slate-200 flex items-center justify-between">

                                <div><h3 className="font-black uppercase text-slate-800">Acceso para Propietarios</h3><p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">Habilitar entrada a la App de vecinos.</p></div>

                                <Switch className="data-[state=checked]:bg-blue-600" checked={settings.loginSettings?.ownerLoginEnabled} onCheckedChange={c => setSettings({...settings, loginSettings: {...settings.loginSettings, ownerLoginEnabled: c}})} />

                            </div>

                        </CardContent>

                        <CardFooter className="p-8 bg-slate-50 flex justify-end">

                            <Button className="bg-blue-600 hover:bg-blue-700 rounded-full px-10 h-12 font-black" onClick={() => handleSave('fees', { condoFee: settings.condoFee, loginSettings: settings.loginSettings })}>GUARDAR AJUSTES</Button>

                        </CardFooter>

                    </Card>

                </TabsContent>



                <TabsContent value="security" className="mt-6">

                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">

                        <CardHeader className="bg-red-600 text-white p-8"><CardTitle className="text-xl font-black uppercase flex items-center gap-3"><KeyRound /> Seguridad Crítica</CardTitle></CardHeader>

                        <CardContent className="p-8 space-y-6">

                            <div className="space-y-4">

                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nuevo PIN de Autorización</Label>

                                <Input type="password" placeholder="••••••" maxLength={6} className="rounded-2xl text-center text-4xl h-20 tracking-[0.5em] bg-slate-100 border-none font-black text-slate-900" value={newAuthKey} onChange={e => setNewAuthKey(e.target.value)} />

                                <p className="text-[11px] text-red-600 uppercase font-black text-center">Este PIN será necesario para borrar registros o modificar datos sensibles.</p>

                            </div>

                        </CardContent>

                        <CardFooter className="p-8 bg-slate-50 flex justify-end">

                            <Button className="bg-red-600 hover:bg-red-700 rounded-full px-10 h-12 font-black text-white shadow-lg" onClick={() => handleSaveSecurity(newAuthKey)} disabled={!newAuthKey || newAuthKey.length < 4}>

                                {saving['security'] ? <Loader2 className="animate-spin mr-2" /> : <KeyRound className="mr-2 h-4 w-4"/>} ACTUALIZAR PIN

                            </Button>

                        </CardFooter>

                    </Card>

                </TabsContent>

            </Tabs>

        </div>

    );

}

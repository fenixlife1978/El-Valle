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
  const { activeCondoId, workingCondoId } = useAuth(); // Usando ambos IDs según instrucciones
  const { requestAuthorization } = useAuthorization();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [newRate, setNewRate] = useState({ date: format(new Date(), 'yyyy-MM-dd'), rate: '' });
  const [newAuthKey, setNewAuthKey] = useState('');

  const inputStyle = "rounded-xl h-12 bg-input border-border font-bold text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary";

  // Identificador prioritario para las consultas
  const condoId = activeCondoId || workingCondoId;

  useEffect(() => {
    async function fetchSettings() {
      if (!condoId) {
        setLoading(false);
        return;
      }

      try {
        // RUTA CORREGIDA: Apuntando a la ruta física real en Firestore
        const docRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({
            companyInfo: { ...defaultSettings.companyInfo, ...data.companyInfo },
            exchangeRates: data.exchangeRates || [],
            condoFee: data.condoFee || 0,
            loginSettings: { ...defaultSettings.loginSettings, ...data.loginSettings }
          });
        } else {
          // Si no existe, lo creamos para evitar errores de visualización
          await setDoc(docRef, defaultSettings);
          setSettings(defaultSettings);
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
        toast({ variant: "destructive", title: "Error de carga", description: "No se pudo conectar con la ruta de configuración." });
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
      const docRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
      await setDoc(docRef, dataToUpdate, { merge: true });
      toast({ title: "Guardado", description: "Configuración actualizada en EFAS CondoSys." });
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
        const authRef = doc(db, 'condominios', condoId, 'config', 'authorization');
        await setDoc(authRef, { key, updatedAt: new Date().toISOString() }, { merge: true });
        toast({ title: "PIN Seguro actualizado" });
        setNewAuthKey('');
      } catch (e) { toast({ variant: "destructive", title: "Error" }); }
      finally { setSaving(prev => ({ ...prev, security: false })); }
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && condoId) {
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

  if (loading) return (
    <div className="flex h-[80vh] flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-primary h-12 w-12" />
      <p className="text-xs font-bold text-muted-foreground uppercase">Sincronizando con {condoId}...</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-6 pb-24">
      <div className="mb-10">
        <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
          Configuración <span className="text-primary">General</span>
        </h2>
        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
        <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
          ID: {condoId} — Gestiona los parámetros de EFAS CondoSys.
        </p>
      </div>
      
      <Tabs defaultValue="company" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-14 bg-secondary/30 p-1 rounded-2xl">
          <TabsTrigger value="company" className="rounded-xl font-black uppercase text-[10px] md:text-xs">Identidad</TabsTrigger>
          <TabsTrigger value="rates" className="rounded-xl font-black uppercase text-[10px] md:text-xs">Tasas BCV</TabsTrigger>
          <TabsTrigger value="fees" className="rounded-xl font-black uppercase text-[10px] md:text-xs">Acceso</TabsTrigger>
          <TabsTrigger value="security" className="rounded-xl font-black uppercase text-[10px] md:text-xs">Seguridad</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-6">
          <Card className="rounded-[2.5rem] border-border bg-card overflow-hidden">
            <CardHeader className="bg-secondary/20 p-8">
              <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3"><Building2 className="text-primary" /> Identidad Legal</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="relative">
                  <div className="w-32 h-32 rounded-3xl border-4 border-border overflow-hidden bg-muted flex items-center justify-center">
                    {settings.companyInfo?.logo ? <img src={settings.companyInfo.logo} className="w-full h-full object-cover" /> : <Upload className="text-muted-foreground h-8 w-8" />}
                  </div>
                  <Button size="icon" className="absolute bottom-0 right-0 rounded-full bg-primary h-10 w-10 shadow-lg" onClick={() => document.getElementById('logo-input')?.click()}><Upload className="h-4 w-4" /></Button>
                  <input id="logo-input" type="file" className="hidden" onChange={handleAvatarChange} accept="image/*" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 w-full">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Nombre Comercial</Label>
                    <Input className={inputStyle} value={settings.companyInfo?.name || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, name: e.target.value}})} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-2">RIF / Identificación</Label>
                    <Input className={inputStyle} value={settings.companyInfo?.rif || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, rif: e.target.value}})} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Email</Label>
                  <Input className={inputStyle} value={settings.companyInfo?.email || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, email: e.target.value}})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Teléfono</Label>
                  <Input className={inputStyle} value={settings.companyInfo?.phone || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, phone: e.target.value}})} />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-2">Dirección</Label>
                  <Textarea className="rounded-2xl min-h-[100px] bg-input border-border font-bold text-foreground" value={settings.companyInfo?.address || ''} onChange={e => setSettings({...settings, companyInfo: {...settings.companyInfo, address: e.target.value}})} />
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-8 bg-secondary/20 flex justify-end">
              <Button className="bg-primary hover:bg-primary/90 rounded-full px-10 h-12 font-black shadow-lg" onClick={() => handleSave('company', { companyInfo: settings.companyInfo })} disabled={saving['company']}>
                {saving['company'] ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />} GUARDAR CAMBIOS
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="rates" className="mt-6">
          <Card className="rounded-[2.5rem] border-border bg-card">
            <CardHeader className="bg-secondary/20 p-8"><CardTitle className="text-xl font-black uppercase">Historial de Tasas</CardTitle></CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="flex flex-col md:flex-row gap-4 items-end bg-muted/50 p-6 rounded-3xl border border-border">
                <div className="flex-1 w-full space-y-1"><Label className="text-[10px] font-black text-muted-foreground">Fecha</Label><Input type="date" className={inputStyle} value={newRate.date} onChange={e => setNewRate({...newRate, date: e.target.value})} /></div>
                <div className="flex-1 w-full space-y-1"><Label className="text-[10px] font-black text-muted-foreground">Monto Bs.</Label><Input type="number" step="0.01" className={inputStyle} value={newRate.rate} onChange={e => setNewRate({...newRate, rate: e.target.value})} /></div>
                <Button className="bg-primary hover:bg-primary/90 rounded-xl h-12 px-8 font-black w-full md:w-auto" onClick={handleAddRate}><PlusCircle className="h-5 w-5 mr-2" /> AGREGAR</Button>
              </div>
              <div className="rounded-2xl border border-border overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/30">
                    <TableRow>
                      <TableHead className="font-black text-muted-foreground">FECHA</TableHead>
                      <TableHead className="font-black text-muted-foreground">TASA</TableHead>
                      <TableHead className="font-black text-muted-foreground text-right">ESTADO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.exchangeRates?.map((r) => (
                      <TableRow key={r.id} className="hover:bg-secondary/20 transition-colors border-border">
                        <TableCell className="font-bold text-foreground">{format(parseISO(r.date), 'PPP', { locale: es })}</TableCell>
                        <TableCell className="font-black text-foreground text-lg">Bs. {r.rate}</TableCell>
                        <TableCell className="text-right">{r.active ? <Badge className="bg-green-500">ACTIVA</Badge> : <Badge variant="outline">HISTORIAL</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="mt-6">
          <Card className="rounded-[2.5rem] border-border bg-card">
            <CardHeader className="bg-secondary/20 p-8"><CardTitle className="text-xl font-black uppercase">Cuotas y Acceso</CardTitle></CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Cuota Mensual Base</Label>
                <div className="flex gap-4 items-center bg-muted/50 p-6 rounded-[2rem] border border-border shadow-inner">
                  <div className="bg-primary p-4 rounded-2xl shadow-lg"><DollarSign className="h-8 w-8 text-primary-foreground"/></div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-primary uppercase mb-1">Dólares (USD)</p>
                    <Input type="number" className="text-4xl h-14 bg-transparent border-none font-black text-foreground focus-visible:ring-0 p-0" value={settings.condoFee || ''} onChange={e => setSettings({...settings, condoFee: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>
              </div>
              <div className="p-8 rounded-[2rem] bg-muted/50 border border-border flex items-center justify-between">
                <div><h3 className="font-black uppercase text-foreground text-sm">Acceso Propietarios</h3><p className="text-[10px] text-muted-foreground font-bold uppercase italic">Permitir entrada a la App de vecinos.</p></div>
                <Switch checked={settings.loginSettings?.ownerLoginEnabled} onCheckedChange={c => setSettings({...settings, loginSettings: {...settings.loginSettings, ownerLoginEnabled: c}})} />
              </div>
            </CardContent>
            <CardFooter className="p-8 bg-secondary/20 flex justify-end">
              <Button className="bg-primary hover:bg-primary/90 rounded-full px-10 h-12 font-black" onClick={() => handleSave('fees', { condoFee: settings.condoFee, loginSettings: settings.loginSettings })}>GUARDAR AJUSTES</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <Card className="rounded-[2.5rem] border-border bg-card overflow-hidden">
            <CardHeader className="bg-destructive text-destructive-foreground p-8">
              <CardTitle className="text-xl font-black uppercase flex items-center gap-3"><KeyRound /> Seguridad Crítica</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6 text-center">
              <div className="max-w-xs mx-auto space-y-4">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Nuevo PIN Maestro (6 dígitos)</Label>
                <Input type="password" placeholder="••••••" maxLength={6} className="rounded-2xl text-center text-4xl h-20 tracking-[0.5em] bg-input border-border font-black" value={newAuthKey} onChange={e => setNewAuthKey(e.target.value)} />
                <p className="text-[10px] text-destructive uppercase font-black">Este PIN protege operaciones sensibles de EFAS CondoSys.</p>
              </div>
            </CardContent>
            <CardFooter className="p-8 bg-secondary/20 flex justify-center">
              <Button className="bg-destructive hover:bg-destructive/90 rounded-full px-10 h-12 font-black text-white shadow-lg" onClick={() => handleSaveSecurity(newAuthKey)} disabled={newAuthKey.length < 4}>
                {saving['security'] ? <Loader2 className="animate-spin mr-2" /> : <KeyRound className="mr-2 h-4 w-4"/>} ACTUALIZAR PIN
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

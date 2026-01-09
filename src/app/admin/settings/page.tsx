'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Loader2, Save, Upload, UserCircle } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';

// --- Type Definitions ---
type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string; // Now a URL
    bankName: string;
    accountNumber: string;
};

type LoginSettings = {
  ownerLoginEnabled: boolean;
  disabledMessage: string;
};

// --- Default / Empty States ---
const emptyCompanyInfo: CompanyInfo = {
    name: 'Nombre de la Empresa',
    address: 'Dirección Fiscal de la Empresa',
    rif: 'J-00000000-0',
    phone: '+58 212-555-5555',
    email: 'contacto@empresa.com',
    logo: '', // Default to empty URL
    bankName: 'Banco Ejemplo',
    accountNumber: '0123-4567-89-0123456789'
};

const emptyCondoFee = {
    amount: 0
};

const emptyLoginSettings: LoginSettings = {
    ownerLoginEnabled: true,
    disabledMessage: 'El inicio de sesión para propietarios se encuentra deshabilitado temporalmente.',
};


export default function AdminSettingsPage() {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [companyInfo, setCompanyInfo] = useState<Partial<CompanyInfo>>({});
    const [condoFee, setCondoFee] = useState<number | ''>('');
    const [loginSettings, setLoginSettings] = useState<LoginSettings>(emptyLoginSettings);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    // Fetch initial settings from Firestore
    useEffect(() => {
        const settingsRef = doc(db, "config", "mainSettings");
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCompanyInfo(data.companyInfo || {});
                setCondoFee(data.condoFee?.amount || '');
                setLoginSettings(data.loginSettings || emptyLoginSettings);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching settings:", error);
            toast({
                variant: "destructive",
                title: "Error al cargar configuración",
                description: "No se pudieron obtener los datos de configuración.",
            });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);
    
    const handleInfoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCompanyInfo(prev => ({ ...prev, [name]: value }));
    };
    
    const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setCondoFee(value === '' ? '' : parseFloat(value));
    };

    const handleLoginSettingsChange = (field: keyof LoginSettings, value: any) => {
        setLoginSettings(prev => ({...prev, [field]: value}));
    };
    
    const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const storageRef = ref(storage, `logos/company-logo-${Date.now()}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    // Optional: track upload progress
                },
                (error) => {
                    console.error("Upload failed:", error);
                    toast({
                        variant: 'destructive',
                        title: 'Error al subir la imagen',
                        description: 'No se pudo subir el logo. Por favor, intente de nuevo.',
                    });
                    setUploading(false);
                },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    setCompanyInfo(prev => ({ ...prev, logo: downloadURL }));
                    toast({
                        title: 'Logo subido',
                        description: 'El logo se ha cargado. No olvide guardar los cambios.',
                    });
                    setUploading(false);
                }
            );
        } catch (error) {
            console.error("Error setting up upload:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Hubo un problema al iniciar la subida de la imagen.' });
            setUploading(false);
        }
    };
    
    const handleSaveChanges = () => {
        requestAuthorization(async () => {
            if (!companyInfo || !condoFee || !loginSettings) return;

            setSaving(true);
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                await setDoc(settingsRef, { 
                    companyInfo: { ...emptyCompanyInfo, ...companyInfo },
                    condoFee: { amount: Number(condoFee) || 0 },
                    loginSettings: loginSettings
                }, { merge: true });
                
                toast({
                    title: '¡Éxito!',
                    description: 'La configuración ha sido guardada correctamente.',
                    className: 'bg-green-100 text-green-800'
                });
            } catch (error: any) {
                console.error("Error saving settings:", error);
                toast({ variant: 'destructive', title: 'Error', description: `No se pudieron guardar los cambios: ${error.message}` });
            } finally {
                setSaving(false);
            }
        });
    };

    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className='flex items-center justify-between'>
                <h1 className="text-3xl font-bold font-headline">Configuración</h1>
                 <Button size="lg" onClick={handleSaveChanges} disabled={saving || uploading}>
                    {saving || uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Actualizar datos
                </Button>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Información de la Empresa</CardTitle>
                    <CardDescription>Datos que aparecerán en recibos y documentos oficiales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className='grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-4'>
                        <div className="space-y-2">
                            <Label htmlFor="logo">Logo de la Empresa</Label>
                             <div className="flex items-center gap-2">
                                <Avatar className="w-24 h-24 text-lg border">
                                    <AvatarImage src={companyInfo?.logo || ''} alt="Logo de la empresa" />
                                    <AvatarFallback><UserCircle className="h-12 w-12 text-muted-foreground"/></AvatarFallback>
                                </Avatar>
                                <div>
                                    <input type="file" ref={fileInputRef} onChange={handleLogoChange} accept="image/*" className="hidden" />
                                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || saving}>
                                        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                        Cambiar Logo
                                    </Button>
                                    <p className="text-xs text-muted-foreground mt-1">Sube la imagen de tu empresa.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre de la Administradora</Label>
                            <Input id="name" name="name" value={companyInfo?.name || ''} onChange={handleInfoChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rif">RIF</Label>
                            <Input id="rif" name="rif" value={companyInfo?.rif || ''} onChange={handleInfoChange} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="address">Dirección Fiscal</Label>
                        <Textarea id="address" name="address" value={companyInfo?.address || ''} onChange={handleInfoChange} />
                    </div>
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone">Teléfono de Contacto</Label>
                            <Input id="phone" name="phone" value={companyInfo?.phone || ''} onChange={handleInfoChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <Input id="email" name="email" type="email" value={companyInfo?.email || ''} onChange={handleInfoChange} />
                        </div>
                    </div>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Datos Bancarios</CardTitle>
                    <CardDescription>Información para realizar pagos y transferencias.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="bankName">Nombre del Banco</Label>
                            <Input id="bankName" name="bankName" value={companyInfo?.bankName || ''} onChange={handleInfoChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="accountNumber">Número de Cuenta</Label>
                            <Input id="accountNumber" name="accountNumber" value={companyInfo?.accountNumber || ''} onChange={handleInfoChange} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Parámetros Financieros</CardTitle>
                    <CardDescription>Ajustes relacionados con los cobros y la moneda.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2">
                        <Label htmlFor="condoFee">Cuota Mensual de Condominio (USD)</Label>
                        <Input 
                            id="condoFee" 
                            type="number" 
                            value={condoFee} 
                            onChange={handleFeeChange} 
                            placeholder="Ej: 25.00"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                 <CardHeader>
                    <CardTitle>Control de Acceso</CardTitle>
                    <CardDescription>Gestiona el acceso de los propietarios a la plataforma.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center space-x-4 rounded-md border p-4">
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium leading-none">Habilitar Ingreso de Propietarios</p>
                            <p className="text-sm text-muted-foreground">
                                Permite o bloquea el acceso de todos los usuarios con rol de propietario.
                            </p>
                        </div>
                        <Switch
                            checked={loginSettings.ownerLoginEnabled}
                            onCheckedChange={(checked) => handleLoginSettingsChange('ownerLoginEnabled', checked)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="disabledMessage">Mensaje de Bloqueo</Label>
                        <Textarea
                            id="disabledMessage"
                            placeholder="Ej: El sistema se encuentra en mantenimiento. Por favor, intente más tarde."
                            value={loginSettings.disabledMessage}
                            onChange={(e) => handleLoginSettingsChange('disabledMessage', e.target.value)}
                            disabled={loginSettings.ownerLoginEnabled}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

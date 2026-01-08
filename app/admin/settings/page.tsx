'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2, Save } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import { Textarea } from '@/components/ui/textarea';

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
};

const emptyCompanyInfo: CompanyInfo = {
    name: 'Nombre de la Empresa',
    address: 'Dirección Fiscal de la Empresa',
    rif: 'J-00000000-0',
    phone: '+58 212-555-5555',
    email: 'contacto@empresa.com',
};

const emptyCondoFee = 25; // Default value

export default function AdminSettingsPage() {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();

    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(emptyCompanyInfo);
    const [condoFee, setCondoFee] = useState<number>(emptyCondoFee);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const fetchSettings = async () => {
            try {
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setCompanyInfo({ ...emptyCompanyInfo, ...data.companyInfo });
                    setCondoFee(data.condoFee || emptyCondoFee);
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
                toast({
                    variant: "destructive",
                    title: "Error al cargar la configuración",
                    description: "No se pudieron obtener los datos de configuración.",
                });
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [toast]);

    const handleInfoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCompanyInfo(prev => ({ ...prev, [name]: value }));
    };

    const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setCondoFee(value === '' ? 0 : parseFloat(value));
    };

    const handleSaveChanges = () => {
        if (!companyInfo) return;

        requestAuthorization(async () => {
            setSaving(true);
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                await updateDoc(settingsRef, {
                    companyInfo,
                    condoFee,
                });
                
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
            <div>
                <h1 className="text-3xl font-bold font-headline">Configuración</h1>
                <p className="text-muted-foreground">Ajusta los parámetros generales de la aplicación y la comunidad.</p>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Información de la Administradora</CardTitle>
                    <CardDescription>Datos que aparecerán en recibos y documentos oficiales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre de la Administradora</Label>
                            <Input id="name" name="name" value={companyInfo.name} onChange={handleInfoChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rif">RIF</Label>
                            <Input id="rif" name="rif" value={companyInfo.rif} onChange={handleInfoChange} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="address">Dirección Fiscal</Label>
                        <Textarea id="address" name="address" value={companyInfo.address} onChange={handleInfoChange} />
                    </div>
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone">Teléfono de Contacto</Label>
                            <Input id="phone" name="phone" value={companyInfo.phone} onChange={handleInfoChange} />
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
            
            <div className="flex justify-end pt-4">
                 <Button size="lg" onClick={handleSaveChanges} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Actualizar datos
                </Button>
            </div>
        </div>
    );
}

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Loader2, Save, Building2, Globe, Mail, Phone } from "lucide-react";

export default function SettingsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Estado inicial de la configuración
    const [settings, setSettings] = useState({
        companyInfo: {
            name: '',
            address: '',
            phone: '',
            email: '',
            logo: '',
            website: ''
        }
    });

    // Cargar datos desde Firebase al montar el componente
    useEffect(() => {
        async function fetchSettings() {
            try {
                const docRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSettings(docSnap.data() as any);
                }
            } catch (error) {
                console.error("Error al cargar configuración:", error);
                toast({
                    variant: "destructive",
                    title: "Error de carga",
                    description: "No se pudieron obtener los ajustes desde la base de datos."
                });
            } finally {
                setLoading(false);
            }
        }
        fetchSettings();
    }, [toast]);

    // Función para guardar cambios
    const handleSave = async () => {
        setSaving(true);
        try {
            const docRef = doc(db, 'config', 'mainSettings');
            await updateDoc(docRef, settings);
            toast({
                title: "Configuración guardada",
                description: "Los datos de ValleCondo se han actualizado con éxito."
            });
        } catch (error) {
            console.error("Error al guardar:", error);
            toast({
                variant: "destructive",
                title: "Error al guardar",
                description: "Hubo un problema al intentar actualizar la configuración."
            });
        } finally {
            setSaving(false);
        }
    };

    // Estado de carga inicial
    if (loading) {
        return (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse">Cargando configuración...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight text-primary">Configuración General</h1>
                <p className="text-muted-foreground">Administra la identidad y los datos de contacto del condominio.</p>
            </header>

            <Card className="border-t-4 border-t-primary">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        Información del Condominio
                    </CardTitle>
                    <CardDescription>
                        Esta información se reflejará en los estados de cuenta y comunicaciones oficiales.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Nombre */}
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre Legal / Comercial</Label>
                            <Input 
                                id="name" 
                                placeholder="Ej. Residencias Valle Alto"
                                value={settings.companyInfo.name} 
                                onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, name: e.target.value}})}
                            />
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico de Contacto</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="email" 
                                    type="email"
                                    className="pl-9"
                                    placeholder="administracion@correo.com"
                                    value={settings.companyInfo.email} 
                                    onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, email: e.target.value}})}
                                />
                            </div>
                        </div>

                        {/* Teléfono */}
                        <div className="space-y-2">
                            <Label htmlFor="phone">Teléfono Central</Label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="phone" 
                                    className="pl-9"
                                    placeholder="+58 000 000 0000"
                                    value={settings.companyInfo.phone} 
                                    onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, phone: e.target.value}})}
                                />
                            </div>
                        </div>

                        {/* Sitio Web */}
                        <div className="space-y-2">
                            <Label htmlFor="website">Página Web (URL)</Label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="website" 
                                    className="pl-9"
                                    placeholder="https://www.vallecondo.com"
                                    value={settings.companyInfo.website} 
                                    onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, website: e.target.value}})}
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Dirección */}
                    <div className="space-y-2">
                        <Label htmlFor="address">Dirección Física Completa</Label>
                        <Textarea 
                            id="address" 
                            className="min-h-[100px] resize-none"
                            placeholder="Av. Principal con Calle 2..."
                            value={settings.companyInfo.address} 
                            onChange={(e) => setSettings({...settings, companyInfo: {...settings.companyInfo, address: e.target.value}})}
                        />
                    </div>

                    {/* Botón de Guardar */}
                    <div className="flex justify-end pt-4 border-t">
                        <Button 
                            onClick={handleSave} 
                            disabled={saving}
                            className="w-full md:w-auto px-8"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Guardar Cambios
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

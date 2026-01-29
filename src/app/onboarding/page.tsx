'use client';

import React, { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        condoId: '',
        regKey: '',
        email: '',
        password: '',
        adminName: ''
    });
    const { toast } = useToast();
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 1. Validar si el CondoId y la Key existen y coinciden
            const systemRef = doc(db, 'system_management', formData.condoId);
            const systemSnap = await getDoc(systemRef);

            if (!systemSnap.exists()) {
                throw new Error("El ID del condominio no existe en nuestro sistema maestro.");
            }

            const systemData = systemSnap.data();
            if (systemData.registrationKey !== formData.regKey) {
                throw new Error("La clave de activación es incorrecta.");
            }

            if (systemData.ownerEmail) {
                throw new Error("Este condominio ya ha sido activado previamente.");
            }

            // 2. Crear el usuario en Firebase Auth
            const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
            const uid = userCred.user.uid;

            // 3. Crear el perfil del usuario administrador
            await setDoc(doc(db, 'users', uid), {
                name: formData.adminName,
                email: formData.email,
                role: 'admin',
                condominioId: formData.condoId,
                createdAt: new Date().toISOString()
            });

            // 4. Vincular el administrador al sistema maestro
            await updateDoc(systemRef, {
                ownerEmail: formData.email,
                ownerUid: uid,
                status: 'active',
                activatedAt: new Date().toISOString()
            });

            toast({ 
                title: "¡Sistema Activado!", 
                description: "Registro exitoso. Ahora puedes iniciar sesión." 
            });
            
            router.push('/login?role=admin');

        } catch (error: any) {
            toast({ 
                variant: "destructive", 
                title: "Error de Activación", 
                description: error.message 
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="max-w-md w-full rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
                <CardHeader className="bg-slate-900 text-white p-8 text-center">
                    <ShieldCheck className="w-12 h-12 text-sky-400 mx-auto mb-4" />
                    <CardTitle className="text-2xl font-black italic uppercase tracking-tighter">Activar Condominio</CardTitle>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">Panel de Activación EFAS CondoSys</p>
                </CardHeader>
                <CardContent className="p-8">
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">ID Condominio</Label>
                                <Input 
                                    placeholder="ej: condo-valle" 
                                    className="rounded-xl" 
                                    value={formData.condoId} 
                                    onChange={e => setFormData({...formData, condoId: e.target.value.toLowerCase().trim()})} 
                                    required 
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Clave Activación</Label>
                                <Input 
                                    placeholder="XXXX-XXXX" 
                                    className="rounded-xl font-mono uppercase" 
                                    value={formData.regKey} 
                                    onChange={e => setFormData({...formData, regKey: e.target.value.toUpperCase().trim()})} 
                                    required 
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nombre del Administrador</Label>
                            <Input 
                                placeholder="Nombre completo" 
                                className="rounded-xl" 
                                value={formData.adminName} 
                                onChange={e => setFormData({...formData, adminName: e.target.value})} 
                                required 
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Email Master</Label>
                            <Input 
                                type="email" 
                                placeholder="admin@ejemplo.com" 
                                className="rounded-xl" 
                                value={formData.email} 
                                onChange={e => setFormData({...formData, email: e.target.value.toLowerCase().trim()})} 
                                required 
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Contraseña Master</Label>
                            <Input 
                                type="password" 
                                placeholder="••••••••" 
                                className="rounded-xl" 
                                value={formData.password} 
                                onChange={e => setFormData({...formData, password: e.target.value})} 
                                required 
                            />
                        </div>
                        <Button 
                            type="submit"
                            className="w-full bg-sky-600 hover:bg-sky-700 h-12 rounded-2xl font-black text-white mt-6 transition-all" 
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "ACTIVAR LICENCIA"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

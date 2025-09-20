
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';

export default function ChangePasswordPage() {
    const router = useRouter();
    const [session, setSession] = useState<any>(null);
    const { toast } = useToast();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login');
        } else {
            const parsedSession = JSON.parse(userSession);
            // Redirect if not required to change password
            if (!parsedSession.mustChangePass) {
                if (parsedSession.role === 'administrador') {
                    router.push('/admin/dashboard');
                } else {
                    router.push('/owner/dashboard');
                }
            }
            setSession(parsedSession);
        }
    }, [router]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!session) {
            toast({ variant: 'destructive', title: 'Error', description: 'No estás autenticado.' });
            setLoading(false);
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ variant: 'destructive', title: 'Error', description: 'Las contraseñas no coinciden.' });
            setLoading(false);
            return;
        }
        if (newPassword.length < 6) {
            toast({ variant: 'destructive', title: 'Error', description: 'La contraseña debe tener al menos 6 caracteres.' });
            setLoading(false);
            return;
        }
        if (newPassword === '123456') {
            toast({ variant: 'destructive', title: 'Contraseña no válida', description: 'No puedes usar la misma contraseña genérica.' });
            setLoading(false);
            return;
        }

        try {
            // This is a simulated password change since there is no backend.
            // In a real app, this would be an API call to a secure backend.
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            toast({
                title: 'Contraseña Cambiada Exitosamente',
                description: 'Serás redirigido a tu panel de control.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            // Update local session and redirect
            const updatedSession = { ...session, mustChangePass: false };
            localStorage.setItem('user-session', JSON.stringify(updatedSession));
            
            if (session.role === 'administrador') {
                router.push('/admin/dashboard');
            } else {
                router.push('/owner/dashboard');
            }

        } catch (error: any) {
            console.error("Error changing password:", error);
            toast({ 
                variant: 'destructive', 
                title: 'Error al cambiar la contraseña', 
                description: 'Por favor, intenta de nuevo. Si el problema persiste, contacta al administrador.' 
            });
        } finally {
            setLoading(false);
        }
    };

    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <KeyRound className="mx-auto h-12 w-12 text-primary"/>
                    <CardTitle className="mt-4 text-3xl font-bold font-headline">Cambiar Contraseña</CardTitle>
                    <CardDescription>
                        Por tu seguridad, debes establecer una nueva contraseña para continuar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleChangePassword} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">Nueva Contraseña</Label>
                            <Input
                                id="new-password"
                                type="password"
                                placeholder="••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirmar Nueva Contraseña</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {loading ? 'Guardando...' : 'Guardar y Continuar'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

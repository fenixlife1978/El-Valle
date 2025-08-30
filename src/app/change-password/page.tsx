
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { updatePassword } from "firebase/auth";
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';

export default function ChangePasswordPage() {
    const router = useRouter();
    const [user, authLoading] = useAuthState(auth);
    const { toast } = useToast();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Redirect if user is not logged in
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!user) {
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
            toast({ variant: 'destructive', title: 'Error', description: 'No puedes usar la misma contraseña genérica.' });
            setLoading(false);
            return;
        }

        try {
            await updatePassword(user, newPassword);
            toast({
                title: 'Contraseña Cambiada Exitosamente',
                description: 'Serás redirigido a tu panel de control.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            // Redirect to the correct dashboard based on role
            const userDocRef = doc(db, 'owners', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                if (userData.role === 'administrador') {
                    router.push('/admin/dashboard');
                } else {
                    router.push('/owner/dashboard');
                }
            } else {
                 router.push('/'); // Fallback to home
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

    if (authLoading) {
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

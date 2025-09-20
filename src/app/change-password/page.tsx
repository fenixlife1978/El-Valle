
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { updatePassword, signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';

export default function ChangePasswordPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [user, authLoading] = useAuthState(auth);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionRole, setSessionRole] = useState('');

     useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
        const userSession = localStorage.getItem('user-session');
        if(userSession){
            setSessionRole(JSON.parse(userSession).role);
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
            toast({ variant: 'destructive', title: 'Contraseña no válida', description: 'No puedes usar la misma contraseña genérica.' });
            setLoading(false);
            return;
        }

        try {
            await updatePassword(user, newPassword);
            
            const userDocRef = doc(db, 'owners', user.uid);
            await updateDoc(userDocRef, {
                mustChangePass: false
            });

            // Clear old session and logout
            localStorage.removeItem('user-session');
            await signOut(auth);

            toast({
                title: 'Contraseña Cambiada Exitosamente',
                description: 'Por favor, inicia sesión con tu nueva contraseña.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            router.push(`/login?role=${sessionRole}`);

        } catch (error: any) {
            console.error("Error changing password:", error);
            let description = 'Ocurrió un error inesperado.';
            if (error.code === 'auth/requires-recent-login') {
                description = 'Por seguridad, debes volver a iniciar sesión para cambiar la contraseña.';
            }
            toast({ 
                variant: 'destructive', 
                title: 'Error al cambiar la contraseña', 
                description: description
            });
            if (error.code === 'auth/requires-recent-login') {
                localStorage.removeItem('user-session');
                await signOut(auth);
                router.push('/login');
            }
        } finally {
            setLoading(false);
        }
    };

    if (authLoading || !user) {
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

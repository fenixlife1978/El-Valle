
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound } from 'lucide-react';
import { getAuth, onAuthStateChanged, updatePassword, type User } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ChangePasswordPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [user, setUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                router.push('/login?role=owner');
            }
        });
        return () => unsubscribe();
    }, [router]);

    const handleChangePassword = async () => {
        if (!user) {
            toast({ variant: "destructive", title: "Error", description: "No hay un usuario autenticado." });
            return;
        }
        if (newPassword.length < 6) {
             toast({ variant: "destructive", title: "Contraseña Débil", description: "La contraseña debe tener al menos 6 caracteres." });
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ variant: "destructive", title: "Error", description: "Las contraseñas no coinciden." });
            return;
        }

        setLoading(true);
        try {
            await updatePassword(user, newPassword);
            const userDocRef = doc(db, 'owners', user.uid);
            await updateDoc(userDocRef, { passwordChanged: true });
            
            toast({ title: "Éxito", description: "Tu contraseña ha sido actualizada. Serás redirigido." });
            router.push('/owner/dashboard');

        } catch (error: any) {
            console.error("Password change error:", error);
            const message = error.code === 'auth/requires-recent-login'
                ? 'Esta operación es sensible y requiere una autenticación reciente. Por favor, inicie sesión de nuevo.'
                : 'Ocurrió un error al cambiar la contraseña.';
            toast({ variant: "destructive", title: "Error", description: message });
            if (error.code === 'auth/requires-recent-login') {
                router.push('/login?role=owner');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Cambio de Contraseña Obligatorio</CardTitle>
                    <CardDescription>
                        Por seguridad, debes cambiar tu contraseña inicial antes de continuar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-password">Nueva Contraseña</Label>
                        <Input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirmar Nueva Contraseña</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button className="w-full" onClick={handleChangePassword} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4"/>}
                        Guardar Contraseña y Continuar
                    </Button>
                </CardFooter>
            </Card>
        </main>
    );
}

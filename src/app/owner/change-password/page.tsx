'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db, app } from '@/lib/firebase';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Loader2 } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';


export default function ChangePasswordPage() {
    const router = useRouter();
    const { toast } = useToast();
    const auth = getAuth(app);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [session, setSession] = useState<any>(null);

    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login?role=owner');
        } else {
            const parsedSession = JSON.parse(userSession);
            setSession(parsedSession);
        }
    }, [router]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setLoading(true);
        const user = auth.currentUser;

        if (user && session) {
            try {
                // Re-authenticate with the generic password to allow password change
                const credential = EmailAuthProvider.credential(user.email!, '123456');
                await reauthenticateWithCredential(user, credential);
                
                // Now update the password
                await updatePassword(user, newPassword);

                // Update the flag in Firestore
                const userDocRef = doc(db, 'owners', user.uid);
                await updateDoc(userDocRef, {
                    passwordChanged: true
                });

                // Update session storage
                localStorage.setItem('user-session', JSON.stringify({ ...session, passwordChanged: true }));

                toast({
                    title: '¡Contraseña Actualizada!',
                    description: 'Tu nueva contraseña ha sido guardada. Ahora puedes acceder a tu panel.',
                    className: 'bg-green-100 border-green-400 text-green-800'
                });

                router.push('/owner/dashboard');

            } catch (err: any) {
                console.error("Password change error:", err);
                let errorMessage = 'Ocurrió un error al cambiar tu contraseña.';
                 if (err.code === 'auth/wrong-password') {
                    errorMessage = 'Parece que esta no es tu primera vez aquí. Si olvidaste tu contraseña, contacta al administrador.';
                }
                setError(errorMessage);
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: errorMessage
                });
            } finally {
                setLoading(false);
            }
        } else {
            setError('No se pudo encontrar la sesión de usuario. Por favor, inicia sesión de nuevo.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">Cambiar Contraseña</CardTitle>
                    <CardDescription>
                        Por tu seguridad, debes establecer una nueva contraseña para continuar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">Nueva Contraseña</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                        {error && (
                            <Alert variant="destructive">
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                            Guardar Contraseña y Continuar
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
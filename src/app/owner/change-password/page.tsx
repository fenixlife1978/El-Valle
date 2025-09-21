'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Loader2, LogOut, CheckCircle } from 'lucide-react';
import { getAuth, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db, app } from '@/lib/firebase';

export default function ChangePasswordPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [session, setSession] = useState<any>(null);

    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login');
            return;
        }
        const parsedSession = JSON.parse(userSession);
        if (parsedSession.passwordChanged) {
            router.push('/owner/dashboard');
        }
        setSession(parsedSession);
    }, [router]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 6) {
            toast({ variant: 'destructive', title: 'Contraseña muy corta', description: 'La contraseña debe tener al menos 6 caracteres.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ variant: 'destructive', title: 'Las contraseñas no coinciden', description: 'Por favor, verifique su nueva contraseña.' });
            return;
        }

        setLoading(true);
        const auth = getAuth(app);
        const user = auth.currentUser;

        if (user && session) {
            try {
                await updatePassword(user, newPassword);
                
                const userDocRef = doc(db, 'owners', user.uid);
                await updateDoc(userDocRef, {
                    passwordChanged: true
                });

                // Update session in localStorage
                const updatedSession = { ...session, passwordChanged: true };
                localStorage.setItem('user-session', JSON.stringify(updatedSession));

                toast({
                    title: 'Contraseña Actualizada',
                    description: 'Serás redirigido a tu panel de control.',
                    className: 'bg-green-100 border-green-400 text-green-800'
                });

                router.push('/owner/dashboard');

            } catch (error: any) {
                console.error("Error changing password:", error);
                toast({ variant: 'destructive', title: 'Error al cambiar la contraseña', description: 'Por favor, cierre sesión y vuelva a intentarlo.' });
            } finally {
                setLoading(false);
            }
        }
    };
    
    const handleLogout = () => {
        const auth = getAuth(app);
        auth.signOut();
        localStorage.removeItem('user-session');
        router.push('/login');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline flex items-center gap-2">
                        <KeyRound className="h-6 w-6 text-primary"/>
                        Cambiar Contraseña
                    </CardTitle>
                    <CardDescription>
                        Por seguridad, debes establecer una nueva contraseña para continuar.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleChangePassword}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">Nueva Contraseña</Label>
                            <Input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirmar Nueva Contraseña</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4"/>}
                            Guardar y Continuar
                        </Button>
                         <Button type="button" variant="outline" className="w-full" onClick={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Cerrar Sesión
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}

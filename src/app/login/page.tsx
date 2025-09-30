
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';

type Role = 'admin' | 'owner';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    
    const initialRole = searchParams.get('role') === 'admin' ? 'admin' : 'owner';
    const [role, setRole] = useState<Role>(initialRole);
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [resetEmail, setResetEmail] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!email || !password) {
            toast({ variant: "destructive", title: "Error", description: "Por favor, ingrese su correo y contraseña." });
            setLoading(false);
            return;
        }

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user) {
                const userDocRef = doc(db, 'owners', user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    
                    if (role === 'admin' && userData.role !== 'administrador') {
                        throw new Error("No tienes permisos de administrador.");
                    }
                    if (role === 'owner' && userData.role !== 'propietario') {
                         throw new Error("Esta cuenta no es de un propietario.");
                    }

                    // Save session to localStorage
                    localStorage.setItem('user-session', JSON.stringify({
                        uid: user.uid,
                        email: user.email,
                        displayName: userData.name,
                        role: userData.role
                    }));
                    
                    if (userData.role === 'administrador') {
                        router.push('/admin/dashboard');
                    } else {
                        // Check if password needs changing
                        if (!userData.passwordChanged) {
                            router.push('/owner/change-password');
                        } else {
                            router.push('/owner/dashboard');
                        }
                    }
                } else {
                    throw new Error("No se encontró un perfil para este usuario.");
                }
            }
        } catch (error: any) {
            console.error("Login Error:", error);
            const friendlyMessage = 
                error.code === 'auth/user-not-found' ? 'Usuario no encontrado.' :
                error.code === 'auth/wrong-password' ? 'Contraseña incorrecta.' :
                error.code === 'auth/invalid-credential' ? 'Credenciales inválidas.' :
                error.message || 'Ocurrió un error al iniciar sesión.';
            toast({ variant: "destructive", title: "Error de inicio de sesión", description: friendlyMessage });
            setLoading(false);
        }
    };
    
    const handlePasswordReset = async () => {
        if (!resetEmail) {
            toast({ variant: "destructive", title: "Error", description: "Por favor ingrese su correo electrónico." });
            return;
        }
        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, resetEmail);
            toast({ title: "Correo enviado", description: "Se ha enviado un enlace para restablecer su contraseña a su correo." });
            setShowPasswordReset(false);
            setResetEmail('');
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
        setLoading(false);
    };

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
             {!showPasswordReset ? (
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold text-center">
                            Bienvenido a CondoConnect
                        </CardTitle>
                        <CardDescription className="text-center">
                           Seleccione su rol e inicie sesión
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                         <div className="grid grid-cols-2 gap-2 mb-6">
                            <Button variant={role === 'owner' ? 'default' : 'outline'} onClick={() => setRole('owner')}>
                                Soy Propietario
                            </Button>
                            <Button variant={role === 'admin' ? 'default' : 'outline'} onClick={() => setRole('admin')}>
                                Soy Administrador
                            </Button>
                        </div>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Correo Electrónico</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="su-correo@ejemplo.com"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                             <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Iniciar Sesión
                            </Button>
                        </form>
                    </CardContent>
                     <CardFooter className="flex justify-center">
                        <Button variant="link" onClick={() => setShowPasswordReset(true)}>
                            ¿Olvidó su contraseña?
                        </Button>
                    </CardFooter>
                </Card>
            ) : (
                <Card className="w-full max-w-sm">
                     <CardHeader>
                        <CardTitle className="text-2xl font-bold">Restablecer Contraseña</CardTitle>
                        <CardDescription>
                            Ingrese su correo y le enviaremos un enlace para cambiar su contraseña.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="reset-email">Correo Electrónico</Label>
                            <Input
                                id="reset-email"
                                type="email"
                                placeholder="su-correo@ejemplo.com"
                                required
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                            />
                        </div>
                        <Button onClick={handlePasswordReset} className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4"/>}
                            Enviar Correo de Restablecimiento
                        </Button>
                    </CardContent>
                     <CardFooter className="flex justify-center">
                         <Button variant="link" onClick={() => setShowPasswordReset(false)}>
                            Volver a Inicio de Sesión
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </main>
    );
}

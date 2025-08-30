
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2 } from 'lucide-react';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

type Role = 'propietario' | 'administrador';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<Role>('propietario');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!email || !password) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Por favor, ingrese su correo y contraseña.',
            });
            setLoading(false);
            return;
        }

        try {
            const auth = getAuth();
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user) {
                const userDocRef = doc(db, 'owners', user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    if (userData.role === role) {
                        toast({
                            title: 'Inicio de Sesión Exitoso',
                            description: `Bienvenido, ${userData.name || 'usuario'}.`,
                        });
                        if (role === 'administrador') {
                            router.push('/admin/dashboard');
                        } else {
                            router.push('/owner/dashboard');
                        }
                    } else {
                        await auth.signOut(); // Sign out if role doesn't match
                        toast({
                            variant: 'destructive',
                            title: 'Error de Rol',
                            description: 'El rol seleccionado no coincide con su perfil.',
                        });
                    }
                } else {
                     await auth.signOut(); // Sign out if no profile found
                     toast({
                        variant: 'destructive',
                        title: 'Error de Perfil',
                        description: 'No se encontró un registro de propietario para este usuario.',
                    });
                }
            }
        } catch (error: any) {
            console.error("Authentication error:", error);
            let description = 'Correo o contraseña incorrectos.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El correo electrónico o la contraseña que ingresaste son incorrectos. Por favor, inténtalo de nuevo.';
            } else if (error.code === 'auth/too-many-requests') {
                description = 'Has intentado iniciar sesión demasiadas veces. Por favor, intenta de nuevo más tarde.';
            }
            toast({
                variant: 'destructive',
                title: 'Error de Autenticación',
                description: description,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <Building2 className="mx-auto h-12 w-12 text-primary"/>
                    <CardTitle className="mt-4 text-3xl font-bold font-headline">Bienvenido</CardTitle>
                    <CardDescription>Inicia sesión para acceder a tu panel</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="tu@correo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-3">
                            <Label>Iniciar sesión como</Label>
                            <RadioGroup
                                value={role}
                                onValueChange={(value) => setRole(value as Role)}
                                className="flex gap-4"
                                disabled={loading}
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="propietario" id="r-propietario" />
                                    <Label htmlFor="r-propietario">Propietario</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="administrador" id="r-administrador" />
                                    <Label htmlFor="r-administrador">Administrador</Label>
                                </div>
                            </RadioGroup>
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

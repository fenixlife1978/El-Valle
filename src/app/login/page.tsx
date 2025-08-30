
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, ArrowLeft } from 'lucide-react';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

type Role = 'propietario' | 'administrador';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<Role | null>(null);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        const roleParam = searchParams.get('role') as Role;
        if (roleParam && ['propietario', 'administrador'].includes(roleParam)) {
            setRole(roleParam);
        } else {
            router.push('/'); // Redirige si el rol no es válido o no existe
        }
    }, [searchParams, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!email || !password || !role) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Por favor, complete todos los campos.',
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
                        
                        // Lógica para el primer inicio de sesión
                        if (password === '123456') {
                            router.push('/change-password');
                        } else {
                            if (role === 'administrador') {
                                router.push('/admin/dashboard');
                            } else {
                                router.push('/owner/dashboard');
                            }
                        }
                    } else {
                        await auth.signOut();
                        toast({
                            variant: 'destructive',
                            title: 'Error de Rol',
                            description: 'El rol seleccionado no coincide con su perfil.',
                        });
                    }
                } else {
                     await auth.signOut();
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

    if (!role) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
            <Card className="w-full max-w-md relative">
                <Button variant="ghost" size="icon" className="absolute top-4 left-4" onClick={() => router.push('/')}>
                    <ArrowLeft className="h-5 w-5"/>
                </Button>
                <CardHeader className="text-center pt-12">
                    <Building2 className="mx-auto h-12 w-12 text-primary"/>
                    <CardTitle className="mt-4 text-3xl font-bold font-headline capitalize">
                        Iniciar Sesión
                    </CardTitle>
                    <CardDescription>
                        Ingresa tus credenciales como <span className="font-semibold text-primary">{role}</span>
                    </CardDescription>
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

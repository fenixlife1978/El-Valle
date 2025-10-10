
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, LogIn, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const auth = getAuth();
    const { user, role, ownerData } = useAuth();

    const targetRole = searchParams.get('role');

    useEffect(() => {
        if (!targetRole) {
            router.replace('/');
        }
    }, [targetRole, router]);

    useEffect(() => {
        if (user && role && ownerData) {
            if ((targetRole === 'admin' && role === 'administrador') || (targetRole === 'owner' && role === 'propietario')) {
                toast({
                    title: 'Inicio de Sesión Exitoso',
                    description: `Bienvenido de nuevo, ${ownerData.name || 'usuario'}.`,
                    className: 'bg-green-100 border-green-400'
                });
                
                if (role === 'administrador') {
                    router.push('/admin/dashboard');
                } else { // propietario
                    if (!ownerData.passwordChanged) {
                        router.push('/owner/change-password');
                    } else {
                        router.push('/owner/dashboard');
                    }
                }
            }
        }
    }, [user, role, ownerData, router, targetRole, toast]);


    if (!targetRole) {
         return null;
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast({
                variant: 'destructive',
                title: 'Campos requeridos',
                description: 'Por favor, ingrese su email y contraseña.',
            });
            return;
        }

        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // The useEffect hook will handle redirection and toasts on successful login.

        } catch (error: any) {
            console.error('Login error:', error);
            let description = 'Ocurrió un error inesperado. Por favor, intente de nuevo.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El email o la contraseña son incorrectos.';
            }
            toast({
                variant: 'destructive',
                title: 'Error de Autenticación',
                description,
            });
        } finally {
            setLoading(false);
        }
    };
    
    const title = targetRole === 'admin' ? 'Acceso de Administrador' : 'Portal de Propietario';
    const description = targetRole === 'admin' ? 'Inicia sesión para gestionar el condominio.' : 'Inicia sesión para consultar tu información.';

    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4 relative">
            <Link href="/" className="absolute top-4 left-4">
                <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4">
                        <Image src="/logo.png" alt="Logo" width={80} height={80} data-ai-hint="logo for a condo app"/>
                    </div>
                    <CardTitle className="capitalize font-headline">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="tu@email.com"
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
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <LogIn className="mr-2 h-4 w-4" />
                            )}
                            {loading ? 'Ingresando...' : 'Ingresar'}
                        </Button>
                         <p className="text-xs text-muted-foreground">
                            ¿No tienes cuenta?{' '}
                            <Link href={`/register?role=${targetRole}`} className="underline text-primary">
                                Regístrate aquí
                            </Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}

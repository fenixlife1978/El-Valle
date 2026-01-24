
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';

const ADMIN_EMAIL = 'vallecondo@gmail.com';

function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { companyInfo, loading: authLoading } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [role, setRole] = useState<'owner' | 'admin' | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const roleParam = searchParams?.get('role') ?? null;
        if (roleParam === 'admin' || roleParam === 'owner') {
            setRole(roleParam);
        } else {
            router.replace('/welcome');
        }
    }, [searchParams, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanEmail = email.trim().toLowerCase();

        if (!email || !password || !role) {
            toast({ variant: 'destructive', title: 'Campos incompletos' });
            return;
        }

        setLoading(true);

        try {
            // --- BYPASS FOR SUPER ADMIN ---
            if (cleanEmail === ADMIN_EMAIL) {
                await signInWithEmailAndPassword(auth, cleanEmail, password);
                toast({ title: 'Acceso Maestro Concedido', description: 'Redirigiendo al panel global...' });
                router.push('/admin/dashboard'); 
                return;
            }

            // --- NORMAL LOGIC FOR OTHER USERS ---
            const settingsRef = doc(db, 'config', 'mainSettings');
            const settingsSnap = await getDoc(settingsRef);
            
            if (role === 'owner' && settingsSnap.exists()) {
                const settings = settingsSnap.data();
                if (settings.loginSettings && !settings.loginSettings.ownerLoginEnabled) {
                    toast({
                        variant: 'destructive',
                        title: 'Acceso Deshabilitado',
                        description: settings.loginSettings.disabledMessage || 'Acceso deshabilitado temporalmente.',
                    });
                    setLoading(false);
                    return;
                }
            }

            let userRoleFromDB: string | null = null;
            const q = query(collection(db, "owners"), where("email", "==", cleanEmail));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                userRoleFromDB = querySnapshot.docs[0].data().role;
            }
            
            const expectedRole = role === 'admin' ? 'administrador' : 'propietario';

            if (userRoleFromDB !== expectedRole) {
                throw new Error("role-mismatch");
            }

            await signInWithEmailAndPassword(auth, cleanEmail, password);
            toast({ title: 'Sesión Iniciada', description: 'Redirigiendo...' });

            // Redirection is handled by AuthGuard in layout.tsx
            
        } catch (error: any) {
            console.error("Login error:", error);
            let description = 'Error de autenticación. Verifique sus datos.';
            
            if (error.message === "role-mismatch") {
                description = `No tienes permisos para entrar como ${role === 'admin' ? 'Administrador' : 'Propietario'}.`;
            } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'Correo o contraseña incorrectos.';
            }

            toast({
                variant: 'destructive',
                title: 'Error al iniciar sesión',
                description: description,
            });
        } finally {
            setLoading(false);
        }
    };

    if (!role) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }
    
    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <div className="text-center mb-6">
                {authLoading ? (
                    <Skeleton className="w-24 h-24 rounded-full mx-auto" />
                ) : (
                    companyInfo?.logo && (
                        <div className="w-24 h-24 rounded-full mx-auto overflow-hidden bg-card border flex items-center justify-center">
                            <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-cover" />
                        </div>
                    )
                )}
            </div>
            
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <CardTitle>{companyInfo?.name || 'ValleCondo'}</CardTitle>
                    <CardDescription>
                        Entrar como {role === 'admin' ? 'Administrador' : 'Propietario'}
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <Input 
                                id="email" 
                                type="email" 
                                placeholder="tu@email.com" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                required 
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Contraseña</Label>
                                <Button variant="link" size="sm" asChild className="text-xs p-0 h-auto">
                                    <Link href="/forgot-password">¿Olvidaste?</Link>
                                </Button>
                            </div>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Verificando...
                                </>
                            ) : 'Ingresar'}
                        </Button>
                        <Button variant="link" size="sm" asChild className="text-xs">
                            <Link href="/welcome">Cambiar de rol</Link>
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}

export default function LoginPageWithSuspense() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <LoginPage />
        </Suspense>
    );
}

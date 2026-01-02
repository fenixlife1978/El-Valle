
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

const ADMIN_USER_ID = 'valle-admin-main-account';

function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [role, setRole] = useState<'owner' | 'admin' | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [loadingLogo, setLoadingLogo] = useState(true);

    useEffect(() => {
        const roleParam = searchParams?.get('role') ?? null;
        if (roleParam === 'admin' || roleParam === 'owner') {
            setRole(roleParam);
        } else {
            router.replace('/welcome');
        }

        async function fetchLogo() {
          try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
              const settings = docSnap.data();
              if (settings.companyInfo && settings.companyInfo.logo) {
                setLogoUrl(settings.companyInfo.logo);
              }
            }
          } catch (error) {
            console.error("Error fetching company logo:", error);
          } finally {
            setLoadingLogo(false);
          }
        }
        fetchLogo();
    }, [searchParams, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || !role) {
            toast({
                variant: 'destructive',
                title: 'Campos incompletos',
                description: 'Por favor, ingrese su correo y contraseña.',
            });
            return;
        }

        setLoading(true);
        try {
             // Fetch login settings first
            const settingsRef = doc(db, 'config', 'mainSettings');
            const settingsSnap = await getDoc(settingsRef);
            
            if (role === 'owner' && settingsSnap.exists()) {
                const settings = settingsSnap.data();
                if (settings.loginSettings && !settings.loginSettings.ownerLoginEnabled) {
                    toast({
                        variant: 'destructive',
                        title: 'Acceso Deshabilitado',
                        description: settings.loginSettings.disabledMessage || 'El inicio de sesión para propietarios está deshabilitado temporalmente.',
                        duration: 10000,
                    });
                    setLoading(false);
                    return;
                }
            }


            let userRoleFromDB: string | null = null;
            if (role === 'admin') {
                // Admin login is not subject to the general owner block
                const q = query(collection(db, "owners"), where("email", "==", email.toLowerCase()), where("role", "==", "administrador"));
                const querySnapshot = await getDocs(q);
                 if (!querySnapshot.empty) {
                    userRoleFromDB = 'administrador';
                }
            } else {
                const q = query(collection(db, "owners"), where("email", "==", email.toLowerCase()));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const userData = querySnapshot.docs[0].data();
                    userRoleFromDB = userData.role;
                }
            }
            
            const expectedRole = role === 'admin' ? 'administrador' : 'propietario';

            if (userRoleFromDB !== expectedRole) {
                toast({
                    variant: 'destructive',
                    title: 'Acceso Denegado',
                    description: `No tienes los permisos para iniciar sesión como ${role === 'admin' ? 'Administrador' : 'Propietario'}.`,
                });
                setLoading(false);
                return;
            }

            await signInWithEmailAndPassword(auth, email, password);
            
            toast({
                title: 'Inicio de sesión exitoso',
                description: 'Bienvenido de nuevo. Redirigiendo...',
                className: 'bg-green-100 border-green-400 text-green-800'
            });
            
        } catch (error: any) {
            console.error("Login error:", error);
            let description = 'Ocurrió un error inesperado. Por favor, intente de nuevo.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El correo electrónico o la contraseña son incorrectos.';
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
                {loadingLogo ? (
                    <Skeleton className="w-24 h-24 rounded-full mx-auto" />
                ) : (
                    <div className="w-24 h-24 flex items-center justify-center overflow-hidden mx-auto rounded-full bg-white p-1">
                        {logoUrl && <img src={logoUrl} alt="Company Logo" className="w-full h-full object-contain" />}
                    </div>
                )}
            </div>
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <CardTitle>Iniciar Sesión como {role === 'admin' ? 'Administrador' : 'Propietario'}</CardTitle>
                    <CardDescription>Ingrese sus credenciales para acceder al sistema.</CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="su.correo@ejemplo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Contraseña</Label>
                                <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs">
                                    <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
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
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                    <span className="sr-only">Toggle password visibility</span>
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? 'Verificando...' : 'Ingresar'}
                        </Button>
                        <Button variant="link" size="sm" asChild className="text-xs">
                            <Link href="/welcome">Volver a selección de rol</Link>
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}

// Wrap the main component in Suspense for useSearchParams
export default function LoginPageWithSuspense() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <LoginPage />
        </Suspense>
    )
}

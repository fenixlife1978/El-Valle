
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, User, Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

const ADMIN_USER_ID = 'valle-admin-main-account';
const ADMIN_EMAIL = 'vallecondo@gmail.com';

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [role, setRole] = useState<'owner' | 'admin' | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const roleParam = searchParams.get('role');
        if (roleParam === 'admin' || roleParam === 'owner') {
            setRole(roleParam);
        } else {
            router.replace('/welcome');
        }
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
            // Step 1: Verify role from Firestore before attempting to sign in.
            let userRoleFromDB: string | null = null;
            if (role === 'admin') {
                // For admin, we explicitly check the admin document by its known ID.
                const adminRef = doc(db(), "owners", ADMIN_USER_ID);
                const adminSnap = await getDoc(adminRef);
                if (adminSnap.exists() && adminSnap.data().email?.toLowerCase() === email.toLowerCase()) {
                    userRoleFromDB = 'administrador';
                }
            } else {
                // For owners, we query by email.
                const q = query(collection(db(), "owners"), where("email", "==", email));
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

            // Step 2: If role is correct, proceed with Firebase Auth sign-in.
            await signInWithEmailAndPassword(auth(), email, password);
            
            toast({
                title: 'Inicio de sesión exitoso',
                description: 'Bienvenido de nuevo. Redirigiendo...',
                className: 'bg-green-100 border-green-400 text-green-800'
            });
            // Redirection is handled by the root AuthGuard
            
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
        <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                    {role === 'admin' ? <Shield className="h-10 w-10 text-primary"/> : <User className="h-10 w-10 text-primary"/>}
                </div>
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
                    <div className="space-y-2 relative">
                        <Label htmlFor="password">Contraseña</Label>
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
                            className="absolute right-1 top-7 h-7 w-7 text-muted-foreground"
                            onClick={() => setShowPassword((prev) => !prev)}
                        >
                            {showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                            <span className="sr-only">Toggle password visibility</span>
                        </Button>
                    </div>
                        <div className="text-right">
                            <Button variant="link" size="sm" asChild className="p-0 h-auto">
                                <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
                            </Button>
                        </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {loading ? 'Verificando...' : 'Ingresar'}
                    </Button>
                        <Button variant="link" size="sm" asChild>
                        <Link href="/welcome">Volver a selección de rol</Link>
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

export default function LoginPage() {
    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin" />}>
                <LoginContent />
            </Suspense>
        </main>
    );
}

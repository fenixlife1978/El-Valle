'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, User } from 'lucide-react';
import Link from 'next/link';

// Firebase imports
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

const ADMIN_EMAIL = 'vallecondo@gmail.com';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [condoKey, setCondoKey] = useState('');
    const [role, setRole] = useState<'owner' | 'admin' | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const roleFromQuery = searchParams?.get('role');
        if (roleFromQuery === 'admin' || roleFromQuery === 'owner') {
            setRole(roleFromQuery);
        } else {
            router.replace('/welcome'); // Redirect if role is invalid
        }
    }, [searchParams, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
    
        try {
            await setPersistence(auth, browserLocalPersistence);
            const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            const user = userCredential.user;
    
            // Super Admin check
            if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
                localStorage.setItem('userRole', 'super-admin');
                window.location.href = '/super-admin';
                return;
            }
            
            // Admin Login Flow
            if (role === 'admin') {
                if (!condoKey) {
                    throw new Error("Debes ingresar la Key de tu condominio");
                }
                const condoQuery = query(
                    collection(db, "condominios"),
                    where("registrationKey", "==", condoKey.trim().toUpperCase()),
                    limit(1)
                );
                const condoSnap = await getDocs(condoQuery);
                if (condoSnap.empty) {
                    throw new Error("La Key del condominio no es válida.");
                }
                const activeCondoId = condoSnap.docs[0].id;
                
                // Validate admin belongs to this condo
                const collectionName = activeCondoId === 'condo_01' ? 'owners' : 'propietarios';
                const userDocRef = doc(db, 'condominios', activeCondoId, collectionName, user.uid);
                const userDocSnap = await getDoc(userDocRef);
    
                if (!userDocSnap.exists() || !['admin', 'administrador'].includes(userDocSnap.data()?.role)) {
                     await auth.signOut();
                     throw new Error(`No tienes permisos de administrador para este condominio.`);
                }
    
                localStorage.setItem('activeCondoId', activeCondoId);
                localStorage.setItem('userRole', 'admin');
                toast({ title: "Acceso de Administrador Exitoso" });
                window.location.href = `/${activeCondoId}/admin/dashboard`;
                
            } else if (role === 'owner') {
                // Owner Login Flow
                // The AuthGuard will handle redirection after useAuth loads the user's data
                toast({ title: "Acceso Exitoso", description: "Cargando tu portal..." });
                router.push('/welcome'); // Let the AuthGuard do its job
            }
    
        } catch (err: any) {
            console.error("Login Error:", err);
            setLoading(false); // Make sure loading is set to false on error
            let errorMessage = "Credenciales incorrectas o error de conexión.";
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                errorMessage = "Correo electrónico o contraseña incorrectos.";
            } else if (err.message) {
                errorMessage = err.message;
            }
            toast({ 
                variant: 'destructive', 
                title: 'Error de Inicio de Sesión', 
                description: errorMessage
            });
        }
    };
    
    if (!role) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        {role === 'admin' ? <Shield className="h-10 w-10 text-primary"/> : <User className="h-10 w-10 text-primary"/>}
                    </div>
                    <CardTitle>Portal de {role === 'admin' ? 'Administrador' : 'Propietario'}</CardTitle>
                    <CardDescription>Inicia sesión para acceder a tu panel.</CardDescription>
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
                            <Label htmlFor="password">Contraseña</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {role === 'admin' && (
                            <div className="space-y-2">
                                <Label htmlFor="condoKey">Condo Key</Label>
                                <Input
                                    id="condoKey"
                                    type="text"
                                    placeholder="Clave de tu condominio"
                                    value={condoKey}
                                    onChange={(e) => setCondoKey(e.target.value)}
                                    required
                                />
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
                        </Button>
                        <div className="flex justify-between w-full text-sm">
                            <Button variant="link" size="sm" asChild className="p-0">
                                <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
                            </Button>
                            <Button variant="link" size="sm" asChild className="p-0">
                                <Link href="/welcome">Cambiar de portal</Link>
                            </Button>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}

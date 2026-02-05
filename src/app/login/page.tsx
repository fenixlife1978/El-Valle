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
    
            // 1. AUTENTICAR PRIMERO (Para tener permisos de lectura)
            const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            const userId = userCredential.user.uid;
    
            // 2. CASO SUPER ADMIN
            if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
                localStorage.setItem('userRole', 'super-admin');
                window.location.href = '/super-admin';
                return;
            }
    
            if (!condoKey) throw new Error("Debes ingresar la Key de tu condominio");
    
            // 3. OBTENER CONDO ID
            const condoQuery = query(
                collection(db, "condominios"), 
                where("registrationKey", "==", condoKey.trim().toUpperCase()), 
                limit(1)
            );
            const condoSnap = await getDocs(condoQuery);
            if (condoSnap.empty) throw new Error("La Key ingresada no es válida.");
            const activeCondoId = condoSnap.docs[0].id;
    
            // 4. GUARDAR ESTADO
            localStorage.setItem('activeCondoId', activeCondoId);
            localStorage.setItem('workingCondoId', activeCondoId);
            localStorage.setItem('userRole', role!);
    
            // 5. VALIDAR PERTENENCIA
            const collectionName = activeCondoId === 'condo_01' ? 'owners' : 'propietarios';
            const userDocRef = doc(db, 'condominios', activeCondoId, collectionName, userId);
            const userDocSnap = await getDoc(userDocRef);
    
            if (!userDocSnap.exists()) {
                await auth.signOut();
                localStorage.clear();
                throw new Error(`No tienes acceso a este condominio.`);
            }
    
            // 6. REDIRIGIR
            const targetPath = role === 'admin' 
                ? `/${activeCondoId}/admin/dashboard` 
                : `/${activeCondoId}/owner/dashboard`;
    
            toast({ title: "Acceso Exitoso", description: "Cargando tu portal..." });
            window.location.href = targetPath;
    
        } catch (err: any) {
            console.error("Login Error:", err);
            setLoading(false);
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
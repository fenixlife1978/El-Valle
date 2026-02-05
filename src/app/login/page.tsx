'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, User, Shield } from 'lucide-react';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';

const ADMIN_EMAIL = 'vallecondo@gmail.com';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [condoKey, setCondoKey] = useState('');
    const [role, setRole] = useState<'admin' | 'owner' | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const roleFromQuery = searchParams?.get('role');
        if (roleFromQuery === 'admin' || roleFromQuery === 'owner') {
            setRole(roleFromQuery);
        } else {
            router.replace('/welcome');
        }
    }, [searchParams, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await setPersistence(auth, browserLocalPersistence);

            let activeCondoId = '';

            if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
                if (!condoKey) throw new Error("Por favor, ingresa la Key del condominio");

                const condoQuery = query(
                    collection(db, "condominios"), 
                    where("registrationKey", "==", condoKey.trim().toUpperCase()), 
                    limit(1)
                );
                
                const condoSnap = await getDocs(condoQuery);
                if (condoSnap.empty) throw new Error("La Key del condominio no es válida.");
                
                activeCondoId = condoSnap.docs[0].id;
            }

            const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            const userId = userCredential.user.uid;

            if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
                localStorage.setItem('userRole', 'super-admin');
                window.location.href = '/super-admin';
                return;
            }

            localStorage.setItem('activeCondoId', activeCondoId);
            localStorage.setItem('workingCondoId', activeCondoId);
            localStorage.setItem('userRole', role!);

            const collectionName = activeCondoId === 'condo_01' ? 'owners' : 'propietarios';
            const userDocRef = doc(db, 'condominios', activeCondoId, collectionName, userId);
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                await auth.signOut();
                localStorage.clear();
                throw new Error("No estás registrado en este condominio específico.");
            }

            const targetPath = role === 'admin' 
                ? `/${activeCondoId}/admin/dashboard` 
                : `/${activeCondoId}/owner/dashboard`;

            toast({ title: "¡Bienvenido!", description: "Acceso verificado correctamente." });
            
            window.location.href = targetPath;

        } catch (err: any) {
            console.error("Login Error:", err);
            setLoading(false);
            toast({ 
                variant: 'destructive', 
                title: 'Error de Acceso', 
                description: err.message || "Credenciales o Key incorrectas" 
            });
        }
    };
    
    if (!role) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    const isSuperAdminLogin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm rounded-3xl shadow-2xl border-border">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                         {role === 'admin' ? (
                            <Shield className="h-10 w-10 text-primary"/>
                         ) : (
                            <User className="h-10 w-10 text-primary"/>
                         )}
                    </div>
                    <CardTitle className="text-3xl font-black uppercase tracking-tighter italic">
                        {role === 'admin' ? 'Portal Admin' : 'Portal Propietario'}
                    </CardTitle>
                    <CardDescription className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                        {role === 'admin' ? 'Gestión de Condominio' : 'Acceso a tu Propiedad'}
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                         {!isSuperAdminLogin && role === 'admin' && (
                             <div className="space-y-2">
                                <Label htmlFor="condoKey" className="text-xs font-bold uppercase text-muted-foreground">Condo Key</Label>
                                <Input
                                    id="condoKey"
                                    type="text"
                                    placeholder="Clave de tu condominio"
                                    value={condoKey}
                                    onChange={(e) => setCondoKey(e.target.value)}
                                    required={!isSuperAdminLogin}
                                    className="uppercase font-mono"
                                />
                            </div>
                         )}
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-xs font-bold uppercase text-muted-foreground">Correo Electrónico</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="tu.correo@ejemplo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-xs font-bold uppercase text-muted-foreground">Contraseña</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full h-12 text-sm font-bold uppercase" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                            {loading ? 'Validando...' : 'Ingresar'}
                        </Button>
                        <div className="flex justify-between items-center w-full">
                            <Button variant="link" size="sm" asChild>
                                <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
                            </Button>
                            {role === 'owner' && (
                                <Button variant="link" size="sm" asChild>
                                    <Link href="/register">Crear cuenta</Link>
                                </Button>
                            )}
                        </div>
                    </CardFooter>
                </form>
            </Card>
             <Button variant="link" size="sm" className="mt-6" asChild>
                <Link href="/welcome">Volver a selección de portal</Link>
            </Button>
        </main>
    );
}

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, AlertCircle, Home } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { SYSTEM_LOGO } from '@/lib/constants';

const ADMIN_EMAIL = 'vallecondo@gmail.com';

function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [condoKey, setCondoKey] = useState(''); 
    const [loading, setLoading] = useState(false);
    const [role, setRole] = useState<'owner' | 'admin' | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const roleParam = searchParams?.get('role') ?? null;
        if (roleParam === 'admin' || roleParam === 'owner') {
            setRole(roleParam as 'owner' | 'admin');
        } else {
            router.replace('/welcome');
        }
    }, [searchParams, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        const cleanKey = condoKey.trim().toUpperCase();

        if (!email || !password || !role) {
            toast({ variant: 'destructive', title: 'Campos incompletos' });
            return;
        }

        setLoading(true);

        try {
            // 1. Caso Super Admin
            if (cleanEmail === ADMIN_EMAIL) {
                await signInWithEmailAndPassword(auth, cleanEmail, password);
                router.push('/super-admin');
                return;
            }

            // 2. BUSCAR IDENTIFICADORES (REGLA: activeCondoId y workingCondoId)
            const condoQuery = query(
                collection(db, "condominios"), 
                where("registrationKey", "==", cleanKey),
                limit(1)
            );
            const condoSnapshot = await getDocs(condoQuery);

            if (condoSnapshot.empty) {
                throw new Error("condo-not-found");
            }

            const condoDoc = condoSnapshot.docs[0];
            const activeCondoId = condoDoc.id;
            const workingCondoId = activeCondoId;

            // 3. Autenticación Firebase
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
            const user = userCredential.user;

            // 4. Buscar perfil en la subcolección del activeCondoId
            const collectionName = role === 'admin' ? 'admins' : 'owners';
            const userRef = doc(db, 'condominios', activeCondoId, collectionName, user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                throw new Error("user-not-found");
            }

            const userData = userSnap.data();

            // REGLA 29-ENE: Validar si el registro está publicado
            if (userData.published === false) {
                throw new Error("unpublished");
            }

            // 5. PERSISTENCIA DE SESIÓN
            localStorage.setItem('activeCondoId', activeCondoId);
            localStorage.setItem('workingCondoId', workingCondoId);
            localStorage.setItem('userRole', role);

            toast({ title: 'Acceso Concedido', description: `Iniciando sesión en EFAS CondoSys...` });

            // Redirección con pequeña pausa para asegurar escritura en Storage
            setTimeout(() => {
                if (role === 'admin') {
                    router.push('/admin/dashboard');
                } else {
                    router.push('/owner/dashboard');
                }
            }, 500);

        } catch (error: any) {
            console.error("Login Error:", error);
            let msg = 'Error de datos. Verifique correo, clave y Key.';
            if (error.message === "condo-not-found") msg = `La Key "${cleanKey}" no existe.`;
            if (error.message === "user-not-found") msg = "No tienes permisos en este condominio.";
            if (error.message === "unpublished") msg = "Tu acceso no está activo actualmente.";
            if (error.code === 'auth/invalid-credential') msg = "Correo o contraseña incorrectos.";
            
            toast({ variant: 'destructive', title: 'Error de Acceso', description: msg });
            setLoading(false);
        }
    };
   
    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-montserrat relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[100px] rounded-full"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/5 blur-[100px] rounded-full"></div>

            <Card className="w-full max-w-sm border-border shadow-2xl rounded-[2.5rem] overflow-hidden bg-card/80 backdrop-blur-xl text-card-foreground relative z-10">
                <CardHeader className="text-center pb-2 pt-8">
                    <img src={SYSTEM_LOGO} alt="Logo" className="w-16 h-16 mx-auto mb-4 rounded-2xl border-2 border-primary/20 p-1" />
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider mb-2 mx-auto border border-primary/20">
                        <AlertCircle className="w-3.5 h-3.5" /> Acceso {role === 'admin' ? 'Administrativo' : 'Propietario'}
                    </div>
                </CardHeader>

                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-5 pt-4 px-8">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Key del Condominio</Label>
                            <div className="relative">
                                <Input 
                                    type="text" 
                                    placeholder="VALLE2026"
                                    className="h-12 rounded-2xl border-border bg-input text-foreground focus-visible:ring-primary pl-10"
                                    value={condoKey}
                                    onChange={(e) => setCondoKey(e.target.value.toUpperCase())}
                                    required={email !== ADMIN_EMAIL}
                                />
                                <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">E-mail</Label>
                            <Input 
                                type="email" 
                                className="h-12 rounded-2xl border-border bg-input focus-visible:ring-primary"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Contraseña</Label>
                            <div className="relative">
                                <Input 
                                    type={showPassword ? "text" : "password"}
                                    className="h-12 rounded-2xl border-border bg-input pr-12"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button 
                                    type="button" 
                                    onClick={() => setShowPassword(!showPassword)} 
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4 pb-10 pt-6 px-8">
                        <Button type="submit" disabled={loading} className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 transition-all">
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Acceder al Sistema'}
                        </Button>
                        <div className="flex justify-between w-full px-1">
                            <Link href="/forgot-password" className="text-[11px] font-bold text-primary hover:underline uppercase tracking-widest">
                                ¿Olvidaste tu clave?
                            </Link>
                            <Link href="/welcome" className="text-[10px] font-black uppercase text-muted-foreground hover:text-amber-500 tracking-widest transition-colors">
                                ← Volver
                            </Link>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}

export default function LoginPageWithSuspense() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <LoginPage />
        </Suspense>
    );
}

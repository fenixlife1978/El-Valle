
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

const ADMIN_EMAIL = 'vallecondo@gmail.com';

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
            console.warn("Logo no cargado por falta de permisos.");
          } finally {
            setLoadingLogo(false);
          }
        }
        fetchLogo();
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
            // --- BYPASS PARA SUPER ADMIN ---
            if (cleanEmail === ADMIN_EMAIL) {
                await signInWithEmailAndPassword(auth, cleanEmail, password);
                toast({ title: 'Bienvenido, Super Admin', description: 'Accediendo al panel maestro...' });
                router.push('/admin/dashboard'); 
                return;
            }

            // --- LÓGICA NORMAL PARA OTROS USUARIOS ---
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

            if (role === 'admin') {
                router.push('/admin/dashboard');
            } else {
                router.push('/dashboard');
            }
            
        } catch (error: any) {
            console.error("Login error:", error);
            let description = 'Error de autenticación. Verifique sus datos.';
            
            if (error.message === "role-mismatch") {
                description = `No tienes permisos de ${role}.`;
            } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'Correo o contraseña incorrectos.';
            } else if (error.code === 'auth/too-many-requests') {
                description = 'Cuenta temporalmente bloqueada por muchos intentos. Intente más tarde.';
            }

            toast({
                variant: 'destructive',
                title: 'Error de Acceso',
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
        <main className="min-h-screen flex flex-col items-center justify-center bg-[#020617] p-4 font-montserrat">
            <div className="mb-8 text-center">
                 <h1 className="text-4xl font-black italic uppercase tracking-tighter">
                    <span className="text-[#f59e0b]">EFAS</span>
                    <span className="text-[#0081c9]">CondoSys</span>
                </h1>
                <p className="text-[9px] text-slate-500 font-bold tracking-[0.4em] uppercase mt-2">Autogestión de Condominios</p>
            </div>

            <Card className="w-full max-w-sm border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-slate-900 text-white">
                <CardHeader className="text-center pb-2 pt-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-[9px] font-black uppercase tracking-wider mb-2 mx-auto">
                        <AlertCircle className="w-3 h-3" /> Acceso {role === 'admin' ? 'Administrativo' : 'Propietario'}
                    </div>
                </CardHeader>

                <form onSubmit={handleLogin} className="p-2">
                    <CardContent className="space-y-4 pt-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">E-mail</Label>
                            <Input 
                                type="email" 
                                className="h-12 rounded-2xl border-slate-800 bg-slate-950 text-white focus-visible:ring-[#0081c9]"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Contraseña</Label>
                            <div className="relative">
                                <Input 
                                    type={showPassword ? "text" : "password"}
                                    className="h-12 rounded-2xl border-slate-800 bg-slate-950 text-white focus-visible:ring-[#0081c9] pr-12"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-3 pb-8 pt-4">
                        <Button type="submit" disabled={loading} className="w-full h-14 bg-[#0081c9] hover:bg-sky-700 text-white rounded-[1.25rem] font-black text-lg shadow-lg shadow-sky-500/20">
                            {loading ? <Loader2 className="animate-spin" /> : 'INICIAR SESIÓN'}
                        </Button>
                        <Link href="/welcome" className="text-[10px] font-black uppercase text-slate-500 hover:text-[#f59e0b] tracking-widest text-center transition-colors">
                            ← Volver al inicio
                        </Link>
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

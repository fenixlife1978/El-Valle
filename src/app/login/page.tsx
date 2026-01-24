'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft } from 'lucide-react';
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
            // --- BYPASS PARA SUPER ADMIN ---
            if (cleanEmail === ADMIN_EMAIL) {
                await signInWithEmailAndPassword(auth, cleanEmail, password);
                toast({ title: 'Acceso Maestro Concedido', description: 'Cargando panel global...' });
                router.push('/admin/dashboard'); 
                return;
            }

            // Lógica de validación de rol y estado del sistema
            const settingsRef = doc(db, 'config', 'mainSettings');
            const settingsSnap = await getDoc(settingsRef);
            
            if (role === 'owner' && settingsSnap.exists()) {
                const settings = settingsSnap.data();
                if (settings.loginSettings && !settings.loginSettings.ownerLoginEnabled) {
                    toast({
                        variant: 'destructive',
                        title: 'Acceso Deshabilitado',
                        description: settings.loginSettings.disabledMessage || 'El acceso para propietarios no está disponible.',
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
            toast({ title: 'Sesión Iniciada', description: 'Bienvenido a EFAS CondoSys.' });
            
        } catch (error: any) {
            console.error("Login error:", error);
            let description = 'Verifique sus credenciales e intente de nuevo.';
            
            if (error.message === "role-mismatch") {
                description = `Esta cuenta no tiene permisos de ${role === 'admin' ? 'Administrador' : 'Propietario'}.`;
            } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'Correo o contraseña incorrectos.';
            }

            toast({
                variant: 'destructive',
                title: 'Error de acceso',
                description: description,
            });
        } finally {
            setLoading(false);
        }
    };

    if (!role) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
        </div>
      );
    }
    
    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 relative overflow-hidden">
            {/* Elementos decorativos de fondo */}
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-amber-100 rounded-full blur-3xl opacity-40" />
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-sky-100 rounded-full blur-3xl opacity-40" />

            <div className="text-center mb-10 relative z-10">
                {authLoading ? (
                    <Skeleton className="w-28 h-28 rounded-3xl mx-auto mb-6" />
                ) : (
                    /* LOGO SUPER GRANDE Y LEGIBLE */
                    <div className="w-28 h-28 rounded-3xl mx-auto overflow-hidden bg-white border shadow-xl flex items-center justify-center p-1 mb-6 transform hover:scale-105 transition-transform duration-300">
                        <img 
                            src={companyInfo?.logo || "/logo-efas.png"} 
                            alt="EFAS Logo" 
                            className="w-full h-full object-contain" 
                        />
                    </div>
                )}
                
                <div className="flex items-center justify-center gap-1.5 text-4xl font-black tracking-tighter">
                    <span className="text-amber-500 drop-shadow-sm">EFAS</span>
                    <span className="text-sky-500">CondoSys</span>
                </div>
                
                <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-white border shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        {companyInfo?.name || 'Gestión Residencial Inteligente'}
                    </span>
                </div>
            </div>
            
            <Card className="w-full max-w-sm shadow-2xl shadow-sky-900/10 border-none relative z-10 overflow-hidden">
                <div className="h-2 w-full bg-gradient-to-r from-amber-400 via-sky-500 to-sky-600" />
                
                <CardHeader className="text-center pb-2 pt-6">
                    <CardTitle className="text-2xl font-bold text-slate-800">Iniciar Sesión</CardTitle>
                    <CardDescription className="font-semibold text-sky-600/80">
                        Acceso para {role === 'admin' ? 'Administradores' : 'Propietarios'}
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="font-bold text-slate-700">Correo Electrónico</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                                <Input 
                                    id="email" 
                                    type="email" 
                                    placeholder="admin@ejemplo.com" 
                                    className="pl-10 h-12 border-slate-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                                    value={email} 
                                    onChange={(e) => setEmail(e.target.value)} 
                                    required 
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password" title="Contraseña" className="font-bold text-slate-700">Contraseña</Label>
                                <Link href="/forgot-password" title="Recuperar contraseña" className="text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline">
                                    ¿Olvidaste tu clave?
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="pl-10 pr-12 h-12 border-slate-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                                    placeholder="••••••••"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 text-slate-400 hover:text-sky-500 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
                                </Button>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4 pb-10 pt-4">
                        <Button 
                            type="submit" 
                            className="w-full h-12 bg-sky-600 hover:bg-sky-700 text-white font-black text-lg rounded-xl shadow-lg shadow-sky-200 transition-all active:scale-95"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Validando...
                                </>
                            ) : 'Entrar al Panel'}
                        </Button>
                        
                        <Button variant="ghost" size="sm" asChild className="text-xs text-slate-400 font-bold hover:text-amber-500 hover:bg-amber-50/50">
                            <Link href="/welcome" className="gap-2">
                                <ArrowLeft className="w-4 h-4" /> Volver a selección de rol
                            </Link>
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            <footer className="mt-12 text-center">
                <div className="flex items-center justify-center gap-1 text-sm font-bold mb-1">
                    <span className="text-amber-600">EFAS</span>
                    <span className="text-sky-600">CondoSys</span>
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-[0.3em] font-black">
                    Tecnología Residencial © {new Date().getFullYear()}
                </p>
            </footer>
        </main>
    );
}

export default function LoginPageWithSuspense() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
                <div className="flex items-center gap-1 font-black text-xl tracking-tighter">
                    <span className="text-amber-500">EFAS</span>
                    <span className="text-sky-500">CondoSys</span>
                </div>
            </div>
        }>
            <LoginPage />
        </Suspense>
    );
}

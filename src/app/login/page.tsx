
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

// Tu correo de Super Admin
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
            // 1. BYPASS SUPER ADMIN
            if (cleanEmail === ADMIN_EMAIL) {
                await signInWithEmailAndPassword(auth, cleanEmail, password);
                localStorage.removeItem('support_condo_id');
                router.push('/super-admin');
                return;
            }
            
            // 2. INICIO DE SESIÓN PRIMERO
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
            const user = userCredential.user;

            // 3. BUSCAR ROL EN COLECCIÓN 'owners' USANDO EL UID
            let userDoc = await getDoc(doc(db, "owners", user.uid));
            let userData = userDoc.exists() ? userDoc.data() : null;

            // Si no aparece por UID, buscamos por correo (como respaldo)
            if (!userData) {
                const q = query(collection(db, "owners"), where("email", "==", cleanEmail));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    userData = querySnapshot.docs[0].data();
                }
            }

            if (!userData) {
                throw new Error("user-not-found");
            }

            // 4. VERIFICACIÓN DE ROL
            const expectedRole = role === 'admin' ? 'administrador' : 'propietario';
            
            if (userData.role?.toLowerCase() !== expectedRole) {
                throw new Error("role-mismatch");
            }

            toast({ title: 'Bienvenido', description: 'Cargando panel de EFAS CondoSys...' });

            if (role === 'admin') {
                router.push('/admin/dashboard');
            } else {
                router.push('/owner/dashboard');
            }

        } catch (error: any) {
            console.error("Login error:", error);
            let description = 'Error de autenticación. Verifique sus datos.';
            
            if (error.message === "role-mismatch") {
                description = `Este correo no está registrado como ${role === 'admin' ? 'Administrador' : 'Propietario'}.`;
            } else if (error.message === "user-not-found") {
                description = 'El correo no existe en nuestra base de datos.';
            } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
                description = 'Correo o contraseña incorrectos.';
            } else if (error.code === 'auth/too-many-requests') {
                description = 'Cuenta temporalmente bloqueada. Intente más tarde.';
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
            <div className="min-h-screen flex items-center justify-center bg-[#020617]">
                <Loader2 className="h-8 w-8 animate-spin text-[#0081c9]" />
            </div>
        );
    }

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-[#020617] p-4 font-montserrat relative overflow-hidden">
            {/* Fondo decorativo */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#0081c9]/10 blur-[100px] rounded-full"></div>

            <div className="mb-8 text-center relative z-10">
                 <h1 className="text-4xl font-black italic uppercase tracking-tighter">
                    <span className="text-[#f59e0b]">EFAS</span>
                    <span className="text-[#0081c9]"> CondoSys</span>
                </h1>
                <p className="text-[9px] text-slate-500 font-black tracking-[0.4em] uppercase mt-2 italic">Autogestión de Condominios</p>
            </div>

            <Card className="w-full max-w-sm border-slate-800 shadow-2xl rounded-[2.5rem] overflow-hidden bg-slate-900/50 backdrop-blur-xl text-white relative z-10">
                <CardHeader className="text-center pb-2 pt-8">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/10 text-sky-400 text-[10px] font-black uppercase tracking-wider mb-2 mx-auto border border-sky-500/20">
                        <AlertCircle className="w-3.5 h-3.5" /> Acceso {role === 'admin' ? 'Administrativo' : 'Propietario'}
                    </div>
                </CardHeader>

                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-5 pt-4 px-8">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">E-mail Corporativo</Label>
                            <Input 
                                type="email" 
                                className="h-12 rounded-2xl border-slate-700 bg-slate-950/50 text-white focus-visible:ring-[#0081c9] transition-all"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Contraseña</Label>
                            <div className="relative">
                                <Input 
                                    type={showPassword ? "text" : "password"}
                                    className="h-12 rounded-2xl border-slate-700 bg-slate-950/50 text-white focus-visible:ring-[#0081c9] pr-12 transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4 pb-10 pt-6 px-8">
                        <Button type="submit" disabled={loading} className="w-full h-14 bg-[#0081c9] hover:bg-sky-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-sky-900/20 transition-all">
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Acceder al Sistema'}
                        </Button>
                        <div className="flex justify-between w-full">
                            <Link href="/forgot-password" className="text-[10px] font-black uppercase text-slate-500 hover:text-[#f59e0b] tracking-[0.2em] text-center transition-colors">
                                ¿Olvidaste tu clave?
                            </Link>
                            <Link href="/welcome" className="text-[10px] font-black uppercase text-slate-500 hover:text-[#f59e0b] tracking-[0.2em] text-center transition-colors">
                                ← Volver al Portal
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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#020617]"><Loader2 className="h-8 w-8 animate-spin text-[#0081c9]" /></div>}>
            <LoginPage />
        </Suspense>
    )
}

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
import { doc, getDoc } from 'firebase/firestore';
import { useGatekeeper } from '@/hooks/use-gatekeeper';
import Link from 'next/link';

function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { verifyAccess } = useGatekeeper();

    const roleParam = searchParams?.get('role') || null;
    const isValidRole = roleParam === 'admin' || roleParam === 'owner';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!isValidRole) {
            const timer = setTimeout(() => {
                const currentParams = new URLSearchParams(window.location.search);
                const currentRole = currentParams.get('role');
                if (currentRole !== 'admin' && currentRole !== 'owner') {
                    router.replace('/welcome');
                }
            }, 1000); 
            return () => clearTimeout(timer);
        }
    }, [isValidRole, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValidRole) return;

        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            const user = userCredential.user;

            if (user.email === 'vallecondo@gmail.com') {
                toast({ title: 'Modo Super Admin' });
                router.push('/super-admin');
                return;
            }

            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) throw new Error('Perfil no encontrado.');

            const userData = userDoc.data();
            const condoId = userData?.condominioId;

            if (condoId) {
                const isAllowed = await verifyAccess(condoId);
                if (!isAllowed) return;
            }

            toast({ title: 'Éxito', description: 'Iniciando sesión...' });
            router.push(roleParam === 'admin' ? '/admin/dashboard' : '/owner/dashboard');

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error de Acceso',
                description: 'Verifique sus credenciales.',
            });
        } finally {
            setLoading(false);
        }
    };

    if (!isValidRole) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-[#0081c9]" />
                <p className="text-[10px] font-black uppercase text-slate-500 italic tracking-[0.3em]">Verificando Acceso...</p>
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
                        <AlertCircle className="w-3 h-3" /> Acceso {roleParam === 'admin' ? 'Administrativo' : 'Propietario'}
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

export default function LoginPageWithSuspense() {
    return <Suspense fallback={null}><LoginPage /></Suspense>;
}

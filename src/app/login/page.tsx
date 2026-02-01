
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, AlertCircle, Home } from 'lucide-react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
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
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            const user = userCredential.user;
    
        // Caso Super Admin
        if (email.toLowerCase() === 'vallecondo@gmail.com') {
            localStorage.setItem('userRole', 'super-admin');
            window.location.href = '/super-admin';
            return;
        }

        // Buscar el condominio por Key
        const condoQuery = query(collection(db, "condominios"), where("registrationKey", "==", condoKey.trim().toUpperCase()), limit(1));
        const condoSnap = await getDocs(condoQuery);
        if (condoSnap.empty) throw new Error("Key inválida");
        const condoId = condoSnap.docs[0].id;

        // Guardar TODO antes de movernos
        localStorage.setItem('activeCondoId', condoId);
        localStorage.setItem('workingCondoId', condoId);
        localStorage.setItem('userRole', role!); // 'admin' o 'owner'

        // EL TRUCO: window.location.href limpia cualquier rastro de estados anteriores
        const dest = role === 'admin' ? '/admin/dashboard' : '/owner/dashboard';
        window.location.href = dest;

    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Error', description: err.message });
        setLoading(false);
    }
    };
   
    // ... resto del componente visual igual (Card, Inputs, etc.)
    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-montserrat relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[100px] rounded-full"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/5 blur-[100px] rounded-full"></div>

            <Card className="w-full max-w-sm border-border shadow-2xl rounded-[2.5rem] overflow-hidden bg-card/80 backdrop-blur-xl relative z-10">
                <CardHeader className="text-center pb-2 pt-8">
                    <img src={SYSTEM_LOGO} alt="EFAS CondoSys" className="w-16 h-16 mx-auto mb-4 rounded-2xl border-2 border-primary/20 p-1" />
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider mb-2 mx-auto border border-primary/20">
                        <AlertCircle className="w-3.5 h-3.5" /> Portal {role === 'admin' ? 'Administrativo' : 'Propietario'}
                    </div>
                </CardHeader>

                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-5 pt-4 px-8">
                        <div className={`space-y-2 transition-opacity ${email === ADMIN_EMAIL ? 'opacity-50' : 'opacity-100'}`}>
                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Key del Condominio</Label>
                            <div className="relative">
                                <Input 
                                    type="text" 
                                    placeholder="VALLE2026"
                                    className="h-12 rounded-2xl border-border bg-input text-foreground focus-visible:ring-primary pl-10"
                                    value={condoKey}
                                    disabled={email === ADMIN_EMAIL || loading}
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
                                placeholder="ejemplo@correo.com"
                                className="h-12 rounded-2xl border-border bg-input focus-visible:ring-primary"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Contraseña</Label>
                            <div className="relative">
                                <Input 
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    className="h-12 rounded-2xl border-border bg-input pr-12"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    required
                                />
                                <button 
                                    type="button" 
                                    onClick={() => setShowPassword(!showPassword)} 
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4 pb-10 pt-6 px-8">
                        <Button type="submit" disabled={loading} className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg transition-all">
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Acceder al Sistema'}
                        </Button>
                        <div className="flex justify-between w-full px-1">
                            <Link 
                                href={loading ? "#" : "/forgot-password"} 
                                className={`text-[11px] font-bold text-primary hover:underline uppercase tracking-widest ${
                                    loading ? 'pointer-events-none opacity-50' : ''
                                }`}
                            >
                                ¿Olvidaste tu clave?
                            </Link>
                            <Link href="/welcome" className={`text-[10px] font-black uppercase text-muted-foreground hover:text-amber-500 tracking-widest transition-colors ${loading ? 'pointer-events-none opacity-50' : ''}`}>
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

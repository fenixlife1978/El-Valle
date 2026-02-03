'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, AlertCircle, Home } from 'lucide-react';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
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
        const roleParam = searchParams?.get('role');
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
            // 1. Forzar persistencia local en Firebase
            await setPersistence(auth, browserLocalPersistence);

            // 2. Caso Super Admin
            if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
                await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
                localStorage.setItem('userRole', 'super-admin');
                window.location.href = '/super-admin';
                return;
            }

            if (!condoKey) throw new Error("Debes ingresar la Key de tu condominio");

            // 3. Obtener el CondoID (Necesario para la ruta dinámica)
            const condoQuery = query(
                collection(db, "condominios"), 
                where("registrationKey", "==", condoKey.trim().toUpperCase()), 
                limit(1)
            );
            const condoSnap = await getDocs(condoQuery);
            if (condoSnap.empty) throw new Error("La Key ingresada no es válida.");
            const activeCondoId = condoSnap.docs[0].id;

            // 4. Autenticar
            const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            const userId = userCredential.user.uid;

            // 5. Guardar IDs en LocalStorage (Reglas de EFAS CondoSys)
            localStorage.setItem('activeCondoId', activeCondoId);
            localStorage.setItem('workingCondoId', activeCondoId);
            localStorage.setItem('userRole', role!);

            // 6. Verificación de ruta (Retrocompatibilidad para condo_01)
            const collectionName = activeCondoId === 'condo_01' ? 'owners' : 'propietarios';
            const userDocRef = doc(db, 'condominios', activeCondoId, collectionName, userId);
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                // Si no existe el documento, el usuario no pertenece a este condominio
                localStorage.clear(); 
                await auth.signOut();
                throw new Error(`Usuario no registrado en este condominio.`);
            }

            // 7. Salto Directo a la URL (Evita que el componente de Auth reaccione tarde)
            const targetPath = role === 'admin' 
                ? `/${activeCondoId}/admin/dashboard` 
                : `/${activeCondoId}/owner/dashboard`;

            toast({ title: "Acceso Exitoso", description: "Redirigiendo..." });

            // Usamos href para asegurar que la app cargue desde cero con los nuevos IDs
            window.location.href = targetPath;

        } catch (err: any) {
            console.error("Login Error:", err);
            setLoading(false);
            toast({ 
                variant: 'destructive', 
                title: 'Error de Acceso', 
                description: err.message || "Error al iniciar sesión" 
            });
        }
    };

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative font-montserrat">
            <Card className="w-full max-w-sm border-border shadow-2xl rounded-[2.5rem] bg-card/80 backdrop-blur-xl z-10 overflow-hidden">
                <CardHeader className="text-center pb-2 pt-8">
                    <img src={SYSTEM_LOGO} alt="EFAS" className="w-16 h-16 mx-auto mb-4 rounded-2xl object-cover border-2 border-primary/20 p-1" />
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase mx-auto border border-primary/20">
                        Portal {role === 'admin' ? 'Administrativo' : 'Propietario'}
                    </div>
                </CardHeader>

                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4 px-8 pt-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Key del Condominio</Label>
                            <div className="relative">
                                <Input 
                                    type="text" 
                                    className="h-12 rounded-2xl pl-10 uppercase font-bold"
                                    value={condoKey}
                                    onChange={(e) => setCondoKey(e.target.value)}
                                    placeholder="VALLE2026"
                                    required={email.toLowerCase() !== ADMIN_EMAIL}
                                />
                                <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">E-mail</Label>
                            <Input type="email" className="h-12 rounded-2xl font-bold" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Contraseña</Label>
                            <div className="relative">
                                <Input 
                                    type={showPassword ? "text" : "password"}
                                    className="h-12 rounded-2xl font-bold pr-12"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4 pb-10 pt-6 px-8">
                        <Button type="submit" disabled={loading} className="w-full h-14 rounded-2xl font-black uppercase tracking-widest">
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Acceder'}
                        </Button>
                        <Link href="/welcome" className="text-[10px] font-black uppercase text-muted-foreground hover:text-primary transition-colors text-center">← Volver</Link>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}

export default function LoginPageWithSuspense() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
            <LoginPage />
        </Suspense>
    );
}

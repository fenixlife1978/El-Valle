
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building, User } from 'lucide-react';
import Link from 'next/link';

type CompanyInfo = {
    name: string;
    logo: string;
};

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    const role = searchParams.get('role') || 'owner';

    useEffect(() => {
        const fetchCompanyInfo = async () => {
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
                }
            } catch (error) {
                console.error("Error fetching company info:", error);
            }
        };
        fetchCompanyInfo();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user) {
                const userDocRef = doc(db, "owners", user.uid);
                const userDoc = await getDoc(userDocRef);

                if (!userDoc.exists()) {
                    toast({ variant: "destructive", title: "Error", description: "Perfil de usuario no encontrado en la base de datos." });
                    setLoading(false);
                    return;
                }
                
                const userData = userDoc.data();
                const sessionData = { 
                    uid: user.uid, 
                    role: userData.role, 
                    email: user.email, 
                    mustChangePass: userData.mustChangePass || false
                };
                
                localStorage.setItem('user-session', JSON.stringify(sessionData));

                if (userData.mustChangePass) {
                    router.push('/change-password');
                } else {
                    if (userData.role === 'administrador') {
                        router.push('/admin/dashboard');
                    } else {
                        router.push('/owner/dashboard');
                    }
                }
            }
        } catch (error: any) {
            console.error("Login error:", error);
            let description = "Ocurrió un error inesperado.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = "Correo electrónico o contraseña incorrectos.";
            }
            toast({
                variant: "destructive",
                title: "Error de Autenticación",
                description: description,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <div className="mx-auto bg-primary/10 rounded-full p-3 w-16 h-16 flex items-center justify-center border-2 border-primary">
                    {companyInfo?.logo ? <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-cover rounded-full"/> : <Building className="w-8 h-8 text-primary" />}
                </div>
                <CardTitle className="text-3xl font-bold font-headline mt-4">
                    {companyInfo?.name || 'CondoConnect'}
                </CardTitle>
                <CardDescription>
                    {role === 'admin' ? 'Acceso para Administradores' : 'Acceso para Propietarios'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Correo Electrónico</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="tu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Contraseña</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>
                    <div className="pt-2">
                        <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <User className="mr-2 h-5 w-5" />}
                            Ingresar
                        </Button>
                    </div>
                </form>
            </CardContent>
            <CardFooter className="flex flex-col items-center p-4 gap-2">
                 <Button variant="link" asChild>
                    <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
                </Button>
                 <Button variant="link" asChild>
                    <Link href="/">Volver a la selección de rol</Link>
                </Button>
            </CardFooter>
        </Card>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
            <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin" />}>
                <LoginContent />
            </Suspense>
        </div>
    );
}

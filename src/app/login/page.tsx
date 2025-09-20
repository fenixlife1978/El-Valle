
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px" {...props}>
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.223,0-9.657-3.356-11.303-8H4.694v8.192C8.214,40.63,15.553,44,24,44z" />
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.022,36.219,44,30.561,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </svg>
);


function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const auth = getAuth();

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

            const userDocRef = doc(db, 'owners', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                throw new Error("Perfil no encontrado en la base de datos.");
            }
            
            const userData = userDocSnap.data();

            if (role === 'owner' && password === '123456') {
                 router.push('/change-password');
                 return;
            }

            if (userData.role === 'administrador') {
                router.push('/admin/dashboard');
            } else {
                router.push('/owner/dashboard');
            }
        } catch (error: any) {
            let description = "Ocurrió un error al iniciar sesión.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = "Correo o contraseña incorrectos.";
            } else if (error.message === "Perfil no encontrado en la base de datos.") {
                description = error.message;
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

    const handleGoogleSignIn = async () => {
        setLoading(true);
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const userDocRef = doc(db, 'owners', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                if (userData.role === 'administrador') {
                    router.push('/admin/dashboard');
                } else {
                    router.push('/owner/dashboard');
                }
            } else {
                // If user does not exist, create a new 'owner' profile
                const newUserProfile = {
                    name: user.displayName || 'Propietario',
                    email: user.email,
                    role: 'propietario',
                    properties: [],
                    balance: 0,
                    avatar: user.photoURL || '',
                };
                await setDoc(userDocRef, newUserProfile);
                router.push('/owner/dashboard');
            }
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Error de Inicio de Sesión',
                description: 'No se pudo iniciar sesión con Google. Por favor, intenta de nuevo.',
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
                 <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                            O ingresa con
                        </span>
                    </div>
                </div>
                 <Button variant="outline" className="w-full h-12 text-lg" onClick={handleGoogleSignIn} disabled={loading}>
                    <GoogleIcon className="mr-2" />
                    Ingresar con Google
                </Button>
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


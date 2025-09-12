
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
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

function LoginPageContent() {
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
            const auth = getAuth();
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user) {
                const userDocRef = doc(db, 'owners', user.uid);
                let userDocSnap = await getDoc(userDocRef);

                if (!userDocSnap.exists() && email === 'vallecondo@gmail.com') {
                    toast({
                        title: 'Perfil no encontrado',
                        description: 'Creando perfil de administrador por primera vez...',
                    });
                    const adminData = {
                        name: 'EDWIN AGUIAR',
                        email: 'vallecondo@gmail.com',
                        role: 'administrador',
                        properties: [{ street: 'N/A', house: 'N/A' }],
                        balance: 0,
                    };
                    await setDoc(userDocRef, adminData);
                    userDocSnap = await getDoc(userDocRef);
                }


                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    
                    if (userData.role === 'administrador') {
                        router.push('/admin/dashboard');
                        return;
                    }

                    if (userData.role !== role) {
                        toast({ variant: 'destructive', title: 'Error de Rol', description: `No tienes permisos para acceder como ${role}.` });
                        setLoading(false);
                        return;
                    }

                    if (userData.role === 'propietario' && password === '123456') {
                        router.push('/change-password');
                    } else {
                        router.push('/owner/dashboard');
                    }
                } else {
                    toast({ variant: 'destructive', title: 'Error', description: 'No se encontró tu perfil en la base de datos.' });
                }
            }
        } catch (error: any) {
            console.error("Firebase Auth Error:", error);
            let description = 'Ocurrió un error inesperado. Por favor, intenta de nuevo.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El correo electrónico o la contraseña que ingresaste son incorrectos. Por favor, inténtalo de nuevo.';
            }
            toast({
                variant: 'destructive',
                title: 'Error de Inicio de Sesión',
                description: description,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
             <Card className="w-full max-w-md shadow-2xl">
                <CardHeader className="text-center bg-primary text-primary-foreground p-8 rounded-t-lg">
                    <div className="mx-auto bg-white/20 rounded-full p-4 w-24 h-24 flex items-center justify-center">
                         {role === 'admin' ? <Building className="mx-auto h-12 w-12"/> : <User className="mx-auto h-12 w-12"/>}
                    </div>
                    <CardTitle className="mt-4 text-3xl font-bold font-headline">
                        {role === 'admin' ? 'Administrador' : 'Propietario'}
                    </CardTitle>
                    <CardDescription className="text-primary-foreground/80">
                        Ingresa tus credenciales para acceder a tu panel.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-8">
                    <form onSubmit={handleLogin} className="space-y-6">
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
                                className="h-12"
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
                                className="h-12"
                            />
                        </div>
                        <Button type="submit" className="w-full h-12 rounded-full text-base font-bold" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {loading ? 'Ingresando...' : 'Ingresar'}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-center p-4">
                    <Button variant="link" asChild>
                        <Link href="/">Volver a la selección de rol</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}


export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

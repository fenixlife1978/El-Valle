
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, setDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
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
                let userDocRef = doc(db, "owners", user.uid);
                let userDoc = await getDoc(userDocRef);
                let userData;

                if (!userDoc.exists()) {
                    // Self-healing logic: If doc with UID doesn't exist, try to find by email
                    toast({ title: "Sincronizando perfil...", description: "Un momento, estamos actualizando su cuenta." });
                    const q = query(collection(db, "owners"), where("email", "==", user.email));
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        const oldDoc = querySnapshot.docs[0];
                        userData = oldDoc.data();
                        
                        await setDoc(userDocRef, userData);
                        
                        userDoc = await getDoc(userDocRef); 
                        toast({ title: "¡Perfil Sincronizado!", description: "Su cuenta ha sido actualizada. Bienvenido.", className: 'bg-green-100 border-green-400 text-green-800' });
                    } else {
                        // No profile found at all, create a new one.
                        userData = {
                            name: user.email?.split('@')[0] || 'Nuevo Propietario',
                            email: user.email,
                            role: 'propietario',
                            balance: 0,
                            mustChangePass: true, 
                            properties: [{ street: 'N/A', house: 'N/A' }],
                        };
                        await setDoc(userDocRef, userData);
                        userDoc = await getDoc(userDocRef); 
                        toast({ title: "¡Bienvenido!", description: "Hemos creado un perfil para usted.", className: 'bg-green-100 border-green-400 text-green-800' });
                    }
                }
                
                userData = userDoc.data();

                if (!userData) {
                     toast({ variant: "destructive", title: "Error Crítico", description: "No se pudo cargar el perfil de usuario después de la sincronización." });
                     setLoading(false);
                     return;
                }
                
                 const sessionData = {
                    uid: user.uid,
                    role: userData.role,
                    name: userData.name
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

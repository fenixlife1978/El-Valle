'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { db, app } from '@/lib/firebase';
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
    const auth = getAuth(app);

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

        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, ingrese su correo y contraseña.' });
            setLoading(false);
            return;
        }

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user) {
                const userDocRef = doc(db, 'owners', user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (!userDocSnap.exists()) {
                     // Check if a profile exists with this email but different ID (sync issue)
                    const q = query(collection(db, "owners"), where("email", "==", user.email));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        const oldDoc = querySnapshot.docs[0];
                        // This case is complex, ideally handled by a backend function
                        // to avoid security issues. For now, we'll deny login.
                        await signOut(auth);
                        toast({ variant: 'destructive', title: 'Error de Sincronización', description: 'Contacte al administrador para sincronizar su cuenta.' });
                        setLoading(false);
                        return;
                    }
                    toast({ variant: 'destructive', title: 'Perfil No Encontrado', description: 'No se encontró un perfil en la base de datos para este usuario.' });
                    await signOut(auth);
                    setLoading(false);
                    return;
                }

                const userData = userDocSnap.data();
                const sessionData = {
                    uid: user.uid,
                    role: userData.role,
                    name: userData.name,
                    passwordChanged: userData.passwordChanged,
                };
                localStorage.setItem('user-session', JSON.stringify(sessionData));

                toast({ title: '¡Bienvenido!', description: `Has iniciado sesión como ${userData.role}.`, className: 'bg-green-100 border-green-400 text-green-800' });

                if (userData.role === 'administrador') {
                    router.push('/admin/dashboard');
                } else {
                    if (userData.passwordChanged === false) {
                        router.push('/owner/change-password');
                    } else {
                        router.push('/owner/dashboard');
                    }
                }
            }
        } catch (error: any) {
            console.error("Login error:", error);
            let description = "Ocurrió un error al intentar iniciar sesión.";
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                description = "Correo electrónico o contraseña incorrectos.";
            }
            toast({
                variant: "destructive",
                title: "Error de Autenticación",
                description,
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

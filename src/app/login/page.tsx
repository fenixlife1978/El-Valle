
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
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

        // Admin login
        if (email.toLowerCase() === 'vallecondo@gmail.com') {
            if (password === 'M110710.m') {
                const adminQuery = query(collection(db, "owners"), where("email", "==", email.toLowerCase()));
                const querySnapshot = await getDocs(adminQuery);
                if (querySnapshot.empty) {
                    toast({ variant: "destructive", title: "Error", description: "Perfil de administrador no encontrado en la base de datos." });
                    setLoading(false);
                    return;
                }
                const adminDoc = querySnapshot.docs[0];
                localStorage.setItem('user-session', JSON.stringify({ uid: adminDoc.id, role: 'administrador', email: adminDoc.data().email }));
                router.push('/admin/dashboard');
            } else {
                toast({ variant: "destructive", title: "Error de Autenticación", description: "Contraseña incorrecta para el administrador." });
                setLoading(false);
            }
            return;
        }

        // Owner login
        try {
            const ownerQuery = query(collection(db, "owners"), where("email", "==", email.toLowerCase()));
            const querySnapshot = await getDocs(ownerQuery);

            if (querySnapshot.empty) {
                 toast({ variant: "destructive", title: "Error de Autenticación", description: "Propietario no encontrado." });
                 setLoading(false);
                 return;
            }

            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();

            if (password === '123456') {
                 localStorage.setItem('user-session', JSON.stringify({ uid: userDoc.id, role: 'propietario', email: userData.email, mustChangePass: true }));
                 router.push('/change-password');
            } else {
                // This is a simplified check. Without server-side auth, we can't securely verify passwords.
                // For this simulation, we'll assume any other password is "correct" if the user exists.
                // In a real app, this is highly insecure.
                localStorage.setItem('user-session', JSON.stringify({ uid: userDoc.id, role: 'propietario', email: userData.email }));
                router.push('/owner/dashboard');
            }

        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error Inesperado",
                description: "Ocurrió un error al intentar iniciar sesión.",
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
                 <p className="text-sm text-muted-foreground">¿Problemas para ingresar?</p>
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

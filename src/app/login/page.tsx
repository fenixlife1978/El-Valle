
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

        if (!email) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, ingrese su correo electrónico.' });
            setLoading(false);
            return;
        }

        try {
            const q = query(collection(db, "owners"), where("email", "==", email));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                toast({
                    variant: "destructive",
                    title: "Usuario No Encontrado",
                    description: "El correo electrónico no está registrado en el sistema.",
                });
                setLoading(false);
                return;
            }
            
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();

            const sessionData = {
                uid: userDoc.id,
                role: userData.role,
                name: userData.name
            };
            localStorage.setItem('user-session', JSON.stringify(sessionData));

            toast({ title: '¡Bienvenido!', description: `Has iniciado sesión como ${userData.role}.`, className: 'bg-green-100 border-green-400 text-green-800' });

            if (userData.role === 'administrador') {
                router.push('/admin/dashboard');
            } else {
                router.push('/owner/dashboard');
            }

        } catch (error: any) {
            console.error("Login error:", error);
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

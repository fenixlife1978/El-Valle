'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, User, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';

export default function WelcomePage() {
    const router = useRouter();
    const { user, ownerData, loading } = useAuth();

    // EFAS CondoSys: Si el usuario ya está logueado, enviarlo a su sitio directamente
    useEffect(() => {
        if (!loading && user) {
            const role = localStorage.getItem('userRole');
            const condoId = localStorage.getItem('activeCondoId');

            if (user.email === 'vallecondo@gmail.com') {
                router.replace('/super-admin');
            } else if (condoId && role) {
                router.replace(`/${condoId}/${role}/dashboard`);
            }
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-montserrat">
            <div className="text-center mb-8">
                <div className="mb-6">
                    <h1 className="text-5xl font-black italic tracking-tighter uppercase">
                        <span className="text-primary">EFAS</span><span className="text-foreground">CONDOSYS</span>
                    </h1>
                    <p className="text-sm text-muted-foreground font-bold tracking-wider mt-2 uppercase">
                        Autogestión de Condominios
                    </p>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Bienvenido</h2>
                <p className="text-muted-foreground mt-2">Seleccione su tipo de acceso para continuar.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                {/* CARD ADMINISTRADOR */}
                <Card className="hover:border-primary transition-all border-2 border-transparent bg-card/50 backdrop-blur-sm rounded-[2rem] overflow-hidden shadow-xl">
                    <CardHeader className="items-center text-center">
                        <div className="p-4 bg-primary/10 rounded-2xl mb-2">
                            <Shield className="h-10 w-10 text-primary" />
                        </div>
                        <CardTitle className="font-black uppercase tracking-tight">Administrador</CardTitle>
                        <CardDescription className="font-medium">Gestión administrativa y configuración.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button 
                            className="w-full h-12 rounded-xl font-bold uppercase tracking-wider" 
                            onClick={() => router.push('/login?role=admin')}
                        >
                            Entrar como Administrador
                        </Button>
                    </CardContent>
                </Card>

                {/* CARD PROPIETARIO */}
                <Card className="hover:border-primary transition-all border-2 border-transparent bg-card/50 backdrop-blur-sm rounded-[2rem] overflow-hidden shadow-xl">
                    <CardHeader className="items-center text-center">
                        <div className="p-4 bg-primary/10 rounded-2xl mb-2">
                            <User className="h-10 w-10 text-primary" />
                        </div>
                        <CardTitle className="font-black uppercase tracking-tight">Propietario</CardTitle>
                        <CardDescription className="font-medium">Pagos, deudas y estado de cuenta.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button 
                            className="w-full h-12 rounded-xl font-bold uppercase tracking-wider" 
                            variant="secondary"
                            onClick={() => router.push('/login?role=owner')}
                        >
                            Entrar como Propietario
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}

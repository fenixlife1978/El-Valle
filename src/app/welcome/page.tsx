
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, User } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import { useGatekeeper } from '@/hooks/use-gatekeeper';


export default function WelcomePage() {
    const router = useRouter();
    const { ownerData, loading } = useAuth();
    const { verifyAccess } = useGatekeeper();

    useEffect(() => {
        if (!loading && ownerData?.condominioId) {
            verifyAccess(ownerData.condominioId);
        }
    }, [loading, ownerData, verifyAccess]);

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <div className="text-center mb-8">
                <div className="w-24 h-24 rounded-full mx-auto overflow-hidden bg-card border flex items-center justify-center mb-4">
                     <img src="/efas-condosys-logo.png" alt="EFAS Logo" className="w-16 h-16 object-contain" />
                </div>
                <h1 className="text-4xl font-black italic uppercase tracking-tighter">
                    Bienvenido a <span className="text-orange-500">EFAS</span><span className="text-slate-800 dark:text-slate-100">CondoSys</span>
                </h1>
                <p className="text-muted-foreground mt-2">Seleccione su tipo de acceso para continuar.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                <Card className="hover:border-primary transition-all">
                    <CardHeader className="items-center text-center">
                        <Shield className="h-12 w-12 text-primary mb-4" />
                        <CardTitle>Administrador</CardTitle>
                        <CardDescription>Acceso al panel de gestión y configuración del condominio.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button className="w-full" onClick={() => router.push('/login?role=admin')}>
                            Entrar como Administrador
                        </Button>
                    </CardContent>
                </Card>
                <Card className="hover:border-primary transition-all">
                    <CardHeader className="items-center text-center">
                        <User className="h-12 w-12 text-primary mb-4" />
                        <CardTitle>Propietario</CardTitle>
                        <CardDescription>Consulte sus deudas, pagos y estado de cuenta.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button className="w-full" onClick={() => router.push('/login?role=owner')}>
                            Entrar como Propietario
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}

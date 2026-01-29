
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, User } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import { useGatekeeper } from '@/hooks/use-gatekeeper';
import { SYSTEM_LOGO } from '@/lib/constants';


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
                <img src={SYSTEM_LOGO} alt="EFAS CondoSys Logo" className="w-64 mx-auto mb-6" />
                <h1 className="text-2xl font-bold text-foreground">Bienvenido</h1>
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

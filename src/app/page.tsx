
'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, User, Shield } from 'lucide-react';

export default function WelcomePage() {
    const router = useRouter();

    const handleRoleSelection = (role: 'propietario' | 'administrador') => {
        router.push(`/login?role=${role}`);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-body">
            <div className="text-center mb-10">
                <h1 className="text-4xl font-bold font-headline text-primary">Condo<span className="text-foreground">Connect</span></h1>
                <p className="text-lg text-muted-foreground mt-2">Ingresa a tu cuenta de condominio</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
                <Card 
                    className="cursor-pointer hover:border-primary hover:shadow-lg transition-all transform hover:-translate-y-1"
                    onClick={() => handleRoleSelection('propietario')}
                >
                    <CardHeader>
                        <CardTitle className="flex flex-col items-center gap-4 text-2xl font-headline">
                            <Building className="w-16 h-16 text-primary" />
                            Soy Propietario
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-muted-foreground">
                        <p>Accede a tu estado de cuenta, reporta pagos y mantente al día con las novedades de la comunidad.</p>
                    </CardContent>
                </Card>
                <Card 
                    className="cursor-pointer hover:border-primary hover:shadow-lg transition-all transform hover:-translate-y-1"
                    onClick={() => handleRoleSelection('administrador')}
                >
                    <CardHeader>
                        <CardTitle className="flex flex-col items-center gap-4 text-2xl font-headline">
                            <div className="relative w-16 h-16">
                                <User className="absolute w-12 h-12 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
                                <Shield className="absolute w-16 h-16 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary opacity-40" />
                            </div>
                            Soy Administrador
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-muted-foreground">
                        <p>Gestiona pagos, deudas, propietarios y configuraciones del sistema desde el panel de control.</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

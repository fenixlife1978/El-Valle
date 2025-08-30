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
            <div className="text-center mb-12">
                <h1 className="text-5xl font-bold text-primary font-headline">CondoConnect</h1>
                <p className="text-muted-foreground mt-2 text-lg">Ingresa a tu cuenta de condominio</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
                <Card 
                    className="cursor-pointer hover:border-primary transition-all duration-300 transform hover:scale-105"
                    onClick={() => handleRoleSelection('propietario')}
                >
                    <CardHeader className="items-center text-center">
                        <Building className="w-16 h-16 text-primary mb-4" />
                        <CardTitle className="text-2xl font-bold">Soy Propietario</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-muted-foreground">
                        <p>Accede a tu estado de cuenta, realiza pagos y mantente informado.</p>
                    </CardContent>
                </Card>
                <Card 
                    className="cursor-pointer hover:border-primary transition-all duration-300 transform hover:scale-105"
                    onClick={() => handleRoleSelection('administrador')}
                >
                    <CardHeader className="items-center text-center">
                        <div className="relative w-16 h-16 mb-4 text-primary">
                          <User className="absolute w-14 h-14 top-1 left-1" />
                          <Shield className="absolute w-16 h-16 opacity-40" />
                        </div>
                        <CardTitle className="text-2xl font-bold">Soy Administrador</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-muted-foreground">
                        <p>Gestiona la comunidad, verifica pagos y genera reportes.</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

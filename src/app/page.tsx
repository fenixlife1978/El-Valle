
'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, User } from 'lucide-react';

export default function WelcomePage() {
    const router = useRouter();

    const handleRoleSelection = (role: 'owner' | 'admin') => {
        router.push(`/login?role=${role}`);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-body">
            <div className="text-center mb-12">
                <h1 className="text-5xl font-bold text-primary font-headline">Condo<span className="text-foreground">Connect</span></h1>
                <p className="text-muted-foreground mt-2 text-lg">Tu plataforma de gestión de condominios.</p>
            </div>
            <div className="w-full max-w-3xl">
                 <Card>
                    <CardHeader>
                        <CardTitle>¿Cómo deseas ingresar?</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card 
                            className="p-6 text-center hover:border-primary cursor-pointer"
                            onClick={() => handleRoleSelection('owner')}
                        >
                            <User className="mx-auto h-16 w-16 text-primary mb-4"/>
                            <h3 className="text-xl font-semibold font-headline">Soy Propietario</h3>
                            <p className="text-sm text-muted-foreground mt-1">Accede a tu cuenta y gestiona tus propiedades y pagos.</p>
                        </Card>
                        <Card 
                             className="p-6 text-center hover:border-primary cursor-pointer"
                            onClick={() => handleRoleSelection('admin')}
                        >
                            <Building className="mx-auto h-16 w-16 text-primary mb-4"/>
                            <h3 className="text-xl font-semibold font-headline">Soy Administrador</h3>
                            <p className="text-sm text-muted-foreground mt-1">Administra el condominio, gestiona pagos y más.</p>
                        </Card>
                    </CardContent>
                </Card>
            </div>
             <footer className="absolute bottom-6 text-center text-xs text-muted-foreground">
                <p>© {new Date().getFullYear()} CondoConnect. Todos los derechos reservados.</p>
            </footer>
        </div>
    );
}

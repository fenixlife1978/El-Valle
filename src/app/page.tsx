'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, User } from 'lucide-react';
import Image from 'next/image';

export default function WelcomePage() {
    const router = useRouter();

    const handleRoleSelection = (role: 'admin' | 'owner') => {
        router.push(`/login?role=${role}`);
    };

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
             <div className="mb-8">
                <Image src="/logo.png" alt="CondoConnect Logo" width={100} height={100} data-ai-hint="logo for a condo app"/>
                <h1 className="text-4xl font-bold text-primary font-headline mt-4">CondoConnect</h1>
                <p className="text-muted-foreground">Tu comunidad, conectada.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl w-full">
                <Card 
                    className="cursor-pointer hover:shadow-2xl hover:border-primary transition-all duration-300 transform hover:-translate-y-1"
                    onClick={() => handleRoleSelection('admin')}
                >
                    <CardHeader className="items-center text-center">
                        <div className="p-4 bg-primary/10 rounded-full mb-4">
                            <Shield className="h-10 w-10 text-primary" />
                        </div>
                        <CardTitle className="text-2xl font-headline">Administrador</CardTitle>
                        <CardDescription>Acceso al panel de gestión, finanzas y reportes.</CardDescription>
                    </CardHeader>
                </Card>

                <Card 
                    className="cursor-pointer hover:shadow-2xl hover:border-primary transition-all duration-300 transform hover:-translate-y-1"
                    onClick={() => handleRoleSelection('owner')}
                >
                    <CardHeader className="items-center text-center">
                        <div className="p-4 bg-primary/10 rounded-full mb-4">
                            <User className="h-10 w-10 text-primary" />
                        </div>
                        <CardTitle className="text-2xl font-headline">Propietario</CardTitle>
                        <CardDescription>Consulta de deudas, historial de pagos y más.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
             <p className="text-xs text-muted-foreground mt-12">© {new Date().getFullYear()} CondoConnect. Todos los derechos reservados.</p>
        </main>
    );
}

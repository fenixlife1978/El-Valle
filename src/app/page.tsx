'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, User, UserPlus, LogIn } from 'lucide-react';
import Image from 'next/image';

export default function WelcomePage() {
    const router = useRouter();

    const handleNavigation = (path: string) => {
        router.push(path);
    };

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
             <div className="mb-8">
                <Image src="/logo.png" alt="CondoConnect Logo" width={100} height={100} data-ai-hint="logo for a condo app"/>
                <h1 className="text-4xl font-bold text-primary font-headline mt-4">CondoConnect</h1>
                <p className="text-muted-foreground">Tu comunidad, conectada.</p>
            </div>
            
            <div className="w-full max-w-4xl space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Login Cards */}
                    <Card 
                        className="cursor-pointer hover:shadow-2xl hover:border-primary transition-all duration-300 transform hover:-translate-y-1"
                        onClick={() => handleNavigation('/login?role=admin')}
                    >
                        <CardHeader className="items-center text-center">
                            <div className="p-4 bg-primary/10 rounded-full mb-4">
                                <Shield className="h-10 w-10 text-primary" />
                            </div>
                            <CardTitle className="text-2xl font-headline">Acceso Administrador</CardTitle>
                            <CardDescription>Gestión, finanzas y reportes.</CardDescription>
                        </CardHeader>
                    </Card>

                    <Card 
                        className="cursor-pointer hover:shadow-2xl hover:border-primary transition-all duration-300 transform hover:-translate-y-1"
                        onClick={() => handleNavigation('/login?role=owner')}
                    >
                        <CardHeader className="items-center text-center">
                            <div className="p-4 bg-primary/10 rounded-full mb-4">
                                <User className="h-10 w-10 text-primary" />
                            </div>
                            <CardTitle className="text-2xl font-headline">Portal Propietario</CardTitle>
                            <CardDescription>Consulta de deudas e historial de pagos.</CardDescription>
                        </CardHeader>
                    </Card>
                </div>
                
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Register Cards */}
                    <Card 
                        className="cursor-pointer hover:shadow-2xl hover:border-accent transition-all duration-300 transform hover:-translate-y-1"
                        onClick={() => handleNavigation('/register?role=admin')}
                    >
                        <CardHeader className="items-center text-center">
                            <div className="p-4 bg-accent/10 rounded-full mb-4">
                                <UserPlus className="h-10 w-10 text-accent" />
                            </div>
                            <CardTitle className="text-2xl font-headline">Registrar Administrador</CardTitle>
                            <CardDescription>Crear una nueva cuenta de gestión.</CardDescription>
                        </CardHeader>
                    </Card>

                    <Card 
                        className="cursor-pointer hover:shadow-2xl hover:border-accent transition-all duration-300 transform hover:-translate-y-1"
                        onClick={() => handleNavigation('/register?role=owner')}
                    >
                        <CardHeader className="items-center text-center">
                            <div className="p-4 bg-accent/10 rounded-full mb-4">
                                <UserPlus className="h-10 w-10 text-accent" />
                            </div>
                            <CardTitle className="text-2xl font-headline">Registrar Propietario</CardTitle>
                            <CardDescription>Crear una nueva cuenta de propietario.</CardDescription>
                        </CardHeader>
                    </Card>
                </div>
            </div>
             <p className="text-xs text-muted-foreground mt-12">© {new Date().getFullYear()} CondoConnect. Todos los derechos reservados.</p>
        </main>
    );
}

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building, User } from 'lucide-react';

export default function RoleSelectionPage() {
    const router = useRouter();

    const handleRoleSelection = (role: 'admin' | 'owner') => {
        router.push(`/login?role=${role}`);
    };

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-body">
            <div className="text-center mb-12">
                 <h1 className="text-5xl font-bold text-primary font-headline">
                    Bienvenido a CondoConnect
                </h1>
                <p className="text-muted-foreground mt-2 text-lg">
                    La solución todo-en-uno para la gestión de tu condominio.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
                <Card className="transform hover:scale-105 transition-transform duration-300">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-primary/10 rounded-full p-4 w-20 h-20 flex items-center justify-center border-2 border-primary mb-4">
                            <Building className="w-10 h-10 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">Administrador</CardTitle>
                        <CardDescription>Accede al panel de control para gestionar pagos, usuarios y configuraciones.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button className="w-full h-12 text-lg" onClick={() => handleRoleSelection('admin')}>
                            Ingresar como Administrador
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="transform hover:scale-105 transition-transform duration-300">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-primary/10 rounded-full p-4 w-20 h-20 flex items-center justify-center border-2 border-primary mb-4">
                            <User className="w-10 h-10 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">Propietario</CardTitle>
                        <CardDescription>Consulta tu estado de cuenta, reporta pagos y mantente informado.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button className="w-full h-12 text-lg" onClick={() => handleRoleSelection('owner')}>
                            Ingresar como Propietario
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    );
}
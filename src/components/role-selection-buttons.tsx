
'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, User } from 'lucide-react';

export default function RoleSelectionButtons() {
    const router = useRouter();

    return (
        <>
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
        </>
    );
}

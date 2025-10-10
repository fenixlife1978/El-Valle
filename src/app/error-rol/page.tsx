
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function ErrorRolPage() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit">
                        <ShieldAlert className="h-10 w-10 text-destructive" />
                    </div>
                    <CardTitle className="mt-4">Rol de Usuario No Válido</CardTitle>
                    <CardDescription>
                        Hemos detectado un problema con el rol asignado a tu perfil de usuario.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Tu cuenta no tiene un rol reconocido por el sistema (propietario o administrador). Por favor, contacta al administrador para que verifique y corrija la configuración de tu perfil.
                    </p>
                </CardContent>
                <CardFooter>
                    <Link href="/" className="w-full">
                        <Button variant="outline" className="w-full">
                            Volver a la página de inicio
                        </Button>
                    </Link>
                </CardFooter>
            </Card>
        </main>
    );
}

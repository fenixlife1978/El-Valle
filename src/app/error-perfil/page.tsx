
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function ErrorPerfilPage() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit">
                        <AlertTriangle className="h-10 w-10 text-destructive" />
                    </div>
                    <CardTitle className="mt-4">Error de Perfil</CardTitle>
                    <CardDescription>
                        Tu cuenta ha sido autenticada, pero no hemos podido encontrar un perfil de usuario asociado en nuestra base de datos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Esto puede ocurrir si tu cuenta fue eliminada o si hubo un problema durante el registro. Por favor, contacta al administrador del sistema para resolver este inconveniente.
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

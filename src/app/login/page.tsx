
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4 relative">
             <Card className="w-full max-w-sm text-center">
                <CardHeader>
                    <CardTitle className="capitalize font-headline">Acceso Directo Habilitado</CardTitle>
                    <CardDescription>
                        El inicio de sesión ha sido desactivado. Estás siendo redirigido al panel de administrador.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Si no eres redirigido, haz clic en el botón de abajo.
                    </p>
                </CardContent>
                <CardFooter>
                    <Link href="/admin/dashboard" className="w-full">
                        <Button className="w-full">
                             <LogIn className="mr-2 h-4 w-4" />
                            Ir al Panel de Administrador
                        </Button>
                    </Link>
                </CardFooter>
            </Card>
        </main>
    );
}

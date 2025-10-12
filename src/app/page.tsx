'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function WelcomePage() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto mb-4">
                         <Image src="/logo.png" alt="Logo de VALLECONDO" width={100} height={100} data-ai-hint="logo for a condo app"/>
                    </div>
                    <CardTitle className="text-3xl font-bold font-headline">
                        Bienvenido a VALLECONDO
                    </CardTitle>
                    <CardDescription>
                        Seleccione su tipo de acceso para continuar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4">
                    <Link href="/login?role=owner" passHref>
                        <Button className="w-full h-16 text-lg" variant="outline">
                            Soy Propietario
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                    <Link href="/login?role=admin" passHref>
                        <Button className="w-full h-16 text-lg">
                            Soy Administrador
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </main>
    );
}

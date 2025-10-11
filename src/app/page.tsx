
'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, User, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { getAuth, signOut } from 'firebase/auth';

export default function WelcomePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const auth = getAuth();
        if (auth.currentUser) {
            signOut(auth).finally(() => {
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    }, []);

    const handleRoleSelection = (role: 'admin' | 'owner') => {
        router.push(`/login?role=${role}`);
    };

    if (loading) {
        return (
            <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground mt-4">Cerrando sesión anterior...</p>
            </main>
        );
    }

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center relative">
            <div className="absolute top-8 left-8">
                 <Image src="/logo.png" alt="Logo de VALLECONDO" width={80} height={80} className="rounded-full" data-ai-hint="logo for a condo app"/>
            </div>
            <div className="mb-8">
                <h1 className="text-4xl font-bold mt-4 font-headline">Bienvenido a VALLECONDO</h1>
                <p className="text-muted-foreground mt-2">"tu condominio"</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl w-full">
                <Card 
                    className="cursor-pointer hover:shadow-primary/20 hover:shadow-lg hover:-translate-y-1 transition-transform duration-300"
                    onClick={() => handleRoleSelection('admin')}
                >
                    <CardHeader className="items-center">
                        <Shield className="w-12 h-12 text-primary mb-4" />
                        <CardTitle className="font-headline">Administrador</CardTitle>
                        <CardDescription>Acceso al panel de gestión del condominio.</CardDescription>
                    </CardHeader>
                </Card>
                <Card 
                    className="cursor-pointer hover:shadow-accent/20 hover:shadow-lg hover:-translate-y-1 transition-transform duration-300"
                    onClick={() => handleRoleSelection('owner')}
                >
                    <CardHeader className="items-center">
                        <User className="w-12 h-12 text-accent mb-4" />
                        <CardTitle className="font-headline">Propietario</CardTitle>
                        <CardDescription>Acceso a su portal de propietario.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        </main>
    );
}

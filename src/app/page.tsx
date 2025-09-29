'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
    </svg>
);

const AdminIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
);


export default function RoleSelectionPage() {

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
            <div className="space-y-8 max-w-2xl w-full">
                <div className="space-y-2">
                    <Building2 className="mx-auto h-12 w-12 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">
                        Bienvenido a Residencias El Valle
                    </h1>
                    <p className="text-muted-foreground">
                        Ingresa a tu cuenta de condominio
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Link href="/login?role=propietario" passHref>
                        <Card className="hover:bg-card/90 hover:shadow-lg transition-all duration-300 cursor-pointer group">
                            <CardContent className="p-8 flex flex-col items-center justify-center gap-4">
                                <div className="p-4 bg-muted rounded-full transform group-hover:scale-110 transition-transform">
                                   <UserIcon />
                                </div>
                                <h2 className="text-xl font-semibold text-card-foreground">Ingresar como Propietario</h2>
                            </CardContent>
                        </Card>
                    </Link>
                    <Link href="/login?role=administrador" passHref>
                         <Card className="hover:bg-card/90 hover:shadow-lg transition-all duration-300 cursor-pointer group">
                            <CardContent className="p-8 flex flex-col items-center justify-center gap-4">
                                <div className="p-4 bg-muted rounded-full transform group-hover:scale-110 transition-transform">
                                    <AdminIcon />
                                </div>
                                <h2 className="text-xl font-semibold text-card-foreground">Ingresar como Administrador</h2>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </div>
        </main>
    );
}

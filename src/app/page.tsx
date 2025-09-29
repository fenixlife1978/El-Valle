
'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';

const OwnerIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const AdminIcon = () => (
     <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
);

export default function RoleSelectionPage() {
    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
            <div className="mb-12">
                <Building2 className="mx-auto h-16 w-16 text-primary" />
                <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground font-headline">
                    Bienvenido a Residencias El Valle
                </h1>
                <p className="mt-3 text-lg text-muted-foreground">
                    Ingresa a tu cuenta de condominio
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
                <Link href="/login?role=propietario" passHref>
                    <div className="group flex flex-col items-center justify-center p-8 border-2 border-border rounded-xl bg-card hover:bg-card/80 hover:border-primary transition-all duration-300 transform hover:-translate-y-2 cursor-pointer space-y-4">
                        <OwnerIcon />
                        <span className="text-xl font-semibold text-card-foreground">Ingresar como Propietario</span>
                    </div>
                </Link>

                <Link href="/login?role=administrador" passHref>
                     <div className="group flex flex-col items-center justify-center p-8 border-2 border-border rounded-xl bg-card hover:bg-card/80 hover:border-primary transition-all duration-300 transform hover:-translate-y-2 cursor-pointer space-y-4">
                        <AdminIcon />
                        <span className="text-xl font-semibold text-card-foreground">Ingresar como Administrador</span>
                    </div>
                </Link>
            </div>
        </main>
    );
}

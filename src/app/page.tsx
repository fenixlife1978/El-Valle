
'use client';

import { Building2, User } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
            <div className="space-y-4">
                <div className="flex items-center justify-center gap-4">
                     <Building2 className="h-12 w-12 text-primary" />
                     <h1 className="text-4xl font-bold tracking-tight text-foreground font-headline">
                        Condo<span className="text-primary">Connect</span>
                    </h1>
                </div>
                <p className="max-w-md text-lg text-muted-foreground">
                    La solución todo-en-uno para la gestión de tu condominio.
                </p>
            </div>
            
            <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 w-full max-w-2xl">
                 <Link href="/login?role=propietario" className="group">
                    <div className="h-full rounded-xl border-2 border-primary/20 bg-card p-8 text-center transition-all duration-300 hover:border-primary hover:bg-primary/5 hover:scale-105">
                         <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                            <User className="h-8 w-8" />
                        </div>
                        <h2 className="mt-6 text-2xl font-semibold text-foreground">
                            Soy Propietario
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            Accede para ver tu estado de cuenta, realizar pagos y más.
                        </p>
                    </div>
                </Link>

                <Link href="/login?role=administrador" className="group">
                    <div className="h-full rounded-xl border-2 border-primary/20 bg-card p-8 text-center transition-all duration-300 hover:border-primary hover:bg-primary/5 hover:scale-105">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                            <Building2 className="h-8 w-8" />
                        </div>
                        <h2 className="mt-6 text-2xl font-semibold text-foreground">
                            Soy Administrador
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            Accede al panel de gestión y control del condominio.
                        </p>
                    </div>
                 </Link>
            </div>

            <footer className="absolute bottom-4 text-sm text-muted-foreground">
                © {new Date().getFullYear()} CondoConnect. Todos los derechos reservados.
            </footer>
        </main>
    );
}

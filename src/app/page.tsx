'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
    const { user, loading, role } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (user) {
                if (role === 'administrador') {
                    router.replace('/admin/dashboard');
                } else if (role === 'propietario') {
                    router.replace('/owner/dashboard');
                } else {
                    // Fallback for users with no role or unknown role
                    router.replace('/login');
                }
            } else {
                router.replace('/login');
            }
        }
    }, [user, loading, role, router]);

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Verificando sesión, por favor espere...</p>
        </main>
    );
}


'use client';

import { useEffect } from 'react';
import { useRouter }from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function WelcomePage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/dashboard');
    }, [router]);

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground mt-4">Accediendo al panel de administrador...</p>
        </main>
    );
}

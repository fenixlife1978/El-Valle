
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();

    useEffect(() => {
        // Redirect to the main entry point of the app, which will handle navigation.
        router.replace('/');
    }, [router]);

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Esta página ya no es necesaria. Redirigiendo...</p>
        </main>
    );
}

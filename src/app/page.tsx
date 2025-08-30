'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function WelcomePage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/dashboard');
    }, [router]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-body">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p className="text-muted-foreground mt-4">Redirigiendo...</p>
        </div>
    );
}

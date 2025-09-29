
'use client';

import {
    Home,
    Landmark,
    Settings,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { Loader2 } from 'lucide-react';

const ownerNavItems: NavItem[] = [
    { href: "/owner/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Reportar Pago",
    },
    { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login?role=owner');
            return;
        }
        const parsedSession = JSON.parse(userSession);
        if (parsedSession.role !== 'propietario') {
             router.push('/login?role=owner');
             return;
        }
        setSession(parsedSession);
        setLoading(false);
    }, [router]);
    
    if (loading) {
        return (
             <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <DashboardLayout userName={session?.name || 'Propietario'} userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

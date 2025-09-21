
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
    const [loading, setLoading] = useState(true);

     useEffect(() => {
        const session = localStorage.getItem('user-session');
        if (!session) {
            router.push('/login');
        } else {
            const userData = JSON.parse(session);
            if (userData.role !== 'propietario') {
                router.push('/login');
            } else if (!userData.passwordChanged && window.location.pathname !== '/owner/change-password') {
                router.push('/owner/change-password');
            } else {
                setLoading(false);
            }
        }
    }, [router]);

    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <DashboardLayout userName="Edwin Aguiar" userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

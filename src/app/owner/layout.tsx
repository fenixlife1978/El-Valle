
'use client';

import {
    Home,
    Landmark,
    Settings,
    History
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

const ownerNavItems: NavItem[] = [
    { href: "/owner/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Reportar Pago",
    },
    { href: "/owner/history", icon: History, label: "Historial de Reportes"},
    { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
    const { user, role, loading, ownerData } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/login?role=owner');
            } else if (role !== 'propietario') {
                router.push('/login?role=admin');
            }
        }
    }, [user, role, loading, router]);

    if (loading || !user || role !== 'propietario') {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <DashboardLayout userName={ownerData?.name || 'Propietario'} userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

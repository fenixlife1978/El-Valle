'use client';

import {
    Home,
    Landmark,
    Settings,
    History
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/login?role=owner');
            } else if (role !== 'propietario') {
                router.push('/login?role=admin');
            } else if (ownerData && !ownerData.passwordChanged) {
                // If the user is an owner and hasn't changed their password,
                // force them to the change password page, unless they are already there.
                if (pathname !== '/owner/change-password') {
                     router.push('/owner/change-password');
                }
            }
        }
    }, [user, role, loading, ownerData, router, pathname]);

    if (loading || !user || role !== 'propietario') {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    // While loading is false, ownerData might still be null briefly.
    // Also check for passwordChanged status before rendering layout, unless on the change-password page itself.
    if (pathname !== '/owner/change-password' && (!ownerData || !ownerData.passwordChanged)) {
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

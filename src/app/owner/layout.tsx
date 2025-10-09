'use client';

import {
    Home,
    Landmark,
    Settings,
    History
} from 'lucide-react';
import { type ReactNode } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
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
    const { user, loading, role, ownerData } = useAuth();
    const router = useRouter();

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) {
        router.replace('/login');
        return null;
    }
    
     if (role && role !== 'propietario') {
        router.replace('/admin/dashboard');
        return null;
    }

    // Redirect to change password if required
    if (ownerData && !ownerData.passwordChanged) {
        router.replace('/owner/change-password');
        return null;
    }

    return (
        <DashboardLayout userName={ownerData?.name || 'Propietario'} userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

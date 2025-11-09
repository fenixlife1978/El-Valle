

'use client';

import {
    Home,
    Landmark,
    Settings,
    History,
    Calculator,
    ClipboardList
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

const ownerNavItems: NavItem[] = [
    { href: "/owner/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/owner/payments", 
      icon: Landmark, 
      label: "Pagos",
      items: [
        { href: "/owner/payments", label: "Reportar Pago" },
        { href: "/owner/payments/calculator", label: "Calculadora de Pagos" },
      ]
    },
    { href: "/owner/surveys", icon: ClipboardList, label: "Encuestas"},
    { href: "/owner/history", icon: History, label: "Historial de Reportes"},
    { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
    const { user, ownerData, loading, role } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (loading) {
            return; // Don't do anything while loading
        }
        if (!user) {
            router.push('/login?role=owner');
            return;
        }
        if (ownerData && ownerData.passwordChanged === false && pathname !== '/owner/change-password') {
            router.push('/owner/change-password');
            return;
        }
    }, [loading, user, ownerData, pathname, router]);

    if (loading || !user) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-2">Cargando sesión...</p>
            </div>
        );
    }
    
    // This case covers the password change page which shouldn't have the main layout
    if (ownerData && ownerData.passwordChanged === false) {
        if(pathname === '/owner/change-password') {
            return <>{children}</>;
        }
        // While redirecting, show a loader
        return (
             <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
                 <p className="ml-2">Redirigiendo para cambiar contraseña...</p>
            </div>
        );
    }

    return (
        <DashboardLayout ownerData={ownerData} userRole={role} navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

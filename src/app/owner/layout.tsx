
'use client';

import {
    Home,
    Landmark,
    Settings,
    History,
    Calculator,
    ClipboardList,
    Plus,
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar } from '@/components/bottom-nav-bar';

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

const bottomNavItems = [
  { href: '/owner/dashboard', icon: Home, label: 'Inicio' },
  { href: '/owner/history', icon: History, label: 'Historial' },
  { href: '/owner/payments', icon: Plus, label: 'Reportar', isCentral: true },
  { href: '/owner/payments/calculator', icon: Calculator, label: 'Calcular' },
  { href: '/owner/surveys', icon: ClipboardList, label: 'Encuestas' },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
    const { user, ownerData, loading, role } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/login?role=owner');
            } else if (role && role !== 'owner') {
                router.push('/admin/dashboard');
            }
        }
    }, [loading, user, role, router]);

    if (loading || !user || !role) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-2">Cargando sesión...</p>
            </div>
        );
    }
    
    return (
        <DashboardLayout ownerData={ownerData} userRole={role} navItems={ownerNavItems}>
            <div className="pb-20 sm:pb-0">{children}</div>
            <BottomNavBar items={bottomNavItems} pathname={pathname} />
        </DashboardLayout>
    );
}

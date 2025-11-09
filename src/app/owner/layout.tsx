
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
import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
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
    const { ownerData, role } = useAuth();
    const pathname = usePathname();

    // The AuthGuard in the root layout handles the main loading and redirection.
    // This component now just renders the layout for the owner section.

    return (
        <DashboardLayout ownerData={ownerData} userRole={role} navItems={ownerNavItems}>
            <div className="pb-20 sm:pb-0">{children}</div>
            <BottomNavBar items={bottomNavItems} pathname={pathname} />
        </DashboardLayout>
    );
}

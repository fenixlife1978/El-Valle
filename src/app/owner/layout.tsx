
'use client';

import {
    Home,
    Landmark,
    Settings,
    History
} from 'lucide-react';
import { type ReactNode } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';

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
    // Authentication check has been removed as the primary access is now the admin panel.
    return (
        <DashboardLayout userName="Propietario" userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

'use client';

import {
    Home,
    Landmark,
    Settings,
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
    { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
    return (
        <DashboardLayout userName="Propietario" userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

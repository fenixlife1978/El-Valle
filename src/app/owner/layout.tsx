'use client';

import {
    Home,
    Landmark,
    CalendarCheck,
    Megaphone,
    Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';

const ownerNavItems: NavItem[] = [
    { href: "/owner/dashboard", icon: Home, label: "Dashboard" },
    { href: "/admin/payments", icon: Landmark, label: "Mis Pagos" },
    { href: "#", icon: CalendarCheck, label: "Mis Reservas" },
    { href: "#", icon: Megaphone, label: "Comunicados" },
    { href: "#", icon: Settings, label: "Configuración" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
    return (
        <DashboardLayout userName="Juan Perez" userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

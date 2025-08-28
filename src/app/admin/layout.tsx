'use client';

import {
    Home,
    Landmark,
    Building,
    Users,
    CalendarCheck,
    Wrench,
    Megaphone,
    Settings,
    FileCheck2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';

const adminNavItems: NavItem[] = [
    { href: "/admin/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Pagos",
      items: [
        { href: "/admin/payments", label: "Reportar Pago" },
        { href: "/admin/payments/verify", label: "Verificar Pagos" },
      ]
    },
    { href: "#", icon: Building, label: "Unidades" },
    { href: "/admin/people", icon: Users, label: "Personas" },
    { href: "#", icon: CalendarCheck, label: "Reservas" },
    { href: "#", icon: Wrench, label: "Mantenimiento" },
    { href: "#", icon: Megaphone, label: "Comunicados" },
    { href: "#", icon: Settings, label: "Configuración" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <DashboardLayout userName="Administrador" userRole="Administrador" navItems={adminNavItems}>
            {children}
        </DashboardLayout>
    );
}

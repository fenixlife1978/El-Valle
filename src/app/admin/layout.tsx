'use client';

import {
    Home,
    Landmark,
    Users,
    Settings,
    FileSearch,
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
    { href: "/admin/reports", icon: FileSearch, label: "Consultas y Reportes" },
    { href: "/admin/people", icon: Users, label: "Personas" },
    { href: "#", icon: Settings, label: "Configuración" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <DashboardLayout userName="Administrador" userRole="Administrador" navItems={adminNavItems}>
            {children}
        </DashboardLayout>
    );
}

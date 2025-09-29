
'use client';

import {
    Home,
    Landmark,
    Users,
    Settings,
    FileSearch,
    CircleDollarSign,
    ListChecks,
    RefreshCw,
    TrendingUp,
} from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { Loader2 } from 'lucide-react';


const adminNavItems: NavItem[] = [
    { href: "/admin/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Pagos",
      items: [
        { href: "/admin/payments", label: "Reportar Pago" },
        { href: "/admin/payments/advance", label: "Registrar Adelanto" },
        { href: "/admin/payments/verify", label: "Verificar Pagos" },
        { href: "/admin/payments/calculator", label: "Calculadora de Pagos" },
        { href: "/admin/payments/history", label: "Pagos Históricos" },
      ]
    },
    { href: "/admin/debts", icon: CircleDollarSign, label: "Gestión de Deudas" },
    { href: "/admin/financial-balance", icon: TrendingUp, label: "Balance Financiero" },
    { href: "/admin/reports", icon: FileSearch, label: "Informes" },
    { href: "/admin/people", icon: Users, label: "Personas" },
    { 
      href: "/admin/settings", 
      icon: Settings, 
      label: "Configuración",
      items: [
        { href: "/admin/settings", label: "General" },
        { href: "/admin/settings/sync", label: "Sincronizar Perfiles" },
      ]
    },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('Administrador');

    useEffect(() => {
        // SIMULATE ADMIN SESSION FOR TEMPORARY ACCESS
        const adminSession = {
            uid: 'valle-admin-main-account',
            email: 'vallecondo@gmail.com',
            role: 'administrador',
            name: 'Valle Admin',
            passwordChanged: true,
        };
        localStorage.setItem('user-session', JSON.stringify(adminSession));
        setUserName(adminSession.name);
        setLoading(false);
    }, []);

    if (loading) {
        return (
             <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <DashboardLayout userName={userName} userRole="Administrador" navItems={adminNavItems}>
            {children}
        </DashboardLayout>
    );
}

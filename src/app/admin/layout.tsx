
'use client';

import {
    Home,
    Users,
    Settings,
    FileSearch,
    CircleDollarSign,
    Wallet,
    Award,
    ShieldCheck,
    ClipboardList,
    Plus,
    Megaphone,
    Grid3X3,
    FileSignature,
    WalletCards,
    Receipt,
    Calculator,
    BarChart3,
    FileImage,
    Palette,
    Server,
    Landmark
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar, type BottomNavItem } from '@/components/bottom-nav-bar';
import { Loader2 } from 'lucide-react';

const adminNavItems: NavItem[] = [
    { href: "/admin/dashboard", icon: Home, label: "Dashboard" },
    { 
        href: "/admin/payments", 
        icon: Landmark, 
        label: "Pagos",
        items: [
            { href: "/admin/payments", label: "Verificar Pagos" },
            { href: "/admin/payments?tab=report", label: "Reportar/Calcular" },
        ]
    },
    { 
        href: "#", 
        icon: Grid3X3, 
        label: "Utilidades",
        items: [
            { href: "/admin/debts", label: "Gestión de Deudas" },
            { href: "/admin/financial-balance", label: "Balance Financiero" },
            { href: "/admin/petty-cash", label: "Caja Chica" },
            { href: "/admin/reports", label: "Informes" },
            { href: "/admin/billboard", label: "Cartelera" },
            { href: "/admin/surveys", label: "Encuestas" },
            { href: "/admin/certificates", label: "Constancias" },
            { href: "/admin/people", label: "Personas" },
        ]
    },
     { 
        href: "/admin/settings", 
        icon: Settings, 
        label: "Configuración",
        items: [
           { href: "/admin/settings", label: "General" },
           { href: "/admin/settings/sync", label: "Sincronización" },
           { href: "/admin/validation", label: "Validación de Datos" },
        ]
    },
];

const adminBottomNavItems: BottomNavItem[] = [
  { href: '/admin/dashboard', icon: Home, label: 'Inicio' },
  { href: '/admin/payments', icon: Landmark, label: 'Pagos' },
  { 
    href: '#', 
    icon: Plus, 
    label: 'Más', 
    isCentral: true,
    subMenu: [
        { href: "/admin/debts", icon: CircleDollarSign, label: "Deudas" },
        { href: "/admin/people", icon: Users, label: "Personas" },
        { href: "/admin/surveys", icon: ClipboardList, label: "Encuestas" },
    ]
  },
  { href: '/admin/reports', icon: FileSearch, label: 'Informes' },
  { href: '/admin/settings', icon: Settings, label: 'Ajustes' },
];


export default function AdminLayout({ children }: { children: ReactNode }) {
    const { ownerData, role, loading, user } = useAuth();
    const rawPathname = usePathname();
    const pathname: string = rawPathname ?? '';
    const router = useRouter();

    useEffect(() => {
        if (!loading && role !== 'administrador') {
            router.replace('/welcome');
        }
    }, [role, loading, router]);

    if (loading || role !== 'administrador') {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Verificando acceso...</p>
            </div>
        );
    }
    
    return (
        <DashboardLayout ownerData={ownerData} userRole={role} navItems={adminNavItems}>
            <div className="pb-20 sm:pb-0">{children}</div>
            <BottomNavBar items={adminBottomNavItems} pathname={pathname} />
        </DashboardLayout>
    );
}

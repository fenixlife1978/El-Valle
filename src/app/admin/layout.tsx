'use client';

import {
    Home,
    Users,
    Settings,
    FileSearch,
    Landmark,
    Grid3X3,
    WalletCards,
    ClipboardList,
    Plus,
    Loader2
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar, type BottomNavItem } from '@/components/bottom-nav-bar';
import Header from '@/components/Header'; // Importamos el nuevo Header

const adminNavItems: NavItem[] = [
    { href: "/admin/dashboard", icon: Home, label: "Dashboard" },
    { 
        href: "#", 
        icon: Grid3X3, 
        label: "Utilidades",
        items: [
            { href: "/admin/payments", label: "Gestión de Pagos" },
            { href: "/admin/debts", label: "Gestión de Deudas" },
            { href: "/admin/financial-balance", label: "Balance Financiero" },
            { href: "/admin/expenses", label: "Gestión de Egresos" },
            { href: "/admin/petty-cash", label: "Caja Chica" },
            { href: "/admin/reports", label: "Informes" },
            { href: "/admin/billboard", label: "Cartelera" },
            { href: "/admin/surveys", label: "Encuestas" },
            { href: "/admin/certificates", label: "Constancias" },
            { href: "/admin/people", label: "Personas" },
            { href: "/admin/settings", label: "Config. General" },
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
        { href: "/admin/debts", icon: WalletCards, label: "Deudas" },
        { href: "/admin/surveys", icon: ClipboardList, label: "Encuestas" },
        { href: "/admin/people", icon: Users, label: "Personas" },
        { href: "/admin/settings", icon: Settings, label: "Ajustes" },
    ]
  },
  { href: '/admin/reports', icon: FileSearch, label: 'Informes' },
  { href: '/admin/people', icon: Users, label: 'Personas' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    const { ownerData, role, loading, user } = useAuth();
    const pathname = usePathname() ?? '';
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            // Verificamos si es administrador o super-admin (tu cuenta vallecondo@gmail.com)
            const hasAccess = role === 'administrador' || role === 'super-admin';
            if (!user || !hasAccess) {
                router.replace('/login');
            }
        }
    }, [role, loading, user, router]);
    
    const hasAccess = role === 'administrador' || role === 'super-admin';

    // Pantalla de carga con diseño de salud visual
    if (loading || !user || !hasAccess) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-[#020617]">
                <Loader2 className="h-10 w-10 animate-spin text-[#006241]" />
                <p className="ml-2 mt-4 text-slate-400 font-bold text-xs uppercase tracking-widest">
                    Verificando Credenciales...
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#020617]">
            {/* Header con Tasa BCV y Logo */}
            <Header />

            <div className="flex flex-1 overflow-hidden">
                <DashboardLayout 
                    ownerData={ownerData} 
                    userRole={role} 
                    navItems={adminNavItems} 
                    mobileNavItems={adminNavItems}
                >
                    {/* El padding-bottom evita que el contenido se tape con la barra móvil */}
                    <div className="pb-24 sm:pb-8 px-4 sm:px-6 pt-6">
                        {children}
                    </div>
                    
                    {/* Barra de navegación inferior para móviles */}
                    <BottomNavBar items={adminBottomNavItems} pathname={pathname} />
                </DashboardLayout>
            </div>
        </div>
    );
}

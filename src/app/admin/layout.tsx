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
    Loader2,
    ArrowLeftCircle,
    AlertTriangle
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar, type BottomNavItem } from '@/components/bottom-nav-bar';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';

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
    const [supportCondoId, setSupportCondoId] = useState<string | null>(null);

    useEffect(() => {
        // Verificar si estamos en Modo Soporte (desde el Super Admin)
        const mode = localStorage.getItem('support_condo_id');
        setSupportCondoId(mode);

        if (!loading) {
            // Permitimos acceso si es administrador, super-admin o si el correo es el tuyo
            const hasAccess = role === 'administrador' || role === 'super-admin' || user?.email === 'vallecondo@gmail.com';
            if (!user || !hasAccess) {
                router.replace('/login');
            }
        }
    }, [role, loading, user, router]);
    
    const exitSupportMode = () => {
        localStorage.removeItem('support_condo_id');
        router.push('/super-admin');
    };

    const hasAccess = role === 'administrador' || role === 'super-admin' || user?.email === 'vallecondo@gmail.com';

    // Pantalla de carga (Azul EFAS CondoSys)
    if (loading || !user || !hasAccess) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-[#020617]">
                <Loader2 className="h-10 w-10 animate-spin text-[#0081c9]" />
                <p className="ml-2 mt-4 text-slate-500 font-black text-[10px] uppercase tracking-[0.3em] italic">
                    EFAS CondoSys: Validando...
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#020617]">
            {/* 1. Banner de Modo Soporte (Solo visible si vienes del Panel Maestro) */}
            {supportCondoId && (
                <div className="bg-[#f59e0b] text-[#020617] py-2 px-4 shadow-lg border-b border-amber-600 flex justify-between items-center z-[110] sticky top-0">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 animate-pulse" />
                        <span className="text-[11px] font-black uppercase tracking-tight italic">
                            Modo Soporte: <span className="bg-[#020617] text-white px-2 py-0.5 rounded ml-1">{supportCondoId}</span>
                        </span>
                    </div>
                    <Button 
                        onClick={exitSupportMode}
                        variant="secondary"
                        size="sm"
                        className="bg-[#020617] text-white hover:bg-slate-800 rounded-full font-black text-[9px] uppercase px-4 h-7"
                    >
                        <ArrowLeftCircle className="w-3 h-3 mr-2" /> 
                        Volver al Mando
                    </Button>
                </div>
            )}

            {/* 2. Header con Tasa BCV */}
            <Header />

            <div className="flex flex-1 overflow-hidden">
                <DashboardLayout 
                    ownerData={ownerData} 
                    userRole={role} 
                    navItems={adminNavItems} 
                    mobileNavItems={adminNavItems}
                >
                    <div className="pb-24 sm:pb-8 px-4 sm:px-6 pt-6 bg-slate-50 min-h-full rounded-t-[2.5rem] sm:rounded-none">
                        {children}
                    </div>
                    
                    <BottomNavBar items={adminBottomNavItems} pathname={pathname} />
                </DashboardLayout>
            </div>
        </div>
    );
}

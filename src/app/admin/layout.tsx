
'use client';

import {
    Home,
    Landmark,
    Users,
    Settings,
    FileSearch,
    CircleDollarSign,
    TrendingUp,
    Wallet,
    Award,
    ShieldCheck,
    ClipboardList,
    Plus,
    Megaphone, // Icono añadido
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar, type BottomNavItem } from '@/components/bottom-nav-bar';
import { Loader2 } from 'lucide-react';
import { initFCM } from '@/lib/init-fcm';


const adminNavItems: NavItem[] = [
    { href: "/admin/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments/verify", 
      icon: Landmark, 
      label: "Pagos",
      items: [
        { href: "/admin/payments/report", label: "Reportar Pago" },
        { href: "/admin/payments/verify", label: "Verificar Pagos" },
        { href: "/admin/payments/calculator", label: "Calculadora de Pagos" },
      ]
    },
    { href: "/admin/debts", icon: CircleDollarSign, label: "Gestión de Deudas" },
    { href: "/admin/financial-balance", icon: TrendingUp, label: "Balance Financiero" },
    { href: "/admin/petty-cash", icon: Wallet, label: "Caja Chica" },
    { href: "/admin/reports", icon: FileSearch, label: "Informes" },
    { href: "/admin/billboard", icon: Megaphone, label: "Cartelera" }, // Nuevo item
    { href: "/admin/surveys", icon: ClipboardList, label: "Encuestas" },
    { href: "/admin/certificates", icon: Award, label: "Constancias" },
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
    { href: "/admin/validation", icon: ShieldCheck, label: "Validación" },
];

const adminBottomNavItems: BottomNavItem[] = [
  { href: '/admin/dashboard', icon: Home, label: 'Inicio' },
  { href: '/admin/payments/verify', icon: Landmark, label: 'Verificar' },
  { 
    href: '#', 
    icon: Plus, 
    label: 'Más', 
    isCentral: true,
    subMenu: [
        { href: "/admin/payments/report", icon: Plus, label: "Reportar Pago" },
        { href: "/admin/debts", icon: CircleDollarSign, label: "Deudas" },
        { href: "/admin/people", icon: Users, label: "Personas" },
        { href: "/admin/surveys", icon: ClipboardList, label: "Encuestas" },
    ]
  },
  { href: '/admin/reports', icon: FileSearch, label: 'Informes' },
  { href: '/admin/settings', icon: Settings, label: 'Ajustes' },
];


function AdminLayoutContent({ children }: { children: ReactNode }) {
    const { ownerData, role, loading, user } = useAuth();
    const rawPathname = usePathname();
    const pathname: string = rawPathname ?? '';
    const router = useRouter();

    useEffect(() => {
        if (!loading && role !== 'administrador') {
            router.replace('/welcome');
        }
    }, [role, loading, router]);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && user) {
            initFCM(user);
        }
    }, [user]);

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

const DynamicAdminLayout = dynamic(() => Promise.resolve(AdminLayoutContent), {
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Cargando módulo...</p>
    </div>
  ),
  ssr: false,
});


export default function AdminLayout({ children }: { children: ReactNode }) {
    return <DynamicAdminLayout>{children}</DynamicAdminLayout>
}

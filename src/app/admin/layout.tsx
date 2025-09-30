
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
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';


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
    const router = useRouter();
    const { toast } = useToast();
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login?role=admin');
            return;
        }
        
        const parsedSession = JSON.parse(userSession);
        if (parsedSession.role !== 'administrador') {
            toast({
                variant: 'destructive',
                title: 'Acceso Denegado',
                description: 'No tienes permisos para acceder a esta área.'
            });
            localStorage.removeItem('user-session');
            router.push('/login');
            return;
        }
        
        setSession(parsedSession);
        setLoading(false);

    }, [router, toast]);
    
    if (loading) {
        return (
             <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <DashboardLayout userName={session?.displayName || 'Administrador'} userRole="Administrador" navItems={adminNavItems}>
            {children}
        </DashboardLayout>
    );
}


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
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuButton, SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

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
        href: "/admin/utils", 
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
      <SidebarProvider>
        <Sidebar>
            <SidebarHeader>
                {/* Puedes poner un logo o título aquí si quieres */}
            </SidebarHeader>
            <SidebarContent>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton href="/admin/dashboard" isActive={pathname === '/admin/dashboard'}>
                            <Home />
                            Dashboard
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    
                    <SidebarGroup>
                        <SidebarGroupLabel>Gestión Principal</SidebarGroupLabel>
                        <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/payments')}>
                                <Landmark />
                                Pagos
                            </SidebarMenuButton>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                     <SidebarMenuSubButton href="/admin/payments" isActive={pathname === '/admin/payments' && !pathname.includes('tab=')}>Verificar Pagos</SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                     <SidebarMenuSubButton href="/admin/payments?tab=report" isActive={pathname.includes('tab=report')}>Reportar/Calcular</SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </SidebarMenuItem>

                        <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/debts')}>
                                <WalletCards />
                                Deudas
                            </SidebarMenuButton>
                             <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                     <SidebarMenuSubButton href="/admin/debts" isActive={pathname === '/admin/debts'}>Gestionar Deudas</SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </SidebarMenuItem>
                        
                         <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/people')}>
                                <Users />
                                Personas
                            </SidebarMenuButton>
                              <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                     <SidebarMenuSubButton href="/admin/people" isActive={pathname === '/admin/people'}>Gestionar Personas</SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </SidebarMenuItem>
                    </SidebarGroup>

                    <SidebarGroup>
                        <SidebarGroupLabel>Utilidades</SidebarGroupLabel>
                         <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/financial-balance')}>
                                <BarChart3 />
                                Balance Financiero
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/petty-cash')}>
                                <Wallet />
                                Caja Chica
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/reports')}>
                                <FileSearch />
                                Informes
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/billboard')}>
                                <Megaphone />
                                Cartelera
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/surveys')}>
                                <ClipboardList />
                                Encuestas
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/certificates')}>
                                <Award />
                                Constancias
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarGroup>

                     <SidebarGroup>
                        <SidebarGroupLabel>Sistema</SidebarGroupLabel>
                         <SidebarMenuItem>
                             <SidebarMenuButton isActive={pathname.startsWith('/admin/settings')}>
                                <Settings />
                                Configuración
                            </SidebarMenuButton>
                            <SidebarMenuSub>
                                <SidebarMenuSubItem><SidebarMenuSubButton href="/admin/settings" isActive={pathname === '/admin/settings'}>General</SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton href="/admin/settings/sync" isActive={pathname === '/admin/settings/sync'}>Sincronización</SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton href="/admin/validation" isActive={pathname === '/admin/validation'}>Validación</SidebarMenuSubButton></SidebarMenuSubItem>
                            </SidebarMenuSub>
                        </SidebarMenuItem>
                    </SidebarGroup>
                </SidebarMenu>
            </SidebarContent>
        </Sidebar>

        <DashboardLayout ownerData={ownerData} userRole={role} navItems={[]}>
            <div className="pb-20 sm:pb-0">{children}</div>
            <BottomNavBar items={adminBottomNavItems} pathname={pathname} />
        </DashboardLayout>

      </SidebarProvider>
    );
}

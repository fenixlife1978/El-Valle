
'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar, type BottomNavItem } from '@/components/bottom-nav-bar';
import { Loader2, Home, Plus, FileSearch, Settings, Banknote, Landmark, ClipboardList, Calculator, Award } from 'lucide-react';

const ownerNavItems: NavItem[] = [
  { href: "/owner/dashboard", icon: Home, label: "Inicio" },
  { 
    href: "/owner/payments", 
    icon: Landmark, 
    label: "Pagos",
    items: [
      { href: "/owner/payments/report", label: "Reportar Pago" },
      { href: "/owner/payment-methods", label: "Métodos de Pago" },
      { href: "/owner/payments/calculator", label: "Calculadora de Pagos" },
    ]
  },
  { href: "/owner/certificates", icon: Award, label: "Constancias" },
  { href: "/owner/reports", icon: FileSearch, label: "Publicaciones" },
  { href: "/owner/surveys", icon: ClipboardList, label: "Encuestas" },
  { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

const ownerBottomNavItems: BottomNavItem[] = [
  { href: '/owner/dashboard', icon: Home, label: 'Inicio' },
  { href: '/owner/payment-methods', icon: Banknote, label: 'Pagar' },
  { 
    href: '#', 
    icon: Plus, 
    label: 'Reportar', 
    isCentral: true,
    subMenu: [
        { href: "/owner/payments/report", icon: Plus, label: "Reportar Pago" },
        { href: "/owner/payments/calculator", icon: Calculator, label: "Calculadora" },
        { href: "/owner/certificates", icon: Award, label: "Constancias" },
        { href: "/owner/surveys", icon: ClipboardList, label: "Encuestas" },
    ]
  },
  { href: '/owner/reports', icon: FileSearch, label: 'Publicaciones' },
  { href: '/owner/settings', icon: Settings, label: 'Ajustes' },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
  const { user, ownerData, role, loading } = useAuth();
  const rawPathname = usePathname();
  const pathname: string = rawPathname ?? '';
  const router = useRouter();

  useEffect(() => {
    if (!loading && role !== 'propietario') {
      router.replace('/welcome');
    }
  }, [role, loading, router]);
  
  // Se ha eliminado la llamada a initializeFCM para evitar errores de compilación

  if (loading || role !== 'propietario') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Verificando acceso...</p>
      </div>
    );
  }

  return (
    <DashboardLayout ownerData={ownerData} userRole={role} navItems={ownerNavItems}>
      <div className="pb-20 sm:pb-0">{children}</div>
      <BottomNavBar items={ownerBottomNavItems} pathname={pathname} />
    </DashboardLayout>
  );
}

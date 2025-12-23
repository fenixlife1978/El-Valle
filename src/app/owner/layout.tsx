'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { Loader2, Home, Plus, FileSearch, Settings, Banknote, Calculator, ClipboardList, Receipt, Landmark } from 'lucide-react';

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
  { href: "/owner/reports", icon: FileSearch, label: "Informes" },
  { href: "/owner/surveys", icon: ClipboardList, label: "Encuestas" },
  { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

type BottomNavItem = {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
  isCentral?: boolean;
};

const bottomNavItems: BottomNavItem[] = [
  { href: '/owner/dashboard', icon: Home, label: 'Inicio' },
  { href: '/owner/payment-methods', icon: Banknote, label: 'Pagar' },
  { href: '/owner/payments/report', icon: Plus, label: 'Reportar', isCentral: true },
  { href: '/owner/reports', icon: FileSearch, label: 'Informes' },
  { href: '/owner/settings', icon: Settings, label: 'Ajustes' },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
  const { ownerData, role, loading } = useAuth();
  const rawPathname = usePathname();
  const pathname: string = rawPathname ?? ''; // ✅ aseguramos que nunca sea null
  const router = useRouter();

  useEffect(() => {
    if (!loading && role !== 'propietario') {
      router.replace('/welcome');
    }
  }, [role, loading, router]);

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
      <BottomNavBar items={bottomNavItems} pathname={pathname} />
    </DashboardLayout>
  );
}

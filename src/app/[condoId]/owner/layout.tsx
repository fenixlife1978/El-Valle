
'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar, type BottomNavItem } from '@/components/bottom-nav-bar';
import { Loader2, Home, Plus, FileSearch, Banknote, Landmark, ClipboardList, Calculator, Award, Grid3X3 } from 'lucide-react';

export default function OwnerLayout({ children }: { children: ReactNode }) {
  const { user, ownerData, role, loading } = useAuth();
  const rawPathname = usePathname();
  const pathname: string = rawPathname ?? '';
  const router = useRouter();
  const params = useParams();
  const condoId = params?.condoId as string;

  const ownerNavItems: NavItem[] = [
    { href: `/${condoId}/owner/dashboard`, icon: Home, label: "Inicio" },
    { 
      href: `/${condoId}/owner/payments`, 
      icon: Landmark, 
      label: "Pagos",
      items: [
        { href: `/${condoId}/owner/payments?tab=report`, label: "Reportar Pago" },
        { href: `/${condoId}/owner/payment-methods`, label: "Métodos de Pago" },
        { href: `/${condoId}/owner/payments/calculator`, label: "Calculadora de Pagos" },
      ]
    },
    { 
      href: "#", 
      icon: Grid3X3, 
      label: "Utilidades",
      items: [
          { href: `/${condoId}/owner/reports`, label: "Publicaciones" },
          { href: `/${condoId}/owner/certificates`, label: "Constancias" },
          { href: `/${condoId}/owner/surveys`, label: "Encuestas" },
      ]
    },
  ];

  const ownerBottomNavItems: BottomNavItem[] = [
    { href: `/${condoId}/owner/dashboard`, icon: Home, label: 'Inicio' },
    { href: `/${condoId}/owner/payment-methods`, icon: Banknote, label: 'Pagar' },
    { 
      href: '#', 
      icon: Plus, 
      label: 'Reportar', 
      isCentral: true,
      subMenu: [
          { href: `/${condoId}/owner/payments?tab=report`, icon: Plus, label: "Reportar Pago" },
          { href: `/${condoId}/owner/payments/calculator`, icon: Calculator, label: "Calculadora" },
          { href: `/${condoId}/owner/certificates`, icon: Award, label: "Constancias" },
          { href: `/${condoId}/owner/surveys`, icon: ClipboardList, label: "Encuestas" },
      ]
    },
    { href: `/${condoId}/owner/reports`, icon: FileSearch, label: 'Publicaciones' },
  ];

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
      <BottomNavBar items={ownerBottomNavItems} pathname={pathname} />
    </DashboardLayout>
  );
}

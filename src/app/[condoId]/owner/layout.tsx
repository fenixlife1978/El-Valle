'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { BottomNavBar, type BottomNavItem } from '@/components/bottom-nav-bar';
import { 
  Loader2, 
  Home, 
  Plus, 
  FileSearch, 
  Banknote, 
  ClipboardList, 
  Calculator, 
  Award, 
  Receipt, 
  Wrench 
} from 'lucide-react';

export default function OwnerLayout({ children }: { children: ReactNode }) {
  const { user, ownerData, role, loading } = useAuth();
  const rawPathname = usePathname();
  const pathname: string = rawPathname ?? '';
  const router = useRouter();
  const params = useParams();
  const condoId = params?.condoId as string;

  // Se agregaron los iconos faltantes a los objetos raíz para cumplir con el tipo NavItem
  const ownerNavItems: NavItem[] = [
    { 
      href: `/${condoId}/owner/dashboard`, 
      icon: Home, 
      label: "Inicio" 
    },
    { 
      href: "#", 
      icon: Receipt, // Icono agregado para corregir el error TS2741
      label: "Pagos",
      items: [
        { href: `/${condoId}/owner/payments`, label: "Reportar Pago" },
        { href: `/${condoId}/owner/payment-methods`, label: "Métodos de Pago" },
        { href: `/${condoId}/owner/payments/calculator`, label: "Calculadora de Pagos" },
      ]
    },
    { 
      href: "#", 
      icon: Wrench, // Icono agregado para corregir el error TS2741
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
          { href: `/${condoId}/owner/payments`, icon: Plus, label: "Reportar Pago" },
          { href: `/${condoId}/owner/payments/calculator`, icon: Calculator, label: "Calculadora" },
          { href: `/${condoId}/owner/certificates`, icon: Award, label: "Constancias" },
          { href: `/${condoId}/owner/surveys`, icon: ClipboardList, label: "Encuestas" },
      ]
    },
    { href: `/${condoId}/owner/reports`, icon: FileSearch, label: 'Publicaciones' },
  ];

  useEffect(() => {
    // Protección de ruta: Si no es propietario, fuera.
    if (!loading && role !== 'propietario') {
      router.replace('/welcome');
    }
  }, [role, loading, router]);
  
  if (loading || role !== 'propietario') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 font-bold uppercase text-[10px] tracking-widest">Verificando acceso EFAS...</p>
      </div>
    );
  }

  return (
    <DashboardLayout ownerData={ownerData} userRole={role} navItems={ownerNavItems}>
      {/* El padding bottom asegura que el BottomNavBar no tape el contenido en móviles */}
      <div className="pb-20 sm:pb-0">{children}</div>
      <BottomNavBar items={ownerBottomNavItems} pathname={pathname} />
    </DashboardLayout>
  );
}

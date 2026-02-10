'use client';

import React, { useEffect } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function CondoLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  useEffect(() => {
    // Si no hay parámetros o ruta todavía, esperamos a Next.js
    if (loading || !params || !pathname) return;

    const condoIdFromUrl = params.condoId as string;

    // 1. Si no hay usuario logueado en Firebase
    if (!user) {
      router.replace('/welcome');
      return;
    }

    // 2. Si hay usuario pero el rol todavía no se sincroniza
    if (!role) return;

    // 3. Verificación de Rol vs Ruta (Protección de EFAS CondoSys)
    const isAdminPath = pathname.includes(`/${condoIdFromUrl}/admin`);
    const isOwnerPath = pathname.includes(`/${condoIdFromUrl}/owner`);

    if (isAdminPath && (role === 'owner' || role === 'propietario')) {
      router.replace(`/${condoIdFromUrl}/owner/dashboard`);
    } else if (isOwnerPath && (role === 'admin' || role === 'administrador')) {
      router.replace(`/${condoIdFromUrl}/admin/dashboard`);
    }

  }, [user, role, loading, pathname, params, router]);

  // Pantalla de carga mientras se decide el acceso
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1A1D23]">
        <Loader2 className="animate-spin text-[#F28705] h-10 w-10" />
      </div>
    );
  }

  // Evitar renderizado si los hooks de Next.js no están listos
  if (!pathname || !params) return null;

  return <>{children}</>;
}

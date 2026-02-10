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
    // Si está cargando o no hay parámetros/ruta todavía, esperamos
    if (loading || !params || !pathname) return;

    // Extraemos el condoId con seguridad
    const condoIdFromUrl = params.condoId as string;

    // 1. Si no hay usuario, mandamos a welcome
    if (!user) {
      router.replace('/welcome');
      return;
    }

    // 2. Si hay usuario pero el rol aún no se define, esperamos
    if (!role) return;

    // 3. Verificación de "Match" entre Rol y Ruta
    // Usamos encadenamiento opcional (?.) y validación de nulidad para pathname
    const isAdminPath = pathname.includes(`/${condoIdFromUrl}/admin`);
    const isOwnerPath = pathname.includes(`/${condoIdFromUrl}/owner`);

    if (isAdminPath && role === 'owner') {
      console.log("EFAS: Redirigiendo propietario a su dashboard...");
      router.replace(`/${condoIdFromUrl}/owner/dashboard`);
    } else if (isOwnerPath && role === 'admin') {
      console.log("EFAS: Redirigiendo administrador a su dashboard...");
      router.replace(`/${condoIdFromUrl}/admin/dashboard`);
    }

  }, [user, role, loading, pathname, params, router]);

  // Pantalla de carga mientras se valida la seguridad
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1A1D23]">
        <Loader2 className="animate-spin text-[#F28705] h-10 w-10" />
      </div>
    );
  }

  // Si no hay pathname o params (SSR), no renderizamos nada para evitar errores
  if (!pathname || !params) return null;

  return <>{children}</>;
}

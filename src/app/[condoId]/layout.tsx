'use client';

import React, { useEffect } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * EFAS CondoSys - Layout de Condominio Centralizado
 * Gestiona la protección de rutas basada en activeCondoId y workingCondoId
 */
export default function CondoLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  useEffect(() => {
    // 1. Esperar a que Next.js y Auth estén listos
    if (loading || !params || !pathname) return;

    const condoIdFromUrl = params.condoId as string;

    // 2. Si no hay sesión activa en Firebase, mandar a Welcome
    if (!user) {
      router.replace('/welcome');
      return;
    }

    // 3. Si el usuario existe pero el rol aún se está recuperando de Firestore, esperar
    if (!role) return;

    // 4. Normalización de Roles para validación flexible
    const lowerRole = role.toLowerCase();
    const isAdmin = ['admin', 'administrador', 'super-admin'].includes(lowerRole);
    const isOwner = ['owner', 'propietario', 'residente'].includes(lowerRole);

    // 5. Identificación de la zona actual
    const isInAdminZone = pathname.includes(`/${condoIdFromUrl}/admin`);
    const isInOwnerZone = pathname.includes(`/${condoIdFromUrl}/owner`);

    /**
     * LÓGICA ANTI-REBOTE EFAS:
     * Solo redirigimos si hay una incongruencia confirmada.
     * Si el usuario está en su zona correcta, el efecto no hace NADA.
     */

    // Caso A: Usuario con rol de Propietario intentando entrar a zona Admin
    if (isInAdminZone && isOwner) {
      console.warn("EFAS: Acceso Admin denegado para Propietario. Redirigiendo...");
      router.replace(`/${condoIdFromUrl}/owner/dashboard`);
      return;
    }

    // Caso B: Usuario con rol de Admin intentando entrar a zona Owner
    if (isInOwnerZone && isAdmin) {
      console.warn("EFAS: Administrador en zona de Propietario. Redirigiendo a su Panel...");
      router.replace(`/${condoIdFromUrl}/admin/dashboard`);
      return;
    }

    // Caso C: Si el rol no es ninguno de los conocidos (seguridad extra)
    if (!isAdmin && !isOwner) {
      console.error("EFAS: Rol no reconocido:", role);
      router.replace('/welcome');
    }

  }, [user, role, loading, pathname, params, router]);

  // Loader refinado con estilo EFAS CondoSys
  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
        <div className="relative mb-4">
          <Loader2 className="animate-spin text-[#F28705] h-12 w-12" />
          <div className="absolute inset-0 bg-[#F28705]/20 blur-xl rounded-full animate-pulse"></div>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 animate-pulse">
          Verificando Credenciales
        </p>
      </div>
    );
  }

  // No renderizar nada hasta que los hooks de ruta estén hidratados
  if (!pathname || !params) return null;

  // Si pasa todas las validaciones, mostrar el contenido
  return <>{children}</>;
}

'use client';

import React, { useEffect } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

/**
 * EFAS CondoSys - Layout de Condominio Centralizado
 * Gestiona la protección de rutas basada en activeCondoId y workingCondoId
 */
export default function CondoLayout({ children }: { children: React.ReactNode }) {
  const { user, ownerData, role, loading, activeCondoId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  useEffect(() => {
    // 1. Esperar a que los hooks se hidraten y la autenticación se resuelva
    if (loading || !params || !pathname) return;

    const condoIdFromUrl = params.condoId as string;

    // 2. Si no hay sesión activa en Firebase, mandar a la página de bienvenida
    if (!user) {
      router.replace('/welcome');
      return;
    }

    // 3. El Super Admin tiene acceso a todo, no aplicar más reglas
    if (user.email === 'vallecondo@gmail.com') {
      return;
    }

    // 4. Esperar a que el rol y los datos del perfil se carguen desde la base de datos
    if (!role || !ownerData) return;

    // 5. Verificación de congruencia: ¿El ID de condominio de la URL coincide con el del usuario?
    // Esta es la corrección clave para evitar accesos cruzados y bucles de redirección.
    if (activeCondoId && activeCondoId !== condoIdFromUrl) {
        console.warn(`EFAS Mismatch: URL=${condoIdFromUrl}, User's Condo=${activeCondoId}. Redirecting.`);
        const userRolePath = (role.toLowerCase() === 'admin' || role.toLowerCase() === 'administrador') ? 'admin' : 'owner';
        router.replace(`/${activeCondoId}/${userRolePath}/dashboard`);
        return;
    }

    // 6. Normalización de Roles y Validación de Zona (admin vs. owner)
    const lowerRole = role.toLowerCase();
    const isAdmin = ['admin', 'administrador', 'super-admin'].includes(lowerRole);
    const isOwner = ['owner', 'propietario', 'residente'].includes(lowerRole);

    const isInAdminZone = pathname.includes(`/${condoIdFromUrl}/admin`);
    const isInOwnerZone = pathname.includes(`/${condoIdFromUrl}/owner`);

    // Redirección si un Propietario intenta acceder a la zona de Admin
    if (isInAdminZone && isOwner) {
      console.warn("EFAS: Acceso Admin denegado para Propietario. Redirigiendo...");
      router.replace(`/${condoIdFromUrl}/owner/dashboard`);
      return;
    }

    // Redirección si un Admin intenta acceder a la zona de Propietario
    if (isInOwnerZone && isAdmin) {
      console.warn("EFAS: Administrador en zona de Propietario. Redirigiendo a su Panel...");
      router.replace(`/${condoIdFromUrl}/admin/dashboard`);
      return;
    }

    // Medida de seguridad: si el rol no es reconocido, cerrar sesión y volver a welcome
    if (!isAdmin && !isOwner) {
      console.error("EFAS: Rol no reconocido:", role, "Cerrando sesión.");
      signOut(auth).finally(() => router.replace('/welcome'));
    }

  }, [user, ownerData, role, loading, pathname, params, router, activeCondoId]);

  // Loader refinado con estilo EFAS CondoSys
  if (loading || !user) {
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

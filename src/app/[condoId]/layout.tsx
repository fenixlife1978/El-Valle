'use client';

import React, { useEffect } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function CondoLayout({ children }: { children: React.ReactNode }) {
  const { user, ownerData, role, loading, activeCondoId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  useEffect(() => {
    // 1. No tomar decisiones si el AuthProvider está en proceso inicial
    if (loading || !params || !pathname) return;

    const condoIdFromUrl = params.condoId as string;

    // 2. Si no hay sesión de Firebase, al welcome inmediatamente
    if (!user) {
      router.replace('/welcome');
      return;
    }

    // 3. Super Admin Bypass (Email de vallecondo)
    if (user.email === 'vallecondo@gmail.com') return;

    // 4. Si terminó de cargar y NO hay ownerData, el usuario no tiene perfil en este condominio
    if (!loading && user && !ownerData) {
      console.warn("EFAS: Perfil no encontrado en Firestore para este usuario.");
      router.replace('/welcome');
      return;
    }

    // 5. Verificación de congruencia: URL vs Condominio Activo
    if (activeCondoId && activeCondoId !== condoIdFromUrl) {
        console.warn(`EFAS Mismatch: URL=${condoIdFromUrl}, User=${activeCondoId}. Corrigiendo ruta...`);
        const userRolePath = (role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'administrador') ? 'admin' : 'owner';
        router.replace(`/${activeCondoId}/${userRolePath}/dashboard`);
        return;
    }

    // 6. Validación de Zonas (Admin vs Owner)
    const lowerRole = role?.toLowerCase() || '';
    const isAdmin = ['admin', 'administrador', 'junta'].includes(lowerRole);
    const isOwner = ['owner', 'propietario', 'residente'].includes(lowerRole);

    const isInAdminZone = pathname.includes(`/${condoIdFromUrl}/admin`);
    const isInOwnerZone = pathname.includes(`/${condoIdFromUrl}/owner`);

    if (isInAdminZone && !isAdmin) {
      console.error("EFAS: Acceso Admin denegado.");
      router.replace(`/${condoIdFromUrl}/owner/dashboard`);
      return;
    }

    if (isInOwnerZone && !isOwner && !isAdmin) {
      console.error("EFAS: Acceso Owner denegado.");
      router.replace(`/${condoIdFromUrl}/admin/dashboard`);
      return;
    }

    // 7. Seguridad: Rol no reconocido
    if (!isAdmin && !isOwner) {
      console.error("EFAS: Rol inválido detectado.");
      signOut(auth).finally(() => router.replace('/welcome'));
    }

  }, [user, ownerData, role, loading, pathname, params, router, activeCondoId]);

  // Pantalla de bloqueo mientras se sincroniza TODO (Auth + Firestore)
  if (loading || (user && !ownerData && user.email !== 'vallecondo@gmail.com')) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
        <div className="relative mb-4">
          <Loader2 className="animate-spin text-[#F28705] h-12 w-12" />
          <div className="absolute inset-0 bg-[#F28705]/20 blur-xl rounded-full animate-pulse"></div>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 animate-pulse">
          Sincronizando Acceso EFAS...
        </p>
      </div>
    );
  }

  
  if (!pathname || !params) return null;


  return <>{children}</>;
}

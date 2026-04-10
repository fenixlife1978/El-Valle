'use client';

import { useAuth } from "@/hooks/use-auth";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, activeCondoId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const condoId = params.condoId as string;

  useEffect(() => {
    if (loading) return;

    // Si no hay usuario, fuera
    if (!user) {
      router.replace('/welcome');
      return;
    }

    // VALIDACIÓN FLEXIBLE DE ROL
    const userRole = role?.toLowerCase() || '';
    const isValidOwner = ['owner', 'propietario', 'residente', 'usuarios', 'users'].includes(userRole);

    if (!isValidOwner) {
      console.warn("Acceso denegado: Rol no válido para área de propietarios", userRole);
      router.replace('/welcome');
      return;
    }

    // Si el condo de la URL no es el activo, corregimos la ruta
    if (activeCondoId && condoId !== activeCondoId) {
      router.replace(`/${activeCondoId}/owner/dashboard`);
    }
  }, [user, role, loading, activeCondoId, condoId, router]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
        <Loader2 className="animate-spin text-[#F28705] h-12 w-12" />
        <p className="mt-4 font-black uppercase text-[10px] tracking-[0.3em] text-white/60">
          Cargando Entorno EFAS...
        </p>
      </div>
    );
  }

  // Si no está cargando pero no hay usuario o el rol es incorrecto
  const userRole = role?.toLowerCase() || '';
  const isValidOwner = ['owner', 'propietario', 'residente', 'usuarios', 'users'].includes(userRole);
  
  if (!user || !isValidOwner) return null;

  return (
    <>
      <Header />
      <div className="pt-4">
        {children}
      </div>
    </>
  );
}

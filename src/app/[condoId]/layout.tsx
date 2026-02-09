'use client';

import React, { useEffect } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function CondoLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, activeCondoId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/welcome');
      return;
    }

    if (!role && !loading) {
      console.warn("Usuario autenticado pero sin rol en este condominio");
      return;
    }

    const isAdminRoute = pathname.includes('/admin');
    const isOwnerRoute = pathname.includes('/owner');

    if (isAdminRoute && role !== 'admin' && role !== 'super-admin') {
      router.replace(`/${activeCondoId}/owner/dashboard`);
    } else if (isOwnerRoute && role === 'admin') {
      router.replace(`/${activeCondoId}/admin/dashboard`);
    }

  }, [user, role, loading, pathname, router, activeCondoId]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
        <div className="relative">
          <Loader2 className="animate-spin text-[#F28705] h-12 w-12" />
          <div className="absolute inset-0 blur-xl bg-[#F28705]/20 animate-pulse"></div>
        </div>
        <p className="mt-6 font-black uppercase text-[10px] tracking-[0.4em] text-white/50 animate-pulse">
          Sincronizando EFAS CondoSys
        </p>
      </div>
    );
  }

  return <>{user ? children : null}</>;
}

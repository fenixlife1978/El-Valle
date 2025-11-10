
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// Este componente ahora sirve principalmente para redirigir desde la raíz.
// El AuthGuard en el layout maneja la lógica, pero esto actúa como un
// enrutador principal del lado del cliente.
export default function HomePage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return; // Espera a que termine la carga de autenticación
    }

    if (user && role) {
      // Si el usuario está autenticado y tiene un rol, redirige a su dashboard
      const destination = role === 'administrador' ? '/admin/dashboard' : '/owner/dashboard';
      router.replace(destination);
    } else if (!user) {
      // Si no hay usuario, redirige a la página de bienvenida
      router.replace('/welcome');
    }
    // La dependencia de `router` es importante si se usa fuera de `useEffect`
  }, [user, role, loading, router]);
  
  // Muestra un indicador de carga universal mientras se decide a dónde redirigir
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="ml-2">Cargando aplicación...</p>
    </div>
  );
}

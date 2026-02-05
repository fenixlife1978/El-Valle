'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AuthorizationProvider } from '@/hooks/use-authorization';
import { SupportBanner } from '@/components/support-banner';
import { Loader2 } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import { cn } from '@/lib/utils';
import { SYSTEM_LOGO, COMPANY_NAME } from '@/lib/constants';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['400', '700', '900'],
});

const publicPaths = ['/', '/welcome', '/login', '/forgot-password', '/register', '/onboarding'];

function AuthGuard({ children }: { children: ReactNode }) {
  // Nota: Usamos activeCondoId que es donde tu hook debe estar guardando el 'condominioId' de Firestore
  const { user, role, loading, isSuperAdmin, activeCondoId } = useAuth();
  const pathname = usePathname() ?? '';
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const isPublic = publicPaths.includes(pathname);
    
    // 1. SIN SESIÓN
    if (!user) {
      if (!isPublic) {
        router.replace('/');
      }
      return;
    }

    // 2. CASO SUPER ADMIN
    if (isSuperAdmin) {
      if (isPublic) {
        router.replace('/super-admin');
      }
      return;
    }

    // 3. USUARIOS (ADMIN/OWNER) 
    // Extraemos el ID del condominio. 
    // Si tu hook useAuth carga el documento de 'owners', activeCondoId debería tener ese valor.
    const pathParts = pathname.split('/').filter(Boolean);
    const hasCondoInPath = pathParts.length > 0 && pathParts[0].startsWith('condo_');

    // Si estamos en una ruta pública o la ruta privada no tiene el ID (ej: /admin/dashboard)
    if (isPublic || !hasCondoInPath) {
      // Prioridad: activeCondoId (de la DB) -> localStorage -> fallback condo_01
      const targetCondo = activeCondoId || localStorage.getItem('workingCondoId') || 'condo_01';
      
      if (role) {
        // Normalizamos el rol para construir la ruta física
        const roleLower = role.toLowerCase();
        const targetRole = (roleLower === 'admin' || roleLower === 'administrador') 
          ? 'admin' 
          : 'owner';
          
        const destination = `/${targetCondo}/${targetRole}/dashboard`;
        
        console.log(`[EFAS] Redirigiendo a: ${destination}`);
        router.replace(destination);
      }
    }
  }, [user, role, loading, pathname, isSuperAdmin, activeCondoId, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#1A1D23] fixed inset-0 z-[500]">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-3xl border border-[#F28705]/20 animate-ping opacity-25" />
          <img 
            src={SYSTEM_LOGO} 
            alt={COMPANY_NAME} 
            className="h-28 w-28 rounded-3xl shadow-2xl animate-pulse object-cover border-4 border-[#F28705]/10 relative z-10" 
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-[#F28705]" />
            <p className="font-black italic tracking-tighter text-4xl uppercase text-white">
              <span className="text-[#F28705]">EFAS</span>
              <span>CONDOSYS</span>
            </p>
          </div>
          <p className="text-[10px] text-slate-400 font-bold tracking-[0.6em] uppercase opacity-60">
            Sincronizando Condominio
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={montserrat.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1A1D23" />
        <link rel="apple-touch-icon" href={SYSTEM_LOGO} />
        <link rel="icon" href={SYSTEM_LOGO} type="image/jpeg" />
        <title>{COMPANY_NAME} | Gestión de Condominios</title>
      </head>
      <body suppressHydrationWarning className={cn(
          "antialiased selection:bg-[#F28705] selection:text-white font-sans min-h-screen bg-[#1A1D23] text-foreground",
          montserrat.className
        )}>
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
            <AuthorizationProvider>
              <AuthGuard>
                <div className="relative flex min-h-screen w-full flex-col">
                  <SupportBanner />
                  {children}
                </div>
              </AuthGuard>
              <Toaster />
            </AuthorizationProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

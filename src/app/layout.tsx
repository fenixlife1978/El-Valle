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
  const { user, role, loading, isSuperAdmin, activeCondoId } = useAuth();
  const pathname = usePathname() ?? '';
  const router = useRouter();

  useEffect(() => {
    // Si todavía está cargando la sesión de Firebase, no hacemos nada
    if (loading) return;

    const isPublic = publicPaths.includes(pathname);
    
    // REGLA EFAS CondoSys: Determinar el ID de trabajo
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const workingCondoId = (isSuperAdmin && sId) ? sId : activeCondoId;

    // 1. CASO SUPER ADMIN
    if (isSuperAdmin) {
      if (isPublic) {
        router.replace('/super-admin');
      }
      return;
    }

    // 2. CASO USUARIOS REGULARES (Admin/Owner)
    if (user) {
      if (isPublic) {
        if (!workingCondoId) {
          console.warn("EFAS: Usuario autenticado pero sin activeCondoId.");
          return;
        }

        // NORMALIZACIÓN DE ROL: Traducimos lo que venga de DB a las rutas de Next.js
        const currentRole = role?.toLowerCase();
        
        if (currentRole === 'admin' || currentRole === 'administrador') {
          // Si el rol es admin (en inglés o español), va a la carpeta /admin/
          router.replace(`/${workingCondoId}/admin/dashboard`);
        } else if (currentRole === 'owner' || currentRole === 'propietario') {
          // Si el rol es propietario (en inglés o español), va a la carpeta /owner/
          router.replace(`/${workingCondoId}/owner/dashboard`);
        }
      }
    } 
    // 3. SIN SESIÓN ACTIVA
    else {
      if (!isPublic) {
        router.replace('/welcome');
      }
    }
  }, [user, role, loading, pathname, router, isSuperAdmin, activeCondoId]);

  // Pantalla de carga profesional de EFAS CondoSys
  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background fixed inset-0 z-[500]">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-3xl border border-primary/20 animate-ping opacity-25" />
          <img 
            src={SYSTEM_LOGO} 
            alt={COMPANY_NAME} 
            className="h-28 w-28 rounded-3xl shadow-2xl animate-pulse object-cover border-4 border-primary/10 relative z-10" 
          />
        </div>
        
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="font-black italic tracking-tighter text-4xl uppercase">
              <span className="text-primary">EFAS</span>
              <span className="text-foreground">CONDOSYS</span>
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold tracking-[0.6em] uppercase opacity-60">
            Sincronizando Ecosistema
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
          "antialiased selection:bg-primary selection:text-primary-foreground font-sans min-h-screen bg-background text-foreground",
          montserrat.className
        )}>
        
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            <AuthorizationProvider>
              <AuthGuard>
                <div className="relative flex min-h-screen w-full flex-col">
                  <SupportBanner /> {/* Banner para modo soporte super-admin */}
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

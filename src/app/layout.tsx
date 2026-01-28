
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AuthorizationProvider } from '@/hooks/use-authorization';
import { SupportBanner } from '@/components/support-banner';
import { Loader2 } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import { cn } from '@/lib/utils';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['400', '700', '900'],
});

const publicPaths = ['/', '/welcome', '/login', '/forgot-password', '/register', '/onboarding'];

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, role, loading, isSuperAdmin } = useAuth();
  const pathname = usePathname() ?? '';
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    
    if (isSuperAdmin) return;

    const isPublic = publicPaths.includes(pathname);

    if (user && isPublic) {
      if (role === 'admin' || role === 'administrador') {
        router.replace('/admin/dashboard');
      } else if (role === 'propietario') {
        router.replace('/owner/dashboard');
      }
    } 
    
    if (!user && !isPublic) {
      router.replace('/login');
    }
  }, [user, role, loading, pathname, router, isSuperAdmin]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="mt-6 font-black italic tracking-tighter text-3xl uppercase">
              <span className="text-orange-500">EFAS</span>
              <span className="text-slate-800 dark:text-slate-100">CONDOSYS</span>
            </p>
            <p className="text-[9px] text-muted-foreground font-bold tracking-[0.4em] uppercase mt-2">
              Autogestión de Condominios
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
        <link rel="apple-touch-icon" href="/og-banner.png?v=2" />
        <link rel="icon" href="/og-banner.png?v=2" type="image/png" />
        <title>EFAS CondoSys | Autogestión de Condominios</title>
      </head>
      <body suppressHydrationWarning className={cn(
          "antialiased selection:bg-primary selection:text-primary-foreground font-body",
          montserrat.className
        )}>
        
        <div className="w-full h-1 bg-primary fixed top-0 z-[110] shadow-lg shadow-blue-500/20" />
        
        <AuthProvider>
          <SupportBanner />
          <AuthorizationProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem={false}
              disableTransitionOnChange
            >
              <AuthGuard>
                <div className="min-h-screen bg-background text-foreground">
                    {children}
                </div>
              </AuthGuard>
              <Toaster />
            </ThemeProvider>
          </AuthorizationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

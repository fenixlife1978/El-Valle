
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
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-[#0081c9] mx-auto" />
            <p className="mt-6 font-black italic tracking-tighter text-3xl uppercase font-montserrat">
              <span className="text-[#f59e0b]">EFAS</span>
              <span className="text-[#0081c9]">CondoSys</span>
            </p>
            <p className="text-[9px] text-slate-500 font-bold tracking-[0.4em] uppercase mt-2">
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
        <meta name="theme-color" content="#0081c9" />
        <link rel="apple-touch-icon" href="/og-banner.png?v=2" />
        <link rel="icon" href="/og-banner.png?v=2" type="image/png" />
        <title>EFAS CondoSys | Autogestión de Condominios</title>
      </head>
      <body suppressHydrationWarning className={cn(
          "antialiased selection:bg-[#0081c9] selection:text-white font-body",
          montserrat.className
        )}>
        
        <div className="w-full h-1 bg-[#0081c9] fixed top-0 z-[110] shadow-lg shadow-blue-500/20" />
        
        <AuthProvider>
          <SupportBanner />
          <AuthorizationProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              disableTransitionOnChange
            >
              <AuthGuard>
                <div className="min-h-screen bg-slate-50 text-slate-800">
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

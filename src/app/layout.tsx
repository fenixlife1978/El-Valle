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
import { SYSTEM_LOGO, COMPANY_NAME, SYSTEM_WORDMARK } from '@/lib/constants';

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
      router.replace('/');
    }
  }, [user, role, loading, pathname, router, isSuperAdmin]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-center flex flex-col items-center">
            <img 
              src={SYSTEM_LOGO} 
              alt={COMPANY_NAME} 
              className="h-24 w-24 rounded-2xl shadow-2xl mb-6 animate-pulse object-cover border-2 border-primary/20"
            />
            
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            
            <p className="font-black italic tracking-tighter text-3xl uppercase">
              <span className="text-primary">EFAS</span>
              <span className="text-foreground">CONDOSYS</span>
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
        <link rel="apple-touch-icon" href={SYSTEM_LOGO} />
        <link rel="icon" href={SYSTEM_LOGO} type="image/jpeg" />
        <title>{COMPANY_NAME} | Autogestión de Condominios</title>
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

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
  const { user, loading } = useAuth();
  const pathname = usePathname() ?? '';
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const isPublic = publicPaths.includes(pathname);
    if (!user && !isPublic) {
      router.replace('/welcome');
    }
  }, [user, loading, pathname, router]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('SW registrado:', reg.scope))
          .catch((err) => console.warn('Error SW:', err));
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#1A1D23] fixed inset-0 z-[500]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#F28705]" />
          <div className="text-center">
            <p className="font-black italic text-2xl uppercase text-white tracking-tighter">
              <span className="text-[#F28705]">EFAS</span> CONDOSYS
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning className={montserrat.variable}>
      <head>
        <title>{COMPANY_NAME} | EFAS CondoSys</title>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1A1D23" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body suppressHydrationWarning className={cn(
        "antialiased font-sans min-h-screen bg-[#1A1D23] text-foreground selection:bg-[#F28705] selection:text-white",
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

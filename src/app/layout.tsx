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
    
    // Solo expulsar si intenta entrar a algo privado sin estar logueado
    if (!user && !isPublic) {
      console.log("[EFAS] Acceso no autorizado, redirigiendo a welcome");
      router.replace('/welcome');
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#1A1D23]">
        <Loader2 className="h-10 w-10 animate-spin text-[#F28705]" />
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
        <title>{COMPANY_NAME} | EFAS CondoSys</title>
      </head>
      <body suppressHydrationWarning className={cn(
          "antialiased font-sans min-h-screen bg-[#1A1D23] text-foreground",
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

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AuthorizationProvider } from '@/hooks/use-authorization';
import { Loader2 } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import { cn } from '@/lib/utils';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
});

const publicPaths = ['/', '/welcome', '/login', '/forgot-password', '/register'];

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, role, loading } = useAuth();
  const pathname = usePathname() ?? '';
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const isPublic = publicPaths.includes(pathname);

    if (user && isPublic) {
      if (role === 'super-admin' || role === 'administrador') {
        router.replace('/admin/dashboard');
      } else if (role) {
        router.replace('/owner/dashboard');
      }
    } 
    if (!user && !isPublic) {
      router.replace('/login');
    }
  }, [user, role, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#020617]">
        <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-[#006241] mx-auto" />
            <p className="mt-4 text-slate-400 font-medium tracking-widest text-xs">VALLECONDO</p>
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
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#006241" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="icon" href="/og-banner.png" type="image/png" />
        <title>VALLECONDO</title>
      </head>
      <body className={cn(
          "antialiased selection:bg-[#006241] selection:text-white font-body",
          montserrat.variable
        )}>
        {/* Barra de acento superior con el verde del logo */}
        <div className="w-full h-1 bg-[#006241] fixed top-0 z-50" />
        
        <AuthProvider>
          <AuthorizationProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem={false}
              disableTransitionOnChange
            >
              <AuthGuard>
                {/* Contenedor principal con fondo relajante para la vista */}
                <div className="min-h-screen bg-[#020617] text-slate-200">
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

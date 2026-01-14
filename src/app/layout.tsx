
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AuthorizationProvider } from '@/hooks/use-authorization';
import { Loader2 } from 'lucide-react';

const publicPaths = ['/welcome', '/login', '/forgot-password', '/register'];

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, role, loading } = useAuth();
  const rawPathname = usePathname();
  const pathname = rawPathname ?? '';
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const isPublic = publicPaths.some(path => pathname.startsWith(path));

    if (user) {
      if (isPublic) {
        router.replace(role === 'administrador' ? '/admin/dashboard' : '/owner/dashboard');
      }
    } else if (!isPublic) {
      router.replace('/welcome');
    }
  }, [user, role, loading, pathname, router]);

  if (loading || (!user && !publicPaths.some(path => pathname.startsWith(path)))) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Cargando...</p>
      </div>
    );
  }

  if (user && publicPaths.some(path => pathname.startsWith(path))) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Redirigiendo...</p>
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

   useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('SW registered: ', registration);
        }).catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
      });
    }
  }, []);

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* --- PWA AND META TAGS --- */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#006241" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        {/* --- FUENTES Y FAVICON --- */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/og-banner.png" type="image/png" sizes="any" />
        <title>VALLECONDO</title>
        <meta name="description" content="App de Autogestion de Condominio Conjunto Residencial El Valle" />

        {/* --- OPEN GRAPH --- */}
        <meta property="og:title" content="VALLECONDO" />
        <meta property="og:description" content="App de Autogestion de Condominio Conjunto Residencial El Valle" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://valle-condo.vercel.app" />
        <meta property="og:image" content="https://valle-condo.vercel.app/og-banner.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* --- TWITTER --- */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="VALLECONDO" />
        <meta name="twitter:image" content="https://valle-condo.vercel.app/og-banner.png" />
      </head>
      <body className="font-body antialiased bg-background text-foreground">
        <AuthProvider>
          <AuthorizationProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem={false}
              disableTransitionOnChange
            >
              <AuthGuard>
                {children}
              </AuthGuard>
              <Toaster />
            </ThemeProvider>
          </AuthorizationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

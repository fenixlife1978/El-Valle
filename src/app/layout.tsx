
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { ensureOwnerProfile } from '@/lib/user-sync';
import { useToast } from '@/hooks/use-toast';


const publicPaths = ['/welcome', '/login', '/forgot-password'];

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, role, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (loading) return; // Wait until loading is finished

    const isPublic = publicPaths.some(path => pathname.startsWith(path));
    
    if (user) {
      // User is logged in, ensure profile exists
      ensureOwnerProfile(user, toast).then(() => {
          if (role) {
            if (isPublic) {
              // If on a public page, redirect to the correct dashboard
              router.replace(role === 'administrador' ? '/admin/dashboard' : '/owner/dashboard');
            }
          }
      });
    } else {
      // User is not logged in
      if (!isPublic) {
        // If on a protected page, redirect to login
        router.replace('/welcome');
      }
    }

  }, [user, role, loading, pathname, router, toast]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Cargando...</p>
      </div>
    );
  }

  // If we are on a public path and not logged in, show the page.
  // If we are logged in and on a protected path, show the page.
  // The useEffect handles the redirection for mismatched states.
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet" />
        <title>VALLECONDO</title>
        <meta name="description" content="Condominium Management App" />
      </head>
      <body className="font-body antialiased bg-background text-foreground">
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <AuthGuard>
              {children}
            </AuthGuard>
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

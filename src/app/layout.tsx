
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
    if (loading) return; 

    const isPublic = publicPaths.some(path => pathname.startsWith(path));
    
    if (user && role) {
        if (isPublic) {
          router.replace(role === 'administrador' ? '/admin/dashboard' : '/owner/dashboard');
        }
    } else if (!user && !isPublic) {
        router.replace('/welcome');
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

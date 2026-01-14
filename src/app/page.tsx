'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Hand } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';

export default function SplashScreenPage() {
  const router = useRouter();
  const { companyInfo, loading: authLoading } = useAuth();
  
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (companyInfo?.logo) {
        setLogoUrl(companyInfo.logo);
      }
      setLoading(false);
    }
  }, [authLoading, companyInfo]);

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
      <div className="flex flex-col items-center gap-12">
        <div className="w-48 h-48 rounded-full overflow-hidden bg-card border-4 border-card shadow-lg flex items-center justify-center">
          {logoUrl ? (
            <Image 
              src={logoUrl} 
              alt="Logo Empresa" 
              width={192}
              height={192}
              className="w-full h-full object-cover" 
            />
          ) : (
            <Skeleton className="w-full h-full" />
          )}
        </div>
        <Button 
          size="lg" 
          variant="outline"
          className="rounded-full w-20 h-20 shadow-lg"
          onClick={() => router.push('/welcome')}
          aria-label="Avanzar a la página de bienvenida"
        >
          <Hand className="h-10 w-10 text-primary" />
        </Button>
      </div>
    </main>
  );
}

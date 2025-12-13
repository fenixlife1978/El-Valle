
'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import RoleSelectionButtons from '@/app/role-selection-buttons';

export default function WelcomePage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogo() {
      try {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
          const settings = docSnap.data();
          if (settings.companyInfo && settings.companyInfo.logo) {
            setLogoUrl(settings.companyInfo.logo);
          }
        }
      } catch (error) {
        console.error("Error fetching company logo:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchLogo();
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-12">
        {loading ? (
          <Skeleton className="w-32 h-32 rounded-full mx-auto mb-6" />
        ) : (
          <div className="w-32 h-32 flex items-center justify-center overflow-hidden mx-auto mb-6 rounded-full bg-white">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo Empresa" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full rounded-full bg-muted" />
            )}
          </div>
        )}
        <h1 className="text-4xl font-bold font-headline text-primary">Bienvenid@ a VALLECONDO</h1>
        <p className="text-lg text-muted-foreground mt-2">Seleccione su rol para continuar</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
        <RoleSelectionButtons />
      </div>
    </main>
  );
}

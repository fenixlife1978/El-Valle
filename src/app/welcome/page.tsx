
'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import RoleSelectionButtons from '@/app/role-selection-buttons';

function WelcomePageContent() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogo() {
      try {
        const settingsRef = doc(db(), 'config', 'mainSettings');
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
          <Skeleton className="w-24 h-24 rounded-full mx-auto mb-6" />
        ) : (
          <Avatar className="w-24 h-24 mx-auto mb-6 bg-white flex items-center justify-center overflow-hidden">
            <AvatarImage src={logoUrl || ''} alt="Company Logo" className="object-contain" />
            <AvatarFallback>VC</AvatarFallback>
          </Avatar>
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

export default function WelcomePage() {
    return <WelcomePageContent />;
}

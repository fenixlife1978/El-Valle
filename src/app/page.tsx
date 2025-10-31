
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';

export default function RoleSelectionPage() {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loadingLogo, setLoadingLogo] = useState(true);

  useEffect(() => {
    const fetchLogo = async () => {
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
        setLoadingLogo(false);
      }
    };

    fetchLogo();
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-12">
        {loadingLogo ? (
          <Skeleton className="h-24 w-24 rounded-full mx-auto mb-6" />
        ) : (
          <Avatar className="w-24 h-24 text-lg mx-auto mb-6">
            <AvatarImage src={logoUrl || ''} alt="Company Logo" />
            <AvatarFallback>VC</AvatarFallback>
          </Avatar>
        )}
        <h1 className="text-4xl font-bold font-headline text-primary">Bienvenid@ a VALLECONDO</h1>
        <p className="text-lg text-muted-foreground mt-2">Seleccione su rol para continuar</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
        <Card className="hover:border-primary transition-all">
          <CardHeader className="items-center text-center">
            <Shield className="h-12 w-12 text-primary mb-4" />
            <CardTitle>Administrador</CardTitle>
            <CardDescription>Acceso al panel de gestión y configuración del condominio.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push('/login?role=admin')}>
              Entrar como Administrador
            </Button>
          </CardContent>
        </Card>
        <Card className="hover:border-primary transition-all">
           <CardHeader className="items-center text-center">
            <User className="h-12 w-12 text-primary mb-4" />
            <CardTitle>Propietario</CardTitle>
            <CardDescription>Consulte sus deudas, pagos y estado de cuenta.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push('/login?role=owner')}>
              Entrar como Propietario
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}


'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';

export default function WelcomePage() {
  const router = useRouter();
  const { companyInfo, loading: authLoading } = useAuth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-12">
        {authLoading ? (
          <Skeleton className="w-32 h-32 rounded-full mx-auto mb-6" />
        ) : (
          <div className="w-32 h-32 rounded-full mx-auto mb-6 overflow-hidden bg-card border flex items-center justify-center">
            {companyInfo?.logo ? (
              <img src={companyInfo.logo} alt="Logo Empresa" className="w-full h-full object-cover" />
            ) : (
              <User className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
        )}
        <h1 className="text-4xl font-bold font-headline text-primary">Bienvenid@ a tu portal de Autogestión</h1>
        <p className="text-lg text-muted-foreground mt-2">Seleccione su rol para continuar</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
        <Card className="hover:border-primary transition-all shadow-md">
          <CardHeader className="items-center text-center">
            <Shield className="h-12 w-12 text-primary mb-4" />
            <CardTitle>Administrador</CardTitle>
            <CardDescription>Gestión y configuración del condominio.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push('/login?role=admin')}>
              Entrar como Administrador
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary transition-all shadow-md">
          <CardHeader className="items-center text-center">
            <User className="h-12 w-12 text-primary mb-4" />
            <CardTitle>Propietario</CardTitle>
            <CardDescription>Consulte deudas, pagos y estado de cuenta.</CardDescription>
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

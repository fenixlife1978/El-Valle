'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, ShieldCheck } from 'lucide-react';

export default function OnboardingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3"><Building2 className="h-10 w-10 text-primary" /></div>
          <CardTitle>Activación de condominio</CardTitle>
          <CardDescription>El alta y aprovisionamiento de bases de datos se gestiona desde EFAS CondoSys.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>El sistema crea una base de datos Turso independiente para cada condominio y registra al administrador inicial de forma segura.</p>
          <p>Por seguridad, esta pantalla ya no activa condominios con claves heredadas ni crea cuentas en Firebase. Contacta al superadministrador para dar de alta tu condominio.</p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full"><Link href="/login?role=admin"><ShieldCheck className="mr-2 h-4 w-4" />Acceso administrativo</Link></Button>
          <Button asChild variant="ghost" className="w-full"><Link href="/welcome">Volver al inicio</Link></Button>
        </CardFooter>
      </Card>
    </main>
  );
}

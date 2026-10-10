'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus, ShieldCheck } from 'lucide-react';

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3"><ShieldCheck className="h-10 w-10 text-primary" /></div>
          <CardTitle>Acceso de propietario</CardTitle>
          <CardDescription>Las cuentas se crean desde el panel administrativo del condominio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Para mantener los datos de cada condominio aislados y protegidos, no se permite el autorregistro público.</p>
          <p>Solicita al administrador que cree tu usuario y te entregue tus credenciales iniciales. Si ya tienes una cuenta, inicia sesión.</p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full"><Link href="/login?role=owner"><UserPlus className="mr-2 h-4 w-4" />Iniciar sesión</Link></Button>
          <Button asChild variant="ghost" className="w-full"><Link href="/welcome">Volver al inicio</Link></Button>
        </CardFooter>
      </Card>
    </main>
  );
}

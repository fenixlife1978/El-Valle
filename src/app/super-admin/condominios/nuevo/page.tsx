'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, ShieldPlus, ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function NuevoCondominioPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const id = formData.get('id') as string; // Ej: condo_01
    const nombre = formData.get('nombre') as string;
    const accessKey = formData.get('accessKey') as string;

    try {
      // 1. Crear el documento principal del condominio
      await setDoc(doc(db, 'condominios', id), {
        id,
        nombre,
        accessKey,
        status: 'active',
        plan: 'Premium',
        createdAt: serverTimestamp(),
      });

      // 2. Crear la subcolección de configuración inicial
      await setDoc(doc(db, 'condominios', id, 'config', 'settings'), {
        companyInfo: {
          name: nombre,
          logo: '',
        },
        exchangeRates: [],
        lastUpdated: serverTimestamp()
      });

      toast({ title: "¡Éxito!", description: "Condominio registrado y configurado." });
      router.push('/super-admin/condominios');
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: "Error", description: "No tienes permisos de Super Admin." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Button variant="ghost" onClick={() => router.back()} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Volver
      </Button>

      <Card className="shadow-2xl border-t-4 border-t-blue-600">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-xl">
              <ShieldPlus className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-2xl">Registrar Condominio</CardTitle>
              <CardDescription>Crea un nuevo inquilino en el sistema SaaS</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="id">ID del Condominio (Unico, sin espacios)</Label>
              <Input id="id" name="id" placeholder="ej: valle-condo-01" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre Comercial / Edificio</Label>
              <Input id="nombre" name="nombre" placeholder="Residencias El Valle" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessKey">Clave Dinámica Inicial</Label>
              <Input id="accessKey" name="accessKey" placeholder="Escribe una clave de acceso" required />
            </div>

            <Button type="submit" className="w-full text-lg h-12" disabled={loading}>
              {loading ? <Loader2 className="animate-spin mr-2" /> : "Dar de Alta Condominio"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

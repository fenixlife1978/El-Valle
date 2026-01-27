
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { DatabaseZap, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

export default function MigrationPage() {
  const { toast } = useToast();
  const { ownerData, loading: authLoading } = useAuth() as any;
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  // Si no es super-admin o administrador, proteger la página
  useEffect(() => {
    if (!authLoading && !ownerData) {
      router.push('/login');
    }
  }, [ownerData, authLoading, router]);

  const migrateCollection = async (collectionName: string, targetPath: string) => {
    if (!ownerData?.condominioId) {
        toast({ variant: "destructive", title: "Error", description: "No se detectó ID de condominio." });
        return;
    }
    setLoading(collectionName);
    
    try {
      const querySnapshot = await getDocs(collection(db, collectionName));
      let count = 0;

      for (const document of querySnapshot.docs) {
        const data = document.data();
        // Filtramos para que solo migre lo que pertenece a este condominio
        // o documentos que no tengan condominioId (como configuraciones viejas)
        if (!data.condominioId || data.condominioId === ownerData.condominioId) {
          const newDocRef = doc(db, "condominios", ownerData.condominioId, targetPath, document.id);
          await setDoc(newDocRef, data);
          count++;
        }
      }

      toast({ title: "Migración Exitosa", description: `Se movieron ${count} documentos a la subcolección ${targetPath}.` });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error de Permisos", description: "Revisa las reglas de Firebase." });
    } finally {
      setLoading(null);
    }
  };

  if (authLoading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto" /> Cargando permisos...</div>;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div className="mb-10">
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
              Sistema de <span className="text-[#0081c9]">Migración</span>
          </h2>
          <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
          <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
              Herramienta para la transición de datos a la nueva estructura multi-condominio.
          </p>
      </div>

      <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
        <div className="flex items-center">
          <AlertTriangle className="text-amber-400 mr-3" />
          <p className="text-sm text-amber-700">
            <strong>Atención:</strong> Esta herramienta mueve datos de la raíz a la estructura interna de <strong>{ownerData?.condominioId}</strong>.
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MigrationCard 
          title="Propietarios" 
          icon="owners" 
          loading={loading} 
          onClick={() => migrateCollection('owners', 'owners')} 
        />
        <MigrationCard 
          title="Cartelera" 
          icon="billboard" 
          loading={loading} 
          onClick={() => migrateCollection('billboard_announcements', 'billboard_announcements')} 
        />
        <MigrationCard 
          title="Pagos" 
          icon="payments" 
          loading={loading} 
          onClick={() => migrateCollection('payments', 'payments')} 
        />
        <MigrationCard 
          title="Configuración" 
          icon="config" 
          loading={loading} 
          onClick={() => migrateCollection('config', 'config')} 
        />
      </div>
    </div>
  );
}

function MigrationCard({ title, icon, loading, onClick }: any) {
  return (
    <Card className="hover:shadow-lg transition-shadow border-slate-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-widest text-slate-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={onClick} 
          disabled={loading !== null}
          className="w-full bg-[#0081c9] hover:bg-[#006da8] text-white font-bold rounded-xl"
        >
          {loading === icon ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <DatabaseZap className="mr-2 h-4 w-4" />}
          Migrar ahora
        </Button>
      </CardContent>
    </Card>
  );
}

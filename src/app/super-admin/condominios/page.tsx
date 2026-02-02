
'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Building2, ArrowRight, Loader2, ShieldCheck, Plus } from 'lucide-react';
import Link from 'next/link';

export default function SuperAdminCondosPage() {
  const [condominios, setCondominios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const q = query(collection(db, 'condominios'), orderBy('nombre', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCondominios(data);
      setLoading(false);
    }, (error) => {
      console.error("Error EFAS:", error);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Sincronizando EFAS CondoSys...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto font-montserrat min-h-screen">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-amber-500 mb-2">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-[0.4em]">Directorio Global</span>
          </div>
          <h1 className="text-6xl font-black uppercase italic tracking-tighter text-foreground leading-none">
            Condo<span className="text-amber-500">minios</span>
          </h1>
          <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest mt-4">Gestión de Propiedades EFAS</p>
        </div>
        <Link href="/super-admin/condominios/nuevo">
          <Button className="rounded-2xl font-black uppercase text-[10px] py-6 px-8 bg-amber-500 hover:bg-amber-600 text-white gap-2 shadow-lg shadow-amber-500/20">
            <Plus className="h-4 w-4" /> Registrar Nuevo
          </Button>
        </Link>
      </div>

      <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-card/40 backdrop-blur-xl border border-white/10">
        <CardHeader className="bg-muted/30 border-b border-white/5 p-8">
          <div className="flex items-center gap-3">
            <Building2 className="text-amber-500 h-6 w-6" />
            <CardTitle className="text-xl font-black uppercase tracking-tight italic text-foreground">Portafolio Activo</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow className="hover:bg-transparent border-b border-white/5">
                <TableHead className="py-6 pl-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre del Condominio</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ID del Sistema</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right pr-10">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {condominios.map((condo) => (
                <TableRow key={condo.id} className="border-b border-white/5 group hover:bg-amber-500/5 transition-all duration-300">
                  <TableCell className="py-8 pl-10">
                    <div className="flex flex-col">
                      <span className="font-black text-xl uppercase tracking-tighter group-hover:text-amber-500 transition-colors text-foreground">
                        {condo.nombre}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Ref: {condo.id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-[10px] font-mono bg-muted/50 px-3 py-1.5 rounded-lg text-amber-500/80 border border-amber-500/10 uppercase">
                      {condo.id}
                    </code>
                  </TableCell>
                  <TableCell className="text-right pr-10">
                    <Button 
                      onClick={() => router.push(`/${condo.id}/admin/dashboard`)}
                      className="rounded-xl font-black uppercase text-[10px] py-6 px-6 gap-3 bg-foreground hover:bg-amber-500 text-background transition-all hover:scale-105"
                    >
                      Gestionar <ArrowRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

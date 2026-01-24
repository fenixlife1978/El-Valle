'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Loader2, Building2, ShieldCheck, Key, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Condominio = {
  id: string;
  nombre: string;
  status: 'active' | 'suspended';
  accessKey: string;
};

export default function SuperAdminPage() {
  const [condos, setCondos] = useState<Condominio[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<{id: string, key: string} | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'condominios'), (snap) => {
      setCondos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Condominio)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'condominios', id), { status: newStatus });
      toast({ title: "Estado actualizado", description: `Condominio ${newStatus.toUpperCase()}` });
    } catch (e) {
      toast({ variant: 'destructive', title: "Error de permisos", description: "Revisa tus Security Rules." });
    }
  };

  const updateAccessKey = async (id: string) => {
    if (!editingKey) return;
    try {
      await updateDoc(doc(db, 'condominios', id), { accessKey: editingKey.key });
      setEditingKey(null);
      toast({ title: "Clave Actualizada", description: "Cambio guardado en la nube." });
    } catch (e) {
      toast({ variant: 'destructive', title: "Error al actualizar clave" });
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold flex items-center gap-3">
            <ShieldCheck className="h-12 w-12 text-blue-600" /> 
            Panel Maestro: vallecondo@gmail.com
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">Control total de acceso y condominios activos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-blue-600 shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Condominios Totales</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{condos.length}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-600 shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Servicios Activos</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-green-600">{condos.filter(c => c.status === 'active').length}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-600 shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Suspendidos / Deuda</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-600">{condos.filter(c => c.status === 'suspended').length}</div></CardContent>
        </Card>
      </div>

      <Card className="shadow-xl">
        <CardContent className="pt-6">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[300px]">Condominio</TableHead>
                <TableHead>ID del Sistema</TableHead>
                <TableHead>Clave Dinámica</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Control de Acceso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-10 w-10 text-primary"/></TableCell></TableRow>
              ) : condos.map((condo) => (
                <TableRow key={condo.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-semibold text-lg">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-500" /> {condo.nombre}
                    </div>
                  </TableCell>
                  <TableCell><code className="bg-slate-100 px-2 py-1 rounded text-xs">{condo.id}</code></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {editingKey?.id === condo.id ? (
                        <>
                          <Input 
                            className="w-32 h-8" 
                            value={editingKey.key} 
                            onChange={(e) => setEditingKey({...editingKey, key: e.target.value})}
                          />
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => updateAccessKey(condo.id)}>
                            <Save className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="font-mono bg-yellow-50 px-2 py-1 border border-yellow-200 rounded">{condo.accessKey || 'SIN CLAVE'}</span>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingKey({id: condo.id, key: condo.accessKey})}>
                            <Key className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={condo.status === 'active' ? 'default' : 'destructive'} className="capitalize">
                      {condo.status === 'active' ? 'En Línea' : 'Suspendido'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-3">
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {condo.status === 'active' ? 'Desactivar' : 'Activar'}
                      </span>
                      <Switch 
                        checked={condo.status === 'active'} 
                        onCheckedChange={() => toggleStatus(condo.id, condo.status)} 
                      />
                    </div>
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

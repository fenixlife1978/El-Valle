
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Loader2, Trash2, XCircle, Edit, Save, AlertCircle, Megaphone } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAuth } from '@/hooks/use-auth';
import { compressImage } from '@/lib/utils';
import Image from 'next/image';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function BillboardPage() {
  const { toast } = useToast();
  const { requestAuthorization } = useAuthorization();
  const { ownerData } = useAuth() as any; 
  
  const [anuncios, setAnuncios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para nuevo anuncio
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [imagen, setImagen] = useState<string | null>(null);

  // Estados para edición
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAnuncio, setEditingAnuncio] = useState<any | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');

  useEffect(() => {
    if (!ownerData?.condominioId) {
        const timer = setTimeout(() => { if (loading) setLoading(false); }, 3000);
        return () => clearTimeout(timer);
    }

    const q = query(
      collection(db, "billboard_announcements"), 
      where("condominioId", "==", ownerData.condominioId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnuncios(data);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsubscribe();
  }, [ownerData?.condominioId]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSubmitting(true);
    try {
        const compressedBase64 = await compressImage(file, 800, 800);
        setImagen(compressedBase64);
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error de imagen' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSaveAnuncio = () => {
    if (!titulo || !imagen || !ownerData?.condominioId) return;
    requestAuthorization(async () => {
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'billboard_announcements'), {
                titulo,
                descripcion,
                urlImagen: imagen,
                condominioId: ownerData.condominioId,
                createdAt: serverTimestamp(),
            });
            toast({ title: 'Anuncio publicado' });
            setTitulo(''); setDescripcion(''); setImagen(null);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al guardar' });
        } finally {
            setIsSubmitting(false);
        }
    });
  };

  const openEdit = (anuncio: any) => {
    setEditingAnuncio(anuncio);
    setEditTitulo(anuncio.titulo);
    setEditDescripcion(anuncio.descripcion);
    setIsEditDialogOpen(true);
  };

  const handleUpdateAnuncio = () => {
    if (!editingAnuncio) return;
    requestAuthorization(async () => {
        try {
            await updateDoc(doc(db, 'billboard_announcements', editingAnuncio.id), {
                titulo: editTitulo,
                descripcion: editDescripcion,
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Anuncio actualizado' });
            setIsEditDialogOpen(false);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al actualizar' });
        }
    });
  };

  return (
    <div className="space-y-8 p-4">
      <div className="flex items-center gap-4">
        <img src="/logo-efas.png" className="h-14 w-14 object-contain" alt="EFAS" />
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight italic">
            Cartelera <span className="text-[#0081c9]">Informativa</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Gestión de Comunicados EFAS.</p>
        </div>
      </div>

      <Card className="rounded-[2rem] border-none shadow-sm overflow-hidden bg-white">
        <CardHeader><CardTitle className="text-lg">Crear Aviso Nuevo</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="rounded-xl" />
            <Textarea placeholder="Descripción..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="rounded-xl min-h-[100px]" />
          </div>
          <div className="border-2 border-dashed border-slate-100 rounded-[2rem] p-4 flex flex-col items-center justify-center bg-slate-50/50">
            {imagen ? (
              <div className="relative w-full aspect-video">
                <Image src={imagen} alt="Preview" fill className="object-contain rounded-xl" />
                <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 rounded-full h-8 w-8" onClick={() => setImagen(null)}><XCircle className="h-4 w-4" /></Button>
              </div>
            ) : (
              <Label className="cursor-pointer text-center">
                <Input type="file" className="hidden" onChange={handleImageUpload} />
                <PlusCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <span className="text-slate-400 font-bold text-xs uppercase">Cargar Banner</span>
              </Label>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end bg-slate-50/50 p-4">
          <Button onClick={handleSaveAnuncio} disabled={isSubmitting || !titulo || !imagen} className="bg-[#0081c9] rounded-full px-8">
            {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : "Publicar Ahora"}
          </Button>
        </CardFooter>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {anuncios.map((anuncio) => (
          <Card key={anuncio.id} className="rounded-[2rem] overflow-hidden border-none shadow-sm bg-white group hover:shadow-md transition-all">
            <div className="aspect-video relative overflow-hidden">
              <Image src={anuncio.urlImagen} alt={anuncio.titulo} fill className="object-cover group-hover:scale-105 transition-transform" />
            </div>
            <div className="p-5">
              <h3 className="font-bold text-slate-700 leading-tight">{anuncio.titulo}</h3>
              <p className="text-xs text-slate-400 mt-2 line-clamp-2">{anuncio.descripcion}</p>
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-50">
                <Button variant="outline" size="sm" className="flex-1 rounded-full text-[#0081c9] border-blue-100" onClick={() => openEdit(anuncio)}>
                  <Edit className="h-3 w-3 mr-2" /> Editar
                </Button>
                <Button variant="destructive" size="icon" className="rounded-full h-8 w-8" onClick={() => requestAuthorization(() => deleteDoc(doc(db, 'billboard_announcements', anuncio.id)))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="rounded-[2rem]">
          <DialogHeader><DialogTitle>Editar Anuncio</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateAnuncio} className="bg-[#0081c9] rounded-full">Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Loader2, Trash2, XCircle, Edit } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAuth } from '@/hooks/use-auth';
import { compressImage } from '@/lib/utils';
import Image from 'next/image';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function BillboardPage() {
  const { toast } = useToast();
  const { requestAuthorization } = useAuthorization();
  const { user, activeCondoId } = useAuth(); // Usamos activeCondoId del hook
  
  const [anuncios, setAnuncios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Determinamos el ID del condominio (Soporte o Real)
  const [currentCondoId, setCurrentCondoId] = useState<string | null>(null);

  useEffect(() => {
    const sId = localStorage.getItem('support_mode_id');
    const id = (sId && user?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;
    setCurrentCondoId(id);
  }, [user, activeCondoId]);

  // Estados para nuevo anuncio
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [imagen, setImagen] = useState<string | null>(null);

  // Estados para edición
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAnuncio, setEditingAnuncio] = useState<any | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');

  // ESCUCHA DE ANUNCIOS
  useEffect(() => {
    if (!currentCondoId) return;

    // RUTA CORREGIDA: condominios > {id} > billboard_announcements
    const q = query(
      collection(db, "condominios", currentCondoId, "billboard_announcements"), 
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnuncios(data);
      setLoading(false);
    }, (error) => {
        console.error("Error cargando cartelera:", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [currentCondoId]);

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
    if (!titulo || !imagen || !currentCondoId) return;
    requestAuthorization(async () => {
        setIsSubmitting(true);
        try {
            // GUARDAR EN LA RUTA CORRECTA
            await addDoc(collection(db, 'condominios', currentCondoId, 'billboard_announcements'), {
                titulo,
                descripcion,
                urlImagen: imagen,
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
    if (!editingAnuncio || !currentCondoId) return;
    requestAuthorization(async () => {
        try {
            await updateDoc(doc(db, 'condominios', currentCondoId, 'billboard_announcements', editingAnuncio.id), {
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

  const handleDelete = (id: string) => {
      if(!currentCondoId) return;
      requestAuthorization(async () => {
          try {
              await deleteDoc(doc(db, 'condominios', currentCondoId, 'billboard_announcements', id));
              toast({ title: 'Anuncio eliminado' });
          } catch (e) {
              toast({ variant: 'destructive', title: 'No se pudo eliminar' });
          }
      });
  };

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-slate-400 uppercase tracking-widest">Cargando Cartelera...</div>;

  return (
    <div className="space-y-8 p-4">
      <div className="mb-10">
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
              Cartelera <span className="text-[#0081c9]">Informativa</span>
          </h2>
          <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
          <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
              {currentCondoId ? `Gestionando: ${currentCondoId}` : "Cargando..."}
          </p>
      </div>

      <Card className="rounded-[2rem] border-none shadow-sm overflow-hidden bg-white">
        <CardHeader><CardTitle className="text-lg">Crear Aviso Nuevo</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="rounded-xl h-12 font-bold" />
            <Textarea placeholder="Descripción..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="rounded-xl min-h-[120px]" />
          </div>
          <div className="border-2 border-dashed border-slate-100 rounded-[2rem] p-4 flex flex-col items-center justify-center bg-slate-50/50">
            {imagen ? (
              <div className="relative w-full aspect-video">
                <Image src={imagen} alt="Preview" fill className="object-contain rounded-xl" />
                <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 rounded-full h-8 w-8" onClick={() => setImagen(null)}><XCircle className="h-4 w-4" /></Button>
              </div>
            ) : (
              <Label className="cursor-pointer text-center w-full py-10">
                <Input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                <PlusCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <span className="text-slate-400 font-bold text-xs uppercase tracking-tighter">Cargar Banner Informativo</span>
              </Label>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end bg-slate-50/50 p-4 px-8">
          <Button onClick={handleSaveAnuncio} disabled={isSubmitting || !titulo || !imagen} className="bg-[#0081c9] hover:bg-[#006bb0] rounded-full px-10 font-black uppercase italic text-xs h-12 shadow-lg shadow-blue-200 transition-all">
            {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : "Publicar Ahora"}
          </Button>
        </CardFooter>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {anuncios.map((anuncio) => (
          <Card key={anuncio.id} className="rounded-[2rem] overflow-hidden border-none shadow-sm bg-white group hover:shadow-md transition-all">
            <div className="aspect-video relative overflow-hidden bg-slate-100">
              {anuncio.urlImagen && (
                <Image src={anuncio.urlImagen} alt={anuncio.titulo} fill className="object-cover group-hover:scale-105 transition-transform" />
              )}
            </div>
            <div className="p-6">
              <h3 className="font-black text-slate-700 leading-tight uppercase italic text-sm">{anuncio.titulo}</h3>
              <p className="text-xs font-bold text-slate-400 mt-2 line-clamp-3 leading-relaxed">{anuncio.descripcion}</p>
              <div className="flex gap-2 mt-6 pt-4 border-t border-slate-50">
                <Button variant="outline" size="sm" className="flex-1 rounded-full text-[#0081c9] border-blue-100 font-bold text-[10px] uppercase" onClick={() => openEdit(anuncio)}>
                  <Edit className="h-3 w-3 mr-2" /> Editar
                </Button>
                <Button variant="destructive" size="icon" className="rounded-full h-9 w-9 shadow-md shadow-red-100" onClick={() => handleDelete(anuncio.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {anuncios.length === 0 && !loading && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-100 rounded-[3rem]">
                <p className="text-slate-300 font-black uppercase italic tracking-widest">No hay anuncios publicados</p>
            </div>
        )}
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="rounded-[2rem] border-none">
          <DialogHeader><DialogTitle className="font-black uppercase italic text-slate-700">Editar Comunicado</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-bold text-[10px] uppercase ml-2 text-slate-400">Título del Aviso</Label>
              <Input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} className="rounded-xl h-12 font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="font-bold text-[10px] uppercase ml-2 text-slate-400">Contenido</Label>
              <Textarea value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} className="rounded-xl min-h-[150px]" />
            </div>
          </div>
          <DialogFooter className="sm:justify-between gap-4">
            <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)} className="rounded-full font-bold uppercase text-[10px]">Cancelar</Button>
            <Button onClick={handleUpdateAnuncio} className="bg-[#0081c9] rounded-full px-8 font-black uppercase italic text-xs h-12">Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

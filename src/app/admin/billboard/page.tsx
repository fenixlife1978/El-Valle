
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Loader2, Image as ImageIcon, Trash2, Upload, XCircle, FileText, Edit, Save } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import { compressImage } from '@/lib/utils';
import Image from 'next/image';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

type Anuncio = {
  id: string;
  titulo: string;
  descripcion?: string;
  urlImagen: string;
  createdAt: any;
};

export default function BillboardPage() {
  const { toast } = useToast();
  const { requestAuthorization } = useAuthorization();
  
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [imagen, setImagen] = useState<string | null>(null);

  // Edit state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAnuncio, setEditingAnuncio] = useState<Anuncio | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editImagen, setEditImagen] = useState<string | null>(null);


  useEffect(() => {
    const q = query(collection(db, "billboard_announcements"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Anuncio));
      setAnuncios(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  const resetForm = () => {
      setTitulo('');
      setDescripcion('');
      setImagen(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    toast({ title: 'Procesando imagen...', description: 'Optimizando el archivo para la cartelera.' });
    try {
        const compressedBase64 = await compressImage(file, 800, 800);
        if (isEdit) {
            setEditImagen(compressedBase64);
        } else {
            setImagen(compressedBase64);
        }
        toast({ title: 'Imagen lista', description: 'La imagen ha sido procesada y está lista para guardarse.' });
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error de imagen', description: 'No se pudo procesar la imagen.' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSaveAnuncio = () => {
    if (!titulo || !imagen) {
        toast({ variant: 'destructive', title: 'Datos incompletos', description: 'El título y la imagen son obligatorios.' });
        return;
    }
    requestAuthorization(async () => {
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'billboard_announcements'), {
                titulo,
                descripcion,
                urlImagen: imagen,
                createdAt: serverTimestamp(),
            });
            toast({ title: 'Anuncio Guardado', description: 'El nuevo anuncio aparecerá en la cartelera digital.' });
            resetForm();
        } catch (error) {
            console.error("Error saving announcement: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el anuncio.' });
        } finally {
            setIsSubmitting(false);
        }
    });
  };

  const handleOpenEditDialog = (anuncio: Anuncio) => {
    setEditingAnuncio(anuncio);
    setEditTitulo(anuncio.titulo);
    setEditDescripcion(anuncio.descripcion || '');
    setEditImagen(anuncio.urlImagen);
    setIsEditDialogOpen(true);
  };

  const handleUpdateAnuncio = () => {
    if (!editingAnuncio || !editTitulo || !editImagen) {
        toast({ variant: 'destructive', title: 'Datos incompletos', description: 'El título y la imagen son obligatorios.' });
        return;
    }
    requestAuthorization(async () => {
        setIsSubmitting(true);
        try {
            const anuncioRef = doc(db, 'billboard_announcements', editingAnuncio.id);
            await updateDoc(anuncioRef, {
                titulo: editTitulo,
                descripcion: editDescripcion,
                urlImagen: editImagen,
            });
            toast({ title: 'Anuncio Actualizado', description: 'Los cambios se han guardado correctamente.' });
            setIsEditDialogOpen(false);
        } catch (error) {
            console.error("Error updating announcement: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el anuncio.' });
        } finally {
            setIsSubmitting(false);
        }
    });
  };
  
  const handleDeleteAnuncio = (id: string) => {
      if(window.confirm('¿Estás seguro de que deseas eliminar este anuncio?')) {
        requestAuthorization(async () => {
            try {
                await deleteDoc(doc(db, 'billboard_announcements', id));
                toast({ title: 'Anuncio eliminado', description: 'El anuncio ha sido removido de la cartelera.' });
            } catch (error) {
                console.error("Error deleting announcement: ", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el anuncio.' });
            }
        });
      }
  };


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Gestión de Cartelera Digital</h1>
        <p className="text-muted-foreground">Administra los anuncios que se muestran en los paneles de inicio.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo Anuncio</CardTitle>
          <CardDescription>Crea un nuevo anuncio para la cartelera digital. La imagen se optimizará automáticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="titulo">Título del Anuncio</Label>
                <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Jornada de Vacunación" disabled={isSubmitting} />
            </div>
             <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción (Opcional)</Label>
                <Textarea id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: Este sábado en la casa club de 8am a 12pm..." disabled={isSubmitting} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="imagen-upload">Imagen del Anuncio (JPG, PNG)</Label>
                <Input id="imagen-upload" type="file" accept="image/png, image/jpeg" onChange={(e) => handleImageUpload(e, false)} disabled={isSubmitting} />
            </div>
            {imagen && (
                <div className="space-y-2">
                    <Label>Vista Previa de la Imagen</Label>
                     <div className="relative w-full max-w-sm border p-2 rounded-md bg-muted/50">
                        <Image src={imagen} alt="Vista previa" width={800} height={800} className="w-full h-auto object-contain rounded" />
                        <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-7 w-7 rounded-full" onClick={() => setImagen(null)} disabled={isSubmitting}>
                            <XCircle className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            )}
        </CardContent>
        <CardFooter>
            <Button onClick={handleSaveAnuncio} disabled={isSubmitting || !titulo || !imagen}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                Guardar Anuncio
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Anuncios Activos</CardTitle>
            <CardDescription>Esta es la lista de anuncios que se están mostrando actualmente en la cartelera.</CardDescription>
        </CardHeader>
        <CardContent>
            {loading ? (
                <div className="flex justify-center items-center h-24"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
            ) : anuncios.length === 0 ? (
                <p className="text-center text-muted-foreground">No hay anuncios para mostrar.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {anuncios.map((anuncio) => (
                        <Card key={anuncio.id} className="overflow-hidden flex flex-col">
                            <div className="aspect-square relative w-full">
                                <Image src={anuncio.urlImagen} alt={anuncio.titulo} layout="fill" className="object-cover" />
                            </div>
                            <div className="p-4 flex flex-col flex-grow">
                                <h3 className="font-bold">{anuncio.titulo}</h3>
                                <p className="text-sm text-muted-foreground truncate flex-grow">{anuncio.descripcion || 'Sin descripción'}</p>
                                <div className="flex gap-2 mt-4">
                                     <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpenEditDialog(anuncio)}>
                                        <Edit className="mr-2 h-4 w-4"/> Editar
                                    </Button>
                                    <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDeleteAnuncio(anuncio.id)}>
                                        <Trash2 className="mr-2 h-4 w-4"/> Eliminar
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </CardContent>
      </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Editar Anuncio</DialogTitle>
                    <DialogDescription>
                        Modifica la información del anuncio. Los cambios se reflejarán inmediatamente.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4 overflow-y-auto pr-6 -mr-6">
                    <div className="space-y-2">
                        <Label htmlFor="edit-titulo">Título del Anuncio</Label>
                        <Input id="edit-titulo" value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-descripcion">Descripción (Opcional)</Label>
                        <Textarea id="edit-descripcion" value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-imagen-upload">Cambiar Imagen (Opcional)</Label>
                        <Input id="edit-imagen-upload" type="file" accept="image/png, image/jpeg" onChange={(e) => handleImageUpload(e, true)} disabled={isSubmitting} />
                    </div>
                    {editImagen && (
                        <div className="space-y-2">
                            <Label>Vista Previa de la Imagen</Label>
                            <div className="relative w-full max-w-sm border p-2 rounded-md bg-muted/50">
                                <Image src={editImagen} alt="Vista previa de edición" width={800} height={800} className="w-full h-auto object-contain rounded" />
                                <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-7 w-7 rounded-full" onClick={() => setEditImagen(null)} disabled={isSubmitting}>
                                    <XCircle className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="mt-auto pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleUpdateAnuncio} disabled={isSubmitting || !editTitulo || !editImagen}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    </div>
  );
}

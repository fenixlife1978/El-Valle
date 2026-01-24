'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Loader2, Trash2, XCircle, Edit, Save } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAuth } from '@/hooks/use-auth'; // IMPORTANTE: Para obtener el condominioId
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
  condominioId: string;
};

export default function BillboardPage() {
  const { toast } = useToast();
  const { requestAuthorization } = useAuthorization();
  const { ownerData } = useAuth(); // Obtenemos la data del administrador logueado
  
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [imagen, setImagen] = useState<string | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAnuncio, setEditingAnuncio] = useState<Anuncio | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editImagen, setEditImagen] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerData?.condominioId) return;

    // FILTRO MULTIEMPRESA: Solo anuncios del condominio actual
    const q = query(
      collection(db, "billboard_announcements"), 
      where("condominioId", "==", ownerData.condominioId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Anuncio));
      setAnuncios(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [ownerData?.condominioId]);
  
  const resetForm = () => {
      setTitulo('');
      setDescripcion('');
      setImagen(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    toast({ title: 'Procesando imagen...', description: 'Optimizando archivo.' });
    try {
        const compressedBase64 = await compressImage(file, 800, 800);
        if (isEdit) {
            setEditImagen(compressedBase64);
        } else {
            setImagen(compressedBase64);
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar la imagen.' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSaveAnuncio = () => {
    if (!titulo || !imagen || !ownerData?.condominioId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos o ID de condominio.' });
        return;
    }
    requestAuthorization(async () => {
        setIsSubmitting(true);
        try {
            // CADA NUEVO ANUNCIO SE GUARDA CON EL ID DEL CONDOMINIO
            await addDoc(collection(db, 'billboard_announcements'), {
                titulo,
                descripcion,
                urlImagen: imagen,
                condominioId: ownerData.condominioId,
                createdAt: serverTimestamp(),
            });
            toast({ title: 'Anuncio Guardado' });
            resetForm();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al guardar' });
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
    if (!editingAnuncio || !editTitulo || !editImagen) return;
    
    requestAuthorization(async () => {
        setIsSubmitting(true);
        try {
            const anuncioRef = doc(db, 'billboard_announcements', editingAnuncio.id);
            await updateDoc(anuncioRef, {
                titulo: editTitulo,
                descripcion: editDescripcion,
                urlImagen: editImagen,
            });
            toast({ title: 'Anuncio Actualizado' });
            setIsEditDialogOpen(false);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al actualizar' });
        } finally {
            setIsSubmitting(false);
        }
    });
  };
  
  const handleDeleteAnuncio = (id: string) => {
      if(window.confirm('¿Deseas eliminar este anuncio?')) {
        requestAuthorization(async () => {
            try {
                await deleteDoc(doc(db, 'billboard_announcements', id));
                toast({ title: 'Anuncio eliminado' });
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error al eliminar' });
            }
        });
      }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Gestión de Cartelera Digital</h1>
        <p className="text-muted-foreground">Administra los anuncios de tu condominio.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo Anuncio</CardTitle>
          <CardDescription>Crea un anuncio para los residentes de su edificio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="titulo">Título del Anuncio</Label>
                <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Asamblea Extraordinaria" disabled={isSubmitting} />
            </div>
             <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalles del anuncio..." disabled={isSubmitting} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="imagen-upload">Imagen del Anuncio</Label>
                <Input id="imagen-upload" type="file" accept="image/png, image/jpeg" onChange={(e) => handleImageUpload(e, false)} disabled={isSubmitting} />
            </div>
            {imagen && (
                <div className="space-y-2">
                     <div className="relative w-full max-w-sm border p-2 rounded-md bg-muted/50">
                        <Image src={imagen} alt="Vista previa" width={400} height={400} className="w-full h-auto object-contain rounded" />
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
                Publicar Anuncio
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Anuncios de mi Condominio</CardTitle>
            <CardDescription>Lista de anuncios publicados actualmente.</CardDescription>
        </CardHeader>
        <CardContent>
            {loading ? (
                <div className="flex justify-center items-center h-24"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
            ) : anuncios.length === 0 ? (
                <p className="text-center text-muted-foreground">No hay anuncios activos para este condominio.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {anuncios.map((anuncio) => (
                        <Card key={anuncio.id} className="overflow-hidden flex flex-col">
                            <div className="aspect-square relative w-full">
                                <Image src={anuncio.urlImagen} alt={anuncio.titulo} fill className="object-cover" />
                            </div>
                            <div className="p-4 flex flex-col flex-grow">
                                <h3 className="font-bold">{anuncio.titulo}</h3>
                                <p className="text-sm text-muted-foreground truncate flex-grow">{anuncio.descripcion || 'Sin descripción'}</p>
                                <div className="flex gap-2 mt-4">
                                     <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpenEditDialog(anuncio)}>
                                        <Edit className="mr-2 h-4 w-4"/> Editar
                                    </Button>
                                    <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDeleteAnuncio(anuncio.id)}>
                                        <Trash2 className="mr-2 h-4 w-4"/>
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </CardContent>
      </Card>

        {/* Dialogo de Edición */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Editar Anuncio</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Título</Label>
                        <Input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label>Descripción</Label>
                        <Textarea value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label>Imagen</Label>
                        <Input type="file" accept="image/png, image/jpeg" onChange={(e) => handleImageUpload(e, true)} disabled={isSubmitting} />
                    </div>
                    {editImagen && (
                        <div className="relative w-full max-w-xs border p-2 rounded-md">
                            <Image src={editImagen} alt="Edit preview" width={300} height={300} className="w-full h-auto rounded" />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleUpdateAnuncio} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}


'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Loader2, Image as ImageIcon, Trash2, Upload, XCircle, FileText } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import { compressImage } from '@/lib/utils';
import Image from 'next/image';
import { Textarea } from '@/components/ui/textarea';

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    toast({ title: 'Procesando imagen...', description: 'Optimizando el archivo para la cartelera.' });
    try {
        const compressedBase64 = await compressImage(file, 800, 800);
        setImagen(compressedBase64);
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
                <Input id="imagen-upload" type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} disabled={isSubmitting} />
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
                        <Card key={anuncio.id} className="overflow-hidden">
                            <div className="aspect-square relative w-full">
                                <Image src={anuncio.urlImagen} alt={anuncio.titulo} layout="fill" className="object-cover" />
                            </div>
                            <div className="p-4">
                                <h3 className="font-bold">{anuncio.titulo}</h3>
                                <p className="text-sm text-muted-foreground truncate">{anuncio.descripcion || 'Sin descripción'}</p>
                                <Button variant="destructive" size="sm" className="mt-4 w-full" onClick={() => handleDeleteAnuncio(anuncio.id)}>
                                    <Trash2 className="mr-2 h-4 w-4"/> Eliminar
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </CardContent>
      </Card>

    </div>
  );
}

'use client';

import { useState, useEffect, use } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, Camera, Trash2, Calendar, ImageIcon, X, Download, Eye, Filter, ImagePlus, Edit, Save } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { compressImage } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { downloadPDF } from '@/lib/print-pdf';
import { toast } from 'sonner';
import { uploadToImgbb } from '@/lib/imgbb';

interface ExpenseSupport {
    id: string;
    images: string[];
    fecha: Timestamp;
    descripcion: string;
    createdAt: Timestamp;
    createdBy: string;
}

const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: format(new Date(2000, i), 'MMMM', { locale: es }).toUpperCase()
}));

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

export default function ExpenseSupportPage() {
    const params = useParams();
    const condoId = params?.condoId as string;
    const { user } = useAuth();
    
    const [supports, setSupports] = useState<ExpenseSupport[]>([]);
    const [filteredSupports, setFilteredSupports] = useState<ExpenseSupport[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewImages, setPreviewImages] = useState<string[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
    const [viewingSupport, setViewingSupport] = useState<ExpenseSupport | null>(null);
    const [editingSupport, setEditingSupport] = useState<ExpenseSupport | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editFiles, setEditFiles] = useState<File[]>([]);
    const [editPreviews, setEditPreviews] = useState<string[]>([]);
    const [editFormData, setEditFormData] = useState({ fecha: new Date(), descripcion: "" });
    const [viewingImageIndex, setViewingImageIndex] = useState(0);
    const [formData, setFormData] = useState({
        fecha: new Date(),
        descripcion: ''
    });

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, 'expense_support'), orderBy('fecha', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseSupport));
            setSupports(data);
            setLoading(false);
        }, (error) => {
            console.error("Error cargando soportes:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [condoId]);

    useEffect(() => {
        if (!supports.length) {
            setFilteredSupports([]);
            return;
        }
        
        const filtered = supports.filter(support => {
            if (!support.fecha?.toDate) return false;
            const supportDate = support.fecha.toDate();
            const supportMonth = String(supportDate.getMonth() + 1);
            const supportYear = String(supportDate.getFullYear());
            return supportMonth === selectedMonth && supportYear === selectedYear;
        });
        setFilteredSupports(filtered);
    }, [supports, selectedMonth, selectedYear]);

    const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            toast.error('Por favor seleccione una imagen válida');
            return;
        }
        
        // Crear preview local
        const reader = new FileReader();
        reader.onload = (event) => {
            const newPreviews = [...previewImages];
            newPreviews[index] = event.target?.result as string;
            setPreviewImages(newPreviews);
        };
        reader.readAsDataURL(file);
        
        const newFiles = [...selectedFiles];
        newFiles[index] = file;
        setSelectedFiles(newFiles);
        toast.success(`Imagen ${index + 1} seleccionada`);
    };

    const removeImage = (index: number) => {
        const newFiles = [...selectedFiles];
        const newPreviews = [...previewImages];
        newFiles[index] = undefined as any;
        newPreviews[index] = '';
        setSelectedFiles(newFiles);
        setPreviewImages(newPreviews);
    };

    const handleSubmit = async () => {
        const validFiles = selectedFiles.filter(f => f !== undefined);
        if (validFiles.length === 0) {
            toast.error('Debe seleccionar al menos una imagen');
            return;
        }
        if (!formData.descripcion.trim()) {
            toast.error('Debe ingresar una descripción');
            return;
        }
        
        setIsSubmitting(true);
        toast.loading('Subiendo imágenes a Imgbb...', { id: 'upload' });
        
        try {
            // Subir cada imagen a Imgbb
            const uploadedUrls: string[] = [];
            for (const file of validFiles) {
                const url = await uploadToImgbb(file);
                if (url) {
                    uploadedUrls.push(url);
                } else {
                    toast.error('Error al subir una imagen a Imgbb');
                    setIsSubmitting(false);
                    return;
                }
            }
            
            toast.loading('Guardando en Firestore...', { id: 'upload' });
            
            await addDoc(collection(db, 'condominios', condoId, 'expense_support'), {
                images: uploadedUrls,
                fecha: Timestamp.fromDate(formData.fecha),
                descripcion: formData.descripcion.toUpperCase(),
                createdAt: serverTimestamp(),
                createdBy: user?.email || 'admin'
            });
            
            toast.success('Soporte guardado correctamente', { id: 'upload' });
            setIsDialogOpen(false);
            setSelectedFiles([]);
            setPreviewImages([]);
            setFormData({ fecha: new Date(), descripcion: '' });
        } catch (error) {
            console.error("Error guardando soporte:", error);
            toast.error('Error al guardar el soporte', { id: 'upload' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEditDialog = (support: ExpenseSupport) => {
        setEditingSupport(support);
        setEditFormData({
            fecha: support.fecha?.toDate ? support.fecha.toDate() : new Date(),
            descripcion: support.descripcion
        });
        setEditPreviews([...support.images]);
        setEditFiles([]);
        setIsEditDialogOpen(true);
    };

    const handleEditSubmit = async () => {
        if (!editingSupport || !condoId) return;
        setIsSubmitting(true);
        toast.loading("Actualizando soporte...", { id: "edit-support" });
        try {
            let updatedImages = [...editPreviews];
            for (let i = 0; i < editFiles.length; i++) {
                const file = editFiles[i];
                if (file && typeof file !== "string") {
                    const url = await uploadToImgbb(file);
                    if (url) {
                        if (updatedImages[i]) {
                            updatedImages[i] = url;
                        } else {
                            updatedImages.push(url);
                        }
                    }
                }
            }
            updatedImages = updatedImages.filter(img => img && img !== "");
            const supportRef = doc(db, "condominios", condoId, "expense_support", editingSupport.id);
            await updateDoc(supportRef, {
                images: updatedImages,
                fecha: Timestamp.fromDate(editFormData.fecha),
                descripcion: editFormData.descripcion.toUpperCase(),
                updatedAt: serverTimestamp()
            });
            toast.success("Soporte actualizado correctamente", { id: "edit-support" });
            setIsEditDialogOpen(false);
            setEditingSupport(null);
            setEditFiles([]);
            setEditPreviews([]);
        } catch (error) {
            console.error("Error actualizando soporte:", error);
            toast.error("Error al actualizar el soporte", { id: "edit-support" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditImageCapture = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const newPreviews = [...editPreviews];
            newPreviews[index] = event.target?.result as string;
            setEditPreviews(newPreviews);
        };
        reader.readAsDataURL(file);
        const newFiles = [...editFiles];
        newFiles[index] = file;
        setEditFiles(newFiles);
    };

    const removeEditImage = (index: number) => {
        const newPreviews = [...editPreviews];
        const newFiles = [...editFiles];
        newPreviews.splice(index, 1);
        newFiles.splice(index, 1);
        setEditPreviews(newPreviews);
        setEditFiles(newFiles);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar este soporte permanentemente?')) return;
        try {
            await deleteDoc(doc(db, 'condominios', condoId, 'expense_support', id));
            toast.success('Soporte eliminado');
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const handleDownloadPDF = async (support: ExpenseSupport) => {
        const html = generatePDFHTML(support);
        const fileName = `Soporte_Gasto_${format(support.fecha.toDate(), 'yyyy_MM_dd')}.pdf`;
        downloadPDF(html, fileName);
        toast.success('PDF generado correctamente');
    };

    const generatePDFHTML = (support: ExpenseSupport) => {
        const date = support.fecha?.toDate ? format(support.fecha.toDate(), 'dd/MM/yyyy') : 'Fecha no disponible';
        const createdAt = support.createdAt?.toDate ? format(support.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : '---';
        
        const imagesHTML = support.images.map(img => `
            <div style="margin-bottom: 20px; text-align: center;">
                <img src="${img}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
            </div>
        `).join('');
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Soporte de Gasto</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 20px; padding: 20px; background: white; }
                    .container { max-width: 800px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
                    .header { background: #1A1D23; color: white; padding: 20px; text-align: center; }
                    .header h1 { font-size: 18px; font-weight: 900; text-transform: uppercase; }
                    .images-container { padding: 20px; background: #f8fafc; }
                    .info { padding: 20px; }
                    .info-item { margin-bottom: 12px; }
                    .info-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
                    .info-value { font-size: 14px; font-weight: 700; color: #1e293b; }
                    .footer { background: #f1f5f9; padding: 12px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1>SOPORTE DE GASTO</h1></div>
                    <div class="images-container">${imagesHTML}</div>
                    <div class="info">
                        <div class="info-item"><div class="info-label">Fecha del Gasto</div><div class="info-value">${date}</div></div>
                        <div class="info-item"><div class="info-label">Descripción</div><div class="info-value">${support.descripcion}</div></div>
                        <div class="info-item"><div class="info-label">Registrado por</div><div class="info-value">${support.createdBy}</div></div>
                        <div class="info-item"><div class="info-label">Fecha de Registro</div><div class="info-value">${createdAt}</div></div>
                    </div>
                    <div class="footer"><p>Documento generado por <strong>EFASCondoSys</strong> - Sistema de Autogestión de Condominios</p></div>
                </div>
            </body>
            </html>
        `;
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Cargando soportes...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            <div className="mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            Soportes de <span className="text-primary">Gastos</span>
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                        <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                            Administración de comprobantes y facturas (hasta 20 imágenes por soporte)
                        </p>
                    </div>
                    <Button onClick={() => setIsDialogOpen(true)} className="rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 px-6 italic">
                        <Upload className="mr-2 h-4 w-4" /> Subir Soporte
                    </Button>
                </div>
            </div>

            <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                <CardContent className="p-6">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><span className="text-[10px] font-black uppercase text-white/60">Filtrar por:</span></div>
                        <div className="w-40"><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="h-10 rounded-xl bg-slate-800 border-none text-white font-black uppercase text-[10px]"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white">{months.map(m => (<SelectItem key={m.value} value={m.value} className="font-black uppercase text-[10px]">{m.label}</SelectItem>))}</SelectContent></Select></div>
                        <div className="w-28"><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="h-10 rounded-xl bg-slate-800 border-none text-white font-black uppercase text-[10px]"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white">{years.map(y => (<SelectItem key={y} value={y} className="font-black uppercase text-[10px]">{y}</SelectItem>))}</SelectContent></Select></div>
                        <div className="text-[10px] text-white/40">{filteredSupports.length} soporte(s) encontrado(s)</div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSupports.length === 0 ? (
                    <div className="col-span-full text-center py-20"><ImageIcon className="h-16 w-16 text-white/20 mx-auto mb-4" /><p className="text-[10px] font-black uppercase text-white/40 italic">No hay soportes para este período</p></div>
                ) : (
                    filteredSupports.map((support) => (
                        <Card key={support.id} className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5 group transition-all hover:scale-[1.02] duration-300">
                            <div className="relative aspect-video bg-slate-800 overflow-hidden cursor-pointer" onClick={() => { setViewingSupport(support); setViewingImageIndex(0); }}>
                                <img src={support.images[0]} alt={support.descripcion} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                {support.images.length > 1 && <div className="absolute bottom-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-[8px] font-black">+{support.images.length - 1}</div>}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button size="sm" variant="secondary" className="rounded-xl h-8 px-3 text-[9px] font-black" onClick={(e) => { e.stopPropagation(); setViewingSupport(support); setViewingImageIndex(0); }}><Eye className="h-3 w-3 mr-1" /> Ver</Button>
                                    <Button size="sm" variant="secondary" className="rounded-xl h-8 px-3 text-[9px] font-black" onClick={(e) => { e.stopPropagation(); handleDownloadPDF(support); }}><Download className="h-3 w-3 mr-1" /> PDF</Button>
                                    <Button size="sm" variant="secondary" className="rounded-xl h-8 px-3 text-[9px] font-black" onClick={(e) => { e.stopPropagation(); openEditDialog(support); }}>
                                        <Edit className="h-3 w-3 mr-1" /> Editar
                                    </Button>
                                </div>
                                <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleDelete(support.id); }}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 text-[10px] text-primary mb-2"><Calendar className="h-3 w-3" />{support.fecha?.toDate ? format(support.fecha.toDate(), 'dd/MM/yyyy') : 'Fecha no disponible'}</div>
                                <p className="text-white font-black uppercase text-[10px] leading-tight line-clamp-2">{support.descripcion}</p>
                                <div className="flex items-center gap-1 mt-2"><ImageIcon className="h-3 w-3 text-white/30" /><span className="text-[8px] text-white/30">{support.images.length} imagen(es)</span></div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                            <Upload className="h-5 w-5 text-primary" /> Subir Soporte de Gasto
                        </DialogTitle>
                        <p className="text-[9px] text-white/40">Puedes agregar hasta 20 imágenes por soporte</p>
                    </DialogHeader>
                    <div className="py-6 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto p-2">
                            {Array.from({ length: 20 }).map((_, idx) => (
                                <div key={idx} className="space-y-2">
                                    <Label className="text-[9px] font-black uppercase text-slate-500">Imagen {idx + 1}</Label>
                                    <div className="border-2 border-dashed border-white/20 rounded-2xl p-3 text-center hover:border-primary/50 transition-colors min-h-[120px]">
                                        {previewImages[idx] ? (
                                            <div className="relative">
                                                <img src={previewImages[idx]} alt={`Preview ${idx + 1}`} className="max-h-24 mx-auto rounded-lg" />
                                                <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0 h-6 w-6 rounded-full bg-black/50" onClick={() => removeImage(idx)}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="py-3">
                                                <Camera className="h-6 w-6 text-white/20 mx-auto mb-1" />
                                                <Input type="file" accept="image/*" onChange={(e) => handleImageCapture(e, idx)} className="hidden" id={`image-upload-${idx}`} />
                                                <Label htmlFor={`image-upload-${idx}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/20 text-primary font-black uppercase text-[7px] cursor-pointer hover:bg-primary/30 transition-colors">
                                                    <ImagePlus className="h-2 w-2" /> Seleccionar
                                                </Label>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Fecha del Gasto</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-12 rounded-xl bg-slate-800 border-none text-white uppercase italic text-xs", !formData.fecha && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-3 h-4 w-4 text-primary" />
                                        {formData.fecha ? format(formData.fecha, "PPP", { locale: es }) : "Seleccione una fecha"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10">
                                    <CalendarComponent mode="single" selected={formData.fecha} onSelect={(date) => date && setFormData({ ...formData, fecha: date })} initialFocus locale={es} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Descripción</Label>
                            <Textarea placeholder="Ej: COMPRA DE MATERIALES DE LIMPIEZA" value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} className="rounded-xl bg-slate-800 border-none text-white font-black uppercase text-xs min-h-[80px]" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl font-black uppercase text-[10px]">Cancelar</Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting || !selectedFiles[0]} className="rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] italic">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Guardar Soporte
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewingSupport} onOpenChange={() => setViewingSupport(null)}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /> Detalle del Soporte</DialogTitle></DialogHeader>
                    {viewingSupport && (<div className="space-y-4">
                        <div className="bg-slate-800 rounded-2xl p-4 text-center relative">
                            <img src={viewingSupport.images[viewingImageIndex]} alt="Soporte" className="max-h-[400px] mx-auto rounded-lg" />
                            {viewingSupport.images.length > 1 && (<div className="flex justify-between items-center mt-3"><Button size="sm" variant="ghost" onClick={() => setViewingImageIndex(Math.max(0, viewingImageIndex - 1))} disabled={viewingImageIndex === 0} className="rounded-xl bg-white/10 text-white font-black text-[10px] disabled:opacity-30">← Anterior</Button><span className="text-[9px] text-white/40">{viewingImageIndex + 1} / {viewingSupport.images.length}</span><Button size="sm" variant="ghost" onClick={() => setViewingImageIndex(Math.min(viewingSupport.images.length - 1, viewingImageIndex + 1))} disabled={viewingImageIndex === viewingSupport.images.length - 1} className="rounded-xl bg-white/10 text-white font-black text-[10px] disabled:opacity-30">Siguiente →</Button></div>)}
                        </div>
                        <div className="grid grid-cols-2 gap-4"><div className="bg-white/5 p-4 rounded-xl"><p className="text-[8px] font-black uppercase text-slate-500">Fecha del Gasto</p><p className="font-black text-white text-sm">{viewingSupport.fecha?.toDate ? format(viewingSupport.fecha.toDate(), 'dd/MM/yyyy') : 'N/A'}</p></div><div className="bg-white/5 p-4 rounded-xl"><p className="text-[8px] font-black uppercase text-slate-500">Registrado por</p><p className="font-black text-white text-sm">{viewingSupport.createdBy}</p></div></div>
                        <div className="bg-white/5 p-4 rounded-xl"><p className="text-[8px] font-black uppercase text-slate-500">Descripción</p><p className="font-black text-white text-sm uppercase">{viewingSupport.descripcion}</p></div>
                        <div className="flex gap-3"><Button onClick={() => handleDownloadPDF(viewingSupport)} className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 italic"><Download className="mr-2 h-4 w-4" /> Descargar PDF</Button><Button onClick={() => setViewingSupport(null)} variant="ghost" className="flex-1 rounded-xl border-white/10 text-white font-black uppercase text-[10px]">Cerrar</Button></div>
                    </div>)}
                </DialogContent>
            </Dialog>

            {/* Diálogo de Edición de Soporte */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                            <Edit className="h-5 w-5 text-primary" /> Editar Soporte de Gasto
                        </DialogTitle>
                        <p className="text-[9px] text-white/40">Puedes agregar más imágenes (máximo 20 en total)</p>
                    </DialogHeader>
                    <div className="py-6 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto p-2">
                            {Array.from({ length: 20 }).map((_, idx) => (
                                <div key={idx} className="space-y-2">
                                    <Label className="text-[9px] font-black uppercase text-slate-500">Imagen {idx + 1}</Label>
                                    <div className="border-2 border-dashed border-white/20 rounded-2xl p-3 text-center hover:border-primary/50 transition-colors min-h-[120px]">
                                        {editPreviews[idx] ? (
                                            <div className="relative">
                                                <img src={editPreviews[idx]} alt={`Preview ${idx + 1}`} className="max-h-24 mx-auto rounded-lg" />
                                                <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0 h-6 w-6 rounded-full bg-black/50" onClick={() => removeEditImage(idx)}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="py-3">
                                                <Camera className="h-6 w-6 text-white/20 mx-auto mb-1" />
                                                <Input type="file" accept="image/*" onChange={(e) => handleEditImageCapture(e, idx)} className="hidden" id={`edit-image-upload-${idx}`} />
                                                <Label htmlFor={`edit-image-upload-${idx}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/20 text-primary font-black uppercase text-[7px] cursor-pointer hover:bg-primary/30 transition-colors">
                                                    <ImagePlus className="h-2 w-2" /> Seleccionar
                                                </Label>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Fecha del Gasto</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-12 rounded-xl bg-slate-800 border-none text-white uppercase italic text-xs", !editFormData.fecha && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-3 h-4 w-4 text-primary" />
                                        {editFormData.fecha ? format(editFormData.fecha, "PPP", { locale: es }) : "Seleccione una fecha"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10">
                                    <CalendarComponent mode="single" selected={editFormData.fecha} onSelect={(date) => date && setEditFormData({ ...editFormData, fecha: date })} initialFocus locale={es} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Descripción</Label>
                            <Textarea
                                placeholder="Ej: COMPRA DE MATERIALES DE LIMPIEZA"
                                value={editFormData.descripcion}
                                onChange={(e) => setEditFormData({ ...editFormData, descripcion: e.target.value })}
                                className="rounded-xl bg-slate-800 border-none text-white font-black uppercase text-xs min-h-[80px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)} className="rounded-xl font-black uppercase text-[10px]">
                            Cancelar
                        </Button>
                        <Button onClick={handleEditSubmit} disabled={isSubmitting} className="rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] italic">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Guardar Cambios
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

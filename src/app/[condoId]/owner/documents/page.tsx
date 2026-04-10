'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar, ImageIcon, Eye, Download, Filter, FileText, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { downloadPDF } from '@/lib/print-pdf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

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

export default function OwnerDocumentsPage() {
    const params = useParams();
    const router = useRouter();
    const condoId = params?.condoId as string;
    
    const [supports, setSupports] = useState<ExpenseSupport[]>([]);
    const [filteredSupports, setFilteredSupports] = useState<ExpenseSupport[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
    const [viewingSupport, setViewingSupport] = useState<ExpenseSupport | null>(null);
    const [viewingImageIndex, setViewingImageIndex] = useState(0);
    const [activeTab, setActiveTab] = useState('soportes');

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
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Cargando documentos...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            {/* HEADER */}
            <div className="mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            Mis <span className="text-primary">Documentos</span>
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                        <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                            Accede a soportes, constancias y documentación importante
                        </p>
                    </div>
                </div>
            </div>

            {/* TABS */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-800/50 h-12 rounded-2xl p-1 border border-white/5">
                    <TabsTrigger value="soportes" className="rounded-xl font-black uppercase text-[10px] tracking-widest italic data-[state=active]:bg-primary data-[state=active]:text-slate-900">
                        <Receipt className="h-4 w-4 mr-2" /> Soportes de Gastos
                    </TabsTrigger>
                    <TabsTrigger value="otros" className="rounded-xl font-black uppercase text-[10px] tracking-widest italic data-[state=active]:bg-primary data-[state=active]:text-slate-900">
                        <FileText className="h-4 w-4 mr-2" /> Próximamente
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="soportes" className="mt-8 space-y-6">
                    {/* FILTROS */}
                    <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                        <CardContent className="p-6">
                            <div className="flex flex-wrap items-end gap-4">
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-primary" />
                                    <span className="text-[10px] font-black uppercase text-white/60">Filtrar por:</span>
                                </div>
                                <div className="w-40">
                                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                        <SelectTrigger className="h-10 rounded-xl bg-slate-800 border-none text-white font-black uppercase text-[10px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-white/10 text-white">
                                            {months.map(m => (
                                                <SelectItem key={m.value} value={m.value} className="font-black uppercase text-[10px]">{m.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-28">
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger className="h-10 rounded-xl bg-slate-800 border-none text-white font-black uppercase text-[10px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-white/10 text-white">
                                            {years.map(y => (
                                                <SelectItem key={y} value={y} className="font-black uppercase text-[10px]">{y}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="text-[10px] text-white/40">
                                    {filteredSupports.length} soporte(s) encontrado(s)
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* LISTADO DE SOPORTES */}
                    {filteredSupports.length === 0 ? (
                        <div className="text-center py-20 bg-slate-900/50 rounded-[2rem] border border-white/5">
                            <Receipt className="h-16 w-16 text-white/20 mx-auto mb-4" />
                            <p className="text-[10px] font-black uppercase text-white/40 italic">No hay soportes para este período</p>
                            <p className="text-[8px] text-white/20 mt-1">Selecciona otro mes o año</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredSupports.map((support) => (
                                <Card key={support.id} className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5 group transition-all hover:scale-[1.02] duration-300">
                                    <div className="relative aspect-video bg-slate-800 overflow-hidden cursor-pointer" onClick={() => { setViewingSupport(support); setViewingImageIndex(0); }}>
                                        <img 
                                            src={support.images[0]} 
                                            alt={support.descripcion}
                                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                        />
                                        {support.images.length > 1 && (
                                            <div className="absolute bottom-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-[8px] font-black">
                                                +{support.images.length - 1}
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <Button size="sm" variant="secondary" className="rounded-xl h-8 px-3 text-[9px] font-black" onClick={(e) => { e.stopPropagation(); setViewingSupport(support); setViewingImageIndex(0); }}>
                                                <Eye className="h-3 w-3 mr-1" /> Ver
                                            </Button>
                                            <Button size="sm" variant="secondary" className="rounded-xl h-8 px-3 text-[9px] font-black" onClick={(e) => { e.stopPropagation(); handleDownloadPDF(support); }}>
                                                <Download className="h-3 w-3 mr-1" /> PDF
                                            </Button>
                                        </div>
                                    </div>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 text-[10px] text-primary mb-2">
                                            <Calendar className="h-3 w-3" />
                                            {support.fecha?.toDate ? format(support.fecha.toDate(), 'dd/MM/yyyy') : 'Fecha no disponible'}
                                        </div>
                                        <p className="text-white font-black uppercase text-[10px] leading-tight line-clamp-2">
                                            {support.descripcion}
                                        </p>
                                        <div className="flex items-center gap-1 mt-2">
                                            <ImageIcon className="h-3 w-3 text-white/30" />
                                            <span className="text-[8px] text-white/30">{support.images.length} imagen(es)</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="otros" className="mt-8">
                    <div className="text-center py-20 bg-slate-900/50 rounded-[2rem] border border-white/5">
                        <FileText className="h-16 w-16 text-white/20 mx-auto mb-4" />
                        <p className="text-[10px] font-black uppercase text-white/40 italic">Próximamente más documentos</p>
                        <p className="text-[8px] text-white/20 mt-1">Constancias, recibos y más...</p>
                    </div>
                </TabsContent>
            </Tabs>

            {/* DIÁLOGO PARA VER SOPORTE COMPLETO */}
            <Dialog open={!!viewingSupport} onOpenChange={() => setViewingSupport(null)}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                            <Eye className="h-5 w-5 text-primary" /> Detalle del Soporte
                        </DialogTitle>
                    </DialogHeader>
                    {viewingSupport && (
                        <div className="space-y-4">
                            <div className="bg-slate-800 rounded-2xl p-4 text-center relative">
                                <img src={viewingSupport.images[viewingImageIndex]} alt="Soporte" className="max-h-[400px] mx-auto rounded-lg" />
                                {viewingSupport.images.length > 1 && (
                                    <div className="flex justify-between items-center mt-3">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setViewingImageIndex(Math.max(0, viewingImageIndex - 1))}
                                            disabled={viewingImageIndex === 0}
                                            className="rounded-xl bg-white/10 text-white font-black text-[10px] disabled:opacity-30"
                                        >
                                            ← Anterior
                                        </Button>
                                        <span className="text-[9px] text-white/40">
                                            {viewingImageIndex + 1} / {viewingSupport.images.length}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setViewingImageIndex(Math.min(viewingSupport.images.length - 1, viewingImageIndex + 1))}
                                            disabled={viewingImageIndex === viewingSupport.images.length - 1}
                                            className="rounded-xl bg-white/10 text-white font-black text-[10px] disabled:opacity-30"
                                        >
                                            Siguiente →
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-4 rounded-xl">
                                    <p className="text-[8px] font-black uppercase text-slate-500">Fecha del Gasto</p>
                                    <p className="font-black text-white text-sm">
                                        {viewingSupport.fecha?.toDate ? format(viewingSupport.fecha.toDate(), 'dd/MM/yyyy') : 'N/A'}
                                    </p>
                                </div>
                                <div className="bg-white/5 p-4 rounded-xl">
                                    <p className="text-[8px] font-black uppercase text-slate-500">Registrado por</p>
                                    <p className="font-black text-white text-sm">{viewingSupport.createdBy}</p>
                                </div>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl">
                                <p className="text-[8px] font-black uppercase text-slate-500">Descripción</p>
                                <p className="font-black text-white text-sm uppercase">{viewingSupport.descripcion}</p>
                            </div>
                            <div className="flex gap-3">
                                <Button 
                                    onClick={() => handleDownloadPDF(viewingSupport)}
                                    className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 italic"
                                >
                                    <Download className="mr-2 h-4 w-4" /> Descargar PDF
                                </Button>
                                <Button 
                                    onClick={() => setViewingSupport(null)}
                                    variant="ghost"
                                    className="flex-1 rounded-xl border-white/10 text-white font-black uppercase text-[10px]"
                                >
                                    Cerrar
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
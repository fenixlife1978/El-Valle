'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, addDoc, doc, getDoc, setDoc, orderBy, serverTimestamp, Timestamp, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Trash2, Loader2, Search, XCircle, FileText, User, Info, Stamp, MoreHorizontal, Save, AlignLeft, AlignCenter, AlignJustify } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import jsPDF from 'jspdf';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuthorization } from '@/hooks/use-authorization';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { Switch } from '@/components/ui/switch';

// --- Tipos ---
type Owner = {
  id: string;
  name: string;
  cedula?: string;
  properties: { street: string; house: string }[];
};

type CertificateStyles = {
  lineHeight: number;
  textAlign: 'justify' | 'left' | 'center' | 'right';
  fontSize: number;
};

type Certificate = {
  id: string;
  ownerId?: string;
  ownerName: string;
  ownerCedula: string;
  property: { street: string; house: string };
  type: string;
  body: string;
  createdAt: Timestamp;
  status: 'solicitud' | 'generado';
  published: boolean;
  styles?: CertificateStyles;
};

// --- Formulario Principal con Editor de Estilos ---
const CertificateForm = ({
  templateId,
  templateName,
  owners,
  activeCondoId,
  onGenerate,
  isSubmitting,
}: {
  templateId: string;
  templateName: string;
  owners: Owner[];
  activeCondoId: string;
  onGenerate: (data: any, personData: any) => Promise<void>;
  isSubmitting: boolean;
}) => {
  const { toast } = useToast();
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<{ street: string; house: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [certificateBody, setCertificateBody] = useState('');
  const [styles, setStyles] = useState<CertificateStyles>({ lineHeight: 1.6, textAlign: 'justify', fontSize: 12 });

  // Cargar Plantilla Maestra al iniciar (Corregido para evitar bloqueo)
  useEffect(() => {
    const loadMasterTemplate = async () => {
      if (!activeCondoId || !templateId) return;
      try {
        const docRef = doc(db, 'condominios', activeCondoId, 'config', 'certificateTemplates');
        const snap = await getDoc(docRef);
        
        if (snap.exists() && snap.data()[templateId]) {
          const data = snap.data()[templateId];
          setCertificateBody(data.body || '');
          setStyles(data.styles || { lineHeight: 1.6, textAlign: 'justify', fontSize: 12 });
        } else {
          // Texto por defecto si no existe la plantilla
          setCertificateBody(`Por medio de la presente se hace constar que el ciudadano [NOMBRE], portador de la cédula [CEDULA], residente de [PROPIEDAD]...`);
          setStyles({ lineHeight: 1.6, textAlign: 'justify', fontSize: 12 });
        }
      } catch (error) {
        console.error("Error cargando plantilla:", error);
      }
    };
    loadMasterTemplate();
  }, [templateId, activeCondoId]);

  const saveAsMasterTemplate = async () => {
    try {
      const docRef = doc(db, 'condominios', activeCondoId, 'config', 'certificateTemplates');
      await setDoc(docRef, {
        [templateId]: { body: certificateBody, styles }
      }, { merge: true });
      toast({ title: "Plantilla Actualizada", description: "Se ha guardado como el formato único para este documento." });
    } catch (e) {
      toast({ variant: 'destructive', title: "Error", description: "No se pudo guardar la plantilla." });
    }
  };

  const handleGenerate = () => {
    if (!selectedOwner || !selectedProperty) return toast({ title: "Faltan datos", description: "Selecciona un propietario y propiedad.", variant: "destructive" });
    onGenerate({
      ownerId: selectedOwner.id,
      ownerName: selectedOwner.name,
      ownerCedula: selectedOwner.cedula || 'N/A',
      property: selectedProperty,
      type: templateId,
      body: certificateBody,
      styles: styles,
      status: 'generado',
      published: true
    }, selectedOwner);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <Card className="shadow-sm border-primary/10">
          <CardHeader className="bg-primary text-primary-foreground py-4 rounded-t-lg">
            <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> 1. Propietario</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {!selectedOwner ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                {searchTerm.length > 2 && (
                  <Card className="absolute z-10 w-full mt-1 border rounded-md shadow-lg max-h-40 overflow-auto">
                    {owners.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase())).map(o => (
                      <div key={o.id} className="p-2 hover:bg-muted cursor-pointer text-sm border-b last:border-0" onClick={() => { setSelectedOwner(o); setSelectedProperty(o.properties[0]); setSearchTerm(''); }}>{o.name}</div>
                    ))}
                  </Card>
                )}
              </div>
            ) : (
              <div className="flex justify-between items-center p-3 bg-muted/50 border rounded-md">
                <div className="text-sm"><p className="font-bold text-primary">{selectedOwner.name}</p><p className="text-[10px] text-muted-foreground">C.I: {selectedOwner.cedula || 'S/N'}</p></div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedOwner(null)}><XCircle className="h-4 w-4 text-destructive" /></Button>
              </div>
            )}
            {selectedOwner && (
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold">Propiedad Asociada</Label>
                <Select onValueChange={(v) => setSelectedProperty(selectedOwner.properties.find(p => `${p.street}-${p.house}` === v) || null)} value={selectedProperty ? `${selectedProperty.street}-${selectedProperty.house}` : ''}>
                  <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {selectedOwner.properties.map(p => <SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{p.street} - {p.house}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <Card className="border-2 border-primary/10 shadow-md">
          <CardHeader className="bg-muted/30 flex flex-col md:flex-row items-center justify-between gap-4 py-3 px-4">
            <div className="flex gap-1 border p-1 rounded-md bg-background">
              <Button size="icon" variant={styles.textAlign === 'left' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => setStyles({...styles, textAlign: 'left'})}><AlignLeft className="h-4 w-4"/></Button>
              <Button size="icon" variant={styles.textAlign === 'center' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => setStyles({...styles, textAlign: 'center'})}><AlignCenter className="h-4 w-4"/></Button>
              <Button size="icon" variant={styles.textAlign === 'justify' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => setStyles({...styles, textAlign: 'justify'})}><AlignJustify className="h-4 w-4"/></Button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-[10px] font-bold">INTERLINEADO</Label>
                <Input type="number" step="0.1" className="w-14 h-8 text-xs text-center" value={styles.lineHeight} onChange={(e) => setStyles({...styles, lineHeight: parseFloat(e.target.value)})}/>
              </div>
              <Button size="sm" variant="secondary" className="h-8 text-xs font-bold" onClick={saveAsMasterTemplate}><Save className="h-3 w-3 mr-2"/> FIJAR PLANTILLA</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <Textarea 
              value={certificateBody} 
              onChange={(e) => setCertificateBody(e.target.value)} 
              className="min-h-[350px] text-sm focus-visible:ring-primary border-0 shadow-none resize-none" 
              style={{ textAlign: styles.textAlign, lineHeight: styles.lineHeight, fontSize: `${styles.fontSize}px` }}
              placeholder="Escribe el contenido de la constancia aquí..."
            />
          </CardContent>
          <CardFooter className="justify-end border-t bg-muted/10 py-3">
             <Button onClick={handleGenerate} disabled={isSubmitting || !selectedOwner} size="lg" className="font-bold uppercase tracking-tight"><FileText className="mr-2 h-4 w-4" /> Generar y Publicar PDF</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

// --- Página Principal ---
export default function CertificatesPage() {
  const { toast } = useToast();
  const { requestAuthorization } = useAuthorization();
  const { activeCondoId } = useAuth();

  const [owners, setOwners] = useState<Owner[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    if (!activeCondoId) {
      setLoading(false);
      return;
    }

    const ownersSub = onSnapshot(query(collection(db, 'condominios', activeCondoId, 'owners')), (snap) => {
      setOwners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Owner)));
    });

    const certsSub = onSnapshot(query(collection(db, 'condominios', activeCondoId, 'certificates'), orderBy('createdAt', 'desc')), 
      (snap) => {
        setCertificates(snap.docs.map(d => ({ id: d.id, ...d.data() } as Certificate)));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => { ownersSub(); certsSub(); };
  }, [activeCondoId]);

  const togglePublished = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'condominios', activeCondoId!, 'certificates', id), { published: !current });
      toast({ title: !current ? "Visible para el Propietario" : "Oculto del Historial" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  const handleGenerateAndSave = async (data: any, person: any) => {
    requestAuthorization(async () => {
      setIsSubmitting(true);
      try {
        const docRef = await addDoc(collection(db, 'condominios', activeCondoId!, 'certificates'), { ...data, createdAt: serverTimestamp() });
        await generatePDF({ ...data, id: docRef.id });
        toast({ title: "¡Éxito!", description: "Documento generado y guardado en el historial." });
      } catch (e) {
        toast({ variant: "destructive", title: "Error al guardar" });
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  const generatePDF = async (cert: any) => {
    const docPDF = new jsPDF();
    const margin = 20;
    const pageWidth = docPDF.internal.pageSize.getWidth();
    
    // Encabezado EFAS CondoSys
    docPDF.setFillColor(30, 41, 59).rect(0, 0, pageWidth, 25, 'F');
    docPDF.setTextColor(255, 255, 255).setFontSize(14).setFont('helvetica', 'bold').text("EFAS CondoSys", margin, 12);
    docPDF.setFontSize(8).setFont('helvetica', 'normal').text("SISTEMA DE GESTIÓN DE CONDOMINIOS", margin, 18);
    
    // Contenido
    docPDF.setTextColor(0, 0, 0).setFontSize(cert.styles?.fontSize || 12);
    const splitText = docPDF.splitTextToSize(cert.body, pageWidth - (margin * 2));
    docPDF.text(splitText, margin, 60, { 
      align: cert.styles?.textAlign || 'justify', 
      lineHeightFactor: cert.styles?.lineHeight || 1.6 
    });

    // Pie de página
    docPDF.setFontSize(8).setTextColor(150).text(`Documento de validez interna. ID: ${cert.id}`, margin, 280);
    docPDF.save(`Constancia_${cert.ownerName.replace(/ /g, '_')}.pdf`);
  };

  if (loading) return (
    <div className="flex flex-col h-[70vh] items-center justify-center gap-4">
      <Loader2 className="animate-spin h-12 w-12 text-primary"/>
      <p className="text-muted-foreground font-bold animate-pulse text-sm uppercase">Cargando Módulo de Certificaciones...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b pb-6">
        <div>
          <h2 className="text-4xl font-black text-foreground uppercase italic tracking-tighter">Constancias y <span className="text-primary">Permisos</span></h2>
          <p className="text-muted-foreground text-xs font-bold uppercase tracking-[0.2em] mt-1">Panel de Control Administrativo</p>
        </div>
        <Badge variant="outline" className="py-1 px-4 border-primary text-primary font-bold">ADMINISTRADOR</Badge>
      </div>

      <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-2xl bg-muted rounded-lg p-1">
          <TabsTrigger value="history" className="font-bold text-xs uppercase">Historial General</TabsTrigger>
          <TabsTrigger value="residencia" className="font-bold text-xs uppercase">Nueva Residencia</TabsTrigger>
          <TabsTrigger value="solvencia" className="font-bold text-xs uppercase">Nueva Solvencia</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-6">
          <Card className="shadow-lg border-primary/5">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
              <div>
                <CardTitle className="text-lg">Gestión de Documentos Emitidos</CardTitle>
                <CardDescription>Visualice y controle qué constancias están disponibles para los propietarios.</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre..." className="pl-8 h-9" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold uppercase text-[10px]">Propietario</TableHead>
                    <TableHead className="font-bold uppercase text-[10px]">Tipo de Documento</TableHead>
                    <TableHead className="font-bold uppercase text-[10px]">Fecha Emisión</TableHead>
                    <TableHead className="font-bold uppercase text-[10px]">Visible al Dueño</TableHead>
                    <TableHead className="text-right font-bold uppercase text-[10px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.filter(c => c.ownerName.toLowerCase().includes(historySearch.toLowerCase())).map(c => (
                    <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="font-bold text-primary">{c.ownerName}</div>
                        <div className="text-[10px] text-muted-foreground">C.I: {c.ownerCedula}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-[10px] font-bold">{c.type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.createdAt ? format(c.createdAt.toDate(), 'dd MMM yyyy', { locale: es }) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={c.published} onCheckedChange={() => togglePublished(c.id, c.published)} />
                          <span className="text-[10px] font-medium">{c.published ? 'PÚBLICO' : 'PRIVADO'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => generatePDF(c)}><FileText className="h-4 w-4"/></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4"/></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {certificates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No se han emitido documentos todavía.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="residencia">
          <CertificateForm templateId="residencia" templateName="Constancia de Residencia" owners={owners} activeCondoId={activeCondoId!} onGenerate={handleGenerateAndSave} isSubmitting={isSubmitting} />
        </TabsContent>

        <TabsContent value="solvencia">
          <CertificateForm templateId="solvencia" templateName="Constancia de Solvencia" owners={owners} activeCondoId={activeCondoId!} onGenerate={handleGenerateAndSave} isSubmitting={isSubmitting} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

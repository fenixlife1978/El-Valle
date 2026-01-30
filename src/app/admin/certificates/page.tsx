

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, addDoc, doc, getDoc, orderBy, serverTimestamp, Timestamp, deleteDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, Search, XCircle, FileText, Award, User, Home, Info, Stamp, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuthorization } from '@/hooks/use-authorization';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';


type Owner = {
  id: string;
  name: string;
  email?: string;
  cedula?: string;
  properties: { street: string; house: string }[];
};

type ManualPerson = {
  name: string;
  cedula: string;
  street: string;
  house: string;
  estadoCivil?: string;
  profesion?: string;
  otros?: string;
};

type Certificate = {
  id: string;
  ownerId?: string;
  ownerName: string;
  ownerCedula: string;
  property: { street: string; house: string };
  type: 'residencia' | 'solvencia' | 'remodelacion' | string;
  body: string;
  createdAt: Timestamp;
  status?: 'solicitud' | 'generado';
  condominioId: string;
};

type Template = {
  id: 'residencia' | 'solvencia' | 'remodelacion';
  name: string;
  title: string;
  generateBody: (
    person: Partial<Owner & ManualPerson>,
    property: { street: string; house: string },
    additionalInfo?: string
  ) => string;
};

type CompanyInfo = {
  name: string;
  address: string;
  rif: string;
  phone: string;
  email: string;
  logo: string;
};

const templates: Template[] = [
  {
    id: 'residencia',
    name: 'Constancia de Residencia',
    title: 'CONSTANCIA DE RESIDENCIA',
    generateBody: (person, property) => 
    `Quien suscribe, en mis funciones de Presidente (a) de la JUNTA ADMINISTRADORA DE CONDOMINIO DEL CONJUNTO RESIDENCIAL EL VALLE, por medio de la presente hago constar que el (la) Ciudadano (a) ${person.name}, titular de la Cédula de Identidad ${person.cedula}, reside en el inmueble ubicado en la ${property.street}, ${property.house} y ha demostrado una conducta de sana convivencia y respeto, apegado a las normas y leyes de nuestra sociedad.\n\nConstancia que se expide en la Ciudad de Independencia, Municipio Independencia, Estado Yaracuy a los ${format(new Date(), 'dd')} días del mes de ${format(new Date(), 'MMMM', { locale: es })} del año ${format(new Date(), 'yyyy')}.`
  },
  {
    id: 'solvencia',
    name: 'Constancia de Solvencia',
    title: 'CONSTANCIA DE SOLVENCIA',
    generateBody: (person, property) =>
      `Por medio de la presente, la Junta de Condominio del Conjunto Residencial El Valle, hace constar que el(la) ciudadano(a) ${person.name}, titular de la Cédula de Identidad ${person.cedula || '[Cédula no registrada]'}, propietario(a) de la vivienda ubicada en la ${property.street}, ${property.house}, se encuentra SOLVENTE con las obligaciones y cuotas de condominio hasta la presente fecha.\n\nConstancia que se expide a petición de la parte interesada en la ciudad de Independencia, Estado Yaracuy, a los ${format(new Date(), 'dd')} días del mes de ${format(new Date(), 'MMMM', { locale: es })} de ${format(new Date(), 'yyyy')}.`
  },
  {
    id: 'remodelacion',
    name: 'Permiso de Remodelación',
    title: 'PERMISO DE REMODELACIÓN',
    generateBody: (person, property, description) =>
      `Por medio de la presente, la Junta de Condominio del Conjunto Residencial El Valle, otorga el permiso al ciudadano(a) ${person.name}, titular de la Cédula de Identidad ${person.cedula || '[Cédula no registrada]'}, para realizar trabajos de remodelación en la propiedad ubicada en la ${property.street}, ${property.house}.\n\nLos trabajos a realizar consisten en: ${description || '[Describir trabajos]'}\n\nEl propietario se compromete a cumplir con el horario establecido para trabajos (lunes a viernes de 8:00 a.m. a 5:00 p.m. y sábados de 9:00 a.m. a 2:00 p.m.), así como a mantener la limpieza de las áreas comunes y a reparar cualquier daño que pudiera ocasionar.\n\nPermiso válido desde la fecha de su emisión.`
  }
];


const CertificateForm = ({
  template,
  owners,
  onGenerate,
  isSubmitting,
}: {
  template: Template;
  owners: Owner[];
  onGenerate: (data: any, personData: any) => Promise<void>;
  isSubmitting: boolean;
}) => {
  const [entryMode, setEntryMode] = useState<'search' | 'manual'>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [manualCedulaForOwner, setManualCedulaForOwner] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<{ street: string; house: string } | null>(null);
  const [manualData, setManualData] = useState<ManualPerson>({ name: '', cedula: '', street: '', house: '', estadoCivil: '', profesion: '' });
  const [certificateBody, setCertificateBody] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const { toast } = useToast();

  const filteredOwners = useMemo(() => {
    if (!searchTerm || searchTerm.length < 3) return [];
    return owners.filter((owner) => owner.name && owner.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, owners]);

  useEffect(() => {
    let person: Partial<Owner & ManualPerson> = {};
    let property: { street: string; house: string } | null = null;

    if (entryMode === 'search' && selectedOwner && selectedProperty) {
      person = {
        ...selectedOwner,
        cedula: selectedOwner.cedula || manualCedulaForOwner,
      };
      property = selectedProperty;
    } else if (entryMode === 'manual' && manualData.name && manualData.street && manualData.house && manualData.cedula) {
      person = manualData;
      property = { street: manualData.street, house: manualData.house };
    }

    if (Object.keys(person).length > 0 && property) {
      // @ts-ignore
      if (person.cedula || template.id === 'remodelacion') {
        setCertificateBody(template.generateBody(person, property, additionalInfo));
      } else {
        setCertificateBody('');
      }
    } else {
      setCertificateBody('');
    }
  }, [selectedOwner, manualCedulaForOwner, selectedProperty, additionalInfo, manualData, entryMode, template]);


  const handleSelectOwner = (owner: Owner) => {
    setSelectedOwner(owner);
    setSearchTerm('');
    if (owner.properties && owner.properties.length > 0) {
      setSelectedProperty(owner.properties[0]);
    } else {
      setSelectedProperty(null);
    }
    if (!owner.cedula) {
      setManualCedulaForOwner('');
    }
  };

  const handleManualDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualData({ ...manualData, [e.target.id]: e.target.value });
  };
  
  const handleGenerateClick = async () => {
    let person: Partial<Owner & ManualPerson> = {};
    let property: { street: string; house: string } | null = null;
    let finalCedula = '';

    if (entryMode === 'search') {
      if (!selectedOwner || !selectedProperty) {
        toast({ variant: 'destructive', title: 'Datos Incompletos', description: 'Debe seleccionar un propietario y una propiedad.' });
        return;
      }
      finalCedula = selectedOwner.cedula || manualCedulaForOwner;
      if (!finalCedula) {
        toast({ variant: 'destructive', title: 'Cédula Requerida', description: 'Por favor, ingrese la cédula del propietario.' });
        return;
      }
      person = { ...selectedOwner, cedula: finalCedula };
      property = selectedProperty;
    } else {
      if (!manualData.name || !manualData.cedula || !manualData.street || !manualData.house) {
        toast({ variant: 'destructive', title: 'Datos Incompletos', description: 'Nombre, Cédula, Calle y Casa son obligatorios en modo manual.' });
        return;
      }
      person = manualData;
      finalCedula = manualData.cedula;
      property = { street: manualData.street, house: manualData.house };
    }

    if (!certificateBody) {
      toast({ variant: 'destructive', title: 'Datos Incompletos', description: 'El cuerpo del documento no puede estar vacío.' });
      return;
    }
    
    const docData = {
        ownerId: entryMode === 'search' ? (person as any).id : 'manual',
        ownerName: person!.name as string,
        ownerCedula: finalCedula,
        property: property!,
        type: template.id,
        body: certificateBody,
        createdAt: serverTimestamp() as Timestamp,
        status: 'generado' as const,
    };
    
    await onGenerate(docData, person);
  };

  return (
    <div className="space-y-6">
      <Card className="bg-muted/50">
        <CardHeader className="bg-primary text-primary-foreground rounded-t-2xl"><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" />1. Destinatario</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup defaultValue="search" value={entryMode} onValueChange={(v) => setEntryMode(v as 'search' | 'manual')} className="mb-4 flex gap-4">
            <div className="flex items-center space-x-2"><RadioGroupItem value="search" id={`r1-${template.id}`} /><Label htmlFor={`r1-${template.id}`}>Buscar Propietario</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="manual" id={`r2-${template.id}`} /><Label htmlFor={`r2-${template.id}`}>Ingresar Manualmente</Label></div>
          </RadioGroup>
          {entryMode === 'search' ? (
            <>
              {!selectedOwner ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por nombre..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  {filteredOwners.length > 0 && <Card className="mt-2 border rounded-lg"><ScrollArea className="h-40">{filteredOwners.map((owner) => <div key={owner.id} onClick={() => handleSelectOwner(owner)} className="p-3 hover:bg-background cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p></div>)}</ScrollArea></Card>}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                    <div><p className="font-semibold text-primary">{selectedOwner.name}</p><p className="text-sm text-muted-foreground">C.I: {selectedOwner.cedula || 'No registrada'}</p></div>
                    <Button variant="ghost" size="icon" onClick={() => { setSelectedOwner(null); setSelectedProperty(null); setManualCedulaForOwner(''); }}><XCircle className="h-5 w-5 text-destructive" /></Button>
                  </div>
                  {!selectedOwner.cedula && <div className="space-y-2"><Label htmlFor="manualCedulaForOwner">Cédula del Propietario</Label><Input id="manualCedulaForOwner" value={manualCedulaForOwner} onChange={(e) => setManualCedulaForOwner(e.target.value)} placeholder="Ingrese la cédula ya que no está registrada" /></div>}
                  {selectedOwner.properties.length > 0 && <div className="space-y-2"><Label>Propiedad</Label><Select onValueChange={(v) => setSelectedProperty(selectedOwner.properties.find((p) => `${p.street}-${p.house}` === v) || null)} value={selectedProperty ? `${selectedProperty.street}-${selectedProperty.house}` : ''}><SelectTrigger><SelectValue placeholder="Seleccione una propiedad..." /></SelectTrigger><SelectContent>{selectedOwner.properties.map((p) => <SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{p.street} - {p.house}</SelectItem>)}</SelectContent></Select></div>}
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2"><Label htmlFor="name">Nombre y Apellidos</Label><Input id="name" value={manualData.name} onChange={handleManualDataChange} /></div>
              <div className="space-y-2"><Label htmlFor="cedula">Cédula</Label><Input id="cedula" value={manualData.cedula} onChange={handleManualDataChange} /></div>
              <div className="space-y-2"><Label htmlFor="street">Calle</Label><Input id="street" value={manualData.street} onChange={handleManualDataChange} /></div>
              <div className="space-y-2"><Label htmlFor="house">Casa</Label><Input id="house" value={manualData.house} onChange={handleManualDataChange} /></div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="bg-muted/50">
        <CardHeader className="bg-primary text-primary-foreground rounded-t-2xl"><CardTitle className="text-lg flex items-center gap-2"><Stamp className="h-5 w-5" />2. Contenido</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {template.id === 'remodelacion' && <div className="space-y-2"><Label htmlFor="additional-info">Descripción de los Trabajos</Label><Textarea id="additional-info" value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} placeholder="Ej: Cambio de cerámica en el baño principal..." /></div>}
          <div className="p-4 border bg-background rounded-lg">
            <h4 className="font-semibold mb-2">Cuerpo del Documento (Editable)</h4>
            <Textarea value={certificateBody} onChange={(e) => setCertificateBody(e.target.value)} rows={10} className="text-sm" />
          </div>
          <div className="p-3 bg-blue-100/50 border border-blue-300 rounded-lg text-sm text-blue-800 flex items-start gap-2"><Info className="h-4 w-4 mt-0.5 shrink-0" /><span>El documento final incluirá el encabezado oficial, título y firma.</span></div>
        </CardContent>
        <CardFooter>
            <Button onClick={handleGenerateClick} disabled={isSubmitting || !certificateBody}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Guardar y Generar PDF
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
};


export default function CertificatesPage() {
  const { toast } = useToast();
  const { requestAuthorization } = useAuthorization();
  const { activeCondoId } = useAuth();

  const [owners, setOwners] = useState<Owner[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState<Certificate | null>(null);

  useEffect(() => {
    if (!activeCondoId) {
        setLoading(false);
        return;
    };
    
    const ownersQuery = query(collection(db, 'condominios', activeCondoId, 'owners'));
    const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
      setOwners(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Owner)));
    });

    const certsQuery = query(collection(db, 'condominios', activeCondoId, 'certificates'), orderBy('createdAt', 'desc'));
    const certsUnsubscribe = onSnapshot(certsQuery, (snapshot) => {
      setCertificates(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Certificate)));
    });

    const fetchSettings = async () => {
      const settingsRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
      const snap = await getDoc(settingsRef);
      if (snap.exists()) {
        setCompanyInfo((snap.data() as any).companyInfo as CompanyInfo);
      }
    };

    fetchSettings();
    setLoading(false);

    return () => {
      ownersUnsubscribe();
      certsUnsubscribe();
    };
  }, [activeCondoId]);
  
  const filteredCertificates = useMemo(() => {
    if (!historySearchTerm) return certificates;
    return certificates.filter(
      (cert) =>
        cert.ownerName.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
        (templates.find((t) => t.id === cert.type)?.name.toLowerCase() || '').includes(historySearchTerm.toLowerCase())
    );
  }, [historySearchTerm, certificates]);
  

  const handleGenerateAndSave = async (docData: Omit<Certificate, 'id' | 'condominioId'>, personData: any) => {
    if (!activeCondoId) return;
    requestAuthorization(async () => {
        setIsSubmitting(true);
        try {
            const dataToSave = { ...docData, condominioId: activeCondoId };
            
            const request = certificates.find(c => c.status === 'solicitud' && c.ownerId === docData.ownerId && c.type === docData.type);
            
            let docRef;
            if (request) {
                docRef = doc(db, 'condominios', activeCondoId, 'certificates', request.id);
                await updateDoc(docRef, dataToSave);
            } else {
                docRef = await addDoc(collection(db, 'condominios', activeCondoId, 'certificates'), dataToSave);
            }

            await generatePDF({ ...dataToSave, id: docRef.id, createdAt: Timestamp.now() } as Certificate, personData);
            toast({ title: 'Constancia Generada', description: 'El documento PDF ha sido creado y guardado en el historial.' });
          } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la constancia.' });
          } finally {
            setIsSubmitting(false);
          }
    });
  };
  
  const generatePDF = async (certificate: Certificate, personData: Partial<Owner & ManualPerson>) => {
      if (!companyInfo) {
          toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información de la empresa.' });
          return;
      }
  
      const docPDF = new jsPDF();
      const pageWidth = docPDF.internal.pageSize.getWidth();
      const headerHeight = 25;
      const margin = 14;

      // --- HEADER ---
        const headerColor = [28, 43, 58];
        docPDF.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
        docPDF.rect(0, 0, pageWidth, headerHeight, 'F');
        docPDF.setTextColor(255, 255, 255);

        let textX = margin;
        if (companyInfo?.logo) {
            try {
                const logoSize = 18;
                docPDF.addImage(companyInfo.logo, 'PNG', margin, (headerHeight - logoSize) / 2, logoSize, logoSize);
                textX += logoSize + 5;
            }
            catch(e) { console.error("Error adding logo:", e); }
        }

        docPDF.setFontSize(11).setFont('helvetica', 'bold');
        docPDF.text(companyInfo?.name || 'CONDOMINIO', textX, 13);
        docPDF.setFontSize(8).setFont('helvetica', 'normal');
        docPDF.text(`RIF: ${companyInfo?.rif || 'N/A'}`, textX, 18);
        
        docPDF.setFontSize(8).setFont('helvetica', 'normal');
        docPDF.text('DOCUMENTO OFICIAL', pageWidth - margin, headerHeight / 2 + 3, { align: 'right' });
        
        docPDF.setTextColor(0, 0, 0); // Reset text color
      
        let startY = headerHeight + 15;

      // --- BARCODE ---
      const canvas = document.createElement('canvas');
      const barcodeValue = `CERT-${certificate.id.slice(0, 4)}-${certificate.ownerId?.slice(0, 4)}`;
      try {
          JsBarcode(canvas, barcodeValue, {
              format: "CODE128", height: 40, width: 1.5, displayValue: true, margin: 0, fontSize: 10
          });
          const barcodeDataUrl = canvas.toDataURL("image/png");
          docPDF.addImage(barcodeDataUrl, 'PNG', (pageWidth / 2) - 30, startY, 60, 20);
      } catch (e) {
          console.error("Barcode generation failed", e);
      }
      startY += 25;
      
      const template = templates.find((t) => t.id === certificate.type);
      const title = template ? template.title : 'DOCUMENTO';
      docPDF.setFontSize(16).setFont('helvetica', 'bold').text(title, pageWidth / 2, startY, { align: 'center' });
  
      startY += 20;
      const textOptions = { align: 'justify' as const, lineHeightFactor: 1.6, maxWidth: pageWidth - (margin * 2) };
      docPDF.setFontSize(12).setFont('helvetica', 'normal');
      const textLines = docPDF.splitTextToSize(certificate.body, textOptions.maxWidth);
      docPDF.text(textLines, margin, startY, textOptions);
      
      const textBlockHeight = docPDF.getTextDimensions(certificate.body, textOptions).h;
      let finalY = startY + textBlockHeight;

      const signatureY = finalY > 230 ? 250 : finalY + 40;
      const signatureWidth = 80;
      const signatureX = (pageWidth / 2) - (signatureWidth / 2);
  
      docPDF.setLineWidth(0.5);
      docPDF.line(signatureX, signatureY, signatureX + signatureWidth, signatureY); 
      docPDF.setFontSize(10).setFont('helvetica', 'bold').text('Presidente de la Junta de Condominio', pageWidth / 2, signatureY + 8, { align: 'center' });
  
      docPDF.save(`constancia_${certificate.type}_${certificate.ownerName.replace(/\s/g, '_')}.pdf`);
  };

  const handleDeleteCertificate = async () => {
      if (!certificateToDelete || !activeCondoId) return;
      requestAuthorization(async () => {
          try {
              await deleteDoc(doc(db, 'condominios', activeCondoId, 'certificates', certificateToDelete.id));
              toast({ title: 'Constancia Eliminada', description: 'El registro ha sido eliminado exitosamente.' });
          } catch (error) {
              console.error('Error deleting certificate: ', error);
              toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la constancia.' });
          } finally {
              setCertificateToDelete(null);
              setIsDeleteConfirmationOpen(false);
          }
      });
  };
  
  if(loading) return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  
  return (
    <div className="space-y-8">
      <div className="mb-10">
          <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
              Constancias y <span className="text-primary">Permisos</span>
          </h2>
          <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full"></div>
          <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
              Generación y gestión de documentos para propietarios.
          </p>
      </div>

      <Tabs defaultValue="history">
        <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="history">Historial y Solicitudes</TabsTrigger>
            <TabsTrigger value="residencia">Nueva Residencia</TabsTrigger>
            <TabsTrigger value="solvencia">Nueva Solvencia</TabsTrigger>
            <TabsTrigger value="remodelacion">Nuevo Permiso</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="mt-4">
            <Card>
                <CardHeader className="bg-primary text-primary-foreground rounded-t-2xl">
                    <CardTitle>Historial de Constancias</CardTitle>
                    <CardDescription className="text-primary-foreground/90">Busque y gestione todas las constancias y solicitudes.</CardDescription>
                </CardHeader>
                <CardContent>
                <Input
                    placeholder="Buscar en historial por nombre o tipo..."
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                    className="mb-4"
                />
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Propietario</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredCertificates.map((cert) => (
                        <TableRow key={cert.id}>
                        <TableCell>{cert.ownerName}</TableCell>
                        <TableCell>{templates.find((t) => t.id === cert.type)?.name || cert.type}</TableCell>
                        <TableCell>
                            {cert.createdAt ? format(cert.createdAt.toDate(), 'dd MMMM, yyyy', { locale: es }) : '-'}
                        </TableCell>
                        <TableCell>
                            {cert.status === 'solicitud' ? <Badge variant="warning">Solicitud</Badge> : <Badge variant="success">Generado</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Abrir menú</span><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { const person = owners.find(o => o.id === cert.ownerId) || {name: cert.ownerName, cedula: cert.ownerCedula, properties: [cert.property]}; generatePDF(cert, person); }}>
                                <FileText className="mr-2 h-4 w-4" />
                                {cert.status === 'solicitud' ? 'Generar y Descargar' : 'Regenerar PDF'}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => { setCertificateToDelete(cert); setIsDeleteConfirmationOpen(true);}}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="residencia" className="mt-4">
            <CertificateForm template={templates.find(t => t.id === 'residencia')!} owners={owners} onGenerate={handleGenerateAndSave} isSubmitting={isSubmitting} />
        </TabsContent>
        <TabsContent value="solvencia" className="mt-4">
            <CertificateForm template={templates.find(t => t.id === 'solvencia')!} owners={owners} onGenerate={handleGenerateAndSave} isSubmitting={isSubmitting} />
        </TabsContent>
        <TabsContent value="remodelacion" className="mt-4">
             <CertificateForm template={templates.find(t => t.id === 'remodelacion')!} owners={owners} onGenerate={handleGenerateAndSave} isSubmitting={isSubmitting} />
        </TabsContent>
      </Tabs>

      
      <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Está seguro de que desea eliminar esta constancia? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteCertificate}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

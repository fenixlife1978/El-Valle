
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, addDoc, doc, getDoc, orderBy, serverTimestamp, Timestamp, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, Search, XCircle, FileText, Award, User, Home, Info, Stamp } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';

type Owner = {
    id: string;
    name: string;
    email?: string;
    cedula?: string;
    properties: { street: string, house: string }[];
};

type Certificate = {
    id: string;
    ownerId: string;
    ownerName: string;
    ownerCedula: string;
    property: { street: string, house: string };
    type: string;
    body: string;
    createdAt: Timestamp;
};

type Template = {
    id: 'residencia' | 'solvencia' | 'remodelacion';
    name: string;
    title: string;
    generateBody: (owner: Owner, property: { street: string; house: string }, additionalInfo?: string) => string;
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
        generateBody: (owner, property) => 
            `Por medio de la presente, la Junta de Condominio del Conjunto Residencial Valle de Chara, hace constar que el(la) ciudadano(a) ${owner.name}, titular de la Cédula de Identidad N° ${owner.cedula || '[Cédula no registrada]'}, reside en este conjunto residencial, en la propiedad identificada como ${property.street}, Casa N° ${property.house}.\n\nConstancia que se expide a petición de la parte interesada en la ciudad de Charallave, a los ${format(new Date(), 'dd')} días del mes de ${format(new Date(), 'MMMM', { locale: es })} de ${format(new Date(), 'yyyy')}.`
    },
    {
        id: 'solvencia',
        name: 'Constancia de Solvencia',
        title: 'CONSTANCIA DE SOLVENCIA',
        generateBody: (owner, property) => 
            `Por medio de la presente, la Junta de Condominio del Conjunto Residencial Valle de Chara, hace constar que el(la) ciudadano(a) ${owner.name}, titular de la Cédula de Identidad N° ${owner.cedula || '[Cédula no registrada]'}, propietario(a) de la vivienda ubicada en la ${property.street}, Casa N° ${property.house}, se encuentra SOLVENTE con las obligaciones y cuotas de condominio hasta la presente fecha.\n\nConstancia que se expide a petición de la parte interesada en la ciudad de Charallave, a los ${format(new Date(), 'dd')} días del mes de ${format(new Date(), 'MMMM', { locale: es })} de ${format(new Date(), 'yyyy')}.`
    },
    {
        id: 'remodelacion',
        name: 'Permiso de Remodelación',
        title: 'PERMISO DE REMODELACIÓN',
        generateBody: (owner, property, description) => 
            `Por medio de la presente, la Junta de Condominio del Conjunto Residencial Valle de Chara, otorga el permiso al ciudadano(a) ${owner.name}, titular de la Cédula de Identidad N° ${owner.cedula || '[Cédula no registrada]'}, para realizar trabajos de remodelación en la propiedad ubicada en la ${property.street}, Casa N° ${property.house}.\n\nLos trabajos a realizar consisten en: ${description || '[Describir trabajos]'}\n\nEl propietario se compromete a cumplir con el horario establecido para trabajos (lunes a viernes de 8:00 a.m. a 5:00 p.m. y sábados de 9:00 a.m. a 2:00 p.m.), así como a mantener la limpieza de las áreas comunes y a reparar cualquier daño que pudiera ocasionar.\n\nPermiso válido desde la fecha de su emisión.`
    }
];

export default function CertificatesPage() {
    const { toast } = useToast();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedProperty, setSelectedProperty] = useState<{ street: string, house: string } | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState<Template['id'] | ''>('');
    const [certificateBody, setCertificateBody] = useState('');
    const [additionalInfo, setAdditionalInfo] = useState('');
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    
    useEffect(() => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
            setOwners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)));
        });

        const certsQuery = query(collection(db, "certificates"), orderBy("createdAt", "desc"));
        const certsUnsubscribe = onSnapshot(certsQuery, (snapshot) => {
            setCertificates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certificate)));
        });
        
        const fetchSettings = async () => {
             const settingsRef = doc(db, 'config', 'mainSettings');
             const docSnap = await getDoc(settingsRef);
             if (docSnap.exists()) setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
        };
        fetchSettings();
        setLoading(false);

        return () => {
            ownersUnsubscribe();
            certsUnsubscribe();
        };
    }, []);

    useEffect(() => {
        if (selectedOwner && selectedProperty && selectedTemplateId) {
            const template = templates.find(t => t.id === selectedTemplateId);
            if (template) {
                setCertificateBody(template.generateBody(selectedOwner, selectedProperty, additionalInfo));
            }
        }
    }, [selectedOwner, selectedProperty, selectedTemplateId, additionalInfo]);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(owner =>
            owner.name && owner.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, owners]);

    const filteredCertificates = useMemo(() => {
        if (!historySearchTerm) return certificates;
        return certificates.filter(cert => 
            cert.ownerName.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
            templates.find(t => t.id === cert.type)?.name.toLowerCase().includes(historySearchTerm.toLowerCase())
        );
    }, [historySearchTerm, certificates]);
    
    const resetDialog = () => {
        setIsDialogOpen(false);
        setSearchTerm('');
        setSelectedOwner(null);
        setSelectedProperty(null);
        setSelectedTemplateId('');
        setCertificateBody('');
        setAdditionalInfo('');
    };

    const handleSelectOwner = (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
        if (owner.properties && owner.properties.length > 0) {
            setSelectedProperty(owner.properties[0]);
        }
    };
    
    const handleGenerateAndSave = async () => {
        if (!selectedOwner || !selectedProperty || !selectedTemplateId || !certificateBody) {
            toast({ variant: 'destructive', title: 'Datos Incompletos', description: 'Debe seleccionar un propietario, propiedad, plantilla y tener contenido en el cuerpo del documento.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const docData = {
                ownerId: selectedOwner.id,
                ownerName: selectedOwner.name,
                ownerCedula: selectedOwner.cedula || 'N/A',
                property: selectedProperty,
                type: selectedTemplateId,
                body: certificateBody,
                createdAt: serverTimestamp() as Timestamp,
            };
            const docRef = await addDoc(collection(db, "certificates"), docData);
            generatePDF({ ...docData, id: docRef.id, createdAt: Timestamp.now() });
            toast({ title: "Constancia Generada", description: "El documento PDF ha sido creado y guardado en el historial." });
            resetDialog();
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la constancia.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const generatePDF = async (certificate: Certificate) => {
        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información de la empresa.'});
            return;
        }
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;

        if (companyInfo.logo) {
            try { doc.addImage(companyInfo.logo, 'PNG', margin, 15, 30, 30); }
            catch(e) { console.error(e); }
        }

        doc.setFontSize(10).setFont('helvetica', 'normal').text(companyInfo.name, pageWidth - margin, 20, { align: 'right' });
        doc.text(companyInfo.rif, pageWidth - margin, 25, { align: 'right' });
        doc.text(companyInfo.address, pageWidth - margin, 30, { align: 'right' });

        const template = templates.find(t => t.id === certificate.type);
        const title = template ? template.title : "DOCUMENTO";
        doc.setFontSize(16).setFont('helvetica', 'bold').text(title, pageWidth / 2, 70, { align: 'center' });

        doc.setFontSize(12).setFont('helvetica', 'normal');
        const splitBody = doc.splitTextToSize(certificate.body, pageWidth - (margin * 2));
        doc.text(splitBody, margin, 90);

        const qrContent = `ID:${certificate.id}\nFecha:${format(certificate.createdAt.toDate(), 'yyyy-MM-dd')}\nPropietario:${certificate.ownerName}`;
        const qrCodeUrl = await QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'M' });

        const signatureY = doc.internal.pageSize.getHeight() - 70;
        doc.addImage(qrCodeUrl, 'PNG', margin, signatureY - 20, 30, 30);
        
        doc.setLineWidth(0.5);
        doc.line(pageWidth/2 - 40, signatureY, pageWidth/2 + 40, signatureY);
        doc.setFontSize(10).setFont('helvetica', 'bold').text('Junta de Condominio', pageWidth / 2, signatureY + 8, { align: 'center' });

        doc.save(`constancia_${certificate.type}_${certificate.ownerName.replace(' ', '_')}.pdf`);
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Constancias y Permisos</h1>
                    <p className="text-muted-foreground">Genere y gestione documentos para los propietarios.</p>
                </div>
                <Button onClick={() => setIsDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Crear Nueva Constancia
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Historial de Constancias Emitidas</CardTitle>
                    <div className="relative mt-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar por propietario, tipo de constancia..." className="pl-9" value={historySearchTerm} onChange={(e) => setHistorySearchTerm(e.target.value)} />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Propietario</TableHead>
                                <TableHead>Tipo de Documento</TableHead>
                                <TableHead>Fecha de Emisión</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                            ) : filteredCertificates.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No hay constancias emitidas.</TableCell></TableRow>
                            ) : (
                                filteredCertificates.map(cert => (
                                    <TableRow key={cert.id}>
                                        <TableCell>{cert.ownerName}</TableCell>
                                        <TableCell>{templates.find(t => t.id === cert.type)?.name || cert.type}</TableCell>
                                        <TableCell>{cert.createdAt ? format(cert.createdAt.toDate(), "dd MMMM, yyyy", { locale: es }) : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => generatePDF(cert)}>
                                                <FileText className="mr-2 h-4 w-4"/> Regenerar PDF
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            
            <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetDialog()}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Nueva Constancia o Permiso</DialogTitle>
                        <DialogDescription>Complete el formulario para generar un nuevo documento.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto pr-6 -mr-6 space-y-6">
                        <Card className="bg-muted/50">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5"/>1. Seleccione el Propietario</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {!selectedOwner ? (
                                    <>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input placeholder="Buscar por nombre (mín. 3 caracteres)..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                        </div>
                                        {filteredOwners.length > 0 && (
                                            <Card className="mt-2 border rounded-md">
                                                <ScrollArea className="h-40">{filteredOwners.map(owner => (<div key={owner.id} onClick={() => handleSelectOwner(owner)} className="p-3 hover:bg-background cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p></div>))}</ScrollArea>
                                            </Card>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex items-center justify-between p-3 bg-background rounded-md">
                                        <div>
                                            <p className="font-semibold text-primary">{selectedOwner.name}</p>
                                            <p className="text-sm text-muted-foreground">C.I: {selectedOwner.cedula || 'No registrada'}</p>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => setSelectedOwner(null)}><XCircle className="h-5 w-5 text-destructive"/></Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        
                        {selectedOwner && (
                             <Card className="bg-muted/50">
                                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Home className="h-5 w-5"/>2. Seleccione la Propiedad</CardTitle></CardHeader>
                                <CardContent>
                                    <Select onValueChange={(v) => setSelectedProperty(selectedOwner.properties.find(p => `${p.street}-${p.house}` === v) || null)} value={selectedProperty ? `${selectedProperty.street}-${selectedProperty.house}` : ''}>
                                        <SelectTrigger><SelectValue placeholder="Seleccione una propiedad..." /></SelectTrigger>
                                        <SelectContent>{selectedOwner.properties.map(p => (<SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{p.street} - {p.house}</SelectItem>))}</SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>
                        )}
                        
                        {selectedOwner && selectedProperty && (
                             <Card className="bg-muted/50">
                                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Award className="h-5 w-5"/>3. Tipo de Documento</CardTitle></CardHeader>
                                <CardContent>
                                    <Select onValueChange={(v) => setSelectedTemplateId(v as Template['id'])} value={selectedTemplateId}>
                                        <SelectTrigger><SelectValue placeholder="Seleccione una plantilla..." /></SelectTrigger>
                                        <SelectContent>{templates.map(t => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}</SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>
                        )}
                        
                        {selectedTemplateId && (
                             <Card className="bg-muted/50">
                                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Stamp className="h-5 w-5"/>4. Contenido del Documento</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                     {selectedTemplateId === 'remodelacion' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="additional-info">Descripción de los Trabajos de Remodelación</Label>
                                            <Textarea id="additional-info" value={additionalInfo} onChange={e => setAdditionalInfo(e.target.value)} placeholder="Ej: Cambio de cerámica en el baño principal, pintura de paredes internas..." />
                                        </div>
                                    )}
                                     <div className="p-4 border bg-background rounded-md">
                                        <h4 className="font-semibold mb-2">Vista Previa del Cuerpo</h4>
                                        <p className="text-sm whitespace-pre-wrap">{certificateBody}</p>
                                    </div>
                                     <div className="p-3 bg-blue-100/50 border border-blue-300 rounded-md text-sm text-blue-800 flex items-start gap-2">
                                        <Info className="h-4 w-4 mt-0.5 shrink-0"/>
                                        <span>El documento final incluirá el encabezado oficial de la empresa, el título del documento y la firma de la junta de condominio.</span>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
                        <Button onClick={handleGenerateAndSave} disabled={isSubmitting || !certificateBody}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileText className="mr-2 h-4 w-4"/>}
                            Guardar y Generar PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

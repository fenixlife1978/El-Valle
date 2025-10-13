
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, FileText, Edit, MoreHorizontal, Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Download, Share2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';


type CustomDocument = {
    id: string;
    title: string;
    body: string; // Body will now store HTML
    createdAt: Timestamp;
    updatedAt: Timestamp;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const emptyDocument: Omit<CustomDocument, 'id' | 'createdAt' | 'updatedAt'> = {
    title: '',
    body: '',
};

const RichTextEditor = ({ value, onChange }: { value: string, onChange: (value: string) => void }) => {
    const editorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        onChange(e.currentTarget.innerHTML);
    };
    
    const execCommand = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        if(editorRef.current) editorRef.current.focus();
    }

    return (
        <div className="rounded-md border border-input">
            <div className="p-2 border-b">
                 <ToggleGroup type="multiple" className="flex items-center gap-1 justify-start flex-wrap">
                    <ToggleGroupItem value="bold" aria-label="Toggle bold" onClick={() => execCommand('bold')}><Bold className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="italic" aria-label="Toggle italic" onClick={() => execCommand('italic')}><Italic className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="underline" aria-label="Toggle underline" onClick={() => execCommand('underline')}><Underline className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="justifyLeft" aria-label="Align left" onClick={() => execCommand('justifyLeft')}><AlignLeft className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="justifyCenter" aria-label="Align center" onClick={() => execCommand('justifyCenter')}><AlignCenter className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="justifyRight" aria-label="Align right" onClick={() => execCommand('justifyRight')}><AlignRight className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="justifyFull" aria-label="Align justify" onClick={() => execCommand('justifyFull')}><AlignJustify className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="insertUnorderedList" aria-label="Bullet list" onClick={() => execCommand('insertUnorderedList')}><List className="h-4 w-4"/></ToggleGroupItem>
                    <ToggleGroupItem value="insertOrderedList" aria-label="Numbered list" onClick={() => execCommand('insertOrderedList')}><ListOrdered className="h-4 w-4"/></ToggleGroupItem>
                </ToggleGroup>
            </div>
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                className="w-full min-h-[300px] rounded-b-md bg-background p-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            />
        </div>
    );
};


export default function DocumentsPage() {
    const { toast } = useToast();
    const [documents, setDocuments] = useState<CustomDocument[]>([]);
    const [currentDocument, setCurrentDocument] = useState(emptyDocument);
    const [documentToEdit, setDocumentToEdit] = useState<CustomDocument | null>(null);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [documentToDelete, setDocumentToDelete] = useState<CustomDocument | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [documentToPreview, setDocumentToPreview] = useState<CustomDocument | null>(null);


    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchCompanyInfo = async () => {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
            }
        };
        fetchCompanyInfo();

        const q = query(collection(db, "custom_documents"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomDocument));
            setDocuments(docsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching documents:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la lista de documentos.' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);

    const resetDialog = () => {
        setIsDialogOpen(false);
        setDocumentToEdit(null);
        setCurrentDocument(emptyDocument);
    };

    const handleNewDocument = () => {
        resetDialog();
        setIsDialogOpen(true);
    };
    
    const handleEditDocument = (docToEdit: CustomDocument) => {
        setDocumentToEdit(docToEdit);
        setCurrentDocument({
            title: docToEdit.title,
            body: docToEdit.body,
        });
        setIsDialogOpen(true);
    };

    const handleDeleteDocument = (docToDelete: CustomDocument) => {
        setDocumentToDelete(docToDelete);
        setIsDeleteConfirmationOpen(true);
    };

    const confirmDelete = async () => {
        if (!documentToDelete) return;
        try {
            await deleteDoc(doc(db, "custom_documents", documentToDelete.id));
            toast({ title: "Documento Eliminado", description: "El documento ha sido eliminado exitosamente." });
        } catch (error) {
            console.error("Error deleting document:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el documento.' });
        } finally {
            setIsDeleteConfirmationOpen(false);
            setDocumentToDelete(null);
        }
    };
    
    const handleSaveDocument = async () => {
        if (!currentDocument.title.trim()) {
            toast({ variant: 'destructive', title: 'Título requerido', description: 'Por favor, ingrese un título para el documento.' });
            return;
        }

        setIsSubmitting(true);
        const dataToSave = {
            ...currentDocument,
            updatedAt: serverTimestamp()
        };

        try {
            if (documentToEdit) {
                const docRef = doc(db, "custom_documents", documentToEdit.id);
                await updateDoc(docRef, dataToSave);
                toast({ title: 'Documento Actualizado', description: 'Sus cambios han sido guardados.' });
            } else {
                await addDoc(collection(db, "custom_documents"), { ...dataToSave, createdAt: serverTimestamp() });
                toast({ title: 'Documento Creado', description: 'El nuevo documento ha sido guardado.' });
            }
            resetDialog();
        } catch (error) {
            console.error("Error saving document:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el documento.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenPreview = (docToPreview: CustomDocument) => {
        setDocumentToPreview(docToPreview);
        setIsPreviewOpen(true);
    }
    
    const generatePdfInstance = (docData: Pick<CustomDocument, 'title' | 'body'>): jsPDF | null => {
        if (!companyInfo) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información de la empresa.'});
            return null;
        }

        const { title, body } = docData;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = body;
        const textBody = tempDiv.textContent || tempDiv.innerText || "";
    
        const doc = new jsPDF();
        const margin = 85; 
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
    
        // --- HEADER ---
        // Logo
        if (companyInfo.logo) {
            try { doc.addImage(companyInfo.logo, 'PNG', margin, 15, 25, 25); }
            catch(e) { console.error("Error adding logo to PDF", e); }
        }
    
        // Company Info
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        let infoX = margin; 
        let infoY = 50; 
        doc.text(companyInfo.name, infoX, infoY);
        infoY += 5;
        doc.text(companyInfo.rif, infoX, infoY);
        infoY += 5;
        const addressLines = doc.splitTextToSize(companyInfo.address, 100);
        doc.text(addressLines, infoX, infoY);
        infoY += (addressLines.length * 4);
    
        // Date
        const dateStr = `Independencia, ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es })}`;
        doc.text(dateStr, pageWidth - margin, 50, { align: 'right' });
    
        // --- CONTENT ---
        let currentY = infoY + 20; 
    
        doc.setFontSize(14).setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), pageWidth / 2, currentY, { align: 'center' });
        currentY += 20;
    
        doc.setFontSize(12).setFont('helvetica', 'normal');
        const splitBody = doc.splitTextToSize(textBody, pageWidth - (margin * 2));
        doc.text(splitBody, margin, currentY, { align: 'justify' });
        
        const bodyHeight = doc.getTextDimensions(splitBody).h;
        currentY += bodyHeight;
        
        // --- FOOTER ---
        const signatureBlockY = Math.max(currentY + 40, pageHeight - margin - 30);
    
        doc.setFontSize(12).setFont('helvetica', 'normal');
        doc.text('Atentamente,', pageWidth / 2, signatureBlockY, { align: 'center'});
    
        const signatureLineY = signatureBlockY + 20;
        doc.setLineWidth(0.5);
        doc.line(pageWidth / 2 - 40, signatureLineY, pageWidth / 2 + 40, signatureLineY);
        
        doc.setFontSize(10).setFont('helvetica', 'bold');
        doc.text('Junta de Condominio', pageWidth / 2, signatureLineY + 8, { align: 'center' });

        return doc;
    };
    
    const handleDownloadPDF = (docData: Pick<CustomDocument, 'title' | 'body'>) => {
        const doc = generatePdfInstance(docData);
        if (doc) {
            doc.save(`${docData.title.replace(/\s+/g, '_')}.pdf`);
        }
    };

    const handleSharePDF = async (docData: Pick<CustomDocument, 'title' | 'body'>) => {
        const doc = generatePdfInstance(docData);
        if (!doc) return;

        if (!navigator.share) {
            toast({ variant: 'destructive', title: 'No Soportado', description: 'La función de compartir no está disponible en este navegador.' });
            return;
        }

        try {
            const pdfBlob = doc.output('blob');
            const pdfFile = new File([pdfBlob], `${docData.title.replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });
            await navigator.share({
                title: docData.title,
                text: `Documento: ${docData.title}`,
                files: [pdfFile],
            });
        } catch (error) {
            console.error('Error al compartir:', error);
            if ((error as Error).name !== 'AbortError') {
                 toast({ variant: 'destructive', title: 'Error', description: 'No se pudo compartir el documento.' });
            }
        }
    };
    
    const getPreviewText = (html: string) => {
        if (typeof window === 'undefined') return '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        return tempDiv.textContent || tempDiv.innerText || '';
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Redacción de Documentos</h1>
                    <p className="text-muted-foreground">Cree y gestione documentos personalizados para exportar a PDF.</p>
                </div>
                 <Button onClick={handleNewDocument}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nuevo Documento
                </Button>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Documentos Guardados</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Título del Documento</TableHead>
                                <TableHead>Fecha de Creación</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : documents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                        No hay documentos guardados.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                documents.map((doc) => (
                                    <TableRow key={doc.id}>
                                        <TableCell className="font-medium">{doc.title}</TableCell>
                                        <TableCell>{doc.createdAt ? format(doc.createdAt.toDate(), "dd/MM/yyyy HH:mm") : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleEditDocument(doc)}><Edit className="mr-2 h-4 w-4"/>Editar</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleOpenPreview(doc)}><FileText className="mr-2 h-4 w-4"/>Exportar a PDF...</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDeleteDocument(doc)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4"/>Eliminar</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                 <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{documentToEdit ? 'Editar Documento' : 'Nuevo Documento'}</DialogTitle>
                        <DialogDescription>Redacte el título y el cuerpo del documento.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow space-y-6 overflow-y-auto pr-6 -mr-6">
                        <div className="space-y-2">
                            <Label htmlFor="document-title">Título del Documento</Label>
                            <Input id="document-title" value={currentDocument.title} onChange={(e) => setCurrentDocument(d => ({...d, title: e.target.value}))} placeholder="Ej: Convocatoria a Asamblea Extraordinaria" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="document-body">Cuerpo del Documento</Label>
                             <RichTextEditor 
                                value={currentDocument.body}
                                onChange={(value) => setCurrentDocument(d => ({...d, body: value}))}
                            />
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t gap-2">
                        <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
                        <Button onClick={handleSaveDocument} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {documentToEdit ? 'Guardar Cambios' : 'Guardar Documento'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Está seguro?</DialogTitle>
                        <DialogDescription>Esta acción no se puede deshacer. Esto eliminará permanentemente el documento.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Previsualización y Exportación</DialogTitle>
                        <DialogDescription>
                           Revise el documento. Si todo está correcto, puede descargarlo o compartirlo.
                        </DialogDescription>
                    </DialogHeader>
                     <div className="flex-grow overflow-y-auto pr-4 -mr-4 border rounded-md p-4 bg-white text-black font-sans text-sm space-y-4">
                        {documentToPreview && (
                             <>
                                <h3 className="text-lg font-bold text-center uppercase">{documentToPreview.title}</h3>
                                <p className="whitespace-pre-wrap">{getPreviewText(documentToPreview.body)}</p>
                             </>
                        )}
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Cerrar</Button>
                        <Button 
                            onClick={() => documentToPreview && handleDownloadPDF(documentToPreview)}
                            ref={(button) => button?.focus()}
                        >
                            <Download className="mr-2 h-4 w-4"/> Descargar PDF
                        </Button>
                        <Button onClick={() => documentToPreview && handleSharePDF(documentToPreview)}>
                            <Share2 className="mr-2 h-4 w-4"/> Compartir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}

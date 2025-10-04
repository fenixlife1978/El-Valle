
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, FileText, Edit, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type ExpenseItem = {
    id: string;
    description: string;
    amountUSD: string;
    amountBs: string;
};

type CustomDocument = {
    id: string;
    title: string;
    items: ExpenseItem[];
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
    items: [{ id: Date.now().toString(), description: '', amountUSD: '', amountBs: '' }],
};

const formatCurrency = (value: number | string) => {
    const num = Number(value);
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function DocumentsPage() {
    const { toast } = useToast();
    const [documents, setDocuments] = useState<CustomDocument[]>([]);
    const [currentDocument, setCurrentDocument] = useState(emptyDocument);
    const [documentToEdit, setDocumentToEdit] = useState<CustomDocument | null>(null);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [documentToDelete, setDocumentToDelete] = useState<CustomDocument | null>(null);

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

    const totals = useMemo(() => {
        const totalUSD = currentDocument.items.reduce((sum, item) => sum + (parseFloat(item.amountUSD) || 0), 0);
        const totalBs = currentDocument.items.reduce((sum, item) => sum + (parseFloat(item.amountBs) || 0), 0);
        return { totalUSD, totalBs };
    }, [currentDocument.items]);

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
            items: docToEdit.items.map(item => ({ ...item })) // Deep copy
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
                // Editing existing document
                const docRef = doc(db, "custom_documents", documentToEdit.id);
                await updateDoc(docRef, dataToSave);
                toast({ title: 'Documento Actualizado', description: 'Sus cambios han sido guardados.' });
            } else {
                // Creating new document
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

    const handleItemChange = (id: string, field: keyof Omit<ExpenseItem, 'id'>, value: string) => {
        setCurrentDocument(prevDoc => ({
            ...prevDoc,
            items: prevDoc.items.map(item =>
                item.id === id ? { ...item, [field]: value } : item
            )
        }));
    };

    const addItem = () => {
        setCurrentDocument(prevDoc => ({
            ...prevDoc,
            items: [...prevDoc.items, { id: Date.now().toString(), description: '', amountUSD: '', amountBs: '' }]
        }));
    };

    const removeItem = (id: string) => {
        if (currentDocument.items.length <= 1) {
            toast({ variant: 'destructive', title: 'Acción no permitida', description: 'Debe haber al menos un ítem.' });
            return;
        }
        setCurrentDocument(prevDoc => ({
            ...prevDoc,
            items: prevDoc.items.filter(item => item.id !== id)
        }));
    };
    
    const handleExportPDF = (docData: Pick<CustomDocument, 'title' | 'items'>) => {
        const { title, items } = docData;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) {
            try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
            catch (e) { console.error("Error adding logo to PDF:", e); }
        }
        if (companyInfo) {
            doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
            doc.setFontSize(9).setFont('helvetica', 'normal').text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
            doc.text(companyInfo.address, margin + 30, margin + 19);
        }
        
        const emissionDate = format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss");
        doc.setFontSize(10).text(`Fecha de Emisión: ${emissionDate}`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);
        
        doc.setFontSize(16).setFont('helvetica', 'bold').text(title, pageWidth / 2, margin + 45, { align: 'center' });
        
        const calculatedTotals = {
             totalUSD: items.reduce((sum, item) => sum + (parseFloat(item.amountUSD) || 0), 0),
             totalBs: items.reduce((sum, item) => sum + (parseFloat(item.amountBs) || 0), 0),
        };

        const body = items.map(item => [item.description, formatCurrency(item.amountUSD), formatCurrency(item.amountBs)]);

        (doc as any).autoTable({
            head: [['Descripción del Gasto', 'Monto (USD)', 'Monto (Bs)']],
            body: body,
            foot: [['Total General', formatCurrency(calculatedTotals.totalUSD), formatCurrency(calculatedTotals.totalBs)]],
            startY: margin + 55,
            headStyles: { fillColor: [30, 80, 180] },
            footStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
            styles: { cellPadding: 2.5, fontSize: 10 },
            columnStyles: {
                1: { halign: 'right' },
                2: { halign: 'right' },
            },
        });
        
        doc.save(`${title.replace(/\s/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Creación de Documentos</h1>
                    <p className="text-muted-foreground">Genere y gestione reportes de gastos personalizados.</p>
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
                                                    <DropdownMenuItem onClick={() => handleExportPDF(doc)}><FileText className="mr-2 h-4 w-4"/>Exportar PDF</DropdownMenuItem>
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
                        <DialogDescription>Complete los campos para crear o editar su reporte.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow space-y-6 overflow-y-auto pr-6 -mr-6">
                        <div className="space-y-2">
                            <Label htmlFor="document-title">Título del Documento</Label>
                            <Input id="document-title" value={currentDocument.title} onChange={(e) => setCurrentDocument(d => ({...d, title: e.target.value}))} placeholder="Ej: Relación de Gastos - Octubre 2024" />
                        </div>
                        <div>
                            <Label className="text-base font-medium">Lista de Gastos</Label>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Descripción</TableHead>
                                        <TableHead className="w-[180px] text-right">Monto (USD)</TableHead>
                                        <TableHead className="w-[180px] text-right">Monto (Bs)</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {currentDocument.items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <Input value={item.description} onChange={e => handleItemChange(item.id, 'description', e.target.value)} placeholder="Ej: Mantenimiento de bomba" />
                                            </TableCell>
                                            <TableCell>
                                                <Input type="number" value={item.amountUSD} onChange={e => handleItemChange(item.id, 'amountUSD', e.target.value)} placeholder="0.00" className="text-right" />
                                            </TableCell>
                                            <TableCell>
                                                <Input type="number" value={item.amountBs} onChange={e => handleItemChange(item.id, 'amountBs', e.target.value)} placeholder="0.00" className="text-right" />
                                            </TableCell>
                                            <TableCell>
                                                <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)} disabled={currentDocument.items.length <= 1}>
                                                    <Trash2 className="h-5 w-5 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell className="font-bold text-right">Total General</TableCell>
                                        <TableCell className="text-right font-bold text-lg">${formatCurrency(totals.totalUSD)}</TableCell>
                                        <TableCell className="text-right font-bold text-lg">Bs. {formatCurrency(totals.totalBs)}</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                            <Button variant="outline" size="sm" className="mt-4" onClick={addItem}>
                                <PlusCircle className="mr-2 h-4 w-4" />Agregar Ítem
                            </Button>
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t gap-2">
                        <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
                        <Button onClick={handleSaveDocument} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {documentToEdit ? 'Guardar Cambios' : 'Guardar Documento'}
                        </Button>
                        <Button onClick={() => handleExportPDF(currentDocument)} variant="secondary" disabled={!currentDocument.title.trim()}>
                            <FileText className="mr-2 h-4 w-4" />
                            Exportar a PDF
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

        </div>
    );
}



'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

type ExpenseItem = {
    id: string;
    description: string;
    amountUSD: string;
    amountBs: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const formatCurrency = (value: number | string) => {
    const num = Number(value);
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function DocumentsPage() {
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [items, setItems] = useState<ExpenseItem[]>([{ id: Date.now().toString(), description: '', amountUSD: '', amountBs: '' }]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCompanyInfo = async () => {
            setLoading(true);
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
                }
            } catch (error) {
                console.error("Error fetching company info:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la información de la empresa.' });
            } finally {
                setLoading(false);
            }
        };
        fetchCompanyInfo();
    }, [toast]);

    const totals = useMemo(() => {
        const totalUSD = items.reduce((sum, item) => sum + (parseFloat(item.amountUSD) || 0), 0);
        const totalBs = items.reduce((sum, item) => sum + (parseFloat(item.amountBs) || 0), 0);
        return { totalUSD, totalBs };
    }, [items]);

    const handleItemChange = (id: string, field: keyof Omit<ExpenseItem, 'id'>, value: string) => {
        setItems(currentItems =>
            currentItems.map(item =>
                item.id === id ? { ...item, [field]: value } : item
            )
        );
    };

    const addItem = () => {
        setItems([...items, { id: Date.now().toString(), description: '', amountUSD: '', amountBs: '' }]);
    };

    const removeItem = (id: string) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        } else {
            toast({ variant: 'destructive', title: 'Acción no permitida', description: 'Debe haber al menos un ítem.' });
        }
    };
    
    const handleExportPDF = () => {
        if (!title.trim()) {
            toast({ variant: 'destructive', title: 'Título requerido', description: 'Por favor, ingrese un título para el documento.' });
            return;
        }

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

        const body = items.map(item => [item.description, formatCurrency(item.amountUSD), formatCurrency(item.amountBs)]);

        (doc as any).autoTable({
            head: [['Descripción del Gasto', 'Monto (USD)', 'Monto (Bs)']],
            body: body,
            foot: [['Total General', formatCurrency(totals.totalUSD), formatCurrency(totals.totalBs)]],
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

    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Creación de Documentos</h1>
                <p className="text-muted-foreground">Genere reportes de gastos personalizados con montos en USD y Bolívares.</p>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Editor de Documento</CardTitle>
                    <CardDescription>Complete los campos para crear su reporte. Todos los montos se ingresan manualmente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="document-title">Título del Documento</Label>
                        <Input id="document-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Relación de Gastos de Jardinería - Octubre 2024" />
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
                                {items.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <Input 
                                                value={item.description} 
                                                onChange={e => handleItemChange(item.id, 'description', e.target.value)} 
                                                placeholder="Ej: Mantenimiento de bomba" 
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input 
                                                type="number" 
                                                value={item.amountUSD} 
                                                onChange={e => handleItemChange(item.id, 'amountUSD', e.target.value)} 
                                                placeholder="0.00"
                                                className="text-right"
                                            />
                                        </TableCell>
                                        <TableCell>
                                             <Input 
                                                type="number" 
                                                value={item.amountBs} 
                                                onChange={e => handleItemChange(item.id, 'amountBs', e.target.value)} 
                                                placeholder="0.00"
                                                className="text-right"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)} disabled={items.length <= 1}>
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
                </CardContent>
                <CardFooter className="justify-end">
                    <Button onClick={handleExportPDF}>
                        <FileText className="mr-2 h-4 w-4" />
                        Exportar a PDF
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

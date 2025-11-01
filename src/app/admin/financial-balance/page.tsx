

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, MinusCircle, Loader2, FileText, FileSpreadsheet, Eye, Save, Trash2, ArrowLeft, MoreHorizontal, Megaphone } from 'lucide-react';
import { collection, doc, getDoc, setDoc, onSnapshot, orderBy, query, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';


type FinancialItem = {
    id: string;
    concepto: string;
    monto: number;
};

type FinancialState = {
    // No fields are needed here anymore, but we keep the type for structure.
};

type FinancialStatement = {
    id: string; // YYYY-MM
    ingresos: FinancialItem[];
    egresos: FinancialItem[];
    estadoFinanciero: FinancialState & {
        saldoNeto: number;
    };
    notas: string;
    qrValidacion?: string;
    createdAt: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const initialItem = { id: Date.now().toString(), concepto: '', monto: 0 };
const initialFinancialState: FinancialState = {};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + 1 - i));

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    // Use rounding to the nearest cent to fix floating point issues
    const roundedNum = Math.round(num * 100) / 100;
    return roundedNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export default function FinancialBalancePage() {
    const { toast } = useToast();
    const router = useRouter();
    const [view, setView] = useState<'list' | 'form'>('list');
    const [isEditing, setIsEditing] = useState(false);
    
    // Form State
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
    const [ingresos, setIngresos] = useState<FinancialItem[]>([initialItem]);
    const [egresos, setEgresos] = useState<FinancialItem[]>([initialItem]);
    const [estadoFinanciero, setEstadoFinanciero] = useState<FinancialState>(initialFinancialState);
    const [notas, setNotas] = useState('');
    
    const [statements, setStatements] = useState<FinancialStatement[]>([]);
    const [currentStatement, setCurrentStatement] = useState<FinancialStatement | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, "financial_statements"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialStatement));
            setStatements(data);
            setLoading(false);
        });

        const fetchCompanyInfo = async () => {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
            }
        };
        fetchCompanyInfo();

        return () => unsubscribe();
    }, []);

    const totals = useMemo(() => {
        const totalIngresos = ingresos.reduce((sum, item) => sum + Number(item.monto), 0);
        const totalEgresos = egresos.reduce((sum, item) => sum + Number(item.monto), 0);
        const saldoNeto = totalIngresos - totalEgresos;
        
        return { totalIngresos, totalEgresos, saldoNeto };
    }, [ingresos, egresos]);


    const resetForm = () => {
        setIsEditing(false);
        setSelectedMonth(String(new Date().getMonth() + 1));
        setSelectedYear(String(new Date().getFullYear()));
        setIngresos([{ id: Date.now().toString(), concepto: '', monto: 0 }]);
        setEgresos([{ id: Date.now().toString(), concepto: '', monto: 0 }]);
        setEstadoFinanciero(initialFinancialState);
        setNotas('');
    };

    const handleNewStatement = () => {
        resetForm();
        setView('form');
    };

    const handleViewStatement = (statement: FinancialStatement) => {
        setCurrentStatement(statement);
        setView('form');
        setIsEditing(true);

        setSelectedYear(statement.id.split('-')[0]);
        setSelectedMonth(statement.id.split('-')[1]);
        setIngresos(statement.ingresos.map(i => ({...i, id: Math.random().toString() })));
        setEgresos(statement.egresos.map(e => ({...e, id: Math.random().toString() })));
        setEstadoFinanciero({
            // No fields to set here anymore
        });
        setNotas(statement.notas);
    };

    const handleDeleteStatement = async (statementId: string) => {
        if (window.confirm('¿Está seguro de que desea eliminar este balance? Esta acción no se puede deshacer.')) {
            await deleteDoc(doc(db, "financial_statements", statementId));
            toast({ title: 'Balance Eliminado', description: 'El registro ha sido borrado.' });
        }
    };
    
    const handlePublishStatement = async (statement: FinancialStatement) => {
        try {
            const reportRef = doc(db, 'published_reports', `balance-${statement.id}`);
            await setDoc(reportRef, {
                type: 'balance',
                createdAt: new Date().toISOString(),
            });
            toast({
                title: 'Balance Publicado',
                description: `El balance de ${months.find(m => m.value === statement.id.split('-')[1])?.label} ${statement.id.split('-')[0]} ahora es visible para los propietarios.`,
                className: 'bg-blue-100 text-blue-800'
            });
        } catch (error) {
            console.error('Error publishing statement:', error);
            toast({ variant: 'destructive', title: 'Error de Publicación', description: 'No se pudo publicar el balance.' });
        }
    };

    const handleSaveStatement = async () => {
        const statementId = `${selectedYear}-${selectedMonth}`;
        
        const finalIngresos = ingresos.filter(i => i.concepto && Number(i.monto) > 0).map(i => ({...i, monto: Number(i.monto)}));
        const finalEgresos = egresos.filter(e => e.concepto && Number(e.monto) > 0).map(e => ({...e, monto: Number(e.monto)}));

        if (finalIngresos.length === 0 || finalEgresos.length === 0) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe haber al menos un ingreso y un egreso.' });
            return;
        }

        const data: Omit<FinancialStatement, 'id' | 'estadoFinanciero'> & { estadoFinanciero: any } = {
            ingresos: finalIngresos,
            egresos: finalEgresos,
            estadoFinanciero: {
                saldoNeto: totals.saldoNeto,
            },
            notas: notas,
            createdAt: new Date().toISOString(),
        };

        try {
            await setDoc(doc(db, "financial_statements", statementId), data, { merge: true });
            toast({ title: 'Balance Guardado', description: 'El estado financiero ha sido guardado exitosamente.', className: "bg-green-100 border-green-400" });
            setView('list');
            resetForm();
        } catch (error) {
            console.error("Error saving statement:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el balance.' });
        }
    };
    
    const handleExport = async (formatType: 'pdf' | 'excel', statement: FinancialStatement) => {
        const qrCodeUrl = await QRCode.toDataURL(`${window.location.origin}/balance/${statement.id}`, { errorCorrectionLevel: 'M', margin: 2, scale: 4 });
        
        const totalIngresos = statement.ingresos.reduce((sum, item) => sum + item.monto, 0);
        const totalEgresos = statement.egresos.reduce((sum, item) => sum + item.monto, 0);
        const saldoNeto = totalIngresos - totalEgresos;


        const monthLabel = months.find(m => m.value === statement.id.split('-')[1])?.label;
        const yearLabel = statement.id.split('-')[0];
        const period = `${monthLabel} ${yearLabel}`;

        if (formatType === 'pdf') {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;
            
            // Header
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
            doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo?.name || '', margin + 30, margin + 8);
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(companyInfo?.rif || '', margin + 30, margin + 14);
            doc.text(companyInfo?.address || '', margin + 30, margin + 19);
            doc.text(`Teléfono: ${companyInfo?.phone || ''}`, margin + 30, margin + 24);

            doc.text(`Emitido: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
            if (qrCodeUrl) {
                const qrSize = 25;
                doc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - qrSize, margin + 12, qrSize, qrSize);
            }
            
            // Title
            doc.setFontSize(16).setFont('helvetica', 'bold').text('Balance Financiero', pageWidth / 2, margin + 45, { align: 'center'});
            doc.setFontSize(12).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, margin + 52, { align: 'center'});
            
            let startY = margin + 70;
            
            // Ingresos
            (doc as any).autoTable({
                head: [['INGRESOS', 'MONTO (Bs.)']],
                body: statement.ingresos.map(i => [i.concepto, { content: formatToTwoDecimals(i.monto), styles: { halign: 'right' } }]),
                foot: [[{ content: 'TOTAL INGRESOS', styles: { halign: 'right' } }, { content: formatToTwoDecimals(totalIngresos), styles: { halign: 'right' } }]],
                startY: startY, theme: 'striped', headStyles: { fillColor: [22, 163, 74], halign: 'center' }, footStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
            });
            startY = (doc as any).lastAutoTable.finalY + 10;
            
            // Egresos
            (doc as any).autoTable({
                head: [['EGRESOS', 'MONTO (Bs.)']],
                body: statement.egresos.map(e => [e.concepto, { content: formatToTwoDecimals(e.monto), styles: { halign: 'right' } }]),
                foot: [[{ content: 'TOTAL EGRESOS', styles: { halign: 'right' } }, { content: formatToTwoDecimals(totalEgresos), styles: { halign: 'right' } }]],
                startY: startY,
                theme: 'striped',
                showHead: 'firstPage',
                showFoot: 'lastPage',
                headStyles: { fillColor: [220, 53, 69], halign: 'center' },
                footStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold' },
            });
            startY = (doc as any).lastAutoTable.finalY + 10;

            // Total Efectivo Disponible
            doc.setFontSize(11).setFont('helvetica', 'bold');
            const totalEfectivoY = startY + 10;
            doc.setFillColor(232, 255, 236); // Light green background
            doc.rect(margin, totalEfectivoY - 5, pageWidth - margin * 2, 10, 'F');
            doc.setTextColor(34, 139, 34); // Forest green text
            doc.text('SALDO NETO O SALDO FINAL DEL MES EN BANCO (Ingresos - Egresos)', margin + 2, totalEfectivoY);
            doc.text(formatToTwoDecimals(saldoNeto), pageWidth - margin - 2, totalEfectivoY, { align: 'right' });
            startY = totalEfectivoY + 10;
            doc.setTextColor(0, 0, 0); // Reset text color

            // Footer
            startY += 10;
            doc.setFontSize(10).text('Notas:', margin, startY);
            doc.setFontSize(10).setFont('helvetica', 'normal').text(statement.notas, margin, startY + 5, { maxWidth: 180 });
            
            const signatureBlockY = (doc.internal.pageSize.getHeight() > startY + 40) ? startY + 25 : doc.internal.pageSize.getHeight() - 40;

            // Signature lines
            const signatureWidth = 60;
            const signatureSpacing = (pageWidth - margin * 2 - signatureWidth * 2) / 3;

            const firstSignatureX = margin + signatureSpacing;
            doc.setLineWidth(0.5);
            doc.line(firstSignatureX, signatureBlockY, firstSignatureX + signatureWidth, signatureBlockY);

            const secondSignatureX = firstSignatureX + signatureWidth + signatureSpacing;
            doc.line(secondSignatureX, signatureBlockY, secondSignatureX + signatureWidth, signatureBlockY);

            doc.setFontSize(8);
            doc.text("Juan Garcia", firstSignatureX + signatureWidth / 2, signatureBlockY + 5, { align: 'center' });
            doc.text("Presidente de Condominio", firstSignatureX + signatureWidth / 2, signatureBlockY + 9, { align: 'center' });

            doc.text("Juana Khleif", secondSignatureX + signatureWidth / 2, signatureBlockY + 5, { align: 'center' });
            doc.text("Tesorera", secondSignatureX + signatureWidth / 2, signatureBlockY + 9, { align: 'center' });

            startY = signatureBlockY + 20;
            doc.setFontSize(7).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});

            doc.save(`Balance_Financiero_${statement.id}.pdf`);

        } else { // Excel
            const wb = XLSX.utils.book_new();
            const wsData = [
                ['BALANCE FINANCIERO', period],
                [],
                ['INGRESOS', 'MONTO'],
                ...statement.ingresos.map(i => [i.concepto, i.monto]),
                ['TOTAL INGRESOS', totalIngresos],
                [],
                ['EGRESOS', 'MONTO'],
                ...statement.egresos.map(e => [e.concepto, e.monto]),
                ['TOTAL EGRESOS', totalEgresos],
                [],
                ['SALDO NETO O SALDO FINAL DEL MES EN BANCO', saldoNeto],
                [],
                ['Notas', statement.notas]
            ];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, `Balance ${statement.id}`);
            XLSX.writeFile(wb, `Balance_Financiero_${statement.id}.xlsx`);
        }
    };


    const createItemManager = (items: FinancialItem[], setItems: React.Dispatch<React.SetStateAction<FinancialItem[]>>) => ({
        addItem: () => setItems([...items, { id: Date.now().toString(), concepto: '', monto: 0 }]),
        removeItem: (id: string) => { if (items.length > 1) setItems(items.filter(item => item.id !== id)) },
        updateItem: (id: string, field: 'concepto' | 'monto', value: string) => {
            const isMonto = field === 'monto';
            setItems(items.map(item => item.id === id ? { ...item, [field]: isMonto ? Number(value) : value } : item));
        }
    });

    const ingresosManager = createItemManager(ingresos, setIngresos);
    const egresosManager = createItemManager(egresos, setEgresos);

    const renderFinancialItemsTable = (title: string, items: FinancialItem[], manager: any, total: number) => (
        <Card>
            <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Concepto</TableHead>
                            <TableHead className="w-[150px] text-right">Monto (Bs.)</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell><Input value={item.concepto} onChange={e => manager.updateItem(item.id, 'concepto', e.target.value)} placeholder="Ej: Cuotas ordinarias" /></TableCell>
                                <TableCell><Input type="number" value={item.monto === 0 ? '' : item.monto} onChange={e => manager.updateItem(item.id, 'monto', e.target.value)} placeholder="0.00" className="text-right" /></TableCell>
                                <TableCell>
                                    <Button size="icon" variant="ghost" onClick={() => manager.removeItem(item.id)} disabled={items.length <= 1}>
                                        <MinusCircle className="h-5 w-5 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button variant="outline" size="sm" className="mt-4" onClick={manager.addItem}><PlusCircle className="mr-2 h-4 w-4" />Agregar Fila</Button>
            </CardContent>
            <CardFooter className="justify-end bg-muted/50 p-4">
                <p className="font-bold">Total {title}: Bs. {formatToTwoDecimals(total)}</p>
            </CardFooter>
        </Card>
    );

    if (loading) return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

    if (view === 'list') {
        return (
            <div className="space-y-8">
                 <Button variant="outline" onClick={() => router.back()} className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Atrás
                </Button>
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Balance Financiero</h1>
                        <p className="text-muted-foreground">Consulta o crea los balances financieros mensuales.</p>
                    </div>
                    <Button onClick={handleNewStatement}><PlusCircle className="mr-2 h-4 w-4"/> Nuevo Balance</Button>
                </div>
                <Card>
                    <CardHeader><CardTitle>Balances Guardados</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Período</TableHead><TableHead className="text-right">Saldo Neto (Bs.)</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {statements.length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="h-24 text-center">No hay balances guardados.</TableCell></TableRow>
                                ) : (
                                    statements.map(s => {
                                        const totalIngresos = s.ingresos.reduce((sum, i) => sum + i.monto, 0);
                                        const totalEgresos = s.egresos.reduce((sum, e) => sum + e.monto, 0);
                                        const saldoNeto = totalIngresos - totalEgresos;
                                        return (
                                        <TableRow key={s.id}>
                                            <TableCell className="font-medium">{months.find(m => m.value === s.id.split('-')[1])?.label} {s.id.split('-')[0]}</TableCell>
                                            <TableCell className={`text-right font-bold ${saldoNeto >= 0 ? 'text-green-500' : 'text-destructive'}`}>{formatToTwoDecimals(saldoNeto)}</TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent>
                                                        <DropdownMenuItem onClick={() => handleViewStatement(s)}><Eye className="mr-2 h-4 w-4"/> Ver / Editar</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handlePublishStatement(s)}><Megaphone className="mr-2 h-4 w-4"/> Publicar</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleExport('pdf', s)}><FileText className="mr-2 h-4 w-4"/> Exportar PDF</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleExport('excel', s)}><FileSpreadsheet className="mr-2 h-4 w-4"/> Exportar Excel</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDeleteStatement(s.id)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Eliminar</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    )})
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <Button variant="outline" onClick={() => setView('list')}><ArrowLeft className="mr-2 h-4 w-4"/> Volver a la lista</Button>
            <Card>
                <CardHeader>
                    <CardTitle>{isEditing ? 'Editando' : 'Creando'} Balance Financiero</CardTitle>
                    <CardDescription>Selecciona el período y completa los campos.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label>Año</Label>
                        <Select value={selectedYear} onValueChange={setSelectedYear} disabled={isEditing}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Mes</Label>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={isEditing}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {renderFinancialItemsTable('Ingresos', ingresos, ingresosManager, totals.totalIngresos)}
                {renderFinancialItemsTable('Egresos', egresos, egresosManager, totals.totalEgresos)}
            </div>

            <Card>
                <CardHeader><CardTitle>Resumen y Estado Financiero</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-muted/50 rounded-lg">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Total Ingresos</p>
                            <p className="text-xl font-bold text-green-500 text-right">Bs. {formatToTwoDecimals(totals.totalIngresos)}</p>
                        </div>
                         <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Total Egresos</p>
                            <p className="text-xl font-bold text-destructive text-right">Bs. {formatToTwoDecimals(totals.totalEgresos)}</p>
                        </div>
                        <div className="md:col-span-2 space-y-1 border-t pt-4">
                            <Label htmlFor="saldoNeto" className="text-base font-bold">SALDO NETO O SALDO FINAL DEL MES EN BANCO (Ingresos - Egresos)</Label>
                            <div className="p-2 bg-primary/10 rounded-md">
                                <p id="saldoNeto" className={`text-2xl font-bold text-center ${totals.saldoNeto >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                    {formatToTwoDecimals(totals.saldoNeto)}
                                </p>
                            </div>
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="notas">Notas Adicionales</Label>
                        <Textarea id="notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: Se aprobó instalación de codificadores." />
                    </div>
                </CardContent>
                <CardFooter className="justify-end">
                    <Button onClick={handleSaveStatement}><Save className="mr-2 h-4 w-4"/> Guardar Balance</Button>
                </CardFooter>
            </Card>
        </div>
    );
}


"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, orderBy, onSnapshot, addDoc, 
    deleteDoc, doc, updateDoc, Timestamp, setDoc
} from 'firebase/firestore';
import { 
    FileText, Save, Trash2, Eye, EyeOff, 
    TrendingUp, TrendingDown, Wallet, History,
    CheckCircle2, AlertCircle, Loader2, Building2,
    PlusCircle, X, Download
} from 'lucide-react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/hooks/use-auth';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';


import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// --- TYPE DEFINITIONS ---
interface FinancialItem {
    id: string;
    dia: string;
    concepto: string;
    monto: number;
    categoria: string;
}

interface SavedBalance {
    id: string;
    nombrePeriodo?: string; // Made optional for safety
    totalIngresos?: number;
    totalEgresos?: number;
    saldoNeto?: number;
    fechaCierre?: Timestamp;
    publicado: boolean;
    ingresos: FinancialItem[];
    egresos: FinancialItem[];
    notas?: string;
    companyInfo?: CompanyInfo;
    createdAt: Timestamp;
}

interface AutomaticExpense {
    id: string;
    monto?: number;
    amount?: number;
    description?: string;
    concepto?: string;
    category?: string;
}

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

// Helper para formato de moneda
const formatCurrency = (num: number) => {
    return (num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: format(new Date(2000, i), 'MMMM', { locale: es }),
}));

export default function FinancialBalance() {
    const { activeCondoId, companyInfo } = useAuth();
    
    // Estados de datos
    const [statements, setStatements] = useState<SavedBalance[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Formulario para nuevo cierre
    const [periodName, setPeriodName] = useState('');
    const [ingresos, setIngresos] = useState<FinancialItem[]>([]);
    const [egresos, setEgresos] = useState<FinancialItem[]>([]);
    const [notas, setNotas] = useState('');

    useEffect(() => {
        if (!activeCondoId) {
            const timer = setTimeout(() => setLoading(false), 3000);
            return () => clearTimeout(timer);
        }
    
        const q = query(
            collection(db, "condominios", activeCondoId, "financial_statements"), 
            orderBy("createdAt", "desc")
        );
    
        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                setStatements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedBalance)));
                setLoading(false);
            }, 
            (error) => {
                console.error("Error en Firebase:", error);
                setLoading(false);
            }
        );
    
        return () => unsubscribe();
    }, [activeCondoId]);


    // --- Cálculos ---
    const totalIngresos = useMemo(() => ingresos.reduce((acc, item) => acc + (Number(item.monto) || 0), 0), [ingresos]);
    const totalEgresos = useMemo(() => egresos.reduce((acc, item) => acc + (Number(item.monto) || 0), 0), [egresos]);
    const saldoNeto = totalIngresos - totalEgresos;

    // --- Acciones ---

    const addItem = (type: 'ingresos' | 'egresos') => {
        const newItem: FinancialItem = { id: Date.now().toString(), dia: format(new Date(), 'dd'), concepto: '', monto: 0, categoria: 'Otros' };
        if (type === 'ingresos') setIngresos([...ingresos, newItem]);
        else setEgresos([...egresos, newItem]);
    };

    const updateItem = (type: 'ingresos' | 'egresos', id: string, field: keyof FinancialItem, value: any) => {
        const updater = (items: FinancialItem[]) => items.map(item => item.id === id ? { ...item, [field]: value } : item);
        if (type === 'ingresos') setIngresos(updater);
        else setEgresos(updater);
    };

    const removeItem = (type: 'ingresos' | 'egresos', id: string) => {
        if (type === 'ingresos') setIngresos(ingresos.filter(item => item.id !== id));
        else setEgresos(egresos.filter(item => item.id !== id));
    };

    const handleCreateCierre = async () => {
        const monthMatch = periodName.match(/(\w+)\s+(\d{4})/);
        if (!activeCondoId || !monthMatch) {
            alert("El nombre del período debe ser 'Mes Año' (ej: Enero 2024)");
            return;
        }
        
        const monthIndex = months.findIndex(m => m.label.toLowerCase() === monthMatch[1].toLowerCase());
        const year = monthMatch[2];

        if (monthIndex === -1) {
            alert("Mes inválido.");
            return;
        }
        
        const docId = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

        setIsSubmitting(true);
        try {
            await setDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', docId), {
                ingresos,
                egresos,
                notas,
                createdAt: Timestamp.now(),
                publicado: false,
                companyInfo: companyInfo || null,
            });

            setPeriodName('');
            setIngresos([]);
            setEgresos([]);
            setNotas('');
            alert("Balance cerrado y guardado exitosamente.");
        } catch (error) {
            console.error(error);
            alert("Error al guardar el balance.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const togglePublish = async (id: string, currentState: boolean) => {
        if (!activeCondoId) return;
        try {
            await updateDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', id), {
                publicado: !currentState
            });
        } catch (error) { console.error(error); }
    };

    const handleDeleteBalance = async (id: string) => {
        if (!activeCondoId || !confirm("¿Está seguro de eliminar este registro histórico?")) return;
        try {
            await deleteDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', id));
        } catch (error) { console.error(error); }
    };

     const generatePDF = async (statement: SavedBalance) => {
        if (!companyInfo) {
            alert("La información de la compañía no está cargada.");
            return;
        }

        const doc = new jsPDF();
        const pageWidth = (doc as any).internal.pageSize.getWidth();
        const margin = 14;

        if (statement.companyInfo?.logo) {
            doc.addImage(statement.companyInfo.logo, 'PNG', margin, margin, 25, 25);
        }
        if(statement.companyInfo){
            doc.setFontSize(12).setFont('helvetica', 'bold').text(statement.companyInfo.name, margin + 30, margin + 8);
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(statement.companyInfo.rif, margin + 30, margin + 14);
            doc.text(statement.companyInfo.address, margin + 30, margin + 19);
            doc.text(`Teléfono: ${statement.companyInfo.phone}`, margin + 30, margin + 24);
        }

        doc.text(`Emitido: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
        
        const monthValue = parseInt(statement.id.split('-')[1]);
        const yearLabel = statement.id.split('-')[0];
        const monthLabel = format(new Date(parseInt(yearLabel), monthValue - 1), 'MMMM', { locale: es });
        const period = `${monthLabel} ${yearLabel}`;

        doc.setFontSize(16).setFont('helvetica', 'bold').text('Balance Financiero', pageWidth / 2, margin + 52, { align: 'center' });
        doc.setFontSize(12).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, margin + 59, { align: 'center' });
        
        try {
            const qrCodeUrl = await QRCode.toDataURL(`${window.location.origin}/owner/report/balance-${statement.id}`, {
                errorCorrectionLevel: 'M', margin: 2, scale: 4,
            });

            if (qrCodeUrl) {
                const qrSize = 30;
                doc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - qrSize, margin + 50, qrSize, qrSize);
            }
        } catch (err) {
            console.error('Failed to generate QR code', err);
        }

        let startY = margin + 85;

        // Tabla de Ingresos
        const totalIngresos = statement.ingresos.reduce((sum, item) => sum + item.monto, 0);
        autoTable(doc, {
            head: [['DÍA', 'INGRESOS', 'MONTO (Bs.)']],
            body: statement.ingresos.map(i => [i.dia, i.concepto, { content: formatCurrency(i.monto), styles: { halign: 'right' } }]),
            foot: [[{ content: '', styles: { halign: 'right' } }, { content: 'TOTAL INGRESOS', styles: { halign: 'right' } }, { content: formatCurrency(totalIngresos), styles: { halign: 'right' } }]],
            startY, theme: 'striped', headStyles: { fillColor: [30, 80, 180], halign: 'center' }, footStyles: { fillColor: [30, 80, 180], textColor: 255, fontStyle: 'bold' }
        });
        startY = (doc as any).lastAutoTable.finalY + 10;

        // Tabla de Egresos
        const totalEgresos = statement.egresos.reduce((sum, item) => sum + item.monto, 0);
        autoTable(doc, {
            head: [['DÍA', 'EGRESOS', 'MONTO (Bs.)']],
            body: statement.egresos.map(e => [e.dia, e.concepto, { content: formatCurrency(e.monto), styles: { halign: 'right' } }]),
            foot: [[{ content: '', styles: { halign: 'right' } }, { content: 'TOTAL EGRESOS', styles: { halign: 'right' } }, { content: formatCurrency(totalEgresos), styles: { halign: 'right' } }]],
            startY, theme: 'striped', headStyles: { fillColor: [220, 53, 69], halign: 'center' }, footStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold' }
        });
        startY = (doc as any).lastAutoTable.finalY + 10;
        
        // Resumen de Egresos
        const expensesByCategory = statement.egresos.reduce((acc, expense) => {
            const category = expense.categoria || 'Otros';
            acc[category] = (acc[category] || 0) + expense.monto;
            return acc;
        }, {} as Record<string, number>);

        autoTable(doc, {
            head: [['RESUMEN DE EGRESOS POR CATEGORÍA', 'MONTO (Bs.)']],
            body: Object.entries(expensesByCategory).map(([cat, amount]) => [cat, { content: formatCurrency(amount), styles: { halign: 'right' } }]),
            startY, theme: 'grid', headStyles: { fillColor: [108, 117, 125], halign: 'center' }
        });
        startY = (doc as any).lastAutoTable.finalY + 10;
        
        // Sección de Notas
        if(statement.notas) {
             doc.setFontSize(10).text('Notas:', margin, startY);
             doc.setFontSize(10).setFont('helvetica', 'normal').text(statement.notas, margin, startY + 5, { maxWidth: 180 });
             startY = (doc as any).getTextDimensions(statement.notas, {maxWidth: 180}).h + startY + 10;
        }

        // Resumen de Liquidez
        const saldoNetoLocal = totalIngresos - totalEgresos;
        doc.setFillColor(230, 240, 255);
        doc.rect(margin, startY - 2, pageWidth - margin * 2, 32, 'F');
        doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(30, 80, 180);
        
        doc.text('Saldo del Mes en Banco (Ingresos - Egresos)', margin + 2, startY + 5);
        doc.text(formatCurrency(saldoNetoLocal), pageWidth - margin - 2, startY + 5, { align: 'right' });

        doc.text('(-) Fondo de Reserva del Mes', margin + 2, startY + 12);
        doc.text(formatCurrency(0), pageWidth - margin - 2, startY + 12, { align: 'right' });
        
        doc.text('(=) SALDO NETO', margin + 2, startY + 19);
        doc.text(formatCurrency(saldoNetoLocal), pageWidth - margin - 2, startY + 19, { align: 'right' });

        doc.save(`Balance_Financiero_${statement.id}.pdf`);
    };

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div>
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                    Balance <span className="text-[#0081c9]">Financiero</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Consolidación de Ingresos y Egresos Automáticos
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-t-4 border-[#0081c9] shadow-lg">
                        <CardHeader>
                            <CardTitle className="text-xl font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                                <Save className="h-5 w-5 text-[#0081c9]" /> Nuevo Cierre de Período
                            </CardTitle>
                             <div className="space-y-2 pt-4">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Nombre del Período</Label>
                                <Input placeholder="Ej: MARZO 2024" value={periodName} onChange={(e) => setPeriodName(e.target.value)} className="font-bold uppercase"/>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Ingresos */}
                            <div className="space-y-2">
                                <h3 className="font-bold flex items-center gap-2 text-green-600"><TrendingUp/> Ingresos</h3>
                                {ingresos.map(item => (
                                    <div key={item.id} className="grid grid-cols-[1fr_3fr_1.5fr_auto] gap-2 items-center">
                                        <Input value={item.dia} onChange={(e) => updateItem('ingresos', item.id, 'dia', e.target.value)} placeholder="Día"/>
                                        <Input value={item.concepto} onChange={(e) => updateItem('ingresos', item.id, 'concepto', e.target.value)} placeholder="Concepto"/>
                                        <Input type="number" value={item.monto} onChange={(e) => updateItem('ingresos', item.id, 'monto', parseFloat(e.target.value))} placeholder="Monto"/>
                                        <Button size="icon" variant="ghost" onClick={() => removeItem('ingresos', item.id)}><X className="h-4 w-4"/></Button>
                                    </div>
                                ))}
                                <Button size="sm" variant="outline" onClick={() => addItem('ingresos')}><PlusCircle className="mr-2 h-4 w-4"/>Añadir Ingreso</Button>
                            </div>
                             {/* Egresos */}
                            <div className="space-y-2">
                                <h3 className="font-bold flex items-center gap-2 text-red-600"><TrendingDown/> Egresos</h3>
                                {egresos.map(item => (
                                    <div key={item.id} className="grid grid-cols-[1fr_2.5fr_1.5fr_1.5fr_auto] gap-2 items-center">
                                        <Input value={item.dia} onChange={(e) => updateItem('egresos', item.id, 'dia', e.target.value)} placeholder="Día"/>
                                        <Input value={item.concepto} onChange={(e) => updateItem('egresos', item.id, 'concepto', e.target.value)} placeholder="Concepto"/>
                                        <Input value={item.categoria} onChange={(e) => updateItem('egresos', item.id, 'categoria', e.target.value)} placeholder="Categoría"/>
                                        <Input type="number" value={item.monto} onChange={(e) => updateItem('egresos', item.id, 'monto', parseFloat(e.target.value))} placeholder="Monto"/>
                                        <Button size="icon" variant="ghost" onClick={() => removeItem('egresos', item.id)}><X className="h-4 w-4"/></Button>
                                    </div>
                                ))}
                                <Button size="sm" variant="outline" onClick={() => addItem('egresos')}><PlusCircle className="mr-2 h-4 w-4"/>Añadir Egreso</Button>
                            </div>
                            <div className="space-y-2">
                                <Label>Notas Adicionales</Label>
                                <Textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Añade cualquier observación relevante aquí..." />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <Card className="sticky top-4">
                        <CardHeader>
                            <CardTitle className="text-xl">Resumen</CardTitle>
                        </CardHeader>
                         <CardContent className="space-y-4">
                            <div className="flex justify-between items-center"><p className="text-muted-foreground">Total Ingresos:</p><p className="font-bold text-green-600">Bs. {formatCurrency(totalIngresos)}</p></div>
                            <div className="flex justify-between items-center"><p className="text-muted-foreground">Total Egresos:</p><p className="font-bold text-red-600">Bs. {formatCurrency(totalEgresos)}</p></div>
                             <Separator/>
                            <div className="flex justify-between items-center text-lg"><p className="font-bold">Saldo Neto:</p><p className="font-bold">Bs. {formatCurrency(saldoNeto)}</p></div>
                        </CardContent>
                        <CardFooter>
                            <Button onClick={handleCreateCierre} disabled={isSubmitting || !periodName || (ingresos.length === 0 && egresos.length === 0)} className="w-full">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Cierre de Balance
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>

            <Card className="shadow-md mt-8">
                <CardHeader>
                    <CardTitle>Balances Guardados</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Período</TableHead>
                                <TableHead>Ingresos</TableHead>
                                <TableHead>Egresos</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary"/></TableCell></TableRow>
                            ) : statements.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No se han encontrado balances guardados.</TableCell></TableRow>
                            ) : (
                                statements.map((b) => (
                                    <TableRow key={b.id}>
                                        <TableCell className="font-medium uppercase">{b.id}</TableCell>
                                        <TableCell className="text-green-600">Bs. {formatCurrency(b.ingresos.reduce((s,i) => s + i.monto, 0))}</TableCell>
                                        <TableCell className="text-red-600">Bs. {formatCurrency(b.egresos.reduce((s,i) => s + i.monto, 0))}</TableCell>
                                        <TableCell><Badge variant={b.publicado ? "default" : "secondary"}>{b.publicado ? "Publicado" : "Borrador"}</Badge></TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button variant="ghost" size="icon" onClick={() => generatePDF(b)}><Download className="h-4 w-4"/></Button>
                                            <Button variant="ghost" size="icon" onClick={() => togglePublish(b.id, b.publicado)} title={b.publicado ? "Quitar publicación" : "Publicar"}>{b.publicado ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}</Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteBalance(b.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

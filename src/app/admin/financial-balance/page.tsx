
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, orderBy, onSnapshot, addDoc, 
    deleteDoc, doc, updateDoc, Timestamp, setDoc, where, getDocs, getDoc
} from 'firebase/firestore';
import { 
    FileText, Save, Trash2, Eye, EyeOff, 
    TrendingUp, TrendingDown, Wallet, History,
    CheckCircle2, AlertCircle, Loader2, Building2,
    PlusCircle, X, Download, RefreshCcw
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/hooks/use-auth';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

// --- DEFINICIÓN DE TIPOS ---
interface FinancialItem {
    id: string;
    dia: string;
    concepto: string;
    monto: number;
    categoria: string;
}

interface SavedBalance {
    id: string;
    nombrePeriodo?: string;
    totalIngresos?: number;
    totalEgresos?: number;
    saldoNeto?: number;
    fechaCierre?: Timestamp;
    publicado: boolean;
    ingresos: FinancialItem[];
    egresos: FinancialItem[];
    notas?: string;
    companyInfo?: any;
    createdAt: Timestamp;
}

const formatCurrency = (num: number) => {
    return (num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: format(new Date(2000, i), 'MMMM', { locale: es }),
}));

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

export default function FinancialBalance() {
    const { companyInfo, activeCondoId } = useAuth();
    const { toast } = useToast();
    
    const [statements, setStatements] = useState<SavedBalance[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
    const [periodName, setPeriodName] = useState('');
    const [ingresos, setIngresos] = useState<FinancialItem[]>([]);
    const [egresos, setEgresos] = useState<FinancialItem[]>([]);
    const [notas, setNotas] = useState('');

    // Carga historial
    useEffect(() => {
        if (!activeCondoId) return;
    
        const q = query(
            collection(db, "condominios", activeCondoId, "financial_statements"), 
            orderBy("createdAt", "desc")
        );
    
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setStatements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedBalance)));
            setLoading(false);
        }, (err) => {
            console.error(err);
            setLoading(false);
        });
    
        return () => unsubscribe();
    }, [activeCondoId]);

    // Carga datos al cambiar mes/año
    useEffect(() => {
        if (!activeCondoId || !selectedYear || !selectedMonth) return;
        
        const loadStatement = async () => {
            const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
            const docRef = doc(db, 'condominios', activeCondoId, 'financial_statements', docId);
            const docSnap = await getDoc(docRef);
            
            const monthLabel = months.find(m => m.value === selectedMonth)?.label || '';
            setPeriodName(`${monthLabel} ${selectedYear}`.toUpperCase());

            if (docSnap.exists()) {
                const data = docSnap.data();
                setIngresos(data.ingresos || []);
                setEgresos(data.egresos || []);
                setNotas(data.notas || '');
            } else {
                setIngresos([]);
                setEgresos([]);
                setNotas('');
            }
        };

        loadStatement();
    }, [activeCondoId, selectedYear, selectedMonth]);

    // --- SINCRONIZACIÓN CORREGIDA ---
    const handleSyncData = async () => {
        if (!activeCondoId) {
            toast({ variant: 'destructive', title: 'Error', description: 'No hay un condominio seleccionado.' });
            return;
        }
        setIsSyncing(true);

        const year = parseInt(selectedYear);
        const month = parseInt(selectedMonth);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);

        try {
            // 1. Sincronizar Ingresos (Pagos Aprobados)
            const paymentsQuery = query(
                collection(db, "condominios", activeCondoId, "payments"),
                where("status", "==", "aprobado"),
                where("paymentDate", ">=", Timestamp.fromDate(startDate)),
                where("paymentDate", "<", Timestamp.fromDate(endDate))
            );
            
            const paymentsSnapshot = await getDocs(paymentsQuery);
            const totalPayments = paymentsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);

            setIngresos([{
                id: `auto-income-${Date.now()}`,
                dia: '28',
                concepto: 'Recaudación por Cuotas de Condominio (Sincronizado)',
                monto: totalPayments,
                categoria: 'Ingresos por Cuotas'
            }]);

            // 2. Sincronizar Egresos (Gastos Registrados)
            const mainExpensesQuery = query(
                collection(db, "condominios", activeCondoId, "gastos"),
                where("date", ">=", Timestamp.fromDate(startDate)),
                where("date", "<", Timestamp.fromDate(endDate)),
            );
            
            const mainExpensesSnap = await getDocs(mainExpensesQuery);
            const fetchedExpenses: FinancialItem[] = [];
            
            mainExpensesSnap.forEach(docSnap => {
                const data = docSnap.data();
                fetchedExpenses.push({
                    id: docSnap.id,
                    dia: format(data.date.toDate(), 'dd'),
                    concepto: data.description || 'Sin descripción',
                    monto: data.amount || 0,
                    categoria: data.category || 'General',
                });
            });

            setEgresos(fetchedExpenses.sort((a,b) => parseInt(a.dia) - parseInt(b.dia)));

            toast({ title: 'Datos Actualizados', description: 'Los ingresos y egresos del mes han sido sincronizados.' });

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'Fallo al sincronizar datos desde Firebase.' });
        } finally {
            setIsSyncing(false);
        }
    };

    const totalIngresos = useMemo(() => ingresos.reduce((acc, item) => acc + (Number(item.monto) || 0), 0), [ingresos]);
    const totalEgresos = useMemo(() => egresos.reduce((acc, item) => acc + (Number(item.monto) || 0), 0), [egresos]);
    const saldoNeto = totalIngresos - totalEgresos;

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
        if (!activeCondoId) return;
        const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
        setIsSubmitting(true);
        try {
            await setDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', docId), {
                ingresos,
                egresos,
                notas,
                createdAt: Timestamp.now(),
                publicado: false,
                companyInfo: companyInfo || null,
            }, { merge: true });

            toast({ title: "Guardado en Historial", description: "El balance se guardó correctamente." });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const togglePublish = async (id: string, currentState: boolean) => {
        if (!activeCondoId) return;
        try {
            await updateDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', id), { publicado: !currentState });
            toast({ title: 'Estado actualizado' });
        } catch (e) { console.error(e); }
    };

    const handleDeleteBalance = async (id: string) => {
        if (!activeCondoId || !confirm("¿Eliminar balance?")) return;
        try {
            await deleteDoc(doc(db, 'condominios', activeCondoId, 'financial_statements', id));
            toast({ title: 'Eliminado' });
        } catch (e) { console.error(e); }
    };

    const generatePDF = async (statement: SavedBalance) => {
        // Usar la info de la compañía de EFAS CondoSys o una por defecto
        const info = statement.companyInfo || companyInfo || {
            name: "EFAS CondoSys - Gestión Inmobiliaria",
            rif: "RIF: J-00000000-0",
            address: "Administración de Condominios",
            phone: "Soporte Digital",
            logo: "" 
        };

        const docPDF = new jsPDF();
        const pageWidth = (docPDF as any).internal.pageSize.getWidth();
        const margin = 14;

        // --- CABECERA ESTILO EFAS ---
        // Rectángulo estético superior
        docPDF.setFillColor(0, 129, 201); // El azul #0081c9 de EFAS
        docPDF.rect(0, 0, pageWidth, 40, 'F');

        // Texto Blanco en Cabecera
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(22).setFont('helvetica', 'bold').text("EFAS CondoSys", margin, 20);
        docPDF.setFontSize(10).setFont('helvetica', 'normal').text("SISTEMA DE GESTIÓN FINANCIERA", margin, 28);
        
        // Info de la Empresa (Derecha)
        docPDF.setFontSize(9);
        docPDF.text(info.name, pageWidth - margin, 15, { align: 'right' });
        docPDF.text(info.rif, pageWidth - margin, 20, { align: 'right' });
        docPDF.text(info.address, pageWidth - margin, 25, { align: 'right' });
        docPDF.text(`Tel: ${info.phone}`, pageWidth - margin, 30, { align: 'right' });

        // Título del Reporte
        docPDF.setTextColor(40, 40, 40);
        const docIdParts = statement.id.split('-');
        const monthLabel = months.find(m => m.value === String(parseInt(docIdParts[1])))?.label || '';
        const periodText = `${monthLabel} ${docIdParts[0]}`.toUpperCase();

        docPDF.setFontSize(18).setFont('helvetica', 'bold').text('ESTADO DE RESULTADOS', pageWidth / 2, 55, { align: 'center' });
        docPDF.setFontSize(12).setFont('helvetica', 'italic').text(`PERÍODO: ${periodText}`, pageWidth / 2, 63, { align: 'center' });

        // QR de Validación
        try {
            const qrCodeUrl = await QRCode.toDataURL(`https://efas-condosys.com/verify/balance/${statement.id}`);
            docPDF.addImage(qrCodeUrl, 'PNG', pageWidth - margin - 25, 45, 25, 25);
            docPDF.setFontSize(7).text("VALIDACIÓN DIGITAL", pageWidth - margin - 12.5, 72, { align: 'center' });
        } catch (e) { console.error("QR Error", e); }

        let startY = 80;

        // --- TABLA DE INGRESOS ---
        const totalIn = statement.ingresos?.reduce((sum, i) => sum + i.monto, 0) || 0;
        autoTable(docPDF, {
            head: [['DÍA', 'DESCRIPCIÓN DE INGRESOS', 'CATEGORÍA', 'MONTO (Bs.)']],
            body: statement.ingresos?.map(i => [i.dia, i.concepto.toUpperCase(), i.categoria, { content: formatCurrency(i.monto), styles: { halign: 'right' } }]) || [],
            startY,
            theme: 'striped',
            headStyles: { fillColor: [34, 197, 94], fontStyle: 'bold' }, // Verde EFAS
            foot: [[ { content: 'TOTAL INGRESOS RECAUDADOS', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(totalIn), styles: { halign: 'right', fontStyle: 'bold' } }]],
        });

        startY = (docPDF as any).lastAutoTable.finalY + 10;

        // --- TABLA DE EGRESOS ---
        const totalOut = statement.egresos?.reduce((sum, i) => sum + i.monto, 0) || 0;
        autoTable(docPDF, {
            head: [['DÍA', 'DESCRIPCIÓN DE EGRESOS / GASTOS', 'CATEGORÍA', 'MONTO (Bs.)']],
            body: statement.egresos?.map(e => [e.dia, e.concepto.toUpperCase(), e.categoria, { content: formatCurrency(e.monto), styles: { halign: 'right' } }]) || [],
            startY,
            theme: 'striped',
            headStyles: { fillColor: [239, 68, 68], fontStyle: 'bold' }, // Rojo EFAS
            foot: [[ { content: 'TOTAL EGRESOS DEL PERÍODO', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(totalOut), styles: { halign: 'right', fontStyle: 'bold' } }]],
        });

        startY = (docPDF as any).lastAutoTable.finalY + 15;

        // --- RESUMEN FINAL ---
        docPDF.setFillColor(245, 245, 245);
        docPDF.roundedRect(margin, startY, pageWidth - (margin * 2), 35, 3, 3, 'F');
        
        docPDF.setFontSize(11).setTextColor(100, 100, 100).text("RESUMEN DE LIQUIDEZ:", margin + 5, startY + 10);
        
        docPDF.setTextColor(0, 0, 0).setFontSize(12);
        docPDF.text("SALDO DISPONIBLE NETO:", margin + 5, startY + 22);
        
        const saldoFinal = totalIn - totalOut;
        docPDF.setFontSize(14).setFont('helvetica', 'bold');
        docPDF.setTextColor(saldoFinal >= 0 ? [0, 129, 201] : [239, 68, 68]);
        docPDF.text(`Bs. ${formatCurrency(saldoFinal)}`, pageWidth - margin - 5, startY + 22, { align: 'right' });

        // Notas al pie
        if (statement.notas) {
            startY += 45;
            docPDF.setFontSize(9).setTextColor(100, 100, 100).setFont('helvetica', 'italic');
            docPDF.text("OBSERVACIONES:", margin, startY);
            docPDF.setFontSize(9).text(statement.notas, margin, startY + 5, { maxWidth: pageWidth - (margin * 2) });
        }

        // Footer de página
        docPDF.setFontSize(8).setTextColor(150, 150, 150);
        docPDF.text(`EFAS CondoSys - Reporte Generado Automáticamente - ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 285, { align: 'center' });

        docPDF.save(`Balance_EFAS_${statement.id}.pdf`);
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
                    <Building2 className="h-4 w-4" /> Consolidación de Cuentas
                </p>
            </div>
            
            <Card className="shadow-lg border-l-4 border-[#0081c9]">
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <CardTitle className="text-sm uppercase font-black">Control de Período</CardTitle>
                        <div className="flex items-center gap-2">
                             <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="w-[180px] font-bold uppercase text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value} className="uppercase text-xs">{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedYear} onValueChange={setSelectedYear}>
                                <SelectTrigger className="w-[120px] font-bold text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>{years.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button onClick={handleSyncData} disabled={isSyncing} className="bg-[#f59e0b] hover:bg-orange-600 font-black uppercase text-[10px]">
                                {isSyncing ? <Loader2 className="mr-2 h-3 w-3 animate-spin"/> : <RefreshCcw className="mr-2 h-3 w-3"/>}
                                Sincronizar
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* TABLA INGRESOS */}
                    <Card className="border-t-4 border-green-500 shadow-md">
                        <CardHeader className="pb-2">
                            <h3 className="font-black flex items-center gap-2 text-green-600 uppercase text-sm"><TrendingUp className="h-4 w-4"/> Ingresos Detallados</h3>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {ingresos.map(item => (
                                <div key={item.id} className="grid grid-cols-[60px_1fr_120px_auto] gap-2 items-center">
                                    <Input value={item.dia} onChange={(e) => updateItem('ingresos', item.id, 'dia', e.target.value)} className="text-center font-bold" maxLength={2}/>
                                    <Input value={item.concepto} onChange={(e) => updateItem('ingresos', item.id, 'concepto', e.target.value)} placeholder="Concepto del ingreso" className="uppercase text-xs font-medium"/>
                                    <Input type="number" value={item.monto} onChange={(e) => updateItem('ingresos', item.id, 'monto', parseFloat(e.target.value))} className="font-black text-green-600"/>
                                    <Button size="icon" variant="ghost" onClick={() => removeItem('ingresos', item.id)} className="text-red-300 hover:text-red-600"><X className="h-4 w-4"/></Button>
                                </div>
                            ))}
                            <Button size="sm" variant="outline" onClick={() => addItem('ingresos')} className="w-full border-dashed"><PlusCircle className="mr-2 h-4 w-4"/> Añadir Ingreso Manual</Button>
                        </CardContent>
                    </Card>

                    {/* TABLA EGRESOS */}
                    <Card className="border-t-4 border-red-500 shadow-md">
                        <CardHeader className="pb-2">
                            <h3 className="font-black flex items-center gap-2 text-red-600 uppercase text-sm"><TrendingDown className="h-4 w-4"/> Egresos Detallados</h3>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {egresos.map(item => (
                                <div key={item.id} className="grid grid-cols-[60px_1fr_100px_120px_auto] gap-2 items-center">
                                    <Input value={item.dia} onChange={(e) => updateItem('egresos', item.id, 'dia', e.target.value)} className="text-center font-bold"/>
                                    <Input value={item.concepto} onChange={(e) => updateItem('egresos', item.id, 'concepto', e.target.value)} className="uppercase text-xs font-medium"/>
                                    <Input value={item.categoria} onChange={(e) => updateItem('egresos', item.id, 'categoria', e.target.value)} className="text-[10px] uppercase bg-slate-50"/>
                                    <Input type="number" value={item.monto} onChange={(e) => updateItem('egresos', item.id, 'monto', parseFloat(e.target.value))} className="font-black text-red-600"/>
                                    <Button size="icon" variant="ghost" onClick={() => removeItem('egresos', item.id)} className="text-red-300 hover:text-red-600"><X className="h-4 w-4"/></Button>
                                </div>
                            ))}
                            <Button size="sm" variant="outline" onClick={() => addItem('egresos')} className="w-full border-dashed"><PlusCircle className="mr-2 h-4 w-4"/> Añadir Egreso Manual</Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle className="text-xs font-black uppercase">Notas del Administrador</CardTitle></CardHeader>
                        <CardContent><Textarea value={notas} onChange={e => setNotas(e.target.value)} className="min-h-[100px]" /></CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <Card className="sticky top-4 shadow-xl border-t-8 border-slate-900">
                        <CardHeader>
                            <CardTitle className="text-xl font-black uppercase italic text-center">Resumen del Balance</CardTitle>
                             <CardDescription className="text-center font-bold">Período: {periodName}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center"><p className="text-[10px] font-black uppercase text-slate-400">Total Ingresos</p><p className="font-black text-green-600">Bs. {formatCurrency(totalIngresos)}</p></div>
                            <div className="flex justify-between items-center"><p className="text-[10px] font-black uppercase text-slate-400">Total Egresos</p><p className="font-black text-red-600">Bs. {formatCurrency(totalEgresos)}</p></div>
                             <Separator/>
                            <div className="flex justify-between items-center text-lg pt-2"><p className="font-black uppercase italic">Saldo Neto</p><p className="font-black text-slate-900 underline">Bs. {formatCurrency(saldoNeto)}</p></div>
                        </CardContent>
                        <CardFooter>
                            <Button onClick={handleCreateCierre} disabled={isSubmitting || !periodName} className="w-full bg-slate-900 hover:bg-black font-black uppercase">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar en Historial
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>

            {/* LISTADO HISTÓRICO */}
            <Card className="shadow-md mt-8">
                <CardHeader><CardTitle className="text-sm font-black uppercase tracking-widest">Balances Guardados</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="font-black text-[10px] uppercase">ID Período</TableHead>
                                <TableHead className="font-black text-[10px] uppercase">Ingresos</TableHead>
                                <TableHead className="font-black text-[10px] uppercase">Egresos</TableHead>
                                <TableHead className="font-black text-[10px] uppercase">Estado</TableHead>
                                <TableHead className="text-right font-black text-[10px] uppercase">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-[#0081c9]"/></TableCell></TableRow>
                            ) : statements.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-32 text-center text-slate-400 italic">No hay registros históricos.</TableCell></TableRow>
                            ) : (
                                statements.map((b) => (
                                    <TableRow key={b.id} className="hover:bg-slate-50">
                                        <TableCell className="font-black uppercase text-xs">{b.id}</TableCell>
                                        <TableCell className="text-green-600 font-bold">Bs. {formatCurrency(b.ingresos?.reduce((s,i) => s + i.monto, 0) || 0)}</TableCell>
                                        <TableCell className="text-red-600 font-bold">Bs. {formatCurrency(b.egresos?.reduce((s,i) => s + i.monto, 0) || 0)}</TableCell>
                                        <TableCell><Badge variant={b.publicado ? "default" : "secondary"} className={b.publicado ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : ""}>{b.publicado ? "Publicado" : "Borrador"}</Badge></TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button variant="outline" size="sm" onClick={() => generatePDF(b)}><Download className="mr-2 h-4 w-4"/> PDF</Button>
                                            <Button variant="ghost" size="icon" onClick={() => togglePublish(b.id, b.publicado)}>{b.publicado ? <EyeOff className="h-4 w-4 text-orange-500"/> : <Eye className="h-4 w-4 text-blue-500"/>}</Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteBalance(b.id)} className="text-red-300 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
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

    
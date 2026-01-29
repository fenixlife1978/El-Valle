
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, doc, Timestamp, getDoc, where, getDocs, setDoc, serverTimestamp, onSnapshot, orderBy, deleteDoc, writeBatch
} from 'firebase/firestore';
import { 
    Download, Loader2, RefreshCw, TrendingUp, TrendingDown, Wallet, Box, Save, FileText, Eye, MoreHorizontal, Trash2
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { format, startOfMonth, endOfMonth, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuthorization } from '@/hooks/use-authorization';


const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

type PublishedReport = {
    id: string;
    type: 'balance' | 'integral';
    sourceId: string;
    createdAt: Timestamp;
};

export default function FinancialBalancePage() {
    const { toast } = useToast();
    const { activeCondoId, loading: authLoading } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const currentCondoId = activeCondoId;

    const [dataLoading, setDataLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [companyInfo, setCompanyInfo] = useState<{ name: string; rif: string; logo: string | null }>({ name: "RESIDENCIAS", rif: "J-00000000-0", logo: null });
    
    const [ingresos, setIngresos] = useState<{ concepto: string, real: number, category: string }[]>([]);
    const [egresos, setEgresos] = useState<any[]>([]);
    const [cajaChica, setCajaChica] = useState({ saldoInicial: 0, reposiciones: 0, gastos: 0, saldoFinal: 0 });
    const [estadoFinal, setEstadoFinal] = useState({ saldoAnterior: 0, totalIngresos: 0, totalEgresos: 0, saldoBancos: 0, disponibilidadTotal: 0 });
    const [notas, setNotas] = useState('');

    // State for history
    const [savedStatements, setSavedStatements] = useState<any[]>([]);
    const [publishedReports, setPublishedReports] = useState<PublishedReport[]>([]);

    const loadData = useCallback(async () => {
        if (!currentCondoId) return;
        setSyncing(true);
        try {
            const configRef = doc(db, 'condominios', currentCondoId, 'config', 'mainSettings');
            const snap = await getDoc(configRef);
            if (snap.exists()) {
                const d = snap.data();
                setCompanyInfo({
                    name: d.companyInfo?.name || d.name || "CONDOMINIO",
                    rif: d.companyInfo?.rif || d.rif || "N/A",
                    logo: d.companyInfo?.logo || d.logo || null
                });
            }

            const fromDate = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1));
            const toDate = endOfMonth(fromDate);
            
            const paymentsSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'payments'), where('paymentDate', '>=', fromDate), where('paymentDate', '<=', toDate), where('status', '==', 'aprobado')));
            const totalIngresos = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
            
            const expensesSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'gastos'), where('date', '>=', fromDate), where('date', '<=', toDate)));
            const listaEgresos = expensesSnap.docs.map(d => ({ 
                fecha: format(d.data().date.toDate(), 'dd/MM/yyyy'), 
                descripcion: d.data().description, 
                monto: d.data().amount,
                category: d.data().category
            }));
            const totalEgresos = listaEgresos.reduce((sum, item) => sum + item.monto, 0);

            const prevPettyCashSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'cajaChica_movimientos'), where('date', '<', fromDate)));
            const saldoInicialCajaChica = prevPettyCashSnap.docs.reduce((sum, doc) => sum + (doc.data().type === 'ingreso' ? doc.data().amount : -doc.data().amount), 0);
            
            const currentPettyCashSnap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'cajaChica_movimientos'), where('date', '>=', fromDate), where('date', '<=', toDate)));
            const reposicionesCajaChica = currentPettyCashSnap.docs.filter(d => d.data().type === 'ingreso').reduce((sum, doc) => sum + doc.data().amount, 0);
            const gastosCajaChica = currentPettyCashSnap.docs.filter(d => d.data().type === 'egreso').reduce((sum, doc) => sum + doc.data().amount, 0);
            const saldoFinalCajaChica = saldoInicialCajaChica + reposicionesCajaChica - gastosCajaChica;

            setIngresos([{ concepto: 'Cobranza del Mes', real: totalIngresos, category: 'cuotas' }]);
            setEgresos(listaEgresos);
            setCajaChica({ saldoInicial: saldoInicialCajaChica, reposiciones: reposicionesCajaChica, gastos: gastosCajaChica, saldoFinal: saldoFinalCajaChica });

            const saldoBancos = estadoFinal.saldoAnterior + totalIngresos - totalEgresos;

            setEstadoFinal(prev => ({
                ...prev,
                totalIngresos,
                totalEgresos,
                saldoBancos,
                disponibilidadTotal: saldoBancos + saldoFinalCajaChica
            }));

        } catch (e) {
            console.error("Error EFAS:", e);
        } finally {
            setSyncing(false);
            setDataLoading(false);
        }
    }, [currentCondoId, selectedMonth, selectedYear, estadoFinal.saldoAnterior]);
    
    useEffect(() => {
        let unsubStatements: () => void = () => {};
        let unsubPublished: () => void = () => {};

        const fetchData = async () => {
            if (!authLoading && currentCondoId) {
                await loadData();

                const statementsQuery = query(collection(db, 'condominios', currentCondoId, 'financial_statements'), orderBy('createdAt', 'desc'));
                unsubStatements = onSnapshot(statementsQuery, (snap) => {
                    setSavedStatements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                });

                const publishedQuery = query(collection(db, 'condominios', currentCondoId, 'published_reports'));
                unsubPublished = onSnapshot(publishedQuery, (snap) => {
                    setPublishedReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as PublishedReport)));
                });
            }
        };
        
        fetchData();
        
        return () => {
            unsubStatements();
            unsubPublished();
        };
    }, [authLoading, currentCondoId, loadData]);
    
    const handlePublishToggle = async (statementId: string, isPublished: boolean) => {
        if (!currentCondoId) return;
        requestAuthorization(async () => {
            const publicationId = `balance-${statementId}`;
            const reportRef = doc(db, 'condominios', currentCondoId, 'published_reports', publicationId);

            try {
                if (isPublished) {
                    await deleteDoc(reportRef);
                    toast({ title: "Publicación Retirada" });
                } else {
                    await setDoc(reportRef, {
                        type: 'balance',
                        sourceId: statementId,
                        createdAt: serverTimestamp(),
                    });
                    toast({ title: 'Balance Publicado', description: 'Ahora es visible para los propietarios.' });
                }
            } catch (error) {
                console.error('Error toggling publication:', error);
                toast({ variant: 'destructive', title: 'Error de Publicación' });
            }
        });
    };

    const handleDeleteStatement = async (statementId: string) => {
        if (!currentCondoId) return;
        requestAuthorization(async () => {
            try {
                const batch = writeBatch(db);
                batch.delete(doc(db, 'condominios', currentCondoId, 'financial_statements', statementId));
                
                const publicationId = `balance-${statementId}`;
                const pubDocRef = doc(db, 'condominios', currentCondoId, 'published_reports', publicationId);
                batch.delete(pubDocRef);
                
                await batch.commit();
                toast({ title: 'Balance Eliminado Correctamente' });
            } catch (error) {
                console.error('Error deleting statement:', error);
                toast({ variant: 'destructive', title: 'Error al Eliminar' });
            }
        });
    };

    const generatePDF = (data: any) => {
        if (!data || !data.ingresos || !companyInfo) return;

        const docPDF = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = docPDF.internal.pageSize.getWidth();
        const headerHeight = 35;
        const margin = 14;

        // --- ENCABEZADO ---
        docPDF.setFillColor(30, 41, 59); // Dark blue/slate
        docPDF.rect(0, 0, pageWidth, headerHeight, 'F');

        // Logo Circular
        if (companyInfo.logo) {
            try {
                const pdfCtx = docPDF as any;
                pdfCtx.saveGraphicsState();
                pdfCtx.circle(margin + 12, 17.5, 12, 'S'); // Draw circle path for clipping
                pdfCtx.clip();
                docPDF.addImage(companyInfo.logo, 'PNG', margin, 5.5, 24, 24);
                pdfCtx.restoreGraphicsState();
            } catch (e) {
                console.error("Error adding logo to PDF:", e);
            }
        }

        // Textos del Encabezado
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(14);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text(companyInfo.name.toUpperCase(), margin + 28, 15);
        
        docPDF.setFontSize(9);
        docPDF.setFont('helvetica', 'normal');
        docPDF.text(`RIF: ${companyInfo.rif}`, margin + 28, 22);

        docPDF.setTextColor(245, 158, 11); // Amber for EFAS
        docPDF.setFont('helvetica', 'bold');
        docPDF.setFontSize(10);
        docPDF.text("EFAS", pageWidth - margin - 35, 15, { align: 'right' });
        docPDF.setTextColor(255, 255, 255);
        docPDF.text("CONDOSYS", pageWidth - margin, 15, { align: 'right' });

        docPDF.setFontSize(8);
        docPDF.setFont('helvetica', 'normal');
        docPDF.text("BALANCE FINANCIERO OFICIAL", pageWidth - margin, 20, { align: 'right' });

        // Código de Barras
        const canvas = document.createElement('canvas');
        const barcodeValue = `BF-${data.year}-${data.month}`;
        try {
            JsBarcode(canvas, barcodeValue, {
                format: "CODE128",
                height: 25,
                width: 1.5,
                displayValue: false,
                margin: 0,
                background: "#1e293b", // Header bg color
                lineColor: "#ffffff" // White lines
            });
            const barcodeDataUrl = canvas.toDataURL("image/png");
            docPDF.addImage(barcodeDataUrl, 'PNG', pageWidth - margin - 55, 24, 50, 12);
        } catch (e) {
            console.error("Barcode generation failed", e);
        }

        // --- CUERPO ---
        docPDF.setTextColor(0, 0, 0); // Reset a negro
        let startY = headerHeight + 20;

        docPDF.setFontSize(18);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text("ESTADO DE RESULTADOS", margin, startY);
        startY += 8;

        docPDF.setFontSize(10);
        docPDF.setFont('helvetica', 'normal');
        const periodo = `${months.find(m => m.value === (data.month || selectedMonth))?.label.toUpperCase()} ${data.year || selectedYear}`;
        docPDF.text(`PERÍODO: ${periodo}`, margin, startY);
        startY += 10;

        // Tablas
        autoTable(docPDF, {
            head: [['CONCEPTO DE INGRESO', 'MONTO (Bs.)']],
            body: data.ingresos.map((i: any) => [i.concepto.toUpperCase(), formatCurrency(i.monto)]),
            startY,
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
            styles: { textColor: [0, 0, 0], fontSize: 9 },
            columnStyles: { 1: { halign: 'right' } }
        });
        startY = (docPDF as any).lastAutoTable.finalY + 10;

        autoTable(docPDF, {
            head: [['FECHA', 'CONCEPTO DE EGRESO / GASTO', 'MONTO (Bs.)']],
            body: data.egresos.length > 0 ? data.egresos.map((e: any) => [e.fecha, e.descripcion.toUpperCase(), formatCurrency(e.monto)]) : [['-', 'SIN GASTOS REGISTRADOS', '0,00']],
            startY,
            theme: 'grid',
            headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255] },
            styles: { textColor: [0, 0, 0], fontSize: 9 },
            columnStyles: { 2: { halign: 'right' } }
        });
        startY = (docPDF as any).lastAutoTable.finalY + 15;

        // Cuadro de Total
        docPDF.setFillColor(245, 158, 11);
        docPDF.roundedRect(margin, startY, pageWidth - (margin * 2), 22, 3, 3, 'F');
        docPDF.setTextColor(255, 255, 255);
        docPDF.setFontSize(11);
        docPDF.text("DISPONIBILIDAD TOTAL REAL:", margin + 5, startY + 9);
        docPDF.setFontSize(16);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text(`${formatCurrency(data.disponibilidad)} Bs.`, margin + 5, startY + 17);

        // --- SALIDA ---
        const uniqueID = Math.floor(Date.now() / 1000);
        docPDF.save(`Reporte_Balance_${uniqueID}.pdf`);
    };

    if (authLoading || dataLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic">
                    Balance <span className="text-primary">Financiero</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full"></div>
                <span className="inline-block mt-3 px-3 py-1 bg-secondary text-xs font-bold rounded-full uppercase tracking-tighter">
                    ID: {currentCondoId}
                </span>
            </div>

            <div className="flex gap-2">
                <Button variant="outline" onClick={loadData} disabled={syncing} className="rounded-2xl">
                    <RefreshCw className={`mr-2 h-4 w-4 ${syncing && 'animate-spin'}`}/> Sincronizar
                </Button>
                <Button className="bg-primary rounded-2xl" onClick={() => generatePDF({
                        ingresos: ingresos.map(i => ({...i, monto: i.real})),
                        egresos,
                        disponibilidad: estadoFinal.disponibilidadTotal,
                        month: selectedMonth,
                        year: selectedYear,
                    })}>
                    <Download className="mr-2 h-4 w-4"/> Descargar PDF
                </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <CardHeader className="p-0 mb-4"><CardTitle className="text-sm font-bold text-muted-foreground uppercase">Periodo</CardTitle></CardHeader>
                    <div className="flex gap-2">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label.toUpperCase()}</SelectItem>)}</SelectContent></Select>
                        <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                    </div>
                </Card>
                <Card className="rounded-[2.5rem] p-6 shadow-xl border-2">
                    <CardHeader className="p-0 mb-4">
                        <CardTitle className="text-sm font-bold text-muted-foreground uppercase">Saldo Anterior (Bancos)</CardTitle>
                    </CardHeader>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Bs.</span>
                         <Input 
                            type="number"
                            value={estadoFinal.saldoAnterior}
                            onChange={(e) => setEstadoFinal(prev => ({...prev, saldoAnterior: parseFloat(e.target.value) || 0 }))}
                            className="pl-12 text-xl font-black h-14 rounded-xl bg-input"
                            placeholder="0.00"
                        />
                    </div>
                </Card>

                <Card className="rounded-[2.5rem] bg-emerald-50 text-emerald-700 p-6 border-none"><p className="font-bold">Total Ingresos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.totalIngresos)}</p></Card>
                <Card className="rounded-[2.5rem] bg-rose-50 text-rose-700 p-6 border-none"><p className="font-bold">Total Egresos</p><p className="text-3xl font-black">{formatCurrency(estadoFinal.totalEgresos)}</p></Card>
            </div>
            
             <Card className="rounded-[2.5rem] bg-card border-2">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-xl font-black uppercase italic flex items-center gap-2">
                        <Box className="text-primary"/>
                        Movimientos de Caja Chica
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                    <div className="p-4 bg-muted/50 rounded-2xl">
                        <p className="text-xs font-bold text-muted-foreground">Saldo Anterior</p>
                        <p className="text-xl font-bold">{formatCurrency(cajaChica.saldoInicial)}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-2xl">
                        <p className="text-xs font-bold text-emerald-700">(+) Reposiciones</p>
                        <p className="text-xl font-bold text-emerald-700">{formatCurrency(cajaChica.reposiciones)}</p>
                    </div>
                     <div className="p-4 bg-rose-50 rounded-2xl">
                        <p className="text-xs font-bold text-rose-700">(-) Gastos</p>
                        <p className="text-xl font-bold text-rose-700">{formatCurrency(cajaChica.gastos)}</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-2xl">
                        <p className="text-xs font-bold text-blue-700">Saldo Final</p>
                        <p className="text-xl font-bold text-blue-700">{formatCurrency(cajaChica.saldoFinal)}</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-[2.5rem] p-8 bg-card border-2 shadow-2xl">
                <CardHeader className="p-0 mb-6"><CardTitle className="text-2xl font-black uppercase italic">Cierre de Cuenta</CardTitle></CardHeader>
                <div className="space-y-4">
                    <div className="p-6 rounded-2xl bg-primary text-primary-foreground flex justify-between items-center">
                        <span className="font-bold uppercase tracking-widest">Disponibilidad Real</span>
                        <span className="text-4xl font-black">{formatCurrency(estadoFinal.disponibilidadTotal)} Bs.</span>
                    </div>
                    <Textarea 
                        placeholder="Notas para el PDF..." 
                        value={notas} 
                        onChange={e => setNotas(e.target.value)} 
                        className="rounded-2xl min-h-[100px]"
                    />
                    <div className="flex justify-end">
                        <Button className="rounded-full h-14 px-10 font-black uppercase italic" onClick={async () => {
                            if (!currentCondoId) return;
                            const periodId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                            const docData = {
                                id: periodId,
                                ingresos: ingresos.map(i => ({...i, monto: i.real})), // Guardar el valor 'real'
                                egresos: egresos,
                                cajaChica: cajaChica,
                                estadoFinanciero: estadoFinal,
                                notas,
                                createdAt: serverTimestamp()
                            };
                            await setDoc(doc(db, 'condominios', currentCondoId, 'financial_statements', periodId), docData);
                            toast({ title: "BALANCE GUARDADO" });
                        }}>
                            <Save className="mr-2 h-5 w-5" /> Guardar Balance
                        </Button>
                    </div>
                </div>
            </Card>

            <Card className="rounded-[2.5rem] p-8 bg-card border-2 shadow-2xl">
                <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-2xl font-black uppercase italic">Historial de Balances Guardados</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Período</TableHead>
                                <TableHead>Fecha de Guardado</TableHead>
                                <TableHead>Publicado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {savedStatements.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        No hay balances guardados.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                savedStatements.map(statement => {
                                    const isPublished = publishedReports.some(p => p.id === `balance-${statement.id}`);
                                    const periodDate = parse(statement.id, 'yyyy-MM', new Date());
                                    const periodLabel = format(periodDate, 'MMMM yyyy', { locale: es });

                                    return (
                                        <TableRow key={statement.id}>
                                            <TableCell className="capitalize font-semibold">{periodLabel}</TableCell>
                                            <TableCell>{statement.createdAt ? format(statement.createdAt.toDate(), "dd/MM/yyyy HH:mm") : 'N/A'}</TableCell>
                                            <TableCell>
                                                <Switch
                                                    checked={isPublished}
                                                    onCheckedChange={() => handlePublishToggle(statement.id, isPublished)}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent>
                                                        <Link href={`/owner/report/balance-${statement.id}`} passHref target="_blank">
                                                            <DropdownMenuItem><Eye className="mr-2 h-4 w-4"/> Ver</DropdownMenuItem>
                                                        </Link>
                                                        <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteStatement(statement.id)}>
                                                            <Trash2 className="mr-2 h-4 w-4"/> Eliminar
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

    
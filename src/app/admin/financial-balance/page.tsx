
"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { 
    collection, query, orderBy, onSnapshot, addDoc, 
    deleteDoc, doc, updateDoc, Timestamp, getDoc, where, getDocs, writeBatch, setDoc
} from 'firebase/firestore';
import { 
    Trash2, Eye, EyeOff, History, Download, Loader2, FileText, FilePlus, Info, Sync, Edit
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";


// --- TYPE DEFINITIONS ---
interface FinancialItem {
  id: string;
  dia: string;
  concepto: string;
  categoria: string;
  monto: number;
}

interface SavedBalance {
  id: string;
  nombrePeriodo?: string;
  ingresos: FinancialItem[];
  egresos: FinancialItem[];
  notas: string;
  estadoFinanciero: {
    saldoNeto: number;
  };
  fechaCierre?: Timestamp;
  publicado?: boolean;
  companyInfo?: CompanyInfo;
}

interface AutomaticExpense {
    id: string;
    description: string;
    amount: number;
    category: string;
    date: Timestamp;
}

interface CompanyInfo {
    name: string; address: string; phone: string; email: string; logo: string; rif: string;
}


const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

// --- HELPER FUNCTIONS ---
const formatCurrency = (amount: number | null | undefined): string => {
    if (typeof amount !== 'number') return '0,00';
    return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function FinancialBalance() {
    const { user, activeCondoId, companyInfo } = useAuth();
    
    // --- STATE MANAGEMENT ---
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const workingCondoId = (sId && user?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;

    const [statements, setStatements] = useState<SavedBalance[]>([]);
    const [ingresos, setIngresos] = useState<FinancialItem[]>([]);
    const [egresos, setEgresos] = useState<FinancialItem[]>([]);
    const [notas, setNotas] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    const [loading, setLoading] = useState(true);
    const [editingItem, setEditingItem] = useState<{ type: 'ingreso' | 'egreso', item: FinancialItem } | null>(null);

    // --- DATA FETCHING ---
    useEffect(() => {
        if (!workingCondoId) return;
        const q = query(collection(db, 'condominios', workingCondoId, 'financial_statements'), orderBy('fechaCierre', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setStatements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedBalance)));
            setLoading(false);
        });
        return () => unsubscribe();
    }, [workingCondoId]);

    useEffect(() => {
        const periodId = `${selectedYear}-${selectedMonth}`;
        const found = statements.find(s => s.id === periodId);
        if (found) {
            setIngresos(found.ingresos || []);
            setEgresos(found.egresos || []);
            setNotas(found.notas || '');
        } else {
            setIngresos([]);
            setEgresos([]);
            setNotas('');
        }
    }, [selectedMonth, selectedYear, statements]);

    // --- HANDLERS ---
    const handleSyncData = async () => {
        if (!workingCondoId) return;
        setLoading(true);

        const startDate = new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1);
        const endDate = new Date(parseInt(selectedYear), parseInt(selectedMonth), 0, 23, 59, 59);

        try {
            // Sincronizar Ingresos
            const paymentsQuery = query(
                collection(db, 'condominios', workingCondoId, 'payments'),
                where('status', '==', 'aprobado'),
                where('paymentDate', '>=', startDate),
                where('paymentDate', '<=', endDate)
            );
            const paymentsSnap = await getDocs(paymentsQuery);
            const totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);

            const syncedIngresos = [{
                id: `ing-${Date.now()}`,
                dia: format(endDate, 'dd'),
                concepto: 'Recaudación por Cuotas de Condominio',
                categoria: 'cuotas_ordinarias',
                monto: totalPayments
            }];
            setIngresos(syncedIngresos);
            
            // Sincronizar Egresos
            const expensesQuery = query(
                collection(db, 'condominios', workingCondoId, 'gastos'),
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
            const expensesSnap = await getDocs(expensesQuery);
            const syncedEgresos = expensesSnap.docs.map(doc => {
                const data = doc.data() as AutomaticExpense;
                return {
                    id: doc.id,
                    dia: format(data.date.toDate(), 'dd'),
                    concepto: data.description,
                    categoria: data.category,
                    monto: data.amount,
                };
            });
            setEgresos(syncedEgresos);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleSaveStatement = async () => {
        if (!workingCondoId) return;

        const periodId = `${selectedYear}-${selectedMonth}`;
        const totalIngresos = ingresos.reduce((sum, item) => sum + item.monto, 0);
        const totalEgresos = egresos.reduce((sum, item) => sum + item.monto, 0);

        const statementData: Omit<SavedBalance, 'id'> = {
            ingresos,
            egresos,
            notas,
            estadoFinanciero: { saldoNeto: totalIngresos - totalEgresos },
            fechaCierre: Timestamp.now(),
        };

        try {
            await setDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', periodId), statementData, { merge: true });
        } catch (error) {
            console.error(error);
        }
    };
    
    const handleItemAction = (action: 'add' | 'update' | 'delete', type: 'ingreso' | 'egreso', item?: FinancialItem) => {
        const updateState = type === 'ingreso' ? setIngresos : setEgresos;
        
        updateState(currentItems => {
            if (action === 'add' && item) return [...currentItems, item];
            if (action === 'update' && item) return currentItems.map(i => i.id === item.id ? item : i);
            if (action === 'delete' && item) return currentItems.filter(i => i.id !== item.id);
            return currentItems;
        });
        
        setEditingItem(null);
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
        if (saldoFinal >= 0) {
            docPDF.setTextColor(0, 129, 201);
        } else {
            docPDF.setTextColor(239, 68, 68);
        }
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

    const totalIngresos = ingresos.reduce((sum, item) => sum + item.monto, 0);
    const totalEgresos = egresos.reduce((sum, item) => sum + item.monto, 0);
    const saldoNeto = totalIngresos - totalEgresos;

    return (
        <div className="space-y-6">
            <header className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                    Balance <span className="text-[#0081c9]">Financiero</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Selección del Período</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button onClick={handleSyncData} className="md:col-start-4">
                        <Sync className="mr-2 h-4 w-4"/> Cargar y Sincronizar Datos
                    </Button>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EditableTable type="ingreso" title="Ingresos" items={ingresos} onAction={handleItemAction} setEditingItem={setEditingItem} />
                <EditableTable type="egreso" title="Egresos" items={egresos} onAction={handleItemAction} setEditingItem={setEditingItem} />
            </div>

            <Card>
                <CardHeader><CardTitle>Resumen y Cierre</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-4 bg-green-50 rounded-lg"><p className="text-xs font-bold uppercase text-green-700">Total Ingresos</p><p className="text-2xl font-bold text-green-700">Bs. {formatCurrency(totalIngresos)}</p></div>
                        <div className="p-4 bg-red-50 rounded-lg"><p className="text-xs font-bold uppercase text-red-700">Total Egresos</p><p className="text-2xl font-bold text-red-700">Bs. {formatCurrency(totalEgresos)}</p></div>
                        <div className="p-4 bg-blue-50 rounded-lg"><p className="text-xs font-bold uppercase text-blue-700">Saldo Neto</p><p className="text-2xl font-bold text-blue-700">Bs. {formatCurrency(saldoNeto)}</p></div>
                    </div>
                    <Textarea placeholder="Notas adicionales del período..." value={notas} onChange={e => setNotas(e.target.value)} />
                </CardContent>
                <CardFooter className="justify-end gap-2">
                    <Button onClick={handleSaveStatement} disabled={loading}>Guardar Cierre Mensual</Button>
                </CardFooter>
            </Card>

            {editingItem && (
                <ItemEditorDialog
                    item={editingItem.item}
                    type={editingItem.type}
                    isOpen={!!editingItem}
                    onClose={() => setEditingItem(null)}
                    onSave={(item) => handleItemAction('update', editingItem.type, item)}
                />
            )}
        </div>
    );
}

const EditableTable = ({ type, title, items, onAction, setEditingItem }: { type: 'ingreso' | 'egreso', title: string, items: FinancialItem[], onAction: Function, setEditingItem: Function }) => {
    const handleAddNew = () => {
        const newItem: FinancialItem = { id: `manual-${Date.now()}`, dia: format(new Date(), 'dd'), concepto: '', categoria: 'otros', monto: 0 };
        onAction('add', type, newItem);
        setEditingItem({ type, item: newItem });
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{title}</CardTitle>
                <Button size="sm" variant="outline" onClick={handleAddNew}><FilePlus className="mr-2 h-4 w-4"/> Añadir</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>Día</TableHead><TableHead>Concepto</TableHead><TableHead className="text-right">Monto</TableHead><TableHead className="w-[80px]"></TableHead></TableRow></TableHeader>
                    <TableBody>
                        {items.map((item: FinancialItem) => (
                            <TableRow key={item.id}>
                                <TableCell>{item.dia}</TableCell>
                                <TableCell>{item.concepto}</TableCell>
                                <TableCell className="text-right">{formatCurrency(item.monto)}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => setEditingItem({ type, item })}><Edit className="h-4 w-4"/></Button>
                                    <Button variant="ghost" size="icon" onClick={() => onAction('delete', type, item)}><Trash2 className="h-4 w-4 text-red-500"/></Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

const ItemEditorDialog = ({ item, type, isOpen, onClose, onSave }: { item: FinancialItem, type: 'ingreso' | 'egreso', isOpen: boolean, onClose: Function, onSave: Function }) => {
    const [currentItem, setCurrentItem] = useState(item);

    useEffect(() => {
        setCurrentItem(item);
    }, [item]);

    const handleSave = () => {
        onSave(currentItem);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={() => onClose()}>
            <DialogContent>
                <DialogHeader><DialogTitle>Editar {type === 'ingreso' ? 'Ingreso' : 'Egreso'}</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Día</Label><Input value={currentItem.dia} onChange={e => setCurrentItem({...currentItem, dia: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Concepto</Label><Input value={currentItem.concepto} onChange={e => setCurrentItem({...currentItem, concepto: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Monto (Bs.)</Label><Input type="number" value={currentItem.monto} onChange={e => setCurrentItem({...currentItem, monto: Number(e.target.value)})} /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onClose()}>Cancelar</Button>
                    <Button onClick={handleSave}>Guardar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

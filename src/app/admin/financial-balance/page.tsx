
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, MinusCircle, Loader2, FileText, FileSpreadsheet, Eye, Save, Trash2, ArrowLeft, MoreHorizontal, Megaphone, DollarSign } from 'lucide-react';
import { collection, doc, getDoc, setDoc, onSnapshot, orderBy, query, deleteDoc, Timestamp, where, getDocs, endOfMonth } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';


type FinancialItem = {
    id: string;
    dia: string;
    concepto: string;
    monto: number;
    category: 'cuotas_ordinarias' | 'cuotas_especiales' | 'fondo_reserva' | 'deposito_en_transito' | 'otros';
    date?: Timestamp;
};

type FinancialState = {
    saldoEfectivo?: number;
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

const incomeCategories = [
    { value: 'cuotas_ordinarias', label: 'Cuotas Ordinarias' },
    { value: 'cuotas_especiales', label: 'Cuotas Especiales' },
    { value: 'fondo_reserva', label: 'Fondo de Reserva' },
    { value: 'deposito_en_transito', label: 'Deposito en transito' },
    { value: 'otros', label: 'Otros Ingresos' },
];

const initialItem: FinancialItem = { id: Date.now().toString(), dia: '', concepto: '', monto: 0, category: 'cuotas_ordinarias' };
const initialFinancialState: FinancialState = { saldoEfectivo: 0 };

const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: format(new Date(2000, i), 'MMMM', { locale: es }) }));
const years = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + 1 - i));

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    // Use rounding to the nearest cent to fix floating point issues
    const roundedNum = Math.round(num * 100) / 100;
    return roundedNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export default function FinancialBalancePage() {
    const { toast } = useToast();
    const [view, setView] = useState<'list' | 'form'>('list');
    const [isEditing, setIsEditing] = useState(false);
    
    // Form State
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
    
    // Automatic Fields
    const [editablePreviousMonthBalance, setEditablePreviousMonthBalance] = useState(0);
    const [currentMonthPayments, setCurrentMonthPayments] = useState(0);
    const [editableCurrentMonthPayments, setEditableCurrentMonthPayments] = useState(0);
    const [loadingPeriodData, setLoadingPeriodData] = useState(false);

    // Manual Fields
    const [manualIngresos, setManualIngresos] = useState<FinancialItem[]>([initialItem]);
    const [allExpenses, setAllExpenses] = useState<FinancialItem[]>([]);
    const [estadoFinanciero, setEstadoFinanciero] = useState<FinancialState>(initialFinancialState);
    const [notas, setNotas] = useState('');
    
    const [statements, setStatements] = useState<FinancialStatement[]>([]);
    const [currentStatement, setCurrentStatement] = useState<FinancialStatement | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [loading, setLoading] = useState(true);

    const [allPettyCash, setAllPettyCash] = useState<any[]>([]);
    const [activeRate, setActiveRate] = useState(0);

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
                const settings = docSnap.data();
                setCompanyInfo(settings.companyInfo as CompanyInfo);
                const rates = (settings.exchangeRates || []);
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) {
                    setActiveRate(activeRateObj.rate);
                } else if (rates.length > 0) {
                    const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setActiveRate(sortedRates[0].rate);
                }
            }
        };
        fetchCompanyInfo();

        const expensesQuery = query(collection(db, "expenses"), orderBy("date", "desc"));
        const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
            const expensesData = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    dia: data.date ? format(data.date.toDate(), 'dd') : '',
                    concepto: data.description,
                    monto: data.amount,
                    category: data.category,
                    date: data.date
                } as FinancialItem;
            });
            setAllExpenses(expensesData);
        });

        const pettyCashQuery = query(collection(db, "petty_cash_replenishments"), orderBy("date", "desc"));
        const unsubscribePettyCash = onSnapshot(pettyCashQuery, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllPettyCash(data);
        });


        return () => {
            unsubscribe();
            unsubscribeExpenses();
            unsubscribePettyCash();
        }
    }, []);

    useEffect(() => {
        if (isEditing) return;
    
        const fetchPeriodData = async () => {
            if (!selectedMonth || !selectedYear) return;
            setLoadingPeriodData(true);
    
            // Set previous balance to 0, making it a manual field.
            setEditablePreviousMonthBalance(0);
    
            const year = parseInt(selectedYear);
            const month = parseInt(selectedMonth);
    
            try {
                // Fetch Current Month's Payments
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 0, 23, 59, 59);
    
                const paymentsQuery = query(
                    collection(db, "payments"),
                    where("status", "==", "aprobado"),
                    where("paymentDate", ">=", Timestamp.fromDate(startDate)),
                    where("paymentDate", "<=", Timestamp.fromDate(endDate))
                );
    
                const paymentsSnap = await getDocs(paymentsQuery);
                const totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
                setCurrentMonthPayments(totalPayments);
                setEditableCurrentMonthPayments(totalPayments);
            } catch (error) {
                console.error("Error fetching period data:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos automáticos para el período.' });
            } finally {
                setLoadingPeriodData(false);
            }
        };
    
        if (!loading) {
            fetchPeriodData();
        }
    }, [selectedMonth, selectedYear, isEditing, loading, toast]);


    const egresos = useMemo(() => {
        if (!selectedMonth || !selectedYear) return [];
        const month = parseInt(selectedMonth);
        const year = parseInt(selectedYear);

        return allExpenses.filter(expense => {
            if (!expense.date) return false;
            const expenseDate = expense.date.toDate();
            return expenseDate.getMonth() + 1 === month && expenseDate.getFullYear() === year;
        });
    }, [allExpenses, selectedMonth, selectedYear]);

    const totals = useMemo(() => {
        const totalManualIngresos = manualIngresos.reduce((sum, item) => sum + Number(item.monto), 0);
        const totalIngresos = editablePreviousMonthBalance + editableCurrentMonthPayments + totalManualIngresos;
        const totalEgresos = egresos.reduce((sum, item) => sum + Number(item.monto), 0);
        const saldoNetoBanco = totalIngresos - totalEgresos;

        const endOfMonthDate = new Date(Number(selectedYear), Number(selectedMonth), 0, 23, 59, 59);

        // Sum all replenishment amounts from the petty cash module itself, up to the end of the period.
        const totalReplenished = allPettyCash
            .filter(rep => rep.date.toDate() <= endOfMonthDate)
            .reduce((sum, rep) => sum + rep.amount, 0);

        // Sum all expenses made from the petty cash replenishments, up to the end of the period.
        const totalPettyCashExpenses = allPettyCash
            .flatMap(rep => rep.expenses)
            .filter(exp => exp.date.toDate() <= endOfMonthDate)
            .reduce((sum, exp) => sum + exp.amount, 0);

        const saldoCajaChica = totalReplenished - totalPettyCashExpenses;
        
        const saldoEfectivoNum = Number(estadoFinanciero?.saldoEfectivo) || 0;
        
        const totalLiquidez = saldoNetoBanco + saldoCajaChica + saldoEfectivoNum;

        const usdEquivalent = activeRate > 0 ? totalLiquidez / activeRate : 0;

        return { totalIngresos, totalEgresos, saldoNetoBanco, saldoCajaChica, totalLiquidez, usdEquivalent };
    }, [manualIngresos, editablePreviousMonthBalance, editableCurrentMonthPayments, egresos, allPettyCash, selectedYear, selectedMonth, estadoFinanciero, activeRate]);


    const resetForm = () => {
        setIsEditing(false);
        setCurrentStatement(null);
        setSelectedMonth(String(new Date().getMonth() + 1).padStart(2, '0'));
        setSelectedYear(String(new Date().getFullYear()));
        setManualIngresos([{ ...initialItem, id: Date.now().toString() }]);
        setEstadoFinanciero(initialFinancialState);
        setNotas('');
        setEditablePreviousMonthBalance(0);
        setCurrentMonthPayments(0);
        setEditableCurrentMonthPayments(0);
    };

    const handleNewStatement = () => {
        resetForm();
        setView('form');
    };

    const handleViewStatement = (statement: FinancialStatement) => {
        setView('form');
        setIsEditing(true);
        setCurrentStatement(statement);
    
        setSelectedYear(statement.id.split('-')[0]);
        setSelectedMonth(statement.id.split('-')[1]);
        
        const saldoAnteriorItem = statement.ingresos.find(i => i.concepto === 'Saldo en Banco Mes Anterior');
        const pagosMesItem = statement.ingresos.find(i => i.concepto === 'Ingresos Ordinarios del Mes');
        const manualItems = statement.ingresos.filter(i => 
            i.concepto !== 'Saldo en Banco Mes Anterior' && i.concepto !== 'Ingresos Ordinarios del Mes'
        );
    
        setEditablePreviousMonthBalance(saldoAnteriorItem?.monto || 0);
        setEditableCurrentMonthPayments(pagosMesItem?.monto || 0);
        setManualIngresos(manualItems.length > 0 ? manualItems.map(i => ({...i, id: Math.random().toString(), dia: i.dia || '', category: i.category || 'cuotas_ordinarias' })) : [initialItem]);
        
        setEstadoFinanciero({ saldoEfectivo: statement.estadoFinanciero?.saldoEfectivo || 0 });
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
                sourceId: statement.id,
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

    const handleDeletePublication = async (statementId: string) => {
        if (window.confirm('¿Está seguro de que desea ELIMINAR LA PUBLICACIÓN de este balance? Los propietarios ya no podrán verlo, pero el balance guardado no se eliminará.')) {
            try {
                const reportRef = doc(db, 'published_reports', `balance-${statementId}`);
                await deleteDoc(reportRef);
                toast({ title: 'Publicación Eliminada', description: 'El balance ya no es visible para los propietarios.' });
            } catch (error) {
                console.error('Error deleting publication:', error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la publicación del balance.' });
            }
        }
    };

    const handleSaveStatement = async () => {
        const statementId = `${selectedYear}-${selectedMonth}`;
        
        const finalManualIngresos = manualIngresos
            .filter(i => i.concepto && Number(i.monto) > 0)
            .map(i => ({...i, monto: Number(i.monto), dia: i.dia || '', category: i.category || 'cuotas_ordinarias'}));
            
        const fullIngresos: FinancialItem[] = [
            {
                id: 'saldo-anterior',
                dia: '01',
                concepto: 'Saldo en Banco Mes Anterior',
                monto: editablePreviousMonthBalance,
                category: 'otros'
            },
            {
                id: 'pagos-mes',
                dia: 'Varios',
                concepto: 'Ingresos Ordinarios del Mes',
                monto: editableCurrentMonthPayments,
                category: 'cuotas_ordinarias'
            },
            ...finalManualIngresos
        ];

        if (fullIngresos.length === 0) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe haber al menos un ingreso.' });
            return;
        }

        const data: Omit<FinancialStatement, 'id'> & { estadoFinanciero: any } = {
            ingresos: fullIngresos,
            egresos: egresos,
            estadoFinanciero: {
                saldoNeto: totals.saldoNetoBanco,
                saldoEfectivo: Number(estadoFinanciero.saldoEfectivo) || 0,
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
        const { default: QRCode } = await import('qrcode');
        const qrCodeUrl = await QRCode.toDataURL(`${window.location.origin}/balance/${statement.id}`, { errorCorrectionLevel: 'M', margin: 2, scale: 4 });
        
        const totalIngresos = statement.ingresos.reduce((sum, item) => sum + item.monto, 0);
        const totalEgresos = statement.egresos.reduce((sum, item) => sum + item.monto, 0);
        const saldoNetoBanco = totalIngresos - totalEgresos;

        const endOfMonthDate = new Date(Number(statement.id.split('-')[0]), Number(statement.id.split('-')[1]), 0, 23, 59, 59);

        const relevantReplenishments = allPettyCash.filter(rep => rep.date.toDate() <= endOfMonthDate);
        const totalReplenished = relevantReplenishments.reduce((sum, rep) => sum + rep.amount, 0);
        const totalPettyCashExpenses = relevantReplenishments.flatMap(rep => rep.expenses).filter(exp => exp.date.toDate() <= endOfMonthDate).reduce((sum, exp) => sum + exp.amount, 0);
        const saldoCajaChica = totalReplenished - totalPettyCashExpenses;
        const saldoEfectivo = statement.estadoFinanciero?.saldoEfectivo || 0;
        const totalLiquidez = saldoNetoBanco + saldoCajaChica + saldoEfectivo;
        const usdEquivalent = activeRate > 0 ? totalLiquidez / activeRate : 0;


        const monthLabel = months.find(m => m.value === statement.id.split('-')[1])?.label;
        const yearLabel = statement.id.split('-')[0];
        const period = `${monthLabel} ${yearLabel}`;

        if (formatType === 'pdf') {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;
            
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
            doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo?.name || '', margin + 30, margin + 8);
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(companyInfo?.rif || '', margin + 30, margin + 14);
            doc.text(companyInfo?.address || '', margin + 30, margin + 19);
            doc.text(`Teléfono: ${companyInfo?.phone || ''}`, margin + 30, margin + 24);

            doc.text(`Emitido: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
            
            doc.setFontSize(16).setFont('helvetica', 'bold').text('Balance Financiero', pageWidth / 2, margin + 52, { align: 'center'});
            doc.setFontSize(12).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, margin + 59, { align: 'center'});
            
            if (qrCodeUrl) {
                const qrSize = 30;
                doc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - qrSize, margin + 50, qrSize, qrSize);
            }

            let startY = margin + 85;
            
            autoTable(doc, {
                head: [['DÍA', 'INGRESOS', 'CATEGORÍA', 'MONTO (Bs.)']],
                body: statement.ingresos.map(i => [i.dia || '', i.concepto, incomeCategories.find(c=>c.value === i.category)?.label || i.category, { content: formatToTwoDecimals(i.monto), styles: { halign: 'right' } }]),
                foot: [[{ content: '', colSpan: 2, styles: { halign: 'right' } }, { content: 'TOTAL INGRESOS', styles: { halign: 'right' } }, { content: formatToTwoDecimals(totalIngresos), styles: { halign: 'right' } }]],
                startY: startY, theme: 'striped', headStyles: { fillColor: [22, 163, 74], halign: 'center' }, footStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
            });
            startY = (doc as any).lastAutoTable.finalY + 10;
            
            autoTable(doc, {
                head: [['DÍA', 'EGRESOS', 'CATEGORÍA', 'MONTO (Bs.)']],
                body: statement.egresos.map(e => [e.dia || '', e.concepto, e.category || 'N/A', { content: formatToTwoDecimals(e.monto), styles: { halign: 'right' } }]),
                foot: [[{ content: '', colSpan: 2, styles: { halign: 'right' } }, { content: 'TOTAL EGRESOS', styles: { halign: 'right' } }, { content: formatToTwoDecimals(totalEgresos), styles: { halign: 'right' } }]],
                startY: startY, theme: 'striped', headStyles: { fillColor: [220, 53, 69], halign: 'center' }, footStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold' },
            });
            startY = (doc as any).lastAutoTable.finalY + 10;
            
            doc.setFontSize(11).setFont('helvetica', 'bold').text('Resumen de Egresos por Categoría', margin, startY);
            startY += 6;
            const egresosPorCategoria = statement.egresos.reduce((acc: Record<string, number>, egreso: FinancialItem) => {
                const category = egreso.category || 'Otros';
                acc[category] = (acc[category] || 0) + egreso.monto;
                return acc;
            }, {});
            autoTable(doc, { startY, head: [['Categoría', 'Monto Total (Bs.)']], body: Object.entries(egresosPorCategoria).map(([categoria, monto]) => [categoria, { content: formatToTwoDecimals(monto), styles: { halign: 'right' }}]), theme: 'grid', headStyles: { fillColor: [110, 110, 110] }, });
            startY = (doc as any).lastAutoTable.finalY + 10;

            doc.setFontSize(11).setFont('helvetica', 'bold').text('Notas:', margin, startY);
            startY += 6;
            doc.setFontSize(10).setFont('helvetica', 'normal').text(statement.notas, margin, startY, { maxWidth: 180 });
            startY = doc.getTextDimensions(statement.notas, {maxWidth: 180}).h + startY + 10;

            const summaryData = [
                ['Saldo del Mes en Banco:', `Bs. ${formatToTwoDecimals(saldoNetoBanco)}`],
                ['Saldo en Caja Chica:', `Bs. ${formatToTwoDecimals(saldoCajaChica)}`],
                ['Saldo en Efectivo:', `Bs. ${formatToTwoDecimals(saldoEfectivo)}`],
            ];
             autoTable(doc, { startY: startY, body: summaryData, theme: 'plain', styles: { fontSize: 10, cellPadding: 1 } });
             startY = (doc as any).lastAutoTable.finalY;

            doc.setFontSize(12).setFont('helvetica', 'bold');
            const totalEfectivoY = startY + 8;
            doc.setFillColor(232, 255, 236); // Light green background
            doc.rect(margin, totalEfectivoY - 5, pageWidth - margin * 2, 10, 'F');
            doc.setTextColor(34, 139, 34); // Forest green text
            doc.text('TOTAL LIQUIDEZ', margin + 2, totalEfectivoY);
            doc.text(`Bs. ${formatToTwoDecimals(totalLiquidez)}`, pageWidth - margin - 2, totalEfectivoY, { align: 'right' });

            const usdText = `(aprox. $${formatToTwoDecimals(usdEquivalent)} @ ${activeRate.toFixed(2)} Bs/$)`;
            doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(100,100,100);
            doc.text(usdText, pageWidth-margin-2, totalEfectivoY + 5, {align: 'right'})


            doc.save(`Balance_Financiero_${statement.id}.pdf`);

        } else { // Excel
            const { default: ExcelJS } = await import('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet(`Balance ${statement.id}`);

            worksheet.addRow(['BALANCE FINANCIERO', period]);
            worksheet.addRow([]);
            worksheet.addRow(['DÍA', 'INGRESOS', 'CATEGORIA', 'MONTO']);
            statement.ingresos.forEach(i => worksheet.addRow([i.dia || '', i.concepto, incomeCategories.find(c=>c.value === i.category)?.label || i.category, i.monto]));
            worksheet.addRow(['', '', 'TOTAL INGRESOS', totalIngresos]);
            worksheet.addRow([]);
            worksheet.addRow(['DÍA', 'EGRESOS', 'CATEGORIA', 'MONTO']);
            statement.egresos.forEach(e => worksheet.addRow([e.dia || '', e.concepto, e.category, e.monto]));
            worksheet.addRow(['', '', 'TOTAL EGRESOS', totalEgresos]);
            worksheet.addRow([]);
            worksheet.addRow(['', 'Saldo Neto en Banco', saldoNetoBanco]);
            worksheet.addRow(['', 'Saldo en Caja Chica', saldoCajaChica]);
            worksheet.addRow(['', 'Saldo en Efectivo', saldoEfectivo]);
            worksheet.addRow(['', 'TOTAL LIQUIDEZ', totalLiquidez]);
            worksheet.addRow(['', 'Equivalente USD (aprox)', usdEquivalent]);
            worksheet.addRow([]);
            worksheet.addRow(['Notas', statement.notas]);
            
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Balance_Financiero_${statement.id}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
        }
    };


    const createItemManager = (items: FinancialItem[], setItems: React.Dispatch<React.SetStateAction<FinancialItem[]>>) => ({
        addItem: () => setItems([...items, { ...initialItem, id: Date.now().toString() }]),
        removeItem: (id: string) => { if (items.length > 1) setItems(items.filter(item => item.id !== id)) },
        updateItem: (id: string, field: 'dia' | 'concepto' | 'monto' | 'category', value: string) => {
            const isMonto = field === 'monto';
            setItems(items.map(item => item.id === id ? { ...item, [field]: isMonto ? Number(value) : value } : item));
        }
    });

    const manualIngresosManager = createItemManager(manualIngresos, setManualIngresos);

    const renderManualFinancialItemsTable = (title: string, items: FinancialItem[], manager: any, total: number) => (
        <Card>
            <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">Día</TableHead>
                            <TableHead>Concepto</TableHead>
                             <TableHead className="w-[180px]">Categoría</TableHead>
                            <TableHead className="w-[150px] text-right">Monto (Bs.)</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell><Input value={item.dia} onChange={e => manager.updateItem(item.id, 'dia', e.target.value)} placeholder="Ej: 15" /></TableCell>
                                <TableCell><Input value={item.concepto} onChange={e => manager.updateItem(item.id, 'concepto', e.target.value)} placeholder="Ej: Cuotas ordinarias" /></TableCell>
                                <TableCell>
                                    <Select value={item.category} onValueChange={v => manager.updateItem(item.id, 'category', v)}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{incomeCategories.map(cat => <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </TableCell>
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
                
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Balance Financiero</h1>
                        <p className="text-muted-foreground">Consulta o crea los balances financieros mensuales.</p>
                    </div>
                    <Button onClick={handleNewStatement}><PlusCircle className="mr-2 h-4 w-4"/> Nuevo Balance</Button>
                </div>
                <Card>
                    <CardHeader className="bg-primary text-primary-foreground rounded-t-2xl"><CardTitle>Balances Guardados</CardTitle></CardHeader>
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
                                                        <DropdownMenuItem onClick={() => handleDeletePublication(s.id)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Eliminar Publicación</DropdownMenuItem>
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
                <CardHeader className="bg-primary text-primary-foreground rounded-t-2xl">
                    <CardTitle>{isEditing ? 'Editando' : 'Creando'} Balance Financiero</CardTitle>
                    <CardDescription className="text-primary-foreground/90">Selecciona el período y completa los campos.</CardDescription>
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
                 <Card>
                    <CardHeader><CardTitle>Ingresos</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {loadingPeriodData && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Cargando datos automáticos...</span></div>}
                        <div className="p-4 border rounded-md bg-muted/30">
                            <Label>Saldo en Banco (Mes Anterior)</Label>
                            <Input 
                                type="number"
                                value={editablePreviousMonthBalance}
                                onChange={e => setEditablePreviousMonthBalance(Number(e.target.value))}
                                placeholder="0.00"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Este monto es manual. Ingrese el saldo final del mes anterior.</p>
                        </div>
                        <div className="p-4 border rounded-md bg-muted/30">
                            <Label>Ingresos Ordinarios del Mes</Label>
                            <Input
                                type="number"
                                value={editableCurrentMonthPayments}
                                onChange={(e) => setEditableCurrentMonthPayments(Number(e.target.value))}
                                placeholder="0.00"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Suma de todos los pagos aprobados en el período. Puedes ajustarlo si es necesario.</p>
                        </div>
                        
                        <Separator className="my-6"/>
                        
                        <h4 className="font-semibold">Otros Ingresos (Manual)</h4>
                        {renderManualFinancialItemsTable("", manualIngresos, manualIngresosManager, totals.totalIngresos)}

                    </CardContent>
                    <CardFooter className="justify-end bg-muted/50 p-4">
                        <p className="font-bold">Total Ingresos: Bs. {formatToTwoDecimals(totals.totalIngresos)}</p>
                    </CardFooter>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Egresos (Automático)</CardTitle>
                        <CardDescription>Estos son los gastos registrados para el período seleccionado. Se gestionan desde la página de "Gestión de Egresos".</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Día</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead>Categoría</TableHead>
                                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {egresos.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay egresos registrados para este período.</TableCell></TableRow>
                                ) : (
                                    egresos.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.dia}</TableCell>
                                            <TableCell>{item.concepto}</TableCell>
                                            <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                                            <TableCell className="text-right">{formatToTwoDecimals(item.monto)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                    <CardFooter className="justify-end bg-muted/50 p-4">
                        <p className="font-bold">Total Egresos: Bs. {formatToTwoDecimals(totals.totalEgresos)}</p>
                    </CardFooter>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Resumen y Estado Financiero</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-muted/50 rounded-lg">
                        <div className="space-y-1 border-b pb-4">
                            <p className="text-sm text-muted-foreground">Total Ingresos</p>
                            <p className="text-xl font-bold text-green-500 text-right">Bs. {formatToTwoDecimals(totals.totalIngresos)}</p>
                        </div>
                         <div className="space-y-1 border-b pb-4">
                            <p className="text-sm text-muted-foreground">Total Egresos</p>
                            <p className="text-xl font-bold text-destructive text-right">Bs. {formatToTwoDecimals(totals.totalEgresos)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Saldo Neto en Banco (Ingresos - Egresos)</p>
                            <p className="text-lg font-semibold text-right">Bs. {formatToTwoDecimals(totals.saldoNetoBanco)}</p>
                        </div>
                         <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Saldo Actual en Caja Chica</p>
                            <p className="text-lg font-semibold text-right">Bs. {formatToTwoDecimals(totals.saldoCajaChica)}</p>
                        </div>
                         <div className="space-y-2 col-span-2">
                            <Label htmlFor="saldoEfectivo">Saldo en Efectivo (Reporte Manual)</Label>
                            <Input id="saldoEfectivo" type="number" value={estadoFinanciero.saldoEfectivo || ''} onChange={e => setEstadoFinanciero({...estadoFinanciero, saldoEfectivo: Number(e.target.value)})} placeholder="0.00" className="max-w-xs" />
                        </div>
                        <div className="md:col-span-2 space-y-1 border-t-2 border-primary pt-4 mt-4">
                            <Label className="text-lg font-bold">TOTAL LIQUIDEZ</Label>
                            <div className="p-2 bg-primary/10 rounded-md">
                                <p className="text-3xl font-bold text-center text-primary">
                                    Bs. {formatToTwoDecimals(totals.totalLiquidez)}
                                </p>
                            </div>
                        </div>
                        <div className="md:col-span-2 space-y-1">
                            <Label className="text-md font-semibold text-muted-foreground">TOTAL EN USD (APROX.)</Label>
                            <div className="p-2 rounded-md flex items-center justify-center gap-2">
                                <DollarSign className="h-6 w-6 text-muted-foreground"/>
                                <p className="text-2xl font-bold text-center text-muted-foreground">
                                    {formatToTwoDecimals(totals.usdEquivalent)}
                                </p>
                            </div>
                            <p className="text-xs text-center text-muted-foreground">Tasa de cambio aplicada: Bs. {formatToTwoDecimals(activeRate)}</p>
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

    
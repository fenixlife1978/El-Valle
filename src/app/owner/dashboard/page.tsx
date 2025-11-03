

'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Megaphone, Loader2, Wallet, FileText, CalendarClock, Scale, Calculator, Minus, Equal, ShieldCheck, BookOpen, Clock, Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import { format, isBefore, startOfMonth, addMonths, isEqual, getYear, getMonth, endOfMonth, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import { useAuth } from '@/hooks/use-auth';


type Payment = {
    id: string;
    date: string;
    totalAmount: number; // Corrected from amount
    bank: string;
    type: string;
    reference: string;
    status: 'aprobado' | 'pendiente' | 'rechazado';
    reportedAt: any;
    exchangeRate: number;
    paymentDate: Timestamp;
    beneficiaries: { ownerId: string, ownerName: string, house?: string, street?: string, amount: number }[];
};

type UserData = {
    id: string;
    unit: string;
    name: string;
    balance: number;
    properties: { street: string, house: string }[];
};

type Debt = {
    id: string;
    ownerId: string;
    property: { street: string; house: string; };
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
    paidAmountUSD?: number;
    paymentDate?: Timestamp;
    paymentId?: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type ReceiptData = {
    payment: Payment;
    ownerName: string;
    ownerUnit: string;
    paidDebts: Debt[];
    receiptNumber: string;
} | null;

type HistoricalPayment = {
    ownerId: string;
    referenceMonth: number;
    referenceYear: number;
};


type SolvencyStatus = 'solvente' | 'moroso' | 'cargando...';

const statusVariantMap: { [key in SolvencyStatus]: 'success' | 'destructive' | 'outline' } = {
  'solvente': 'success',
  'moroso': 'destructive',
  'cargando...': 'outline',
};

const monthsLocale: { [key in number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type PublishedReport = {
    id: string; 
    type: 'balance' | 'integral';
    createdAt: string;
};

export default function OwnerDashboardPage() {
    const router = useRouter();
    const { user, ownerData, loading: authLoading, toast } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [allDebts, setAllDebts] = useState<Debt[]>([]);
    const [allHistoricalPayments, setAllHistoricalPayments] = useState<HistoricalPayment[]>([]);
    const [dashboardStats, setDashboardStats] = useState({
        balanceInFavor: 0,
        totalDebtUSD: 0,
        exchangeRate: 0,
    });
    const [solvencyStatus, setSolvencyStatus] = useState<SolvencyStatus>('cargando...');
    const [solvencyPeriod, setSolvencyPeriod] = useState('');
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    
    const [latestIntegralReport, setLatestIntegralReport] = useState<PublishedReport | null>(null);
    const [latestFinancialBalance, setLatestFinancialBalance] = useState<PublishedReport | null>(null);

    const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

    useEffect(() => {
        if (authLoading || !user || !ownerData) return;
        const userId = user.uid;

        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            let activeRate = 0;
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCompanyInfo(settings.companyInfo || null);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) {
                    activeRate = activeRateObj.rate;
                } else if (rates.length > 0) {
                    const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    activeRate = sortedRates[0].rate;
                }
            }
             setDashboardStats(prev => ({ ...prev, exchangeRate: activeRate }));
        });

        setDashboardStats(prev => ({ ...prev, balanceInFavor: ownerData.balance || 0 }));
        
        const debtsQuery = query(collection(db, "debts"), where("ownerId", "==", userId));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (debtsSnapshot) => {
            const debtsData: Debt[] = [];
            debtsSnapshot.forEach(d => debtsData.push({ id: d.id, ...d.data() } as Debt));
            setAllDebts(debtsData);
        });

        const historicalPaymentsQuery = query(collection(db, "historical_payments"), where("ownerId", "==", userId));
        const historicalPaymentsUnsubscribe = onSnapshot(historicalPaymentsQuery, (snapshot) => {
            const historicalData: HistoricalPayment[] = [];
            snapshot.forEach(d => historicalData.push(d.data() as HistoricalPayment));
            setAllHistoricalPayments(historicalData);
        });
        
        const paymentsQuery = query(collection(db, "payments"), where("beneficiaryIds", "array-contains", userId), limit(10));
        const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
            const paymentsData: Payment[] = [];
            snapshot.forEach((doc) => {
                paymentsData.push({ id: doc.id, ...doc.data() } as Payment);
            });
            // Sort client-side
            const sortedPayments = paymentsData.sort((a,b) => b.paymentDate.toMillis() - a.paymentDate.toMillis()).slice(0, 3);
            setPayments(sortedPayments);
        }, (error) => {
            console.error("Error fetching payments: ", error);
        });

         const reportsQuery = query(collection(db, "published_reports"), orderBy('createdAt', 'desc'));
         const reportsUnsubscribe = onSnapshot(reportsQuery, (snapshot) => {
             const reports = snapshot.docs.map(doc => ({...doc.data(), id: doc.id } as PublishedReport));
             const latestIntegral = reports.find(r => r.type === 'integral');
             const latestBalance = reports.find(r => r.type === 'balance');
             setLatestIntegralReport(latestIntegral || null);
             setLatestFinancialBalance(latestBalance || null);
         });

        setLoading(false);
    
        return () => {
            settingsUnsubscribe();
            paymentsUnsubscribe();
            debtsUnsubscribe();
            historicalPaymentsUnsubscribe();
            reportsUnsubscribe();
        };
    
    }, [authLoading, user, ownerData]);

    useEffect(() => {
        if (loading || !ownerData) return;
    
        const ownerDebts = allDebts;
        const ownerHistoricalPayments = allHistoricalPayments;
    
        const allOwnerPeriods = [
            ...ownerDebts.map(d => ({ year: d.year, month: d.month })),
            ...ownerHistoricalPayments.map(p => ({ year: p.referenceYear, month: p.referenceMonth }))
        ];
    
        let firstMonthEver: Date | null = null;
        if (allOwnerPeriods.length > 0) {
            const oldestPeriod = allOwnerPeriods.sort((a, b) => a.year - b.year || a.month - b.month)[0];
            firstMonthEver = startOfMonth(new Date(oldestPeriod.year, oldestPeriod.month - 1));
        }
    
        let lastConsecutivePaidMonth: Date | null = null;
        
        if (firstMonthEver) {
            let currentCheckMonth = firstMonthEver;
            const limitDate = endOfMonth(addMonths(new Date(), 120)); // Look up to 10 years in the future
    
            while (isBefore(currentCheckMonth, limitDate)) {
                const year = getYear(currentCheckMonth);
                const month = getMonth(currentCheckMonth) + 1;
                
                const isInHistorical = ownerHistoricalPayments.some(p => p.referenceYear === year && p.referenceMonth === month);
                let isMonthFullyPaid = false;
    
                if (isInHistorical) {
                    isMonthFullyPaid = true;
                } else {
                    const debtsForMonth = ownerDebts.filter(d => d.year === year && d.month === month);
                    if (debtsForMonth.length > 0) {
                        const mainDebt = debtsForMonth.find(d => d.description.toLowerCase().includes('condominio'));
                        if (mainDebt?.status === 'paid') {
                            isMonthFullyPaid = true;
                        }
                    }
                }
    
                if (isMonthFullyPaid) {
                    lastConsecutivePaidMonth = currentCheckMonth;
                } else {
                    break; // Stop at the first unpaid month
                }
                currentCheckMonth = addMonths(currentCheckMonth, 1);
            }
        }
        
        const today = new Date();
        const hasAnyPendingMainDebt = ownerDebts.some(d => {
            const isMainDebt = d.description.toLowerCase().includes('condominio');
            if (!isMainDebt) return false;
            
            const debtDate = startOfMonth(new Date(d.year, d.month - 1));
            // An adjustment debt is only considered pending if its month has come
            const isAdjustmentDebt = d.description.toLowerCase().includes('ajuste');
            if (isAdjustmentDebt && isBefore(today, debtDate)) {
                return false;
            }
            return d.status === 'pending';
        });
    
        if (hasAnyPendingMainDebt) {
            setSolvencyStatus('moroso');
            let firstUnpaidMonth: Date | null = null;
            if (lastConsecutivePaidMonth) {
                firstUnpaidMonth = addMonths(lastConsecutivePaidMonth, 1);
            } else if (firstMonthEver) {
                firstUnpaidMonth = firstMonthEver;
            }
    
            if (firstUnpaidMonth) {
                setSolvencyPeriod(`Desde ${format(firstUnpaidMonth, 'MMMM yyyy', { locale: es })}`);
            } else {
                setSolvencyPeriod(`Desde ${format(new Date(), 'MMMM yyyy', { locale: es })}`);
            }
    
        } else {
            setSolvencyStatus('solvente');
            if (lastConsecutivePaidMonth) {
                setSolvencyPeriod(`Hasta ${format(lastConsecutivePaidMonth, 'MMMM yyyy', { locale: es })}`);
            } else {
                setSolvencyPeriod('Al día');
            }
        }
    
        const totalDebtUSD = ownerDebts.filter(d => d.status === 'pending').reduce((sum, d) => sum + d.amountUSD, 0);
        setDashboardStats(prev => ({ ...prev, totalDebtUSD }));
        
    }, [allDebts, allHistoricalPayments, loading, ownerData]);

    const pendingDebts = useMemo(() => {
         return allDebts
            .filter(d => d.status === 'pending')
            .sort((a, b) => b.year - b.year || b.month - b.month);
    }, [allDebts]);

    const handleDebtSelection = (debtId: string) => {
        setSelectedDebts(prev => 
            prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]
        );
    };

    const paymentCalculator = useMemo(() => {
        const totalSelectedDebtUSD = pendingDebts
            .filter(debt => selectedDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
            
        const totalSelectedDebtBs = totalSelectedDebtUSD * dashboardStats.exchangeRate;
        const totalToPay = Math.max(0, totalSelectedDebtBs - dashboardStats.balanceInFavor);

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: dashboardStats.balanceInFavor,
            totalToPay: totalToPay,
            hasSelection: selectedDebts.length > 0,
        };
    }, [selectedDebts, pendingDebts, dashboardStats]);

    const openReceiptPreview = async (payment: Payment) => {
      if (!ownerData || !companyInfo) return;

      try {
        const ownerName = ownerData.name;
        const ownerUnit = (ownerData.properties && ownerData.properties.length > 0) 
            ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` 
            : 'N/A';

        const paidDebtsQuery = query(collection(db, "debts"), where("paymentId", "==", payment.id));
        const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
        const paidDebts = paidDebtsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Debt).sort((a, b) => a.year - b.year || a.month - b.month);
        
        const receiptNumber = payment.beneficiaries.find(b => b.ownerId === user?.uid)?.receiptNumber || payment.id.substring(0, 10);
        
        setReceiptData({
          payment,
          ownerName,
          ownerUnit,
          paidDebts,
          receiptNumber,
        });
        setIsReceiptPreviewOpen(true);
      } catch (error) {
        console.error("Error preparing receipt data:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo preparar la vista previa del recibo.' });
      }
    };
    
    const generateAndAct = async (action: 'download' | 'share', data: ReceiptData) => {
      if (!data || !companyInfo) return;

      const { payment, ownerName, ownerUnit, paidDebts, receiptNumber } = data;

      const pdfDoc = new jsPDF();
      const pageWidth = pdfDoc.internal.pageSize.getWidth();
      const margin = 14;

      if (companyInfo.logo) {
          try { pdfDoc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
          catch (e) { console.error("Error adding image to PDF: ", e)}
      }
      pdfDoc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
      pdfDoc.setFontSize(9).setFont('helvetica', 'normal');
      pdfDoc.text(companyInfo.rif, margin + 30, margin + 14);
      pdfDoc.text(companyInfo.address, margin + 30, margin + 19);
      pdfDoc.text(`Teléfono: ${companyInfo.phone}`, margin + 30, margin + 24);
      pdfDoc.setFontSize(10).text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
      pdfDoc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);
      pdfDoc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
      pdfDoc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${receiptNumber}`, pageWidth - margin, margin + 50, { align: 'right' });

      let startY = margin + 60;
      pdfDoc.setFontSize(10).text(`Nombre del Beneficiario: ${ownerName}`, margin, startY);
      startY += 6;
      pdfDoc.text(`Unidad: ${ownerUnit}`, margin, startY);
      startY += 6;
      pdfDoc.text(`Método de pago: ${payment.type}`, margin, startY);
      startY += 6;
      pdfDoc.text(`Banco Emisor: ${payment.bank}`, margin, startY);
      startY += 6;
      pdfDoc.text(`N° de Referencia Bancaria: ${payment.reference}`, margin, startY);
      startY += 6;
      pdfDoc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, startY);
      startY += 6;
      pdfDoc.text(`Tasa de Cambio Aplicada: Bs. ${formatToTwoDecimals(payment.exchangeRate)} por USD`, margin, startY);
      startY += 10;
      
      let totalPaidInConcepts = 0;
      const tableBody = paidDebts.map(debt => {
          const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
          totalPaidInConcepts += debtAmountBs;
          const propertyLabel = debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A';
          const periodLabel = `${monthsLocale[debt.month]} ${debt.year}`;
          const concept = `${debt.description} (${propertyLabel})`;
          return [ periodLabel, concept, `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`, `Bs. ${formatToTwoDecimals(debtAmountBs)}` ];
      });

      if (paidDebts.length > 0) {
          (pdfDoc as any).autoTable({ startY: startY, head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']], body: tableBody, theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
          startY = (pdfDoc as any).lastAutoTable.finalY + 8;
      } else {
          totalPaidInConcepts = payment.totalAmount;
          (pdfDoc as any).autoTable({ startY: startY, head: [['Concepto', 'Monto Pagado (Bs)']], body: [['Abono a Saldo a Favor', `Bs. ${formatToTwoDecimals(payment.totalAmount)}`]], theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
          startY = (pdfDoc as any).lastAutoTable.finalY + 8;
      }
      
      const totalLabel = "TOTAL PAGADO:";
      const totalValue = `Bs. ${formatToTwoDecimals(totalPaidInConcepts)}`;
      pdfDoc.setFontSize(11).setFont('helvetica', 'bold');
      const totalValueWidth = pdfDoc.getStringUnitWidth(totalValue) * 11 / pdfDoc.internal.scaleFactor;
      pdfDoc.text(totalValue, pageWidth - margin, startY, { align: 'right' });
      pdfDoc.text(totalLabel, pageWidth - margin - totalValueWidth - 2, startY, { align: 'right' });
      startY += 10;

      const legalNote = 'Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.';
      const splitLegalNote = pdfDoc.splitTextToSize(legalNote, pageWidth - (margin * 2));
      pdfDoc.setFontSize(8).setFont('helvetica', 'normal').text(splitLegalNote, margin, startY);
      startY += (splitLegalNote.length * 4) + 4;
      pdfDoc.setFontSize(9).text('Este recibo confirma que su pago ha sido validado conforme a los términos establecidos por la comunidad.', margin, startY);
      startY += 8;
      pdfDoc.setFont('helvetica', 'bold').text(`Firma electrónica: '${companyInfo.name} - Condominio'`, margin, startY);
      startY += 10;
      pdfDoc.setLineWidth(0.2).line(margin, startY, pageWidth - margin, startY);
      startY += 5;
      pdfDoc.setFontSize(8).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});

      const pdfOutput = pdfDoc.output('blob');
      const pdfFile = new File([pdfOutput], `recibo_${receiptNumber}.pdf`, { type: 'application/pdf' });

      if (action === 'download') {
        pdfDoc.save(`recibo_${receiptNumber}.pdf`);
      } else if (action === 'share' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({
            title: `Recibo de Pago ${receiptNumber}`,
            text: `Adjunto el recibo de pago para ${ownerName}.`,
            files: [pdfFile],
          });
        } catch (error) {
          console.error('Error al compartir:', error);
          const url = URL.createObjectURL(pdfFile);
          window.open(url, '_blank');
        }
      } else {
        const url = URL.createObjectURL(pdfFile);
        window.open(url, '_blank');
      }
    };


  const getBalancePeriodText = (report: PublishedReport) => {
    const [type, year, month] = report.id.split('-');
    if (type === 'balance' && monthsLocale[parseInt(month)]) {
        return `Balance de ${monthsLocale[parseInt(month)]} ${year}`;
    }
    return 'Balance Publicado';
  };

  if (loading || authLoading) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  if (!ownerData) {
    return (
        <div className="flex flex-col justify-center items-center h-full gap-4">
            <p className="text-lg">No se encontró información del propietario.</p>
        </div>
    )
  }

  return (
    <div className="space-y-8">
        <div>
            <h1 className="text-3xl font-bold font-headline">Panel de Propietario</h1>
            <p className="text-muted-foreground">Bienvenido, {ownerData?.name || 'Propietario'}. Aquí está el resumen de tu cuenta.</p>
        </div>
      
      <Card className="w-full rounded-2xl shadow-lg border-2 border-border/20">
            <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between p-6 gap-4">
                <div className="flex-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Estado de Cuenta</CardTitle>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                             <p className="text-xs text-destructive">Deuda Total Pendiente</p>
                             <p className="text-2xl font-bold text-destructive">${dashboardStats.totalDebtUSD.toFixed(2)}</p>
                             <p className="text-sm text-muted-foreground">~ Bs. {formatToTwoDecimals(dashboardStats.totalDebtUSD * dashboardStats.exchangeRate)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-success">Saldo a Favor</p>
                            <p className="text-2xl font-bold text-success">Bs. {formatToTwoDecimals(dashboardStats.balanceInFavor)}</p>
                            <p className="text-sm text-muted-foreground">~ ${dashboardStats.exchangeRate > 0 ? formatToTwoDecimals(dashboardStats.balanceInFavor / dashboardStats.exchangeRate) : '0,00'}</p>
                        </div>
                    </div>
                </div>
                 <div className="flex flex-col items-start md:items-end flex-shrink-0">
                    <Badge variant={statusVariantMap[solvencyStatus]} className="text-base capitalize mb-2">
                        {solvencyStatus === 'moroso' ? <AlertCircle className="mr-2 h-4 w-4"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                        {solvencyStatus}
                    </Badge>
                     {solvencyPeriod && <p className="text-sm font-semibold text-muted-foreground capitalize">{solvencyPeriod}</p>}
                 </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
                 <div className="text-xs text-muted-foreground">
                    Tasa de cambio del día: Bs. {formatToTwoDecimals(dashboardStats.exchangeRate)} por USD
                 </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold font-headline">Publicaciones del Condominio</CardTitle>
                    <Link href="/owner/history">
                        <Button variant="outline" size="sm">
                            <Clock className="mr-2 h-4 w-4"/>
                            Ver Historial Completo
                        </Button>
                    </Link>
                </div>
                <CardDescription>Consulta los últimos reportes publicados por la administración.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
                <Card className="flex flex-col">
                    <CardHeader className="flex-row gap-4 items-center">
                        <BookOpen className="w-8 h-8 text-primary"/>
                        <div>
                            <CardTitle>Último Reporte Integral</CardTitle>
                            <CardDescription>Estado de solvencia de todos los propietarios.</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-grow">
                        {latestIntegralReport ? (
                            <p className="font-semibold">Publicado: {format(new Date(latestIntegralReport.createdAt), 'dd MMMM, yyyy', {locale: es})}</p>
                        ) : (
                            <p className="text-muted-foreground">Aún no hay reportes publicados.</p>
                        )}
                    </CardContent>
                    {latestIntegralReport && (
                        <CardFooter>
                            <Button className="w-full" asChild>
                                <Link href={`/owner/report/${latestIntegralReport.id}`}>Ver Reporte</Link>
                            </Button>
                        </CardFooter>
                    )}
                </Card>
                <Card className="flex flex-col">
                    <CardHeader className="flex-row gap-4 items-center">
                        <Scale className="w-8 h-8 text-primary"/>
                        <div>
                            <CardTitle>Último Balance Financiero</CardTitle>
                            <CardDescription>Resumen de ingresos y egresos del mes.</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-grow">
                        {latestFinancialBalance ? (
                            <p className="font-semibold">{getBalancePeriodText(latestFinancialBalance)}</p>
                        ) : (
                             <p className="text-muted-foreground">Aún no hay balances publicados.</p>
                        )}
                    </CardContent>
                     {latestFinancialBalance && (
                        <CardFooter>
                             <Button className="w-full" asChild>
                                <Link href={`/owner/report/${latestFinancialBalance.id}`}>Ver Balance</Link>
                            </Button>
                        </CardFooter>
                    )}
                </Card>
            </CardContent>
        </Card>

       <div className="grid gap-8 lg:grid-cols-1">
          <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Desglose de Deudas Pendientes</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[50px] text-center">Pagar</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : pendingDebts.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">¡Felicidades! No tienes deudas pendientes.</TableCell></TableRow>
                    ) : (
                    pendingDebts.map((debt) => {
                        const debtMonthDate = startOfMonth(new Date(debt.year, debt.month - 1));
                        const isOverdue = isBefore(debtMonthDate, startOfMonth(new Date()));
                        return (
                        <TableRow key={debt.id} data-state={selectedDebts.includes(debt.id) ? 'selected' : ''}>
                            <TableCell className="text-center">
                                <Checkbox 
                                    onCheckedChange={() => handleDebtSelection(debt.id)}
                                    checked={selectedDebts.includes(debt.id)}
                                    aria-label={`Seleccionar deuda de ${monthsLocale[debt.month]} ${debt.year}`}
                                />
                            </TableCell>
                            <TableCell className="font-medium">{monthsLocale[debt.month]} ${debt.year}</TableCell>
                            <TableCell>{debt.description}</TableCell>
                            <TableCell>
                                {isOverdue ? <Badge variant={'destructive'}>Vencida</Badge> : <Badge variant={'warning'}>Pendiente</Badge>}
                            </TableCell>
                            <TableCell className="text-right">Bs. {formatToTwoDecimals(debt.amountUSD * dashboardStats.exchangeRate)}</TableCell>
                        </TableRow>
                        )
                    }))}
                </TableBody>
                </Table>
                 {paymentCalculator.hasSelection && (
                    <CardFooter className="p-4 bg-muted/50 border-t">
                        <div className="w-full max-w-md ml-auto space-y-2">
                             <h3 className="text-lg font-semibold flex items-center"><Calculator className="mr-2 h-5 w-5"/> Calculadora de Pago</h3>
                             <div className="flex justify-between items-center">
                                 <span className="text-muted-foreground">Total Seleccionado:</span>
                                 <span className="font-medium">Bs. {formatToTwoDecimals(paymentCalculator.totalSelectedBs)}</span>
                             </div>
                             <div className="flex justify-between items-center text-sm">
                                 <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                 <span className="font-medium">Bs. {formatToTwoDecimals(paymentCalculator.balanceInFavor)}</span>
                             </div>
                             <hr className="my-1"/>
                             <div className="flex justify-between items-center text-lg">
                                 <span className="font-bold flex items-center"><Equal className="mr-2 h-4 w-4"/> TOTAL A PAGAR:</span>
                                 <span className="font-bold text-primary">Bs. {formatToTwoDecimals(paymentCalculator.totalToPay)}</span>
                             </div>
                        </div>
                    </CardFooter>
                )}
            </Card>
           
        </div>

        <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Mis Últimos Pagos Aprobados</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : payments.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No tienes pagos aprobados recientemente.</TableCell></TableRow>
                    ) : (
                    payments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>
                            {payment.type === 'adelanto' 
                                ? `$${formatToTwoDecimals(payment.totalAmount)}`
                                : `Bs. ${formatToTwoDecimals(payment.totalAmount)}`
                            }
                        </TableCell>
                        <TableCell>{payment.bank}</TableCell>
                        <TableCell>{payment.reference}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === 'aprobado' ? 'success' : payment.status === 'rechazado' ? 'destructive' : 'warning'}>
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Badge>
                        </TableCell>
                         <TableCell className="text-right">
                            {payment.status === 'aprobado' ? (
                                <Button variant="ghost" size="icon" onClick={() => openReceiptPreview(payment)}>
                                    <Printer className="h-4 w-4"/>
                                    <span className="sr-only">Ver Recibo</span>
                                </Button>
                            ) : (
                                <Button variant="ghost" size="icon" disabled>
                                    <Printer className="h-4 w-4 text-muted-foreground/50"/>
                                    <span className="sr-only">Ver Recibo (No disponible)</span>
                                </Button>
                            )}
                        </TableCell>
                    </TableRow>
                    )))}
                </TableBody>
                </Table>
            </Card>
        </div>
      </div>

       {/* Receipt Preview Dialog */}
      <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vista Previa del Recibo: {receiptData?.receiptNumber}</DialogTitle>
            <DialogDescription>
              Recibo de pago para {receiptData?.ownerName}.
            </DialogDescription>
          </DialogHeader>
          {receiptData && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
              <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-semibold">Fecha de Pago:</span> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</div>
                  <div><span className="font-semibold">Monto Pagado:</span> Bs. {formatToTwoDecimals(receiptData.payment.totalAmount)}</div>
                  <div><span className="font-semibold">Tasa Aplicada:</span> Bs. {formatToTwoDecimals(receiptData.payment.exchangeRate)}</div>
                  <div><span className="font-semibold">Referencia:</span> {receiptData.payment.reference}</div>
              </div>
              <h4 className="font-semibold">Conceptos Pagados</h4>
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Período</TableHead>
                          <TableHead>Concepto</TableHead>
                          <TableHead className="text-right">Monto (Bs)</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {receiptData.paidDebts.length > 0 ? (
                          receiptData.paidDebts.map(debt => (
                              <TableRow key={debt.id}>
                                  <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                  <TableCell>{debt.description}</TableCell>
                                  <TableCell className="text-right">Bs. {formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                              </TableRow>
                          ))
                      ) : (
                          <TableRow>
                              <TableCell colSpan={3}>Abono a Saldo a Favor</TableCell>
                          </TableRow>
                      )}
                  </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter className="sm:justify-end gap-2">
              <Button variant="outline" onClick={() => generateAndAct('download', receiptData!)}>
                  <Download className="mr-2 h-4 w-4" /> Exportar PDF
              </Button>
              <Button onClick={() => generateAndAct('share', receiptData!)}>
                   <Share2 className="mr-2 h-4 w-4" /> Compartir PDF
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}





'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Loader2, Download, ArrowLeft } from 'lucide-react';
import { doc, getDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { Label } from '@/components/ui/label';

// --- Type Definitions ---
type FinancialItem = {
  id: string;
  concepto: string;
  monto: number;
  dia: string;
};

type FinancialStatement = {
  id: string; // YYYY-MM
  ingresos: FinancialItem[];
  egresos: FinancialItem[];
  estadoFinanciero: { saldoNeto: number };
  notas: string;
  createdAt: string;
};

type Owner = {
  id: string;
  name: string;
  properties: { street: string; house: string }[];
  email?: string;
  balance: number;
};

type Debt = {
  id: string;
  ownerId: string;
  year: number;
  month: number;
  amountUSD: number;
  description: string;
  status: 'pending' | 'paid' | 'vencida';
  paidAmountUSD?: number;
  property: { street: string; house: string };
  paymentId?: string;
};

type Payment = {
  id: string;
  paymentDate: Timestamp;
  totalAmount: number;
  exchangeRate?: number;
  beneficiaries: {
    ownerId: string;
    street?: string;
    house?: string;
    amount: number;
  }[];
  status: 'aprobado' | 'pendiente' | 'rechazado';
};

type HistoricalPayment = {
  ownerId: string;
  referenceMonth: number;
  referenceYear: number;
  amountUSD: number;
};

type CompanyInfo = {
  name: string;
  address: string;
  rif: string;
  phone: string;
  email: string;
  logo: string;
};

// --- Utility Functions ---
const formatToTwoDecimals = (num: number): string => {
  if (typeof num !== 'number' || isNaN(num)) return '0,00';
  const truncated = Math.trunc(num * 100) / 100;
  return truncated.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const months = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: format(new Date(2000, i), 'MMMM', { locale: es }),
}));

export default function ReportViewerPage() {
  const { toast } = useToast();
  const params = useParams();
  const router = useRouter();
  // ✅ corregido: manejar string | string[]
  const reportId: string = Array.isArray(params?.id) ? params?.id[0] : params?.id ?? '';

  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<'balance' | 'integral' | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [reportDate, setReportDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!reportId) return;

    const fetchReport = async () => {
      setLoading(true);
      try {
        const isIntegral = reportId.startsWith('integral-');
        const isBalance = reportId.startsWith('balance-');

        const publishedReportRef = doc(db, "published_reports", reportId);
        const publishedReportSnap = await getDoc(publishedReportRef);
        if (publishedReportSnap.exists()) {
          const createdAtData = publishedReportSnap.data().createdAt;
          if (createdAtData instanceof Timestamp) {
            setReportDate(createdAtData.toDate());
          } else if (typeof createdAtData === 'string') {
            setReportDate(new Date(createdAtData));
          }
        }

        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setCompanyInfo(settingsSnap.data().companyInfo as CompanyInfo);
        }

        if (isBalance) {
          setReportType('balance');
          const balanceId = reportId.replace('balance-', '');
          const docRef = doc(db, "financial_statements", balanceId);
          const reportSnap = await getDoc(docRef);

          if (reportSnap.exists()) {
            setReportData({ id: reportSnap.id, ...reportSnap.data() } as FinancialStatement);
          } else {
            toast({
              variant: 'destructive',
              title: 'Error',
              description: 'No se encontró el balance financiero solicitado.',
            });
          }
        } else if (isIntegral) {
          setReportType('integral');
          const ownersQuery = getDocs(collection(db, 'owners'));
          const debtsQuery = getDocs(collection(db, 'debts'));
          const paymentsQuery = getDocs(collection(db, 'payments'));
          const historicalPaymentsQuery = getDocs(collection(db, 'historical_payments'));

          const [ownersSnapshot, debtsSnapshot, paymentsSnapshot, historicalPaymentsSnapshot] =
            await Promise.all([ownersQuery, debtsQuery, paymentsQuery, historicalPaymentsQuery]);

          const ownersData = ownersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Owner));
          const debtsData = debtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
          const paymentsData = paymentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
          const historicalData = historicalPaymentsSnapshot.docs.map(d => d.data() as HistoricalPayment);

          const integralData = buildIntegralReportData(ownersData, debtsData, paymentsData, historicalData);
          setReportData(integralData);
        } else {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Tipo de reporte no reconocido.',
          });
        }
      } catch (error) {
        console.error("Error fetching report:", error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo cargar el reporte.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [reportId, toast]);

  const handleGeneratePdf = async () => {
    if (reportType === 'balance') {
      generateBalancePdf();
    } else if (reportType === 'integral') {
      generateIntegralPdf();
    }
  };
  // PDF generation for Balance Report
  const generateBalancePdf = async () => {
    if (!reportData || !companyInfo) return;
    const statement = reportData as FinancialStatement;

    const qrCodeUrl = await QRCode.toDataURL(`${window.location.href}`, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 4,
    });

    const totalIngresos = statement.ingresos.reduce((sum, item) => sum + item.monto, 0);
    const totalEgresos = statement.egresos.reduce((sum, item) => sum + item.monto, 0);
    const saldoNeto = totalIngresos - totalEgresos;

    const monthLabel = months.find(m => m.value === statement.id.split('-')[1])?.label;
    const yearLabel = statement.id.split('-')[0];
    const period = `${monthLabel} ${yearLabel}`;

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
    if (qrCodeUrl) {
      const qrSize = 25;
      doc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - qrSize, margin + 12, qrSize, qrSize);
    }

    doc.setFontSize(16).setFont('helvetica', 'bold').text('Balance Financiero', pageWidth / 2, margin + 45, { align: 'center' });
    doc.setFontSize(12).setFont('helvetica', 'normal').text(`Correspondiente al período de ${period}`, pageWidth / 2, margin + 52, { align: 'center' });

    let startY = margin + 70;

    autoTable(doc, {
      head: [['DÍA', 'INGRESOS', 'MONTO (Bs.)']],
      body: statement.ingresos.map(i => [
        i.dia,
        i.concepto,
        { content: formatToTwoDecimals(i.monto), styles: { halign: 'right' } },
      ]),
      foot: [[
        { content: '', styles: { halign: 'right' } },
        { content: 'TOTAL INGRESOS', styles: { halign: 'right' } },
        { content: formatToTwoDecimals(totalIngresos), styles: { halign: 'right' } },
      ]],
      startY,
      theme: 'striped',
      headStyles: { fillColor: [22, 163, 74], halign: 'center' },
      footStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
    });
    startY = (doc as any).lastAutoTable.finalY + 10;

    autoTable(doc, {
      head: [['DÍA', 'EGRESOS', 'MONTO (Bs.)']],
      body: statement.egresos.map(e => [
        e.dia,
        e.concepto,
        { content: formatToTwoDecimals(e.monto), styles: { halign: 'right' } },
      ]),
      foot: [[
        { content: '', styles: { halign: 'right' } },
        { content: 'TOTAL EGRESOS', styles: { halign: 'right' } },
        { content: formatToTwoDecimals(totalEgresos), styles: { halign: 'right' } },
      ]],
      startY,
      theme: 'striped',
      headStyles: { fillColor: [220, 53, 69], halign: 'center' },
      footStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold' },
    });
    startY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(11).setFont('helvetica', 'bold');
    const totalEfectivoY = startY + 10;
    doc.setFillColor(232, 255, 236);
    doc.rect(margin, totalEfectivoY - 5, pageWidth - margin * 2, 10, 'F');
    doc.setTextColor(34, 139, 34);
    doc.text('SALDO NETO O SALDO FINAL DEL MES EN BANCO (Ingresos - Egresos)', margin + 2, totalEfectivoY);
    doc.text(formatToTwoDecimals(saldoNeto), pageWidth - margin - 2, totalEfectivoY, { align: 'right' });
    startY = totalEfectivoY + 10;
    doc.setTextColor(0, 0, 0);

    startY += 10;
    doc.setFontSize(10).text('Notas:', margin, startY);
    doc.setFontSize(10).setFont('helvetica', 'normal').text(statement.notas, margin, startY + 5, { maxWidth: 180 });

    doc.save(`Balance_Financiero_${statement.id}.pdf`);
  };

  // PDF generation for Integral Report
  const generateIntegralPdf = () => {
    if (!reportData || !companyInfo) return;
    const data = reportData;
    const doc = new jsPDF({ orientation: 'landscape' });
    let startY = 15;

    if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
    if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);

    doc.setFontSize(16).setFont('helvetica', 'bold').text('Reporte Integral de Propietarios', doc.internal.pageSize.getWidth() / 2, startY + 15, { align: 'center' });

    startY += 25;
    doc.setFontSize(9).setFont('helvetica', 'normal');
    doc.text(`Fecha de Emisión: ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss")}`, doc.internal.pageSize.getWidth() - 15, startY, { align: 'right' });

    startY += 10;

    autoTable(doc, {
      head: [["Propietario", "Propiedad", "Fecha Últ. Pago", "Monto Pagado (Bs)", "Tasa BCV", "Saldo a Favor (Bs)", "Estado", "Periodo", "Meses Adeudados", "Deuda por Ajuste ($)"]],
      body: data.map((row: any) => [
        row.name,
        row.properties,
        row.lastPaymentDate,
        row.paidAmount > 0 ? formatToTwoDecimals(row.paidAmount) : '',
        row.avgRate > 0 ? formatToTwoDecimals(row.avgRate) : '',
        row.balance > 0 ? formatToTwoDecimals(row.balance) : '',
        row.status,
        row.solvencyPeriod,
        row.monthsOwed > 0 ? row.monthsOwed : '',
        row.adjustmentDebtUSD > 0 ? `$${row.adjustmentDebtUSD.toFixed(2)}` : '',
      ]),
      startY,
      headStyles: { fillColor: [30, 80, 180] },
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        8: { halign: 'center' },
        9: { halign: 'right' },
      },
    });

    doc.save(`Reporte_Integral_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!reportData) {
    return ( 
    <div className="text-center p-8"> 
      <p>Reporte no encontrado o datos insuficientes.</p> 
      <Button variant="outline" onClick={() => router.back()} className="mt-4"> 
        <ArrowLeft className="mr-2 h-4 w-4" /> 
        Atrás 
      </Button> 
    </div> );
            
              // --- Render Balance Report ---
              if (reportType === 'balance') {
                const { ingresos, egresos, notas } = reportData as FinancialStatement;
                const totalIngresos = ingresos.reduce((sum: number, item: FinancialItem) => sum + Number(item.monto), 0);
                const totalEgresos = egresos.reduce((sum: number, item: FinancialItem) => sum + Number(item.monto), 0);
                const saldoNeto = totalIngresos - totalEgresos;
                const monthLabel = months.find(m => m.value === reportData.id.split('-')[1])?.label;
                const yearLabel = reportData.id.split('-')[0];
                const period = `${monthLabel} ${yearLabel}`;
            
                return (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h1 className="text-3xl font-bold font-headline">Balance Financiero: {period}</h1>
                        {reportDate && (
                          <p className="text-muted-foreground">
                            Publicado el {format(reportDate, 'dd MMMM, yyyy', { locale: es })}
                          </p>
                        )}
                      </div>
                      <Button onClick={handleGeneratePdf}>
                        <Download className="mr-2 h-4 w-4" />
                        Descargar PDF
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-green-500">Ingresos</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Día</TableHead>
                                <TableHead>Concepto</TableHead>
                                <TableHead className="text-right">Monto (Bs.)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ingresos.map((item: FinancialItem, index: number) => (
                                <TableRow key={`ingreso-${index}`}>
                                  <TableCell>{item.dia}</TableCell>
                                  <TableCell>{item.concepto}</TableCell>
                                  <TableCell className="text-right">{formatToTwoDecimals(item.monto)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow>
                                <TableCell colSpan={2} className="font-bold text-right">Total Ingresos</TableCell>
                                <TableCell className="text-right font-bold">{formatToTwoDecimals(totalIngresos)}</TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-destructive">Egresos</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Día</TableHead>
                                <TableHead>Concepto</TableHead>
                                <TableHead className="text-right">Monto (Bs.)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {egresos.map((item: FinancialItem, index: number) => (
                                <TableRow key={`egreso-${index}`}>
                                  <TableCell>{item.dia}</TableCell>
                                  <TableCell>{item.concepto}</TableCell>
                                  <TableCell className="text-right">{formatToTwoDecimals(item.monto)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow>
                                <TableCell colSpan={2} className="font-bold text-right">Total Egresos</TableCell>
                                <TableCell className="text-right font-bold">{formatToTwoDecimals(totalEgresos)}</TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>
                    <Card>
                      <CardHeader>
                        <CardTitle>Resumen del Período</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-4 bg-primary/10 rounded-md">
                          <Label htmlFor="saldoNeto" className="text-base font-bold">SALDO NETO</Label>
                          <p
                            id="saldoNeto"
                            className={`text-2xl font-bold text-center ${saldoNeto >= 0 ? 'text-primary' : 'text-destructive'}`}
                          >
                            {formatToTwoDecimals(saldoNeto)}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Notas Adicionales</Label>
                          <p className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/50 whitespace-pre-wrap">
                            {notas || 'No hay notas para este período.'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              }
            
              // --- Render Integral Report ---
              if (reportType === 'integral') {
                const integralData = reportData as any[];
                return (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h1 className="text-3xl font-bold font-headline">Reporte Integral de Propietarios</h1>
                        {reportDate && (
                          <p className="text-muted-foreground">
                            Publicado el {format(reportDate, 'dd MMMM, yyyy', { locale: es })}
                          </p>
                        )}
                      </div>
                      <Button onClick={handleGeneratePdf}>
                        <Download className="mr-2 h-4 w-4" />
                        Descargar PDF
                      </Button>
                    </div>
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Propietario</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead>Periodo</TableHead>
                              <TableHead className="text-center">Meses Adeudados</TableHead>
                              <TableHead className="text-right">Saldo a Favor (Bs)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {integralData.map((row: any) => (
                              <TableRow key={row.ownerId}>
                                <TableCell className="font-medium">{row.name}</TableCell>
                                <TableCell>
                                  <span
                                    className={`font-semibold ${
                                      row.status === 'No Solvente' ? 'text-destructive' : 'text-green-600'
                                    }`}
                                  >
                                    {row.status}
                                  </span>
                                </TableCell>
                                <TableCell className="capitalize">{row.solvencyPeriod}</TableCell>
                                <TableCell className="text-center">{row.monthsOwed > 0 ? row.monthsOwed : ''}</TableCell>
                                <TableCell className="text-right">
                                  {row.balance > 0 ? `Bs. ${formatToTwoDecimals(row.balance)}` : ''}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                );
              }
            
              return null; // Should not happen
            }
// --- Helper function to build integral report data ---
const buildIntegralReportData = (
    owners: Owner[],
    allDebts: Debt[],
    allPayments: Payment[],
    allHistoricalPayments: HistoricalPayment[]
  ) => {
    const {
      format,
      addMonths,
      startOfMonth,
      getYear,
      getMonth,
      isBefore,
      endOfMonth,
    } = require('date-fns');
  
    const sortedOwners = [...owners]
      .filter(
        owner =>
          owner.id !== 'valle-admin-main-account' &&
          owner.name &&
          owner.name !== 'Valle Admin'
      )
      .map(owner => {
        const streetNum = parseInt(
          String(owner.properties?.[0]?.street || '').replace('Calle ', '') || '999'
        );
        const houseNum = parseInt(
          String(owner.properties?.[0]?.house || '').replace('Casa ', '') || '999'
        );
        return { ...owner, sortKeys: { streetNum, houseNum } };
      })
      .sort((a, b) => {
        if (a.sortKeys.streetNum !== b.sortKeys.streetNum)
          return a.sortKeys.streetNum - b.sortKeys.streetNum;
        return a.sortKeys.houseNum - b.sortKeys.houseNum;
      });
  
    return sortedOwners.map(owner => {
      const ownerDebts = allDebts.filter(d => d.ownerId === owner.id);
      const ownerHistoricalPayments = allHistoricalPayments.filter(p => p.ownerId === owner.id);
  
      const allOwnerPeriods = [
        ...ownerDebts.map(d => ({ year: d.year, month: d.month })),
        ...ownerHistoricalPayments.map(p => ({ year: p.referenceYear, month: p.referenceMonth })),
      ];
  
      let firstMonthEver: Date | null = null;
      if (allOwnerPeriods.length > 0) {
        const oldestPeriod = allOwnerPeriods.sort((a, b) => a.year - b.year || a.month - b.month)[0];
        firstMonthEver = startOfMonth(new Date(oldestPeriod.year, oldestPeriod.month - 1));
      }
  
      let lastConsecutivePaidMonth: Date | null = null;
  
      if (firstMonthEver) {
        let currentCheckMonth = firstMonthEver;
        const limitDate = endOfMonth(addMonths(new Date(), 120));
  
        while (isBefore(currentCheckMonth, limitDate)) {
          const year = getYear(currentCheckMonth);
          const month = getMonth(currentCheckMonth) + 1;
  
          const isHistorical = ownerHistoricalPayments.some(
            p => p.referenceYear === year && p.referenceMonth === month
          );
  
          let isMonthFullyPaid = false;
          if (isHistorical) {
            isMonthFullyPaid = true;
          } else {
            const debtsForMonth = ownerDebts.filter(d => d.year === year && d.month === month);
            if (debtsForMonth.length > 0) {
              const mainDebt = debtsForMonth.find(d =>
                d.description.toLowerCase().includes('condominio')
              );
              if (mainDebt?.status === 'paid') {
                isMonthFullyPaid = true;
              }
            }
          }
  
          if (isMonthFullyPaid) {
            lastConsecutivePaidMonth = currentCheckMonth;
          } else {
            break;
          }
          currentCheckMonth = addMonths(currentCheckMonth, 1);
        }
      }
  
      const hasAnyPendingDebt = ownerDebts.some(
        d => d.status === 'pending' || d.status === 'vencida'
      );
  
      const status: 'Solvente' | 'No Solvente' = !hasAnyPendingDebt ? 'Solvente' : 'No Solvente';
      let solvencyPeriod = '';
  
      if (status === 'No Solvente') {
        if (lastConsecutivePaidMonth) {
          solvencyPeriod = `Desde ${format(addMonths(lastConsecutivePaidMonth, 1), 'MMMM yyyy', {
            locale: es,
          })}`;
        } else if (firstMonthEver) {
          solvencyPeriod = `Desde ${format(firstMonthEver, 'MMMM yyyy', { locale: es })}`;
        } else {
          solvencyPeriod = `Desde ${format(new Date(), 'MMMM yyyy', { locale: es })}`;
        }
      } else {
        if (lastConsecutivePaidMonth) {
          solvencyPeriod = `Hasta ${format(lastConsecutivePaidMonth, 'MMMM yyyy', { locale: es })}`;
        } else {
          solvencyPeriod = 'Al día';
        }
      }
  
      const ownerPayments = allPayments.filter(
        p => p.beneficiaries.some(b => b.ownerId === owner.id) && p.status === 'aprobado'
      );
  
      const totalPaid = ownerPayments.reduce((sum, p) => sum + p.totalAmount, 0);
      const totalRateWeight = ownerPayments.reduce(
        (sum, p) => sum + (p.exchangeRate || 0) * p.totalAmount,
        0
      );
      const avgRate = totalPaid > 0 ? totalRateWeight / totalPaid : 0;
  
      let lastPaymentDate = '';
      if (ownerPayments.length > 0) {
        const lastPayment = [...ownerPayments].sort(
          (a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis()
        )[0];
        lastPaymentDate = format(lastPayment.paymentDate.toDate(), 'dd/MM/yyyy');
      }
  
      const adjustmentDebtUSD = ownerDebts
        .filter(d => d.status === 'pending' && d.description.toLowerCase().includes('ajuste'))
        .reduce((sum, d) => sum + d.amountUSD, 0);
  
      let monthsOwed = ownerDebts.filter(d => d.status === 'pending' || d.status === 'vencida').length;
  
      if (owner.name === 'Ingrid Sivira') {
        monthsOwed = 0;
      }
  
      return {
        ownerId: owner.id,
        name: owner.name,
        properties: (owner.properties || []).map(p => `${p.street}-${p.house}`).join(', '),
        lastPaymentDate,
        paidAmount: totalPaid,
        avgRate,
        balance: owner.balance,
        status,
        solvencyPeriod,
        monthsOwed,
        adjustmentDebtUSD,
      };
    });
  };
              
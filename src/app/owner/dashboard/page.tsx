

'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Loader2, AlertCircle, CheckCircle, Receipt, ThumbsUp, ThumbsDown, X, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, Timestamp, orderBy, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfMonth } from "date-fns";
import { es } from 'date-fns/locale';
import Link from "next/link";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Share2, Download } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";


type Debt = {
    id: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
    paidAmountUSD?: number;
};

type Payment = {
    id: string;
    status: 'pendiente' | 'aprobado' | 'rechazado';
    totalAmount: number;
    paymentDate: Timestamp;
    reference: string;
    beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[];
    exchangeRate: number;
    receiptNumbers?: { [ownerId: string]: string };
    observations?: string;
    type: string;
    bank: string;
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
    beneficiary: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; };
    ownerName: string;
    ownerUnit: string;
    paidDebts: Debt[];
    previousBalance: number;
    currentBalance: number;
    qrCodeUrl?: string;
    receiptNumber: string;
} | null;


const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export default function OwnerDashboardPage() {
    const { user, ownerData, loading } = useAuth();
    const [debts, setDebts] = useState<Debt[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [activeRate, setActiveRate] = useState(0);
    const { toast } = useToast();
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [showFeedbackWidget, setShowFeedbackWidget] = useState(true);
    const router = useRouter();

    const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

    useEffect(() => {
        if (loading || !user) return;
        
        const settingsRef = doc(db(), 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCompanyInfo(settings.companyInfo as CompanyInfo);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) {
                    setActiveRate(activeRateObj.rate);
                } else if (rates.length > 0) {
                     const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                     setActiveRate(sortedRates[0].rate);
                }
            }
        });
        
        const debtsQuery = query(collection(db(), "debts"), where("ownerId", "==", user.uid));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData: Debt[] = [];
            snapshot.forEach(doc => debtsData.push({ id: doc.id, ...doc.data() } as Debt));
            setDebts(debtsData);
            setLoadingData(false);
        });

        const paymentsQuery = query(
            collection(db(), "payments"), 
            where("beneficiaryIds", "array-contains", user.uid)
        );
        const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
            const paymentsData: Payment[] = [];
            snapshot.forEach(doc => paymentsData.push({ id: doc.id, ...doc.data() } as Payment));
            // Sort client-side
            paymentsData.sort((a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis());
            setPayments(paymentsData);
        });

        return () => {
            settingsUnsubscribe();
            debtsUnsubscribe();
            paymentsUnsubscribe();
        };

    }, [user, loading]);
    
    const pendingDebts = useMemo(() => {
        return debts
            .filter(d => d.status === 'pending' || d.status === 'vencida')
            .sort((a,b) => a.year - b.year || a.month - b.month)
            .slice(0, 5);
    }, [debts]);

    const totalDebtUSD = useMemo(() => {
        return debts
            .filter(d => d.status === 'pending' || d.status === 'vencida')
            .reduce((sum, d) => sum + d.amountUSD, 0);
    }, [debts]);

    const recentPayments = useMemo(() => {
        return payments.filter(p => p.status === 'pendiente' || p.status === 'rechazado').slice(0, 3);
    }, [payments]);

    const approvedPayments = useMemo(() => {
        return payments.filter(p => p.status === 'aprobado').slice(0, 5);
    }, [payments]);


    const balanceInFavor = ownerData?.balance || 0;

    const handleFeedback = async (response: 'liked' | 'disliked') => {
        if (!user) return;
        try {
            await addDoc(collection(db(), 'app_feedback'), {
                ownerId: user.uid,
                response,
                timestamp: Timestamp.now(),
            });
            setShowFeedbackWidget(false);
            toast({
                title: '¡Gracias por tu opinión!',
                description: 'Valoramos tus comentarios para seguir mejorando.',
            });
        } catch (error) {
            console.error("Error submitting feedback:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo enviar tu opinión en este momento.'
            });
        }
    };


    const openReceiptPreview = async (payment: Payment) => {
        if (!companyInfo || !ownerData || !user) {
          toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información necesaria.' });
          return;
        }
    
        try {
          const beneficiary = payment.beneficiaries.find(b => b.ownerId === user.uid);
          if (!beneficiary) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se encontró su información en este pago.' });
            return;
          }
          
          const ownerUnitSummary = (beneficiary.street && beneficiary.house) ? `${beneficiary.street} - ${beneficiary.house}` : "Propiedad no especificada";
    
          const paidDebtsQuery = query(collection(db(), "debts"), where("paymentId", "==", payment.id), where("ownerId", "==", user.uid));
          const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
          const paidDebts = paidDebtsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Debt).sort((a, b) => a.year - b.year || a.month - b.month);
    
          const totalDebtPaidWithPayment = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
          const paymentAmountForOwner = beneficiary.amount;
          const previousBalance = ownerData.balance - (paymentAmountForOwner - totalDebtPaidWithPayment);
    
          const receiptNumber = payment.receiptNumbers?.[beneficiary.ownerId] || payment.id.substring(0, 10);
          
          const receiptUrl = `${window.location.origin}/receipt/${payment.id}/${beneficiary.ownerId}`;
          const qrDataContent = JSON.stringify({ receiptNumber, date: format(new Date(), 'yyyy-MM-dd'), amount: beneficiary.amount, ownerId: beneficiary.ownerId, url: receiptUrl });
          const qrCodeUrl = await QRCode.toDataURL(qrDataContent, { errorCorrectionLevel: 'M', margin: 2, scale: 4, color: { dark: '#000000', light: '#FFFFFF' } });
    
          setReceiptData({
            payment,
            beneficiary,
            ownerName: beneficiary.ownerName,
            ownerUnit: ownerUnitSummary,
            paidDebts,
            previousBalance,
            currentBalance: ownerData.balance,
            qrCodeUrl,
            receiptNumber
          });
          setIsReceiptPreviewOpen(true);
    
        } catch (error) {
          console.error("Error preparing receipt data: ", error);
          toast({ variant: 'destructive', title: 'Error', description: 'No se pudo preparar la vista previa del recibo.' });
        }
    };
    
    const generateAndAct = async (action: 'download' | 'share', data: ReceiptData) => {
        if (!data || !companyInfo) return;
    
        const { payment, beneficiary, paidDebts, previousBalance, currentBalance, qrCodeUrl, receiptNumber } = data;
        
        const pdfDoc = new jsPDF();
        const pageWidth = pdfDoc.internal.pageSize.getWidth();
        const margin = 14;
    
        if (companyInfo.logo) {
            try { pdfDoc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
            catch(e) { console.error("Error adding logo to PDF", e); }
        }
        pdfDoc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
        pdfDoc.setFontSize(9).setFont('helvetica', 'normal');
        pdfDoc.text(companyInfo.rif, margin + 30, margin + 14);
        pdfDoc.text(companyInfo.address, margin + 30, margin + 19);
        pdfDoc.text(`Teléfono: ${companyInfo.phone}`, margin + 30, margin + 24);
        pdfDoc.setFontSize(10).text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
        pdfDoc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);
        pdfDoc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
        pdfDoc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${receiptNumber}`, pageWidth - margin, margin + 45, { align: 'right' });
        if(qrCodeUrl) {
          const qrSize = 30;
          pdfDoc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - qrSize, margin + 48, qrSize, qrSize);
        }
        
        let startY = margin + 60;
        pdfDoc.setFontSize(10).text(`Beneficiario: ${beneficiary.ownerName} (${data.ownerUnit})`, margin, startY);
        startY += 6;
        pdfDoc.text(`Método de pago: ${payment.type || 'No especificado'}`, margin, startY);
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
            const periodLabel = `${monthsLocale[debt.month]} ${debt.year}`;
            const concept = `${debt.description}`;
            return [ periodLabel, concept, `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`, `Bs. ${formatToTwoDecimals(debtAmountBs)}` ];
        });
    
        if (paidDebts.length > 0) {
            (pdfDoc as any).autoTable({ startY: startY, head: [['Período', 'Concepto', 'Monto ($)', 'Monto Pagado (Bs)']], body: tableBody, theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
            startY = (pdfDoc as any).lastAutoTable.finalY;
        } else {
            totalPaidInConcepts = beneficiary.amount;
            (pdfDoc as any).autoTable({ startY: startY, head: [['Concepto', 'Monto Pagado (Bs)']], body: [['Abono a Saldo a Favor', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`]], theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
            startY = (pdfDoc as any).lastAutoTable.finalY;
        }
        startY += 8;
        
        const summaryData = [
            ['Saldo a Favor Anterior:', `Bs. ${formatToTwoDecimals(previousBalance)}`],
            ['Monto del Pago Recibido:', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`],
            ['Total Abonado en Deudas:', `Bs. ${formatToTwoDecimals(totalPaidInConcepts)}`],
            ['Saldo a Favor Actual:', `Bs. ${formatToTwoDecimals(currentBalance)}`],
        ];
        (pdfDoc as any).autoTable({ startY: startY, body: summaryData, theme: 'plain', styles: { fontSize: 9, fontStyle: 'bold' }, columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right'} } });
        startY = (pdfDoc as any).lastAutoTable.finalY + 10;
        
        const totalLabel = "TOTAL PAGADO:";
        const totalValue = `Bs. ${formatToTwoDecimals(beneficiary.amount)}`;
        pdfDoc.setFontSize(11).setFont('helvetica', 'bold');
        const totalValueWidth = pdfDoc.getStringUnitWidth(totalValue) * 11 / pdfDoc.internal.scaleFactor;
        pdfDoc.text(totalValue, pageWidth - margin, startY, { align: 'right' });
        pdfDoc.text(totalLabel, pageWidth - margin - totalValueWidth - 2, startY, { align: 'right' });
    
        const pdfOutput = pdfDoc.output('blob');
        const pdfFile = new File([pdfOutput], `recibo_${receiptNumber}.pdf`, { type: 'application/pdf' });
    
        if (action === 'download') {
          pdfDoc.save(`recibo_${receiptNumber}.pdf`);
        } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            try {
              await navigator.share({
                title: `Recibo de Pago ${receiptNumber}`,
                text: `Adjunto el recibo de pago para ${data.ownerName}.`,
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
    }


    return (
        <div className="space-y-8">
            <Button variant="outline" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Atrás
            </Button>
            <div>
                <h1 className="text-3xl font-bold font-headline">Bienvenido, {ownerData?.name || 'Propietario'}</h1>
                <p className="text-muted-foreground">Aquí tienes un resumen de tu estado de cuenta y accesos rápidos.</p>
            </div>

            {ownerData && ownerData.passwordChanged === false && showFeedbackWidget && (
                <Alert variant="default" className="bg-blue-900/20 border-blue-500/50">
                    <AlertDescription className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex-grow">
                            <h3 className="font-bold text-lg text-foreground">¡Hola de nuevo!</h3>
                            <p className="text-muted-foreground">¿Te está gustando tu nueva experiencia en la aplicación?</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <Button size="sm" onClick={() => handleFeedback('liked')} className="bg-green-600 hover:bg-green-700">
                                <ThumbsUp className="mr-2 h-4 w-4"/> Sí, me gusta
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleFeedback('disliked')}>
                                <ThumbsDown className="mr-2 h-4 w-4"/> No, puede mejorar
                            </Button>
                        </div>
                         <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => setShowFeedbackWidget(false)}>
                            <X className="h-4 w-4" />
                         </Button>
                    </AlertDescription>
                </Alert>
            )}
          
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Deuda Total Pendiente</CardTitle>
                        <CardDescription>Monto total de tus cuotas y cargos por pagar.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingData ? <Loader2 className="h-8 w-8 animate-spin"/> :
                            <>
                                <p className="text-3xl font-bold text-destructive">${totalDebtUSD.toFixed(2)}</p>
                                <p className="text-sm text-muted-foreground">Bs. {formatToTwoDecimals(totalDebtUSD * activeRate)}</p>
                            </>
                        }
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Saldo a Favor</CardTitle>
                        <CardDescription>Monto disponible para ser usado en futuros pagos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {loadingData ? <Loader2 className="h-8 w-8 animate-spin"/> :
                            <p className="text-3xl font-bold text-green-500">Bs. {formatToTwoDecimals(balanceInFavor)}</p>
                         }
                    </CardContent>
                </Card>
                <Card className="bg-primary text-primary-foreground">
                    <CardHeader>
                        <CardTitle>Reportar un Pago</CardTitle>
                        <CardDescription className="text-primary-foreground/80">¿Realizaste un pago? Notifícalo aquí para que sea procesado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/owner/payments">
                            <Button variant="secondary" className="w-full">
                                Reportar Pago <ArrowRight className="ml-2 h-4 w-4"/>
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
            
             <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Deudas Pendientes Recientes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Período</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Monto (USD)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingData ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin"/></TableCell></TableRow>
                                ) : pendingDebts.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">¡Felicidades! No tienes deudas pendientes.</TableCell></TableRow>
                                ) : (
                                    pendingDebts.map(debt => {
                                        const debtDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                        const isOverdue = isBefore(debtDate, startOfMonth(new Date()));
                                        return (
                                        <TableRow key={debt.id}>
                                            <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                            <TableCell>{debt.description}</TableCell>
                                            <TableCell>
                                                 <Badge variant={isOverdue ? 'destructive' : 'warning'}>
                                                    {isOverdue ? 'Vencida' : 'Pendiente'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">${debt.amountUSD.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )})
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Últimos Pagos Aprobados</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Monto (Bs.)</TableHead>
                                    <TableHead>Recibo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                 {loadingData ? (
                                    <TableRow><TableCell colSpan={3} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin"/></TableCell></TableRow>
                                ) : approvedPayments.length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No tienes pagos aprobados recientemente.</TableCell></TableRow>
                                ) : (
                                     approvedPayments.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell>{format(p.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>{formatToTwoDecimals(p.totalAmount)}</TableCell>
                                            <TableCell>
                                                <Button variant="outline" size="sm" onClick={() => openReceiptPreview(p)}>
                                                    <Receipt className="mr-2 h-4 w-4"/>
                                                    Ver Recibo
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                 {recentPayments.length > 0 && (
                     <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><AlertCircle className="text-destructive"/> Pagos con Observaciones</CardTitle>
                            <CardDescription>Tus reportes de pago más recientes que requieren atención o están pendientes por aprobar.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha del Reporte</TableHead>
                                        <TableHead>Referencia</TableHead>
                                        <TableHead>Monto (Bs.)</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentPayments.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell>{format(p.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>{p.reference}</TableCell>
                                            <TableCell>{formatToTwoDecimals(p.totalAmount)}</TableCell>
                                            <TableCell>
                                                <Badge variant={p.status === 'rechazado' ? 'destructive' : 'warning'} className="capitalize">{p.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                 )}
            </div>

            <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo: {receiptData?.receiptNumber}</DialogTitle>
                    <DialogDescription>
                        Recibo de pago para {receiptData?.ownerName} ({receiptData?.ownerUnit}).
                    </DialogDescription>
                </DialogHeader>
                {receiptData && (
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><span className="font-semibold">Fecha de Pago:</span> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</div>
                            <div><span className="font-semibold">Monto Pagado:</span> Bs. {formatToTwoDecimals(receiptData.beneficiary.amount)}</div>
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
                         <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
                            <div className="text-right text-muted-foreground">Saldo Anterior:</div>
                            <div className="text-right">Bs. {formatToTwoDecimals(receiptData.previousBalance)}</div>
                             <div className="text-right text-muted-foreground">Saldo Actual:</div>
                            <div className="text-right font-bold">Bs. {formatToTwoDecimals(receiptData.currentBalance)}</div>
                        </div>
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

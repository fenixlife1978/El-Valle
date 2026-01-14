
'use client';

// Imports de UI (MANTENER TODOS LOS IMPORTS EN LA PARTE SUPERIOR)
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, CheckCircle, Receipt, ThumbsUp, ThumbsDown, X, ArrowLeft, ShieldCheck, CalendarCheck2, Clock, CalendarX, Share2, Download, Banknote, HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from "@/components/ui/alert";
import Image from 'next/image';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from '@/components/ui/separator';
import CarteleraDigital from "@/components/CarteleraDigital";


// Imports de Lógica y Librerías de Next/React
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, Timestamp, orderBy, addDoc, serverTimestamp, limit, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import Marquee from "@/components/ui/marquee";


// -------------------------------------------------------------------------
// TIPOS Y CONSTANTES
// -------------------------------------------------------------------------
type Anuncio = {
  id: string;
  urlImagen: string;
  titulo: string;
  descripcion?: string;
};

type Debt = {
    id: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
    paidAmountUSD?: number;
    property: { street: string, house: string };
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


// -------------------------------------------------------------------------
// Componente de Dashboard del Propietario
// -------------------------------------------------------------------------

export default function OwnerDashboardPage() {
    const { user, ownerData, loading: authLoading } = useAuth();
    const { toast } = useToast();
    
    // Estados del componente
    const [loading, setLoading] = useState(true);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [lastFeedback, setLastFeedback] = useState<'liked' | 'disliked' | null>(null);
    const [anuncios, setAnuncios] = useState<Anuncio[]>([]);

    const ownerId = user?.uid;

    // Efecto para cargar todos los datos de Firestore
    useEffect(() => {
        if (authLoading || !ownerId) {
            if (!authLoading) setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                 // Suscripción a anuncios
                const anunciosQuery = query(collection(db, "billboard_announcements"), orderBy("createdAt", "desc"));
                const unsubAnuncios = onSnapshot(anunciosQuery, (snapshot) => {
                  setAnuncios(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Anuncio)));
                });


                // Fetch de información de la compañía
                const configRef = doc(db, 'config', 'mainSettings');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    setCompanyInfo(configSnap.data().companyInfo as CompanyInfo);
                }

                // Suscripción a deudas
                const debtsQuery = query(collection(db, 'debts'), where('ownerId', '==', ownerId), orderBy('year', 'desc'), orderBy('month', 'desc'));
                const unsubDebts = onSnapshot(debtsQuery, (snapshot) => {
                    const debtsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));
                    setDebts(debtsList);
                });

                // Suscripción a pagos
                const paymentsQuery = query(collection(db, 'payments'), where('beneficiaryIds', 'array-contains', ownerId));
                const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
                    const paymentsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
                    // Ordenar en el cliente
                    paymentsList.sort((a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis());
                    setPayments(paymentsList);
                });
                
                // Suscripción a feedback
                const feedbackQuery = query(collection(db, 'app_feedback'), where('ownerId', '==', ownerId), limit(1));
                const unsubFeedback = onSnapshot(feedbackQuery, (snapshot) => {
                    if (!snapshot.empty) {
                        setFeedbackSent(true);
                        const feedbackData = snapshot.docs[0].data();
                        setLastFeedback(feedbackData.response);
                    } else {
                        setFeedbackSent(false);
                    }
                });


                setLoading(false); // Datos iniciales cargados

                // Retornar funciones de limpieza
                return () => {
                    unsubAnuncios();
                    unsubDebts();
                    unsubPayments();
                    unsubFeedback();
                };
            } catch (error) {
                console.error("Error fetching initial data:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron obtener los datos necesarios.' });
                setLoading(false);
            }
        };

        const cleanupPromise = fetchData();
        return () => {
            cleanupPromise.then(cleanup => cleanup && cleanup());
        };

    }, [ownerId, authLoading, toast]);


    // Memoización de estadísticas calculadas
    const stats = useMemo(() => {
        const pendingDebts = debts.filter(d => d.status === 'pending' || d.status === 'vencida');
        const totalPendingUSD = pendingDebts.reduce((sum, d) => sum + d.amountUSD - (d.paidAmountUSD || 0), 0);
        
        const paidPayments = payments.filter(p => p.status === 'aprobado');
        const lastPayment = paidPayments.length > 0 ? paidPayments[0] : null;

        const isSolvente = totalPendingUSD <= 0.01;
        
        let oldestDebtDate = 'N/A';
        if (pendingDebts.length > 0) {
            pendingDebts.sort((a, b) => a.year - b.year || a.month - b.month);
            const oldest = pendingDebts[0];
            oldestDebtDate = `${monthsLocale[oldest.month]} ${oldest.year}`;
        }
        
        const today = new Date();
        const firstOfCurrentMonth = startOfMonth(today);
        
        const isVencida = pendingDebts.some(d => {
            const debtDate = new Date(d.year, d.month - 1);
            if (isBefore(debtDate, firstOfCurrentMonth)) {
                return true;
            }
            if (debtDate.getFullYear() === today.getFullYear() && debtDate.getMonth() === today.getMonth()) {
                return today.getDate() > 5;
            }
            return false;
        });

        return {
            totalPendingUSD,
            pendingDebtsCount: pendingDebts.length,
            lastPayment,
            isSolvente,
            oldestDebtDate,
            isVencida
        };
    }, [debts, payments]);

    
    // -------------------------------------------------------------------------
    // MANEJADORES DE EVENTOS
    // -------------------------------------------------------------------------

    const handleFeedback = async (response: 'liked' | 'disliked') => {
        if (!ownerId || feedbackSent) return;

        setLastFeedback(response); // Optimistic update
        setFeedbackSent(true);

        try {
            await addDoc(collection(db, 'app_feedback'), {
                ownerId,
                response,
                timestamp: serverTimestamp()
            });
            toast({
                title: "¡Gracias!",
                description: "Tu opinión ha sido registrada.",
            });
        } catch (error) {
            console.error("Error al enviar feedback:", error);
            setFeedbackSent(false); // Revert on error
            setLastFeedback(null);
            toast({
                variant: 'destructive',
                title: "Error",
                description: "No se pudo registrar tu opinión. Inténtalo de nuevo.",
            });
        }
    };
    
    const handleGenerateAndAct = async (action: 'download' | 'share', data: ReceiptData) => {
        if (!data || !companyInfo) return;

        const { payment, beneficiary, paidDebts, previousBalance, currentBalance, qrCodeUrl, receiptNumber } = data;
        
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo.logo) {
            try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
            catch(e) { console.error("Error adding logo to PDF", e); }
        }
        doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
        doc.setFontSize(9).setFont('helvetica', 'normal');
        doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
        doc.text(companyInfo.address, margin + 30, margin + 19);
        
        doc.setFontSize(10).text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
        
        doc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);
        doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
        doc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${receiptNumber}`, pageWidth - margin, margin + 45, { align: 'right' });
        
        let startY = margin + 60;
        const qrSize = 30;
        const qrX = pageWidth - margin - qrSize;
        const detailsBlockY = startY;

        doc.setFontSize(10).text(`Beneficiario: ${beneficiary.ownerName} (${data.ownerUnit})`, margin, startY);
        startY += 6;
        doc.text(`Método de pago: ${payment.type}`, margin, startY);
        startY += 6;
        doc.text(`Banco Emisor: ${payment.bank}`, margin, startY);
        startY += 6;
        doc.text(`N° de Referencia Bancaria: ${payment.reference}`, margin, startY);
        startY += 6;
        doc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, startY);
        startY += 6;
        doc.text(`Tasa de Cambio Aplicada: Bs. ${formatToTwoDecimals(payment.exchangeRate)} por USD`, margin, startY);

        if(qrCodeUrl) {
            doc.addImage(qrCodeUrl, 'PNG', qrX, detailsBlockY, qrSize, qrSize);
        }
        
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
            autoTable(doc, { startY: startY, head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']], body: tableBody, theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
            startY = (doc as any).lastAutoTable.finalY;
        } else {
            totalPaidInConcepts = beneficiary.amount;
            autoTable(doc, { startY: startY, head: [['Concepto', 'Monto Pagado (Bs)']], body: [['Abono a Saldo a Favor', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`]], theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
            startY = (doc as any).lastAutoTable.finalY;
        }
        
        startY += 8;

        const summaryY = startY;
        const rightColX = pageWidth - margin;
        doc.setFontSize(9);

        doc.setFont('helvetica', 'normal').text('Saldo a Favor Anterior:', rightColX - 50, summaryY, { align: 'right' });
        doc.setFont('helvetica', 'bold').text(`Bs. ${formatToTwoDecimals(previousBalance)}`, rightColX, summaryY, { align: 'right' });
        startY += 5;
        
        doc.setFont('helvetica', 'normal').text('Monto del Pago Recibido:', rightColX - 50, startY, { align: 'right' });
        doc.setFont('helvetica', 'bold').text(`Bs. ${formatToTwoDecimals(beneficiary.amount)}`, rightColX, startY, { align: 'right' });
        startY += 5;
        
        doc.setFont('helvetica', 'normal').text('Total Abonado en Deudas:', rightColX - 50, startY, { align: 'right' });
        doc.setFont('helvetica', 'bold').text(`Bs. ${formatToTwoDecimals(totalPaidInConcepts)}`, rightColX, startY, { align: 'right' });
        startY += 5;
        
        doc.setFont('helvetica', 'normal').text('Saldo a Favor Actual:', rightColX - 50, startY, { align: 'right' });
        doc.setFont('helvetica', 'bold').text(`Bs. ${formatToTwoDecimals(currentBalance)}`, rightColX, startY, { align: 'right' });
        startY += 8;
        
        const totalLabel = "TOTAL PAGADO:";
        const totalValue = `Bs. ${formatToTwoDecimals(beneficiary.amount)}`;
        doc.setFontSize(11).setFont('helvetica', 'bold');
        doc.text(totalLabel, rightColX - 50, startY, { align: 'right' });
        doc.text(totalValue, rightColX, startY, { align: 'right' });
        startY += 8;

        const footerStartY = Math.max(startY, doc.internal.pageSize.getHeight() - 55);
        startY = footerStartY;
        
        if (payment.observations) {
            doc.setFontSize(8).setFont('helvetica', 'italic');
            const splitObservations = doc.splitTextToSize(`Observaciones: ${payment.observations}`, pageWidth - margin * 2);
            doc.text(splitObservations, margin, startY);
            startY += (splitObservations.length * 3.5) + 4;
        }
        
        const legalNote = 'Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.';
        const splitLegalNote = doc.splitTextToSize(legalNote, pageWidth - (margin * 2));
        doc.setFontSize(8).setFont('helvetica', 'bold').text(splitLegalNote, margin, startY);
        startY += (splitLegalNote.length * 3.5) + 2;

        doc.setFontSize(8).setFont('helvetica', 'normal').text('Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.', margin, startY);
        startY += 4;
        doc.setFont('helvetica', 'bold').text(`Firma electrónica: '${companyInfo.name} - Condominio'`, margin, startY);
        startY += 6;
        doc.setLineWidth(0.2).line(margin, startY, pageWidth - margin, startY);
        startY += 4;
        doc.setFontSize(7).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});
        
        const pdfOutput = doc.output('blob');
        const pdfFile = new File([pdfOutput], `recibo_${receiptNumber}.pdf`, { type: 'application/pdf' });

        if (action === 'download') {
            doc.save(`recibo_${receiptNumber}.pdf`);
        } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            try {
                await navigator.share({
                    title: `Recibo de Pago ${data.receiptNumber}`, 
                    text: `Recibo de pago para ${data.ownerName}.`,
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


    const openReceipt = async (payment: Payment) => {
        if (!ownerId || !ownerData || !companyInfo) {
            toast({ variant: "destructive", title: "Error", description: "Datos insuficientes para generar el recibo." });
            return;
        }

        const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
        if (!beneficiary) {
             toast({ variant: "destructive", title: "Error", description: "No es beneficiario de este pago." });
            return;
        }

        setIsGenerating(true);
        try {
            const paidDebtsSnapshot = await getDocs(
                query(collection(db, 'debts'), where('paymentId', '==', payment.id), where('ownerId', '==', ownerId))
            );
            const paidDebts = paidDebtsSnapshot.docs.map(d => d.data() as Debt);
            
            const totalDebtPaidWithPayment = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
            
            // Recalculate previous balance based on current state
            const previousBalance = (ownerData.balance || 0) - (beneficiary.amount - totalDebtPaidWithPayment);

            const receiptNumber = payment.receiptNumbers?.[ownerId] || `N/A-${payment.id.slice(-5)}`;
            const receiptUrl = `${window.location.origin}/receipt/${payment.id}/${beneficiary.ownerId}`;
            const qrDataContent = JSON.stringify({ receiptNumber, date: format(new Date(), 'yyyy-MM-dd'), amount: beneficiary.amount, ownerId: beneficiary.ownerId, url: receiptUrl });
            const qrCodeUrl = await QRCode.toDataURL(qrDataContent, { errorCorrectionLevel: 'M', margin: 2, scale: 4, color: { dark: '#000000', light: '#FFFFFF' } });


            setReceiptData({
                payment,
                beneficiary,
                ownerName: ownerData.name,
                ownerUnit: `${ownerData.properties?.[0]?.street} - ${ownerData.properties?.[0]?.house}`,
                paidDebts: paidDebts.sort((a,b) => a.year - b.year || a.month - b.month),
                previousBalance: previousBalance,
                currentBalance: ownerData.balance || 0,
                receiptNumber: receiptNumber,
                qrCodeUrl: qrCodeUrl
            });
            setIsDialogOpen(true);

        } catch (error) {
            console.error("Error al preparar recibo:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la información para el recibo.' });
        } finally {
            setIsGenerating(false);
        }
    };
    // -------------------------------------------------------------------------
    // RENDERIZADO
    // -------------------------------------------------------------------------

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="ml-3">Cargando su información...</p>
            </div>
        );
    }
    
    if (!ownerData) {
        return (
            <div className="p-8">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        No se encontraron datos asociados a su usuario. Por favor, contacte a la administración.
                    </AlertDescription>
                </Alert>
                
            </div>
        );
    }
    
    const ownerUnit = (ownerData.properties && ownerData.properties.length > 0) 
        ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` 
        : 'N/A';
    
    const statusVariant = stats.isSolvente ? 'success' : stats.isVencida ? 'destructive' : 'warning';


    return (
        <div className="space-y-6 md:space-y-8 p-4 md:p-8">
            <h1 className="text-3xl font-bold font-headline">👋 ¡Hola, {ownerData.name?.split(' ')[0] || 'Propietario'}!</h1>
            
            <div className="relative w-full overflow-hidden rounded-lg bg-yellow-400 text-black">
                <Marquee pauseOnHover>
                    <p className="px-4 text-sm font-semibold">
                    Recuerda que tú Cuota Condominial se Carga el día 1 y Vence los días 5 de cada Mes. Utiliza la Calculadora de Pagos para estar siempre al día. La autogestión es responsabilidad de todos.
                    </p>
                </Marquee>
            </div>
            
            <CarteleraDigital anuncios={anuncios} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* --- Tarjeta de Estado de Cuenta --- */}
                <Card className={cn("border-2 shadow-lg col-span-1", 
                    statusVariant === 'success' && 'border-green-500',
                    statusVariant === 'warning' && 'border-yellow-500',
                    statusVariant === 'destructive' && 'border-red-500'
                )}>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <CardTitle className="flex items-center gap-2">
                                {stats.isSolvente ? <ShieldCheck className="h-6 w-6 text-green-500"/> : <AlertCircle className="h-6 w-6 text-red-500"/>}
                                Estado de Cuenta
                            </CardTitle>
                            <Badge variant={statusVariant} className="text-sm px-3 py-1">
                                {stats.isSolvente ? 'Solvente' : stats.isVencida ? 'Deuda Vencida' : 'Pendiente'}
                            </Badge>
                        </div>
                        <CardDescription>Unidad: {ownerUnit}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-between gap-4">
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground">Deuda Pendiente (USD)</p>
                            <p className={cn("text-5xl font-extrabold", stats.isSolvente ? 'text-green-500' : 'text-destructive')}>
                                ${formatToTwoDecimals(stats.totalPendingUSD)}
                            </p>
                            {!stats.isSolvente && <p className="text-xs text-muted-foreground mt-1">Deuda más antigua: {stats.oldestDebtDate}</p>}
                        </div>
                        
                        <Button asChild className="w-full" disabled={stats.isSolvente}>
                            <Link href="/owner/payments/calculator">
                                <CalendarCheck2 className="mr-2 h-4 w-4" />
                                Calcular y Pagar Deuda
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
                {/* --- Tarjeta de Saldo a Favor --- */}
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Banknote className="h-6 w-6 text-primary"/>
                            Saldo a Favor
                        </CardTitle>
                        <CardDescription>Monto disponible para cubrir futuras deudas.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center">
                        <p className="text-5xl font-extrabold text-primary">
                             Bs. {formatToTwoDecimals(ownerData.balance || 0)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* --- Historial de Pagos --- */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Receipt className="h-5 w-5 text-primary"/>
                        Historial de Pagos Recientes
                    </CardTitle>
                    <CardDescription>Últimos pagos reportados y su estado.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead className="text-right">Monto (Bs)</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-right">Recibo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.slice(0, 5).map(p => {
                                const beneficiary = p.beneficiaries.find(b => b.ownerId === ownerId);
                                if(!beneficiary) return null;
                                let statusIcon, statusText;
                                switch(p.status){
                                    case 'aprobado': statusIcon=<CheckCircle className="h-4 w-4 mr-1"/>; statusText="Aprobado"; break;
                                    case 'pendiente': statusIcon=<Clock className="h-4 w-4 mr-1"/>; statusText="Pendiente"; break;
                                    case 'rechazado': statusIcon=<X className="h-4 w-4 mr-1"/>; statusText="Rechazado"; break;
                                }
                                return (
                                <TableRow key={p.id}>
                                    <TableCell>{format(p.paymentDate.toDate(), 'dd MMM yy', {locale: es})}</TableCell>
                                    <TableCell className="text-right font-medium">{formatToTwoDecimals(beneficiary.amount)}</TableCell>
                                    <TableCell className="text-center"><Badge variant={p.status === 'aprobado' ? 'success' : p.status === 'rechazado' ? 'destructive' : 'warning'} className="flex items-center justify-center">{statusIcon}{statusText}</Badge></TableCell>
                                    <TableCell className="text-right">
                                        {p.status === 'aprobado' && (
                                            <Button variant="ghost" size="sm" onClick={() => openReceipt(p)} disabled={isGenerating}>
                                                {isGenerating ? <Loader2 className="animate-spin h-4 w-4"/> : <Download className="h-4 w-4"/>}
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                                );
                            })}
                             {payments.length === 0 && (
                                 <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No tienes pagos registrados.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                   <CardFooter>
                    <Link href="/owner/payments/report" passHref>
                        <Button variant="link" className="px-0">Ver historial completo y reportar pago →</Button>
                    </Link>
                </CardFooter>
            </Card>

              {/* --- Feedback de la App --- */}
             {!feedbackSent && (
                 <Card className="bg-muted">
                    <CardHeader>
                        <CardTitle className="text-base">¿Qué tal tu experiencia con la app?</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center gap-4">
                        <Button 
                            variant={lastFeedback === 'liked' ? 'default' : 'outline'} 
                            size="lg"
                            onClick={() => handleFeedback('liked')}
                            disabled={feedbackSent}
                            className="flex-1 transition-all duration-300"
                        >
                            <ThumbsUp className="mr-2 h-5 w-5"/>
                            Me gusta
                        </Button>
                        <Button 
                            variant={lastFeedback === 'disliked' ? 'destructive' : 'outline'} 
                            size="lg"
                            onClick={() => handleFeedback('disliked')}
                            disabled={feedbackSent}
                            className="flex-1 transition-all duration-300"
                        >
                            <ThumbsDown className="mr-2 h-5 w-5"/>
                            No me gusta
                        </Button>
                    </CardContent>
                </Card>
              )}


            {/* --- Modal de Recibo --- */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                 <DialogContent className="sm:max-w-2xl">
                    {receiptData ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Receipt className="text-primary"/> Recibo de Pago N°: {receiptData.receiptNumber}
                                </DialogTitle>
                                <DialogDescription>
                                    Emitido el {format(new Date(), 'dd MMMM, yyyy', {locale: es})}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto p-4 border rounded-lg">
                                <div className="flex justify-between items-start">
                                    {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="w-20 h-20 object-contain rounded-md" />}
                                    <div className="text-right">
                                        <h3 className="font-bold text-lg">{companyInfo?.name}</h3>
                                        <p className="text-xs">{companyInfo?.rif}</p>
                                        <p className="text-xs">{companyInfo?.address}</p>
                                    </div>
                                </div>
                                <Separator />
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p><strong>Beneficiario:</strong> {receiptData.ownerName}</p>
                                        <p><strong>Propiedad:</strong> {receiptData.ownerUnit}</p>
                                    </div>
                                    <div className="text-right">
                                        <p><strong>Fecha del Pago:</strong> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                                        <p><strong>Referencia:</strong> {receiptData.payment.reference}</p>
                                    </div>
                                </div>
                                <div className="text-sm bg-muted/50 p-3 rounded-md">
                                    <p><strong>Monto Pagado:</strong> Bs. {formatToTwoDecimals(receiptData.beneficiary.amount)}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold mb-2">Conceptos Pagados</h4>
                                    {receiptData.paidDebts.length > 0 ? (
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Período</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Monto (Bs)</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {receiptData.paidDebts.map(debt => (
                                                    <TableRow key={debt.id}>
                                                        <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                        <TableCell>{debt.description}</TableCell>
                                                        <TableCell className="text-right">{formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (<p className="text-xs italic text-muted-foreground">El pago fue abonado al saldo a favor.</p>)}
                                </div>
                                <div className="text-right text-sm space-y-1 p-3 bg-muted/50 rounded-md">
                                    <p>Saldo Anterior: Bs. {formatToTwoDecimals(receiptData.previousBalance)}</p>
                                    <p className="font-bold">Saldo a Favor Actual: Bs. {formatToTwoDecimals(receiptData.currentBalance)}</p>
                                </div>
                            </div>
                            <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
                                <Button className="w-full sm:w-auto" onClick={() => handleGenerateAndAct('download', receiptData)} disabled={isGenerating}>
                                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Download className="h-4 w-4 mr-2"/>}
                                    Descargar PDF
                                </Button>
                                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => handleGenerateAndAct('share', receiptData)} disabled={isGenerating}>
                                    <Share2 className="h-4 w-4 mr-2"/>
                                    Compartir
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                          <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin" />
                          </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}


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
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import { getMessagingService } from '@/lib/firebase'
import { getToken, onMessage } from 'firebase/messaging'
import { Separator } from '@/components/ui/separator';


// Imports de Lógica y Librerías de Next/React
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, Timestamp, orderBy, addDoc, serverTimestamp, limit, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";


// -------------------------------------------------------------------------
// TIPOS Y CONSTANTES (Sin Cambios)
// -------------------------------------------------------------------------

type Debt = {
    id: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
    paidAmountUSD?: number;
};
// ... (Otros tipos Payment, CompanyInfo, ReceiptData, monthsLocale, formatToTwoDecimals, solventeImage sin cambios)
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

                // Suscripción a pagos - AHORA SIN ORDER BY
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
        
        const currentDate = new Date();
        const startOfCurrentMonth = startOfMonth(currentDate);
        
        const isVencida = pendingDebts.some(d => {
            const debtDate = new Date(d.year, d.month - 1, 1);
            return isBefore(debtDate, startOfCurrentMonth);
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
    
    // Función para manejar la descarga y compartición del PDF
    const handleGenerateAndAct = async (action: 'download' | 'share') => {
        if (!receiptData || !companyInfo) return;
        setIsGenerating(true);

        try {
            const { jsPDF, autoTable, QRCode } = await importPdfLibs();
            const doc = new jsPDF('p', 'mm', 'a4');
            const { payment, beneficiary, paidDebts, previousBalance, currentBalance, receiptNumber } = receiptData;
            
            // Lógica de generación de PDF aquí... (resumida para brevedad)
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;
            let y = margin;
            
            // Header
            if (companyInfo.logo) doc.addImage(companyInfo.logo, 'PNG', margin, y, 25, 25);
            doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, y + 8);
            doc.setFontSize(9).setFont('helvetica', 'normal').text(companyInfo.rif, margin + 30, y + 14);

            doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, y + 35, { align: 'center' });
            doc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${receiptNumber}`, pageWidth - margin, y + 35, { align: 'right' });
            
            y += 50;

            doc.setFontSize(10).text(`Propietario: ${beneficiary.ownerName}`, margin, y); y += 6;
            doc.text(`Propiedad: ${beneficiary.street} - ${beneficiary.house}`, margin, y); y += 6;
            doc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, y); y += 10;
            
            const tableBody = paidDebts.map(debt => {
                const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
                return [
                    `${monthsLocale[debt.month]} ${debt.year}`,
                    debt.description,
                    `Bs. ${formatToTwoDecimals(debtAmountBs)}`
                ];
            });

            autoTable(doc, {
                startY: y,
                head: [['Período', 'Concepto', 'Monto Pagado (Bs)']],
                body: tableBody,
                theme: 'striped',
                headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            });
            y = (doc as any).lastAutoTable.finalY + 10;

            const summary = [
                ['Monto Total Pagado:', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`],
                ['Saldo Anterior:', `Bs. ${formatToTwoDecimals(previousBalance)}`],
                ['Saldo Actual:', `Bs. ${formatToTwoDecimals(currentBalance)}`],
            ];

            autoTable(doc, {
                startY: y, body: summary, theme: 'plain', styles: { fontStyle: 'bold', fontSize: 10 },
                columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right'} }
            });

            const pdfBlob = doc.output('blob');
            const pdfFile = new File([pdfBlob], `recibo_${receiptNumber}.pdf`, { type: 'application/pdf' });
            
            if (action === 'download') {
                doc.save(`recibo_${receiptNumber}.pdf`);
            } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                await navigator.share({
                    title: `Recibo de Pago ${receiptNumber}`,
                    text: `Recibo de pago para ${receiptData.ownerName}.`,
                    files: [pdfFile],
                });
            } else {
                const url = URL.createObjectURL(pdfFile);
                window.open(url, '_blank');
            }

        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "No se pudo generar el PDF. Intente de nuevo.", variant: 'destructive'});
        } finally {
            setIsGenerating(false);
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


            setReceiptData({
                payment,
                beneficiary,
                ownerName: ownerData.name,
                ownerUnit: `${ownerData.properties?.[0]?.street} - ${ownerData.properties?.[0]?.house}`,
                paidDebts: paidDebts.sort((a,b) => a.year - b.year || a.month - b.month),
                previousBalance: previousBalance,
                currentBalance: ownerData.balance || 0,
                receiptNumber: payment.receiptNumbers?.[ownerId] || `N/A-${payment.id.slice(-5)}`
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
            <h1 className="text-3xl font-bold font-headline">¡Hola, {ownerData.name?.split(' ')[0] || 'Propietario'}!</h1>
            
            <Alert className="border-mustard bg-mustard/10 text-mustard-foreground shadow-md">
                <HelpCircle className="h-4 w-4 !text-mustard" />
                <AlertDescription className="font-semibold">
                    La Cuota de Cada Mes vence el Día 5, a partir del día 6 tu estado puede ser Solvente o No Solvente.
                </AlertDescription>
            </Alert>
            
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
                    <Link href="/owner/payments" passHref>
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
                <DialogContent className="sm:max-w-lg">
                    {receiptData && companyInfo ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                     <Receipt className="text-primary"/> Recibo de Pago N°: {receiptData.receiptNumber}
                                </DialogTitle>
                                <DialogDescription>
                                     Emitido el {format(new Date(), 'dd MMMM, yyyy', {locale: es})}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4 border rounded-md">
                                 <p><strong>Propietario:</strong> {receiptData.ownerName}</p>
                                 <p><strong>Propiedad:</strong> {receiptData.ownerUnit}</p>
                                 <p><strong>Fecha del Pago:</strong> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                                 <p><strong>Monto Pagado:</strong> Bs. {formatToTwoDecimals(receiptData.beneficiary.amount)}</p>
                                <h4 className="font-bold pt-2 border-t">Detalles Cubiertos</h4>
                                {receiptData.paidDebts.length > 0 ? (
                                    <ul className="list-disc pl-5 text-sm">
                                        {receiptData.paidDebts.map(d => <li key={d.id}>{d.description} ({monthsLocale[d.month]} {d.year})</li>)}
                                    </ul>
                                ) : (
                                    <p className="text-sm italic">El pago fue abonado a su saldo a favor.</p>
                                )}
                                <Separator />
                                <div className="text-right text-sm space-y-1">
                                    <p>Saldo Anterior: Bs. {formatToTwoDecimals(receiptData.previousBalance)}</p>
                                    <p className="font-bold">Saldo a Favor Actual: Bs. {formatToTwoDecimals(receiptData.currentBalance)}</p>
                                </div>
                            </div>
                             <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
                                <Button className="w-full sm:w-auto" onClick={() => handleGenerateAndAct('download')} disabled={isGenerating}>
                                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Download className="h-4 w-4 mr-2"/>}
                                    Descargar PDF
                                </Button>
                                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => handleGenerateAndAct('share')} disabled={isGenerating}>
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

// -------------------------------------------------------------------------
// COMPONENTES AUXILIARES (Función de importación de PDF)
// -------------------------------------------------------------------------
const importPdfLibs = async () => {
  const [{ default: jsPDF }, autoTable, { default: QRCode }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('qrcode')
  ]);
  return { jsPDF, autoTable, QRCode };
};

// -------------------------------------------------------------------------
// FUNCIÓN DE GENERACIÓN DE PDF
// -------------------------------------------------------------------------
const generateReceiptPDF = async (receiptData: ReceiptData, companyInfo: CompanyInfo, qrCodeUrl?: string): Promise<jsPDF | null> => {
    if (!receiptData) return null;
    
    try {
        const { jsPDF, autoTable } = await importPdfLibs();
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        let y = margin;
        
        // Header
        if (companyInfo.logo) {
             try { doc.addImage(companyInfo.logo, 'PNG', margin, y, 25, 25); }
             catch(e) { console.error("Error adding logo to PDF", e); }
        }
        doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, y + 8);
        doc.setFontSize(9).setFont('helvetica', 'normal').text(companyInfo.rif, margin + 30, y + 14);

        // Title
        doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, y + 35, { align: 'center' });
        doc.setFontSize(10).setFont('helvetica', 'normal').text(`N°: ${receiptData.receiptNumber}`, pageWidth - margin, y + 35, { align: 'right' });
        y += 45;
        
        // Details
        doc.setFontSize(10).text(`Propietario: ${receiptData.ownerName}`, margin, y); y += 6;
        doc.text(`Propiedad: ${receiptData.ownerUnit}`, margin, y); y+= 6;
        doc.text(`Fecha Pago: ${format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, y); y+= 10;

        const tableBody = receiptData.paidDebts.map(debt => {
            const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate;
            return [
                `${monthsLocale[debt.month]} ${debt.year}`,
                debt.description,
                `$${formatToTwoDecimals(debt.paidAmountUSD || debt.amountUSD)}`,
                `Bs. ${formatToTwoDecimals(debtAmountBs)}`
            ];
        });
        
        if (tableBody.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['Período', 'Concepto', 'Monto ($)', 'Monto Pagado (Bs)']],
                body: tableBody,
                theme: 'grid',
            });
            y = (doc as any).lastAutoTable.finalY;
        } else {
            doc.text('Abono a saldo a favor.', margin, y);
            y += 10;
        }
        
        // Footer Summary
        y += 10;
        const finalY = doc.internal.pageSize.getHeight() - 20;
        doc.setFontSize(10).setFont('helvetica', 'bold').text('Total Pagado:', pageWidth - margin - 50, finalY - 15);
        doc.text(`Bs. ${formatToTwoDecimals(receiptData.beneficiary.amount)}`, pageWidth - margin, finalY - 15, { align: 'right' });
        doc.text('Saldo a Favor Actual:', pageWidth - margin - 50, finalY - 5);
        doc.text(`Bs. ${formatToTwoDecimals(receiptData.currentBalance)}`, pageWidth - margin, finalY - 5, { align: 'right' });

        return doc;

    } catch (e) {
        console.error("Error generating PDF:", e);
        return null;
    }
}

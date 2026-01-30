

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
import { collection, query, where, onSnapshot, getDocs, doc, Timestamp, orderBy, addDoc, serverTimestamp, limit, getDoc, runTransaction, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import Marquee from "@/components/ui/marquee";
import { generatePaymentReceipt } from '@/lib/pdf-generator';


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
    paymentMethod: string;
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

const formatCurrency = (num: number) => num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


// -------------------------------------------------------------------------
// Componente de Dashboard del Propietario
// -------------------------------------------------------------------------

export default function OwnerDashboardPage() {
    const { user, ownerData, activeCondoId, companyInfo, loading: authLoading } = useAuth();
    const { toast } = useToast();
    
    // Estados del componente
    const [loading, setLoading] = useState(true);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [lastFeedback, setLastFeedback] = useState<'liked' | 'disliked' | null>(null);
    const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
    const [now, setNow] = useState<Date | null>(null);

    const ownerId = user?.uid;

    // Efecto para cargar todos los datos de Firestore
    useEffect(() => {
        setNow(new Date());

        if (authLoading || !ownerId || !activeCondoId) {
            if (!authLoading) setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                 // Suscripción a anuncios
                const anunciosQuery = query(collection(db, "condominios", activeCondoId, "billboard_announcements"), orderBy("createdAt", "desc"));
                const unsubAnuncios = onSnapshot(anunciosQuery, (snapshot) => {
                  setAnuncios(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Anuncio)));
                });

                // Suscripción a deudas
                const debtsQuery = query(collection(db, 'condominios', activeCondoId, 'debts'), where('ownerId', '==', ownerId), orderBy('year', 'desc'), orderBy('month', 'desc'));
                const unsubDebts = onSnapshot(debtsQuery, (snapshot) => {
                    const debtsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));
                    setDebts(debtsList);
                });

                // Suscripción a pagos
                const paymentsQuery = query(collection(db, 'condominios', activeCondoId, 'payments'), where('beneficiaryIds', 'array-contains', ownerId));
                const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
                    const paymentsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
                    paymentsList.sort((a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis());
                    setPayments(paymentsList);
                });
                
                // Suscripción a feedback
                const feedbackQuery = query(collection(db, 'condominios', activeCondoId, 'app_feedback'), where('ownerId', '==', ownerId), limit(1));
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

    }, [ownerId, authLoading, toast, activeCondoId]);


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
        
        if (!now) {
            return {
                totalPendingUSD,
                pendingDebtsCount: pendingDebts.length,
                lastPayment,
                isSolvente,
                oldestDebtDate,
                isVencida: false
            };
        }

        const today = now;
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
    }, [debts, payments, now]);

    
    // -------------------------------------------------------------------------
    // MANEJADORES DE EVENTOS
    // -------------------------------------------------------------------------

    const handleFeedback = async (response: 'liked' | 'disliked') => {
        if (!ownerId || feedbackSent || !activeCondoId) return;

        setLastFeedback(response); // Optimistic update
        setFeedbackSent(true);

        try {
            await addDoc(collection(db, 'condominios', activeCondoId, 'app_feedback'), {
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
    setIsGenerating(true);

    const { payment, beneficiary, paidDebts, previousBalance, currentBalance, receiptNumber } = data;

    const conceptsForPdf = paidDebts.map(debt => {
        const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
        const propertyLabel = debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A';
        const concept = `${debt.description} (${propertyLabel})`;
        return [
            `${monthsLocale[debt.month]} ${debt.year}`,
            concept,
            `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`,
            formatCurrency(debtAmountBs)
        ];
    });

    if (paidDebts.length === 0 && beneficiary.amount > 0) {
        conceptsForPdf.push(['', 'Abono a Saldo a Favor', '', formatCurrency(beneficiary.amount)]);
    }

    const totalDebtPaidInBs = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);

    const dataForPdf = {
        condoName: companyInfo.name,
        rif: companyInfo.rif,
        receiptNumber: receiptNumber,
        ownerName: data.ownerName,
        method: payment.paymentMethod,
        bank: payment.bank,
        reference: payment.reference,
        date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
        rate: formatCurrency(payment.exchangeRate),
        concepts: conceptsForPdf,
        prevBalance: formatCurrency(previousBalance),
        receivedAmount: formatCurrency(beneficiary.amount),
        totalDebtPaid: formatCurrency(totalDebtPaidInBs),
        currentBalance: formatCurrency(currentBalance),
        observations: payment.observations || 'Sin observaciones.'
    };
    
    try {
        if (action === 'download') {
            generatePaymentReceipt(dataForPdf, companyInfo.logo, 'download');
        } else if (navigator.share) {
            const pdfBlob = generatePaymentReceipt(dataForPdf, companyInfo.logo, 'blob');
            if (pdfBlob) {
                const pdfFile = new File([pdfBlob], `Recibo_${receiptNumber}.pdf`, { type: 'application/pdf' });
                if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                    await navigator.share({
                        title: `Recibo de Pago ${receiptNumber}`,
                        text: `Recibo de pago para ${data.ownerName}.`,
                        files: [pdfFile],
                    });
                } else {
                     throw new Error('No se puede compartir el PDF en este navegador.');
                }
            }
        } else {
          throw new Error('La API de compartir no está soportada en este navegador.');
        }
    } catch (error: any) {
        console.error('Error en Share/Download:', error);
        // Fallback to download if sharing fails
        generatePaymentReceipt(dataForPdf, companyInfo.logo, 'download');
        toast({ title: 'Compartir no disponible', description: 'Se ha iniciado la descarga del PDF.'});
    } finally {
        setIsGenerating(false);
    }
};


    const openReceipt = async (payment: Payment) => {
        if (!ownerId || !ownerData || !companyInfo || !activeCondoId) {
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
                query(collection(db, 'condominios', activeCondoId, 'debts'), where('paymentId', '==', payment.id), where('ownerId', '==', ownerId))
            );
            const paidDebts = paidDebtsSnapshot.docs.map(d => d.data() as Debt);
            
            const totalDebtPaidWithPayment = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
            
            // Recalculate previous balance based on current state
            const previousBalance = (ownerData.balance || 0) - (beneficiary.amount - totalDebtPaidWithPayment);

            const receiptNumber = payment.receiptNumbers?.[ownerId] || `N/A-${payment.id.slice(-5)}`;

            setReceiptData({
                payment,
                beneficiary,
                ownerName: ownerData.name,
                ownerUnit: `${ownerData.properties?.[0]?.street} - ${ownerData.properties?.[0]?.house}`,
                paidDebts: paidDebts.sort((a,b) => a.year - b.year || a.month - b.month),
                previousBalance: previousBalance,
                currentBalance: ownerData.balance || 0,
                receiptNumber: receiptNumber
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
            
            <div className="relative w-full overflow-hidden rounded-lg bg-blue-100 text-blue-800">
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
                    statusVariant === 'success' && 'border-primary',
                    statusVariant === 'warning' && 'border-yellow-500',
                    statusVariant === 'destructive' && 'border-red-500'
                )}>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <CardTitle className="flex items-center gap-2">
                                {stats.isSolvente ? <ShieldCheck className="h-6 w-6 text-primary"/> : <AlertCircle className="h-6 w-6 text-red-500"/>}
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
                            <p className={cn("text-5xl font-extrabold", stats.isSolvente ? 'text-primary' : 'text-destructive')}>
                                ${formatCurrency(stats.totalPendingUSD)}
                            </p>
                            {!stats.isSolvente && <p className="text-xs text-muted-foreground mt-1">Deuda más antigua: {stats.oldestDebtDate}</p>}
                        </div>
                        
                        <Button asChild className="w-full" disabled={stats.isSolvente}>
                            <Link href="/owner/payments?tab=calculator">
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
                             Bs. {formatCurrency(ownerData.balance || 0)}
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
                                    <TableCell className="text-right font-medium">{formatCurrency(beneficiary.amount)}</TableCell>
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
                    <Link href="/owner/payments?tab=report" passHref>
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
                                    <p><strong>Monto Pagado:</strong> Bs. {formatCurrency(receiptData.beneficiary.amount)}</p>
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
                                                        <TableCell className="text-right">{formatCurrency((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (<p className="text-xs italic text-muted-foreground">El pago fue abonado al saldo a favor.</p>)}
                                </div>
                                <div className="text-right text-sm space-y-1 p-3 bg-muted/50 rounded-md">
                                    <p>Saldo Anterior: Bs. {formatCurrency(receiptData.previousBalance)}</p>
                                    <p className="font-bold">Saldo a Favor Actual: Bs. {formatCurrency(receiptData.currentBalance)}</p>
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

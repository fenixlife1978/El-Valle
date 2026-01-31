
'use client';

// Imports de UI
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, Receipt, CalendarCheck2, Download, Banknote, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from "@/components/ui/alert";
import CarteleraDigital from "@/components/CarteleraDigital";

// Imports de Lógica y Librerías
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, Timestamp, orderBy, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Marquee from "@/components/ui/marquee";
import { generatePaymentReceipt } from '@/lib/pdf-generator';

// -------------------------------------------------------------------------
// TIPOS
// -------------------------------------------------------------------------
type Anuncio = { id: string; urlImagen: string; titulo: string; descripcion?: string; published?: boolean; };

type Debt = {
    id: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
    paidAmountUSD?: number;
    property: { street: string, house: string };
    published?: boolean;
};

type Payment = {
    id: string;
    status: 'pendiente' | 'aprobado' | 'rechazado';
    totalAmount: number;
    paymentDate: Timestamp;
    reference: string;
    beneficiaryIds: string[];
    beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[];
    exchangeRate: number;
    receiptNumbers?: { [ownerId: string]: string };
    observations?: string;
    paymentMethod: string;
    bank: string;
};

type ReceiptData = {
    payment: Payment;
    beneficiary: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; };
    ownerName: string;
    ownerUnit: string;
    paidDebts: Debt[];
    previousBalance: number;
    currentBalance: number;
    receiptNumber: string;
} | null;

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatCurrency = (num: number) => num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// -------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// -------------------------------------------------------------------------
export default function OwnerDashboardPage() {
    const { user, ownerData, activeCondoId, workingCondoId, companyInfo, loading: authLoading } = useAuth();
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
    const [now, setNow] = useState<Date | null>(null);

    const ownerId = user?.uid;
    // Usamos las variables solicitadas para buscar la información
    const currentCondoId = activeCondoId || workingCondoId;

    useEffect(() => {
        setNow(new Date());

        if (authLoading || !ownerId || !currentCondoId) {
            if (!authLoading && (!ownerId || !currentCondoId)) setLoading(false);
            return;
        }

        setLoading(true);

        // 1. Suscripción a Anuncios (Solo Publicados)
        const unsubAnuncios = onSnapshot(
            query(
                collection(db, "condominios", currentCondoId, "billboard_announcements"), 
                where("published", "==", true),
                orderBy("createdAt", "desc")
            ),
            (snapshot) => setAnuncios(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Anuncio)))
        );

        // 2. Suscripción a Deudas (Filtrado por Propietario)
        const unsubDebts = onSnapshot(
            query(
                collection(db, 'condominios', currentCondoId, 'debts'), 
                where('ownerId', '==', ownerId),
                orderBy('year', 'desc'), 
                orderBy('month', 'desc')
            ),
            (snapshot) => setDebts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt)))
        );

        // 3. Suscripción a Pagos
        const unsubPayments = onSnapshot(
            query(
                collection(db, 'condominios', currentCondoId, 'payments'), 
                where('beneficiaryIds', 'array-contains', ownerId)
            ),
            (snapshot) => {
                const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
                setPayments(list.sort((a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis()));
                setLoading(false);
            }
        );

        // 4. Feedback
        const unsubFeedback = onSnapshot(
            query(collection(db, 'condominios', currentCondoId, 'app_feedback'), where('ownerId', '==', ownerId), limit(1)),
            (snapshot) => {
                if (!snapshot.empty) setFeedbackSent(true);
            }
        );

        return () => {
            unsubAnuncios();
            unsubDebts();
            unsubPayments();
            unsubFeedback();
        };
    }, [ownerId, currentCondoId, authLoading]);

    const stats = useMemo(() => {
        const pendingDebts = debts.filter(d => d.status === 'pending' || d.status === 'vencida');
        const totalPendingUSD = pendingDebts.reduce((sum, d) => sum + d.amountUSD - (d.paidAmountUSD || 0), 0);
        const isSolvente = totalPendingUSD <= 0.01;
        
        let oldestDebtDate = 'N/A';
        let isVencida = false;

        if (pendingDebts.length > 0) {
            const sorted = [...pendingDebts].sort((a, b) => a.year - b.year || a.month - b.month);
            oldestDebtDate = `${monthsLocale[sorted[0].month]} ${sorted[0].year}`;
            
            if (now) {
                const firstOfCurrent = startOfMonth(now);
                isVencida = sorted.some(d => {
                    const dDate = new Date(d.year, d.month - 1);
                    return isBefore(dDate, firstOfCurrent) || (d.year === now.getFullYear() && d.month === (now.getMonth() + 1) && now.getDate() > 5);
                });
            }
        }

        return { totalPendingUSD, pendingDebtsCount: pendingDebts.length, isSolvente, oldestDebtDate, isVencida };
    }, [debts, now]);

    const handleFeedback = async (response: 'liked' | 'disliked') => {
        if (!ownerId || !currentCondoId) return;
        setFeedbackSent(true);
        try {
            await addDoc(collection(db, 'condominios', currentCondoId, 'app_feedback'), { ownerId, response, timestamp: serverTimestamp() });
            toast({ title: "¡Gracias!", description: "Tu opinión nos ayuda a mejorar." });
        } catch { setFeedbackSent(false); }
    };

    const openReceipt = async (payment: Payment) => {
        if (!ownerId || !ownerData || !currentCondoId) return;
        setIsGenerating(true);
        try {
            const snap = await getDocs(query(collection(db, 'condominios', currentCondoId, 'debts'), where('paymentId', '==', payment.id), where('ownerId', '==', ownerId)));
            const paidDebts = snap.docs.map(d => d.data() as Debt);
            const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId)!;
            const totalDebtPaidBs = paidDebts.reduce((sum, d) => sum + ((d.paidAmountUSD || d.amountUSD) * payment.exchangeRate), 0);
            
            setReceiptData({
                payment, beneficiary, ownerName: ownerData.name,
                ownerUnit: `${ownerData.properties?.[0]?.street} - ${ownerData.properties?.[0]?.house}`,
                paidDebts: paidDebts.sort((a, b) => a.year - b.year || a.month - b.month),
                previousBalance: (ownerData.balance || 0) - (beneficiary.amount - totalDebtPaidBs),
                currentBalance: ownerData.balance || 0,
                receiptNumber: payment.receiptNumbers?.[ownerId] || `REC-${payment.id.slice(-5)}`
            });
            setIsDialogOpen(true);
        } catch (e) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el recibo." });
        } finally { setIsGenerating(false); }
    };

    const handleGenerateAndAct = async (action: 'download' | 'share', data: ReceiptData) => {
        if (!data || !companyInfo) return;
        setIsGenerating(true);
        try {
            const concepts = data.paidDebts.map(d => [
                `${monthsLocale[d.month]} ${d.year}`, d.description, `$${(d.paidAmountUSD || d.amountUSD).toFixed(2)}`, formatCurrency((d.paidAmountUSD || d.amountUSD) * data.payment.exchangeRate)
            ]);
            if (concepts.length === 0) concepts.push(['', 'Abono a Saldo a Favor', '', formatCurrency(data.beneficiary.amount)]);

            const pdfPayload = {
                condoName: companyInfo.name, rif: companyInfo.rif, receiptNumber: data.receiptNumber,
                ownerName: data.ownerName, method: data.payment.paymentMethod, bank: data.payment.bank,
                reference: data.payment.reference, date: format(data.payment.paymentDate.toDate(), 'dd/MM/yyyy'),
                rate: formatCurrency(data.payment.exchangeRate), concepts, prevBalance: formatCurrency(data.previousBalance),
                receivedAmount: formatCurrency(data.beneficiary.amount), totalDebtPaid: formatCurrency(concepts.reduce((s, c) => s + parseFloat(c[3].replace('.','').replace(',','.')), 0)),
                currentBalance: formatCurrency(data.currentBalance), observations: data.payment.observations || 'Sin observaciones.'
            };

            if (action === 'download') generatePaymentReceipt(pdfPayload, companyInfo.logo, 'download');
            else {
                const blob = generatePaymentReceipt(pdfPayload, companyInfo.logo, 'blob');
                if (blob && navigator.share) {
                    const file = new File([blob], `Recibo_${data.receiptNumber}.pdf`, { type: 'application/pdf' });
                    await navigator.share({ files: [file], title: 'Recibo de Pago' });
                }
            }
        } finally { setIsGenerating(false); }
    };

    if (authLoading || loading) return (
        <div className="flex flex-col items-center justify-center h-screen gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground animate-pulse font-medium">EFAS CondoSys • Sincronizando...</p>
        </div>
    );

    if (!ownerData) return (
        <div className="p-8"><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Perfil no encontrado. Contacte soporte.</AlertDescription></Alert></div>
    );

    const statusVariant = stats.isSolvente ? 'success' : stats.isVencida ? 'destructive' : 'warning';

    return (
        <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold font-headline tracking-tight">👋 ¡Hola, {ownerData.name?.split(' ')[0]}!</h1>
                <p className="text-muted-foreground">Bienvenido al portal de autogestión de tu condominio.</p>
            </header>
            
            <div className="relative w-full overflow-hidden rounded-xl bg-primary/5 border border-primary/10 text-primary py-2">
                <Marquee pauseOnHover className="[--duration:30s]">
                    <span className="px-4 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <AlertCircle className="h-4 w-4"/> Pago oportuno antes del 5 de cada mes • Usa la calculadora para reportar tus pagos • EFAS CondoSys
                    </span>
                </Marquee>
            </div>
            
            <CarteleraDigital anuncios={anuncios} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className={cn("border-2 shadow-xl transition-all", 
                    statusVariant === 'success' ? 'border-primary/20 bg-primary/[0.02]' : statusVariant === 'destructive' ? 'border-red-500/20 bg-red-500/[0.02]' : 'border-amber-500/20')}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-bold">Estado de Cuenta</CardTitle>
                            <CardDescription>Unidad: {ownerData.properties?.[0]?.street} - {ownerData.properties?.[0]?.house}</CardDescription>
                        </div>
                        <Badge variant={statusVariant} className="uppercase font-black px-3">{stats.isSolvente ? 'Solvente' : stats.isVencida ? 'Deuda Vencida' : 'Pendiente'}</Badge>
                    </CardHeader>
                    <CardContent className="pt-4 flex flex-col items-center text-center">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-tighter mb-1">Total Deuda Pendiente</p>
                        <div className={cn("text-5xl font-black mb-2", stats.isSolvente ? 'text-primary' : 'text-destructive')}>
                            ${formatCurrency(stats.totalPendingUSD)}
                        </div>
                        {!stats.isSolvente && <p className="text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">Deuda desde: {stats.oldestDebtDate}</p>}
                    </CardContent>
                    <CardFooter className="pt-4">
                        <Button asChild className="w-full h-12 rounded-xl font-bold shadow-lg" disabled={stats.isSolvente}>
                            <Link href="/owner/payments?tab=calculator">
                                <CalendarCheck2 className="mr-2 h-5 w-5" /> Calcular y Reportar Pago
                            </Link>
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="shadow-xl border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Banknote className="h-5 w-5 text-primary"/> Saldo a Favor
                        </CardTitle>
                        <CardDescription>Dinero disponible para próximas cuotas.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-8 flex flex-col items-center justify-center min-h-[140px]">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-tighter mb-1">Monto Disponible</p>
                        <p className="text-5xl font-black text-primary">Bs. {formatCurrency(ownerData.balance || 0)}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-2xl overflow-hidden rounded-2xl">
                <CardHeader className="bg-muted/50 border-b">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <Receipt className="h-5 w-5 text-primary"/> Historial de Pagos Recientes
                        </CardTitle>
                        <Link href="/owner/payments?tab=report">
                            <Button variant="outline" size="sm" className="font-bold text-xs uppercase">Nuevo Pago</Button>
                        </Link>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow>
                                <TableHead className="font-bold">Fecha</TableHead>
                                <TableHead className="text-right font-bold">Monto (Bs)</TableHead>
                                <TableHead className="text-center font-bold">Estado</TableHead>
                                <TableHead className="text-right font-bold">Acción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.slice(0, 5).map(p => {
                                const ben = p.beneficiaries.find(b => b.ownerId === ownerId);
                                if(!ben) return null;
                                return (
                                    <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                                        <TableCell className="font-medium">{format(p.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell className="text-right font-bold">{formatCurrency(ben.amount)}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={p.status === 'aprobado' ? 'success' : p.status === 'rechazado' ? 'destructive' : 'warning'} className="text-[10px] uppercase">
                                                {p.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {p.status === 'aprobado' && (
                                                <Button variant="ghost" size="sm" onClick={() => openReceipt(p)} disabled={isGenerating}>
                                                    {isGenerating ? <Loader2 className="animate-spin h-4 w-4"/> : <Download className="h-4 w-4 text-primary"/>}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {payments.length === 0 && (
                                <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-medium">Sin registros de pago.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-2xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
                    {receiptData ? (
                        <div className="flex flex-col">
                            <div className="bg-primary p-6 text-primary-foreground">
                                <div className="flex justify-between items-start mb-4">
                                    <Receipt className="h-10 w-10 opacity-50" />
                                    <div className="text-right">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Número de Recibo</p>
                                        <p className="text-xl font-black">{receiptData.receiptNumber}</p>
                                    </div>
                                </div>
                                <h2 className="text-2xl font-black uppercase tracking-tighter">Recibo de Pago</h2>
                                <p className="text-sm font-medium opacity-90">{companyInfo?.name || 'EFAS CondoSys'}</p>
                            </div>
                            
                            <div className="p-8 space-y-6">
                                <div className="grid grid-cols-2 gap-8 text-sm border-b pb-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Propietario</p>
                                        <p className="font-bold text-base">{receiptData.ownerName}</p>
                                        <p className="text-muted-foreground">{receiptData.ownerUnit}</p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Detalles</p>
                                        <p className="font-bold">{format(receiptData.payment.paymentDate.toDate(), 'dd MMMM, yyyy', {locale: es})}</p>
                                        <p className="text-muted-foreground">Ref: {receiptData.payment.reference}</p>
                                    </div>
                                </div>

                                <div className="bg-muted/50 rounded-2xl p-4 flex justify-between items-center">
                                    <span className="font-bold text-muted-foreground">Monto Recibido:</span>
                                    <span className="text-2xl font-black text-primary">Bs. {formatCurrency(receiptData.beneficiary.amount)}</span>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Conceptos</p>
                                    {receiptData.paidDebts.length > 0 ? (
                                        <div className="rounded-xl border overflow-hidden">
                                            <Table>
                                                <TableBody>
                                                    {receiptData.paidDebts.map(debt => (
                                                        <TableRow key={debt.id}>
                                                            <TableCell className="text-xs font-bold uppercase">{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">{debt.description}</TableCell>
                                                            <TableCell className="text-right font-bold text-xs">Bs. {formatCurrency((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ) : <p className="text-xs italic text-center py-4 bg-muted/30 rounded-xl">Monto abonado al saldo a favor.</p>}
                                </div>
                            </div>

                            <DialogFooter className="bg-muted/50 p-6 flex-row gap-3">
                                <Button className="flex-1 h-12 rounded-xl font-bold" onClick={() => handleGenerateAndAct('download', receiptData)} disabled={isGenerating}>
                                    <Download className="mr-2 h-4 w-4"/> PDF
                                </Button>
                                <Button variant="secondary" className="flex-1 h-12 rounded-xl font-bold" onClick={() => handleGenerateAndAct('share', receiptData)} disabled={isGenerating}>
                                    <Share2 className="mr-2 h-4 w-4"/> Compartir
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : <div className="p-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>}
                </DialogContent>
            </Dialog>
        </div>
    );
}

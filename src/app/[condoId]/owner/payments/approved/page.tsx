'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, orderBy, getDocs } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Download, Share2, Receipt, CheckCircle, ArrowLeft, FileText, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { generatePaymentReceipt } from '@/lib/pdf-generator';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

interface LiquidatedConcept {
    ownerId: string;
    description: string;
    amountUSD: number;
    period: string;
    type: 'deuda' | 'adelanto' | 'abono';
}

interface ApprovedPayment {
    id: string;
    totalAmount: number;
    exchangeRate: number;
    paymentDate: any;
    paymentMethod: string;
    bank: string;
    reference: string;
    receiptNumbers?: { [ownerId: string]: string };
    beneficiaries?: any[];
    observations?: string;
    liquidatedConcepts?: LiquidatedConcept[];
}

export default function ApprovedPaymentsPage() {
    const params = useParams();
    const router = useRouter();
    const condoId = params.condoId as string;
    const { user, ownerData, companyInfo, loading: authLoading } = useAuth();
    
    const [approvedPayments, setApprovedPayments] = useState<ApprovedPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPayment, setSelectedPayment] = useState<ApprovedPayment | null>(null);
    const [showReceiptDialog, setShowReceiptDialog] = useState(false);
    const [generatingReceipt, setGeneratingReceipt] = useState(false);

    useEffect(() => {
        if (!condoId || !user?.uid) return;

        const paymentsQuery = query(
            collection(db, 'condominios', condoId, 'payments'),
            where('beneficiaryIds', 'array-contains', user.uid),
            where('status', '==', 'aprobado'),
            orderBy('paymentDate', 'desc')
        );

        const unsubscribe = onSnapshot(paymentsQuery, async (snap) => {
            const paymentsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ApprovedPayment));
            
            for (const payment of paymentsData) {
                if (!payment.liquidatedConcepts || payment.liquidatedConcepts.length === 0) {
                    try {
                        const debtsQuery = query(
                            collection(db, 'condominios', condoId, 'debts'),
                            where('paymentId', '==', payment.id),
                            where('ownerId', '==', user.uid)
                        );
                        const debtsSnap = await getDocs(debtsQuery);
                        if (!debtsSnap.empty) {
                            const concepts: LiquidatedConcept[] = debtsSnap.docs.map(d => {
                                const data = d.data();
                                return {
                                    ownerId: data.ownerId,
                                    description: data.description || 'CUOTA DE CONDOMINIO',
                                    amountUSD: data.paidAmountUSD || data.amountUSD || 0,
                                    period: `${monthsLocale[data.month] || ''} ${data.year}`.trim(),
                                    type: 'deuda'
                                };
                            });
                            payment.liquidatedConcepts = concepts;
                        }
                    } catch (error) {
                        console.error("Error fetching debts for payment:", payment.id, error);
                    }
                }
            }
            
            setApprovedPayments(paymentsData);
            setLoading(false);
        }, (error) => {
            console.error("Error cargando pagos aprobados:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [condoId, user?.uid]);

    const getBeneficiaryInfo = (payment: ApprovedPayment) => {
        if (!payment.beneficiaries) return null;
        return payment.beneficiaries.find(b => b.ownerId === user?.uid);
    };

    const getReceiptNumber = (payment: ApprovedPayment) => {
        if (payment.receiptNumbers && user?.uid && payment.receiptNumbers[user.uid]) {
            return payment.receiptNumbers[user.uid];
        }
        return `REC-${payment.id.slice(-8).toUpperCase()}`;
    };

    const getOwnerConcepts = (payment: ApprovedPayment) => {
        if (!payment.liquidatedConcepts) return [];
        return payment.liquidatedConcepts.filter(c => c.ownerId === user?.uid);
    };

    const handleViewReceipt = (payment: ApprovedPayment) => {
        setSelectedPayment(payment);
        setShowReceiptDialog(true);
    };

    const handleDownloadReceipt = async (payment: ApprovedPayment) => {
        if (!user?.uid || !ownerData) return;
        
        setGeneratingReceipt(true);
        try {
            const beneficiary = getBeneficiaryInfo(payment);
            const receiptNumber = getReceiptNumber(payment);
            let ownerConcepts = getOwnerConcepts(payment);
            
            if (ownerConcepts.length === 0) {
                try {
                    const debtsQuery = query(
                        collection(db, 'condominios', condoId, 'debts'),
                        where('paymentId', '==', payment.id),
                        where('ownerId', '==', user.uid)
                    );
                    const debtsSnap = await getDocs(debtsQuery);
                    if (!debtsSnap.empty) {
                        ownerConcepts = debtsSnap.docs.map(d => {
                            const data = d.data();
                            return {
                                ownerId: data.ownerId,
                                description: data.description || 'CUOTA DE CONDOMINIO',
                                amountUSD: data.paidAmountUSD || data.amountUSD || 0,
                                period: `${monthsLocale[data.month] || ''} ${data.year}`.trim(),
                                type: 'deuda'
                            };
                        });
                    }
                } catch (error) {
                    console.error("Error fetching debts for receipt:", error);
                }
            }
            
            if (ownerConcepts.length === 0) {
                const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate) : new Date());
                ownerConcepts = [{
                    ownerId: user.uid,
                    description: 'PAGO DE CUOTA DE CONDOMINIO',
                    amountUSD: payment.totalAmount / payment.exchangeRate,
                    period: format(pDate, 'MMMM yyyy', { locale: es }).toUpperCase(),
                    type: 'deuda'
                }];
            }
            
            let condoName = companyInfo?.name || "CONJUNTO RESIDENCIAL EL VALLE";
            let condoRif = companyInfo?.rif || "J-40587208-0";
            let condoLogo = companyInfo?.logo || null;
            
            if (!companyInfo) {
                const condoRef = doc(db, 'condominios', condoId);
                const condoSnap = await getDoc(condoRef);
                if (condoSnap.exists()) {
                    const data = condoSnap.data();
                    condoName = data.nombre || data.name || condoName;
                    condoRif = data.rif || condoRif;
                }
            }
            
            const propertyString = beneficiary?.street && beneficiary?.house 
                ? `${beneficiary.street} - ${beneficiary.house}`
                : (ownerData?.properties?.[0] ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` : 'N/A');
            
            const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate) : new Date());
            
            const totalAbonadoBs = ownerConcepts.reduce((sum, c) => sum + (c.amountUSD * payment.exchangeRate), 0);
            const currentBalance = ownerData?.balance || 0;
            const prevBalance = Math.max(0, currentBalance - (payment.totalAmount - totalAbonadoBs));
            
            const concepts = ownerConcepts.map(c => {
                const isAbono = c.type === 'abono' || c.description.includes('ABONO');
                return [
                    c.period,
                    c.description.toUpperCase(),
                    isAbono ? '' : `$${c.amountUSD.toFixed(2)}`,
                    formatCurrency(c.amountUSD * payment.exchangeRate)
                ];
            });
            
            const receiptData = {
                condoName,
                rif: condoRif,
                receiptNumber,
                ownerName: ownerData.name,
                property: propertyString,
                method: payment.paymentMethod,
                bank: payment.bank || 'N/A',
                reference: payment.reference || 'N/A',
                date: format(pDate, 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                receivedAmount: formatCurrency(payment.totalAmount),
                totalDebtPaid: formatCurrency(totalAbonadoBs),
                prevBalance: formatCurrency(prevBalance),
                currentBalance: formatCurrency(currentBalance),
                observations: payment.observations || 'Pago verificado y aplicado por la administración.',
                concepts
            };
            
            await generatePaymentReceipt(receiptData, condoLogo, 'download');
            toast.success("Recibo descargado correctamente");
        } catch (error) {
            console.error("Error generando recibo:", error);
            toast.error("Error al generar el recibo");
        } finally {
            setGeneratingReceipt(false);
        }
    };

    const handleShareReceipt = async (payment: ApprovedPayment) => {
        if (!user?.uid || !ownerData) return;
        
        setGeneratingReceipt(true);
        try {
            const beneficiary = getBeneficiaryInfo(payment);
            const receiptNumber = getReceiptNumber(payment);
            let ownerConcepts = getOwnerConcepts(payment);
            
            if (ownerConcepts.length === 0) {
                try {
                    const debtsQuery = query(
                        collection(db, 'condominios', condoId, 'debts'),
                        where('paymentId', '==', payment.id),
                        where('ownerId', '==', user.uid)
                    );
                    const debtsSnap = await getDocs(debtsQuery);
                    if (!debtsSnap.empty) {
                        ownerConcepts = debtsSnap.docs.map(d => {
                            const data = d.data();
                            return {
                                ownerId: data.ownerId,
                                description: data.description || 'CUOTA DE CONDOMINIO',
                                amountUSD: data.paidAmountUSD || data.amountUSD || 0,
                                period: `${monthsLocale[data.month] || ''} ${data.year}`.trim(),
                                type: 'deuda'
                            };
                        });
                    }
                } catch (error) {
                    console.error("Error fetching debts for receipt:", error);
                }
            }
            
            if (ownerConcepts.length === 0) {
                const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate) : new Date());
                ownerConcepts = [{
                    ownerId: user.uid,
                    description: 'PAGO DE CUOTA DE CONDOMINIO',
                    amountUSD: payment.totalAmount / payment.exchangeRate,
                    period: format(pDate, 'MMMM yyyy', { locale: es }).toUpperCase(),
                    type: 'deuda'
                }];
            }
            
            let condoName = companyInfo?.name || "CONJUNTO RESIDENCIAL EL VALLE";
            let condoRif = companyInfo?.rif || "J-40587208-0";
            let condoLogo = companyInfo?.logo || null;
            
            if (!companyInfo) {
                const condoRef = doc(db, 'condominios', condoId);
                const condoSnap = await getDoc(condoRef);
                if (condoSnap.exists()) {
                    const data = condoSnap.data();
                    condoName = data.nombre || data.name || condoName;
                    condoRif = data.rif || condoRif;
                }
            }
            
            const propertyString = beneficiary?.street && beneficiary?.house 
                ? `${beneficiary.street} - ${beneficiary.house}`
                : (ownerData?.properties?.[0] ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` : 'N/A');
            
            const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate) : new Date());
            
            const totalAbonadoBs = ownerConcepts.reduce((sum, c) => sum + (c.amountUSD * payment.exchangeRate), 0);
            const currentBalance = ownerData?.balance || 0;
            const prevBalance = Math.max(0, currentBalance - (payment.totalAmount - totalAbonadoBs));
            
            const concepts = ownerConcepts.map(c => {
                const isAbono = c.type === 'abono' || c.description.includes('ABONO');
                return [
                    c.period,
                    c.description.toUpperCase(),
                    isAbono ? '' : `$${c.amountUSD.toFixed(2)}`,
                    formatCurrency(c.amountUSD * payment.exchangeRate)
                ];
            });
            
            const receiptData = {
                condoName,
                rif: condoRif,
                receiptNumber,
                ownerName: ownerData.name,
                property: propertyString,
                method: payment.paymentMethod,
                bank: payment.bank || 'N/A',
                reference: payment.reference || 'N/A',
                date: format(pDate, 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                receivedAmount: formatCurrency(payment.totalAmount),
                totalDebtPaid: formatCurrency(totalAbonadoBs),
                prevBalance: formatCurrency(prevBalance),
                currentBalance: formatCurrency(currentBalance),
                observations: payment.observations || 'Pago verificado y aplicado por la administración.',
                concepts
            };
            
            const blob = await generatePaymentReceipt(receiptData, condoLogo, 'blob');
            if (blob && navigator.share && typeof navigator.share === 'function') {
                const file = new File([blob], `Recibo_${ownerData.name.replace(/ /g, '_')}.pdf`, { type: 'application/pdf' });
                await navigator.share({ files: [file], title: 'Recibo de Pago', text: `Comprobante de pago - ${format(pDate, 'dd/MM/yyyy')}` });
                toast.success("Recibo compartido");
            } else {
                toast.error("Su navegador no soporta compartir archivos");
            }
        } catch (error) {
            console.error("Error compartiendo recibo:", error);
            toast.error("Error al compartir el recibo");
        } finally {
            setGeneratingReceipt(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Cargando pagos aprobados...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            {/* HEADER */}
            <div className="mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-4">
                            <Button 
                                variant="ghost" 
                                onClick={() => router.push(`/${condoId}/owner/dashboard`)}
                                className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Dashboard
                            </Button>
                            <div>
                                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                                    Pagos <span className="text-primary">Aprobados</span>
                                </h2>
                                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                                <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                                    Historial de pagos verificados y recibos disponibles
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* TABLA DE PAGOS APROBADOS */}
            <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                <CardHeader className="bg-gradient-to-r from-white/5 to-transparent p-6 border-b border-white/5">
                    <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                        <Receipt className="h-5 w-5 text-primary" /> Historial de Pagos
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {approvedPayments.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="bg-slate-800 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Receipt className="h-8 w-8 text-slate-600" />
                            </div>
                            <p className="text-[10px] font-black uppercase text-white/40 italic">No hay pagos aprobados</p>
                            <p className="text-[8px] font-bold text-slate-600 uppercase mt-1">Tus pagos aparecerán aquí una vez verificados</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-800/30">
                                    <TableRow className="border-white/5">
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Fecha</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Monto</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Método</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Referencia</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Estado</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase text-slate-400 pr-8">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {approvedPayments.map((payment) => {
                                        const pDate = payment.paymentDate?.toDate?.() || (payment.paymentDate ? new Date(payment.paymentDate) : new Date());
                                        const conceptCount = getOwnerConcepts(payment).length;
                                        return (
                                            <TableRow key={payment.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                                <TableCell className="font-black text-white text-xs italic">
                                                    {format(pDate, 'dd/MM/yyyy')}
                                                </TableCell>
                                                <TableCell className="font-black text-emerald-400 italic">
                                                    Bs. {formatCurrency(payment.totalAmount)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className="bg-primary/20 text-primary border-none text-[9px] font-black uppercase">
                                                        {payment.paymentMethod === 'movil' ? 'Pago Móvil' : payment.paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-mono text-[10px] text-white/60">
                                                    {payment.reference || 'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className="bg-emerald-500/20 text-emerald-500 border-none text-[9px] font-black uppercase">
                                                        <CheckCircle className="h-3 w-3 mr-1 inline" /> APROBADO
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-8">
                                                    <div className="flex justify-end gap-2">
                                                        <Button 
                                                            size="sm"
                                                            onClick={() => handleViewReceipt(payment)}
                                                            className="h-8 px-3 rounded-lg bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 font-black uppercase text-[9px]"
                                                        >
                                                            <Eye className="h-3 w-3 mr-1" /> Ver
                                                        </Button>
                                                        <Button 
                                                            size="sm"
                                                            onClick={() => handleDownloadReceipt(payment)}
                                                            disabled={generatingReceipt}
                                                            className="h-8 px-3 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-black uppercase text-[9px]"
                                                        >
                                                            {generatingReceipt ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                                                            PDF
                                                        </Button>
                                                        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                                                            <Button 
                                                                size="sm"
                                                                onClick={() => handleShareReceipt(payment)}
                                                                disabled={generatingReceipt}
                                                                className="h-8 px-3 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 font-black uppercase text-[9px]"
                                                            >
                                                                <Share2 className="h-3 w-3 mr-1" /> Compartir
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* DIÁLOGO DE DETALLE DEL RECIBO */}
            <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" /> Detalle del Recibo
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-sm">
                            Información del pago aprobado
                        </DialogDescription>
                    </DialogHeader>
                    {selectedPayment && (
                        <div className="py-4 space-y-4">
                            <div className="bg-white/5 p-4 rounded-2xl">
                                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">N° de Recibo</p>
                                <p className="font-mono text-sm text-primary">{getReceiptNumber(selectedPayment)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">Fecha</p>
                                    <p className="font-black text-white text-sm">
                                        {selectedPayment.paymentDate?.toDate ? 
                                            format(selectedPayment.paymentDate.toDate(), 'dd/MM/yyyy') : 
                                            'Fecha no disponible'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">Monto</p>
                                    <p className="font-black text-emerald-400 text-lg">Bs. {formatCurrency(selectedPayment.totalAmount)}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">Método de Pago</p>
                                <p className="font-black text-white text-sm uppercase">
                                    {selectedPayment.paymentMethod === 'movil' ? 'Pago Móvil' : 
                                     selectedPayment.paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo'}
                                </p>
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">Banco / Referencia</p>
                                <p className="font-black text-white text-sm">{selectedPayment.bank || 'N/A'} - {selectedPayment.reference || 'N/A'}</p>
                            </div>
                            {selectedPayment.observations && (
                                <div>
                                    <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">Observaciones</p>
                                    <p className="text-[10px] text-white/60">{selectedPayment.observations}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">Conceptos Liquidados</p>
                                <div className="space-y-2 mt-2">
                                    {getOwnerConcepts(selectedPayment).map((concept, idx) => (
                                        <div key={idx} className="text-[10px] border-l-2 border-primary/30 pl-2">
                                            <p className="font-black text-primary">{concept.period}</p>
                                            <p className="text-white/80">{concept.description}</p>
                                            <p className="text-emerald-400">${concept.amountUSD.toFixed(2)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-3">
                        <Button 
                            onClick={() => setShowReceiptDialog(false)} 
                            variant="ghost" 
                            className="rounded-xl font-black uppercase text-[10px] text-white/60 hover:text-white"
                        >
                            Cerrar
                        </Button>
                        {selectedPayment && (
                            <Button 
                                onClick={() => {
                                    handleDownloadReceipt(selectedPayment);
                                    setShowReceiptDialog(false);
                                }} 
                                disabled={generatingReceipt}
                                className="rounded-xl bg-gradient-to-r from-primary to-amber-600 hover:from-amber-600 hover:to-primary text-slate-900 font-black uppercase text-[10px] italic"
                            >
                                {generatingReceipt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                Descargar Recibo
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { 
    Search, CheckCircle, XCircle, Eye, MoreHorizontal, 
    Download, Loader2, Calendar as CalendarIcon, Banknote, 
    UserPlus, CheckCircle2, WalletCards, ArrowLeft, Trash2, 
    Hash, FileText, Save, Share2, FileDown, UserCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { 
    collection, onSnapshot, query, addDoc, serverTimestamp, 
    doc, getDoc, where, getDocs, Timestamp, runTransaction, 
    updateDoc, deleteDoc, increment, orderBy 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useAuthorization } from '@/hooks/use-authorization';
import { 
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
    DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub,
    DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal
} from '@/components/ui/dropdown-menu';
import { generatePaymentReceipt } from '@/lib/pdf-generator';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type Owner = { id: string; name: string; properties: { street: string, house: string }[]; balance?: number; role?: string; email?: string; };
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; amount: string; selectedProperty: { street: string, house: string } | null; };
type PaymentMethod = 'movil' | 'transferencia' | 'efectivo_bs' | '';
type Payment = { 
    id: string; 
    beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[]; 
    beneficiaryIds: string[]; 
    totalAmount: number; 
    exchangeRate: number; 
    paymentDate: Timestamp; 
    reportedAt: Timestamp; 
    paymentMethod: string; 
    bank: string; 
    reference: string; 
    status: 'pendiente' | 'aprobado' | 'rechazado'; 
    receiptUrl?: string; 
    observations?: string; 
    receiptNumbers?: { [ownerId: string]: string }; 
};

function VerificationComponent({ condoId }: { condoId: string }) {
    const { user, companyInfo } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const { toast } = useToast();

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pendiente');
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);

    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, 'payments'), orderBy('reportedAt', 'desc'));
        return onSnapshot(q, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
            setLoading(false);
        });
    }, [condoId]);

    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            if (p.status !== activeTab) return false;
            if (!searchTerm) return true;
            const search = searchTerm.toLowerCase();
            return p.reference?.toLowerCase().includes(search) || p.beneficiaries?.some(b => b.ownerName.toLowerCase().includes(search));
        });
    }, [payments, activeTab, searchTerm]);

    const handleApprove = (payment: Payment) => {
        requestAuthorization(async () => {
            if (!condoId) return;
            setIsVerifying(true);
            try {
                // ID EXCLUSIVO BANCO DE VENEZUELA
                const BDV_ACCOUNT_ID = "RdiTtY9ojCuYPRNvB7C3";
                const CAJA_PRINCIPAL_ID = "CAJA_PRINCIPAL_ID";
                
                let targetAccountId = "";
                let targetAccountName = "";
                
                const method = payment.paymentMethod.toLowerCase().trim();
                if (method.includes('movil') || method.includes('transferencia') || method.includes('pagomovil')) {
                    targetAccountId = BDV_ACCOUNT_ID;
                    targetAccountName = "BANCO DE VENEZUELA";
                } else if (method.includes('efectivo')) {
                    targetAccountId = CAJA_PRINCIPAL_ID;
                    targetAccountName = "CAJA PRINCIPAL";
                }

                const monthId = format(payment.paymentDate.toDate(), 'yyyy-MM');

                await runTransaction(db, async (transaction) => {
                    const receiptNumbers: { [ownerId: string]: string } = {};

                    // 1. Actualizar saldos de propietarios
                    for (const beneficiary of payment.beneficiaries) {
                        const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, beneficiary.ownerId);
                        transaction.update(ownerRef, { balance: increment(beneficiary.amount) });
                        receiptNumbers[beneficiary.ownerId] = `REC-${Date.now().toString().substring(6)}-${beneficiary.ownerId.slice(-4)}`.toUpperCase();
                    }

                    // 2. Afectar cuenta física en Tesorería
                    if (targetAccountId) {
                        const accountRef = doc(db, 'condominios', condoId, 'cuentas', targetAccountId);
                        transaction.update(accountRef, { saldoActual: increment(payment.totalAmount) });

                        // 3. Actualizar Estadísticas Financieras Reales
                        const statsRef = doc(db, 'condominios', condoId, 'financial_stats', monthId);
                        transaction.set(statsRef, {
                            periodo: monthId,
                            saldoBancarioReal: increment(targetAccountName === "BANCO DE VENEZUELA" ? payment.totalAmount : 0),
                            saldoCajaReal: increment(targetAccountName === "CAJA PRINCIPAL" ? payment.totalAmount : 0),
                            totalIngresosMes: increment(payment.totalAmount),
                            updatedAt: serverTimestamp()
                        }, { merge: true });

                        // 4. Crear Asiento Contable Detallado
                        const transRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                        transaction.set(transRef, {
                            monto: payment.totalAmount, 
                            tipo: 'ingreso', 
                            cuentaId: targetAccountId, 
                            nombreCuenta: targetAccountName,
                            descripcion: `INGRESO: PAGO DE ${payment.beneficiaries.map(b => b.ownerName).join(', ')}`.toUpperCase(),
                            referencia: payment.reference, 
                            fecha: payment.paymentDate, 
                            sourcePaymentId: payment.id,
                            createdAt: serverTimestamp(), 
                            createdBy: user?.email
                        });
                    }

                    // 5. Marcar pago como aprobado
                    transaction.update(doc(db, 'condominios', condoId, 'payments', payment.id), { 
                        status: 'aprobado', 
                        receiptNumbers, 
                        observations: 'AUDITADO Y SINCRONIZADO EN BANCO.' 
                    });
                });

                toast({ title: "Pago Validado", description: "Sincronizado con Banco de Venezuela exitosamente." });
                setSelectedPayment(null);
            } catch (error: any) { 
                console.error("Error en aprobación:", error);
                toast({ variant: 'destructive', title: "Falla en Sincronización", description: error.message }); 
            }
            finally { setIsVerifying(false); }
        });
    };

    const handleExportPDF = async (payment: Payment, ownerId: string) => {
        if (!companyInfo) return;
        const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
        if (!beneficiary) return;

        const data = {
            condoName: companyInfo.name,
            rif: companyInfo.rif,
            receiptNumber: payment.receiptNumbers?.[ownerId] || 'S/N',
            ownerName: beneficiary.ownerName,
            method: payment.paymentMethod.toUpperCase(),
            bank: payment.bank,
            reference: payment.reference,
            date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
            rate: formatCurrency(payment.exchangeRate),
            receivedAmount: formatCurrency(beneficiary.amount),
            totalDebtPaid: formatCurrency(beneficiary.amount),
            prevBalance: '0,00',
            currentBalance: '0,00',
            observations: payment.observations || 'PAGO VALIDADO',
            concepts: [[
                format(payment.paymentDate.toDate(), 'MM/yyyy'),
                `${beneficiary.street || ''} ${beneficiary.house || ''}`.trim(),
                (beneficiary.amount / payment.exchangeRate).toFixed(2),
                formatCurrency(beneficiary.amount)
            ]]
        };

        await generatePaymentReceipt(data, companyInfo.logo);
    };

    const handleSharePDF = async (payment: Payment, ownerId: string) => {
        if (!companyInfo) return;
        const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerId);
        if (!beneficiary) return;

        const data = {
            condoName: companyInfo.name,
            rif: companyInfo.rif,
            receiptNumber: payment.receiptNumbers?.[ownerId] || 'S/N',
            ownerName: beneficiary.ownerName,
            method: payment.paymentMethod.toUpperCase(),
            bank: payment.bank,
            reference: payment.reference,
            date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
            rate: formatCurrency(payment.exchangeRate),
            receivedAmount: formatCurrency(beneficiary.amount),
            totalDebtPaid: formatCurrency(beneficiary.amount),
            prevBalance: '0,00',
            currentBalance: '0,00',
            observations: payment.observations || 'PAGO VALIDADO',
            concepts: [[
                format(payment.paymentDate.toDate(), 'MM/yyyy'),
                `${beneficiary.street || ''} ${beneficiary.house || ''}`.trim(),
                (beneficiary.amount / payment.exchangeRate).toFixed(2),
                formatCurrency(beneficiary.amount)
            ]]
        };

        const blob = await generatePaymentReceipt(data, companyInfo.logo, 'blob');
        if (blob && navigator.share) {
            const file = new File([blob as Blob], `Recibo_${beneficiary.ownerName.replace(/ /g, '_')}.pdf`, { type: 'application/pdf' });
            try {
                await navigator.share({
                    files: [file],
                    title: 'Recibo de Pago EFAS',
                    text: `Recibo de pago para ${beneficiary.ownerName}`
                });
            } catch (e) { console.error("Share failed", e); }
        } else {
            toast({ title: "Compartir no disponible", description: "Su navegador no soporta el envío directo de archivos." });
        }
    };

    const handleReject = (payment: Payment) => {
        if (!rejectionReason) return toast({ variant: 'destructive', title: "Se requiere un motivo" });
        requestAuthorization(async () => {
            setIsVerifying(true);
            try {
                await updateDoc(doc(db, 'condominios', condoId, 'payments', payment.id), { 
                    status: 'rechazado', 
                    observations: rejectionReason 
                });
                toast({ title: "Reporte Rechazado" });
                setSelectedPayment(null);
            } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
            finally { setIsVerifying(false); }
        });
    };

    const handleDeletePayment = async () => {
        if (!paymentToDelete || !condoId) return;
        requestAuthorization(async () => {
            setIsVerifying(true);
            try {
                const isApproved = paymentToDelete.status === 'aprobado';
                const monthId = format(paymentToDelete.paymentDate.toDate(), 'yyyy-MM');
                const transSnap = await getDocs(query(collection(db, 'condominios', condoId, 'transacciones'), where('sourcePaymentId', '==', paymentToDelete.id)));
                
                await runTransaction(db, async (transaction) => {
                    const payRef = doc(db, 'condominios', condoId, 'payments', paymentToDelete.id);
                    const payDoc = await transaction.get(payRef);
                    
                    if (payDoc.exists() && payDoc.data()?.status === 'aprobado') {
                        for (const ben of paymentToDelete.beneficiaries) {
                            const ownerRef = doc(db, 'condominios', condoId, ownersCollectionName, ben.ownerId);
                            transaction.update(ownerRef, { balance: increment(-ben.amount) });
                        }
                        
                        if (!transSnap.empty) {
                            const txData = transSnap.docs[0].data();
                            transaction.update(doc(db, 'condominios', condoId, 'cuentas', txData.cuentaId), { saldoActual: increment(-paymentToDelete.totalAmount) });
                            const statsRef = doc(db, 'condominios', condoId, 'financial_stats', monthId);
                            transaction.update(statsRef, {
                                saldoBancarioReal: increment(txData.nombreCuenta === "BANCO DE VENEZUELA" ? -paymentToDelete.totalAmount : 0),
                                saldoCajaReal: increment(txData.nombreCuenta === "CAJA PRINCIPAL" ? -paymentToDelete.totalAmount : 0),
                                totalIngresosMes: increment(-paymentToDelete.totalAmount)
                            });
                            transSnap.forEach(d => transaction.delete(d.ref));
                        }
                    }
                    transaction.delete(payRef);
                });
                toast({ title: isApproved ? "Pago Revertido y Eliminado" : "Registro de Pago Eliminado" });
                setPaymentToDelete(null);
            } catch (e) { toast({ variant: 'destructive', title: "Error al eliminar" }); }
            finally { setIsVerifying(false); }
        });
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat">
            <CardHeader className="p-8 border-b border-white/5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <CardTitle className="text-white font-black uppercase italic tracking-tighter text-2xl">Bandeja de <span className="text-primary">Validación</span></CardTitle>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Filtrar por ref o nombre..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-xl bg-slate-800 border-none text-white font-bold" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid grid-cols-3 mx-8 mt-6 mb-6 h-12 bg-slate-800/50 rounded-xl p-1">
                        <TabsTrigger value="pendiente" className="rounded-lg font-black uppercase text-[10px]">Pendientes</TabsTrigger>
                        <TabsTrigger value="aprobado" className="rounded-lg font-black uppercase text-[10px]">Aprobados</TabsTrigger>
                        <TabsTrigger value="rechazado" className="rounded-lg font-black uppercase text-[10px]">Rechazados</TabsTrigger>
                    </TabsList>
                    
                    {loading ? <div className="text-center p-20"><Loader2 className="animate-spin h-10 w-10 mx-auto text-primary" /></div> : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-800/20"><TableRow className="border-white/5"><TableHead className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Residente / Beneficiarios</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Fecha Pago</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Monto Aprobado</TableHead><TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Ref. Bancaria</TableHead><TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-400 tracking-widest">Acción</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {filteredPayments.length === 0 ? (<TableRow><TableCell colSpan={5} className="h-40 text-center text-slate-500 font-bold italic uppercase tracking-widest text-[10px]">Sin reportes en esta categoría</TableCell></TableRow>) : 
                                    filteredPayments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-white/5 border-white/5 transition-colors">
                                            <TableCell className="px-8 py-6"><div className="font-black text-white text-xs uppercase italic">{p.beneficiaries.map(b => b.ownerName).join(', ')}</div><div className="text-[9px] font-black text-primary uppercase mt-1 tracking-tighter">{p.paymentMethod} • {p.bank}</div></TableCell>
                                            <TableCell className="text-slate-400 font-bold text-xs uppercase">{format(p.paymentDate.toDate(), 'dd/MM/yy')}</TableCell>
                                            <TableCell className="font-black text-white text-lg italic tracking-tighter">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                            <TableCell className="font-mono text-[10px] text-slate-500 font-black">{p.reference}</TableCell>
                                            <TableCell className="text-right pr-8">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-slate-500 hover:text-white"><MoreHorizontal className="h-5 w-5"/></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="rounded-xl border-white/10 shadow-2xl bg-slate-900 text-white">
                                                        <DropdownMenuItem onClick={() => setSelectedPayment(p)} className="font-black uppercase text-[10px] p-3 gap-2"><Eye className="h-4 w-4 text-primary" /> Ver Detalles</DropdownMenuItem>
                                                        
                                                        {p.status === 'aprobado' && (
                                                            <>
                                                                <DropdownMenuSeparator className="bg-white/5"/>
                                                                <DropdownMenuSub>
                                                                    <DropdownMenuSubTrigger className="font-black uppercase text-[10px] p-3 gap-2">
                                                                        <FileDown className="h-4 w-4 text-sky-400" /> Exportar Recibos
                                                                    </DropdownMenuSubTrigger>
                                                                    <DropdownMenuPortal>
                                                                        <DropdownMenuSubContent className="bg-slate-900 text-white border-white/10">
                                                                            {p.beneficiaries.map(ben => (
                                                                                <DropdownMenuItem key={ben.ownerId} onClick={() => handleExportPDF(p, ben.ownerId)} className="font-black uppercase text-[9px] p-2">
                                                                                    {ben.ownerName}
                                                                                </DropdownMenuItem>
                                                                            ))}
                                                                        </DropdownMenuSubContent>
                                                                    </DropdownMenuPortal>
                                                                </DropdownMenuSub>
                                                                <DropdownMenuSub>
                                                                    <DropdownMenuSubTrigger className="font-black uppercase text-[10px] p-3 gap-2">
                                                                        <Share2 className="h-4 w-4 text-emerald-400" /> Compartir Recibos
                                                                    </DropdownMenuSubTrigger>
                                                                    <DropdownMenuPortal>
                                                                        <DropdownMenuSubContent className="bg-slate-900 text-white border-white/10">
                                                                            {p.beneficiaries.map(ben => (
                                                                                <DropdownMenuItem key={ben.ownerId} onClick={() => handleSharePDF(p, ben.ownerId)} className="font-black uppercase text-[9px] p-2">
                                                                                    {ben.ownerName}
                                                                                </DropdownMenuItem>
                                                                            ))}
                                                                        </DropdownMenuSubContent>
                                                                    </DropdownMenuPortal>
                                                                </DropdownMenuSub>
                                                                <DropdownMenuSeparator className="bg-white/5"/>
                                                                <DropdownMenuItem onClick={() => setPaymentToDelete(p)} className="text-red-500 font-black uppercase text-[10px] p-3 gap-2"><Trash2 className="h-4 w-4"/> Revertir y Eliminar</DropdownMenuItem>
                                                            </>
                                                        )}

                                                        {p.status === 'pendiente' && (
                                                            <>
                                                                <DropdownMenuSeparator className="bg-white/5"/>
                                                                <DropdownMenuItem onClick={() => handleApprove(p)} className="text-emerald-500 font-black uppercase text-[10px] p-3 gap-2"><CheckCircle className="h-4 w-4" /> Validar y Sincronizar</DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => { setSelectedPayment(p); setRejectionReason(''); }} className="text-red-500 font-black uppercase text-[10px] p-3 gap-2"><XCircle className="h-4 w-4" /> Rechazar Pago</DropdownMenuItem>
                                                            </>
                                                        )}

                                                        {p.status === 'rechazado' && (
                                                            <>
                                                                <DropdownMenuSeparator className="bg-white/5"/>
                                                                <DropdownMenuItem onClick={() => setPaymentToDelete(p)} className="text-red-500 font-black uppercase text-[10px] p-3 gap-2">
                                                                    <Trash2 className="h-4 w-4"/> Eliminar Registro
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </Tabs>
            </CardContent>

            <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
                <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Detalles del <span className="text-primary">Reporte</span></DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                        <div className="space-y-6">
                            <div className="bg-slate-800 p-6 rounded-3xl border border-white/5">
                                <p className="text-[10px] font-black uppercase text-slate-500 mb-4 tracking-[0.2em]">Desglose de Asignación</p>
                                {selectedPayment?.beneficiaries.map((b, i) => (<div key={i} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0"><div className="flex flex-col"><span className="font-black text-white text-xs uppercase italic">{b.ownerName}</span><span className="text-[9px] font-bold text-slate-500 uppercase">{b.street} {b.house}</span></div><span className="font-black text-primary">Bs. {formatCurrency(b.amount)}</span></div>))}
                                <div className="mt-6 pt-6 border-t border-white/10 flex justify-between items-center"><span className="text-[10px] font-black uppercase text-white tracking-widest">Total Reportado:</span><span className="text-2xl font-black text-white italic">Bs. {formatCurrency(selectedPayment?.totalAmount || 0)}</span></div>
                            </div>
                            {selectedPayment?.status === 'pendiente' && (<div className="space-y-2"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Motivo del Rechazo</Label><Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="rounded-2xl bg-slate-800 border-none font-bold text-white min-h-[100px]" placeholder="Ej: Referencia no coincide con extracto bancario..." /></div>)}
                            {selectedPayment?.status === 'rechazado' && selectedPayment.observations && (<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl"><p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Motivo del Rechazo:</p><p className="text-sm font-bold text-white italic">{selectedPayment.observations}</p></div>)}
                        </div>
                        <div className="relative aspect-[3/4] bg-slate-800 rounded-3xl overflow-hidden border border-white/5 group">
                            {selectedPayment?.receiptUrl ? (<Image src={selectedPayment.receiptUrl} alt="Comprobante" fill className="object-contain p-2" />) : (<div className="flex h-full items-center justify-center text-slate-600 font-black uppercase italic text-xs">Sin imagen adjunta</div>)}
                        </div>
                    </div>
                    {selectedPayment?.status === 'pendiente' && (
                        <DialogFooter className="gap-3 mt-4"><Button variant="ghost" onClick={() => handleReject(selectedPayment!)} disabled={isVerifying} className="text-red-500 font-black uppercase text-[10px] hover:bg-red-500/10">Rechazar Pago</Button><Button onClick={() => handleApprove(selectedPayment!)} disabled={isVerifying} className="bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 rounded-xl flex-1 shadow-lg shadow-primary/20 italic">Aprobar y Sincronizar Cuentas</Button></DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!paymentToDelete} onValueChange={() => setPaymentToDelete(null)}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase italic text-red-500">¿Eliminar Registro Definitivamente?</DialogTitle></DialogHeader>
                    <p className="text-slate-400 font-bold text-sm leading-relaxed uppercase tracking-tight">
                        {paymentToDelete?.status === 'aprobado' 
                            ? "Esta acción revertirá los saldos de los propietarios, debitará el dinero de la cuenta bancaria y eliminará el asiento contable."
                            : "Se borrará permanentemente el registro de este reporte de la base de datos."}
                    </p>
                    <DialogFooter className="gap-2 mt-8"><Button variant="ghost" onClick={() => setPaymentToDelete(null)} className="rounded-xl font-black uppercase text-[10px] h-12 text-white">Cancelar</Button><Button onClick={handleDeletePayment} disabled={isVerifying} className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase text-[10px] h-12 shadow-lg shadow-red-600/20">Confirmar Eliminación</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

function ReportPaymentComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const { user: authUser } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('movil');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    
    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';
    const isCashPayment = paymentMethod === 'efectivo_bs';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        return onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.filter(o => o.email !== 'vallecondo@gmail.com').sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
    }, [condoId, ownersCollectionName]);

    useEffect(() => {
        setBeneficiaryRows([{
            id: Date.now().toString(),
            owner: null,
            searchTerm: '',
            amount: '',
            selectedProperty: null
        }]);
    }, []);

    useEffect(() => {
        if (!condoId) return;
        const fetchRate = async () => {
            const docSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            if (docSnap.exists() && paymentDate) {
                const allRates = (docSnap.data().exchangeRates || []);
                const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                const applicable = allRates.filter((r:any) => r.date <= paymentDateString).sort((a:any, b:any) => b.date.localeCompare(a.date));
                setExchangeRate(applicable.length > 0 ? applicable[0].rate : null);
            }
        };
        fetchRate();
    }, [paymentDate, condoId]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const compressedBase64 = await compressImage(file, 800, 800);
            setReceiptImage(compressedBase64);
            toast({ title: 'Imagen vinculada' });
        } catch (error) { toast({ variant: 'destructive', title: 'Error' }); } 
        finally { setLoading(false); }
    };

    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balance = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);
    
    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });
    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => { if (beneficiaryRows.length > 1) setBeneficiaryRows(rows => rows.filter(row => row.id !== id)); };
    const getFilteredOwners = (searchTerm: string) => searchTerm.length < 2 ? [] : allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser || !condoId || !exchangeRate || !totalAmount) return;
        setIsSubmitting(true);
        try {
            const beneficiaries = beneficiaryRows.map(row => ({ 
                ownerId: row.owner!.id, 
                ownerName: row.owner!.name, 
                ...(row.selectedProperty && { street: row.selectedProperty.street, house: row.selectedProperty.house }), 
                amount: Number(row.amount) 
            }));
            await addDoc(collection(db, "condominios", condoId, "payments"), { 
                reportedBy: authUser.uid, beneficiaries, beneficiaryIds: beneficiaries.map(b=>b.ownerId), 
                totalAmount: Number(totalAmount), exchangeRate, paymentDate: Timestamp.fromDate(paymentDate!), 
                paymentMethod, bank: isCashPayment ? 'Efectivo' : (bank === 'Otro' ? otherBank : bank), 
                reference: isCashPayment ? 'EFECTIVO' : reference, receiptUrl: receiptImage, 
                status: 'pendiente', reportedAt: serverTimestamp() 
            });
            toast({ title: 'Reporte Enviado a Auditoría' });
            setTotalAmount(''); setReference(''); setReceiptImage(null);
            setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
        } catch (error) { toast({ variant: "destructive", title: "Error de Guardado" }); } 
        finally { setIsSubmitting(false); }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat">
            <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-white font-black uppercase italic text-2xl tracking-tighter">Reporte <span className="text-primary">Manual</span> de Pago</CardTitle></CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 space-y-10">
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Fecha de Pago</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left justify-start"><CalendarIcon className="mr-3 h-5 w-5 text-primary" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : "Seleccione"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 bg-slate-900 border-white/10"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} /></PopoverContent></Popover></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Tasa Aplicada (Bs.)</Label><Input type="number" value={exchangeRate || ''} readOnly className="h-14 rounded-2xl bg-slate-800 border-none text-primary font-black text-lg italic" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Método</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}><SelectTrigger className="h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs"><SelectValue/></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white"><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem><SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem></SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Banco Emisor</Label><Button type="button" variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left justify-start" onClick={() => setIsBankModalOpen(true)} disabled={isCashPayment}>{isCashPayment ? 'EFECTIVO' : (bank || "Seleccionar Banco...")}</Button></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Referencia Bancaria</Label><Input value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, ''))} disabled={isCashPayment} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic tracking-widest" placeholder="6 DÍGITOS" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Monto Total en Bs.</Label><Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black text-2xl italic text-right pr-6" placeholder="0,00" /></div>
                    </div>
                    
                    <div className="space-y-6">
                        <Label className="text-[10px] font-black uppercase text-primary ml-2 tracking-[0.3em]">Asignación de Beneficiarios</Label>
                        {beneficiaryRows.map((row, index) => (
                            <div key={row.id} className="p-8 bg-white/5 border border-white/5 rounded-[2rem] relative space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        {!row.owner ? (
                                            <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" /><Input placeholder="Buscar Residente..." className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-bold uppercase text-xs" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} />{row.searchTerm.length >= 2 && <Card className="absolute z-50 w-full mt-2 border-white/10 shadow-2xl rounded-2xl overflow-hidden bg-slate-900"><ScrollArea className="h-48">{getFilteredOwners(row.searchTerm).map(o => (<div key={o.id} onClick={() => handleOwnerSelect(row.id, o)} className="p-4 hover:bg-white/5 cursor-pointer font-black text-[10px] uppercase text-white border-b border-white/5 last:border-0">{o.name}</div>))}</ScrollArea></Card>}</div>
                                        ) : (
                                            <div className="p-5 bg-slate-800 rounded-2xl border border-white/5 flex justify-between items-center"><p className="font-black text-primary uppercase text-xs italic tracking-tighter">{row.owner.name}</p><Button variant="ghost" size="icon" onClick={() => removeBeneficiaryRow(row.id)} className="text-red-500 hover:bg-red-500/10"><XCircle className="h-5 w-5" /></Button></div>
                                        )}
                                        {row.owner && (
                                            <div className="space-y-1.5">
                                                <Label className="text-[9px] uppercase font-black text-slate-500 ml-2">Seleccionar Unidad</Label>
                                                <Select 
                                                    onValueChange={(v) => {
                                                        const found = row.owner?.properties?.find(p => `${p.street}-${p.house}` === v);
                                                        updateBeneficiaryRow(row.id, { selectedProperty: found || null });
                                                    }} 
                                                    value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''}
                                                >
                                                    <SelectTrigger className="rounded-xl h-12 bg-slate-800 border-none text-white font-bold uppercase text-[10px]">
                                                        <SelectValue placeholder="Propiedad..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                                        {row.owner.properties?.map((p, pIdx) => (
                                                            <SelectItem key={`${p.street}-${p.house}-${pIdx}`} value={`${p.street}-${p.house}`} className="font-bold text-[10px]">
                                                                {p.street} - {p.house}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[9px] uppercase font-black text-slate-500 ml-2">Monto Individual (Bs.)</Label>
                                        <Input type="number" placeholder="0,00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={!row.owner} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black text-xl italic text-right pr-6" />
                                    </div>
                                </div>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} className="rounded-xl font-black uppercase text-[10px] border-white/10 text-slate-400 hover:bg-white/5"><UserPlus className="mr-2 h-4 w-4 text-primary"/>Añadir Beneficiario</Button>
                    </div>
                </CardContent>
                <CardFooter className="bg-white/5 p-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className={cn("font-black text-2xl italic tracking-tighter uppercase", balance !== 0 ? 'text-red-500' : 'text-emerald-500')}>Diferencia: Bs. {formatCurrency(balance)}</div>
                    <Button type="submit" disabled={isSubmitting || Math.abs(balance) > 0.01} className="h-16 px-12 rounded-2xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95">
                        {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-5 w-5" />} REGISTRAR PAGO Y ASENTAR
                    </Button>
                </CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(v) => { setBank(v); setIsBankModalOpen(false); }} />
        </Card>
    );
}

function PaymentsPage() {
    const searchParams = useSearchParams();
    const condoId = useParams()?.condoId as string;
    const router = useRouter();
    const activeTab = searchParams?.get('tab') ?? 'verify';
    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-primary">Pagos</span></h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.3)]"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">Auditoría centralizada y afectación inmediata de Tesorería.</p>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => router.push(`/${condoId}/admin/payments?tab=${v}`)}>
                <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 h-16 rounded-2xl p-1"><TabsTrigger value="verify" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Verificación Bancaria</TabsTrigger><TabsTrigger value="report" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Reporte Directo</TabsTrigger></TabsList>
                <TabsContent value="verify" className="mt-8"><VerificationComponent condoId={condoId} /></TabsContent>
                <TabsContent value="report" className="mt-8"><ReportPaymentComponent condoId={condoId} /></TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (<Suspense fallback={<div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}><PaymentsPage /></Suspense>);
}

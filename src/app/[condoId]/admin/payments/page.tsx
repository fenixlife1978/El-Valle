'use client';

import React, { useState, useEffect, useMemo, Suspense, use } from 'react';
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
    Download, Loader2, Calendar as CalendarIcon,
    UserPlus, WalletCards, Trash2, FileText, Save, Share2, FileDown,
    Calculator, Receipt, Check, DollarSign, Plus, Info, TrendingUp, TrendingDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { format, addMonths, isBefore, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
    collection, onSnapshot, query, addDoc, serverTimestamp, 
    doc, getDoc, where, getDocs, Timestamp, runTransaction, 
    updateDoc, increment, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useAuthorization } from '@/hooks/use-authorization';
import { 
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
    DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub,
    DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal
} from '@/components/ui/dropdown-menu';
import { generatePaymentReceipt } from '@/lib/pdf-generator';
import { downloadPDF, sharePDF } from '@/lib/print-pdf';
import Decimal from 'decimal.js';
import { Checkbox } from '@/components/ui/checkbox';
import { processPaymentLiquidation } from '@/lib/payment-processor';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const BDV_ACCOUNT_ID = "Hlc0ky0QdnaXIsuf19Od";
const CAJA_PRINCIPAL_ID = "CAJA_PRINCIPAL_ID";

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

// ============================================
// COMPONENTE: VERIFICACIÓN (PAGOS EN TRÁNSITO)
// ============================================

function VerificationComponent({ condoId }: { condoId: string }) {
    const { user } = useAuth();
    const { requestAuthorization } = useAuthorization();
    const { toast } = useToast();

    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [simulation, setSimulation] = useState<any>(null);

    useEffect(() => {
        if (!condoId) return;
        const q = query(
            collection(db, 'condominios', condoId, 'payments'), 
            where('status', '==', 'pendiente'),
            orderBy('reportedAt', 'desc')
        );
        return onSnapshot(q, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
    }, [condoId]);

    const runSimulation = async (payment: any) => {
        setSelectedPayment(payment);
        setSimulation(null);
        
        try {
            const beneficiary = payment.beneficiaries[0];
            if (!beneficiary) return;

            const ownersCol = condoId === 'condo_01' ? 'owners' : 'propietarios';
            const ownerSnap = await getDoc(doc(db, 'condominios', condoId, ownersCol, beneficiary.ownerId));
            const ownerData = ownerSnap.data();

            const debtsSnap = await getDocs(query(
                collection(db, 'condominios', condoId, 'debts'),
                where('ownerId', '==', beneficiary.ownerId),
                where('status', 'in', ['pending', 'vencida'])
            ));
            
            const pendingDebts = debtsSnap.docs.map(d => d.data());
            const totalDebtUSD = pendingDebts.reduce((sum, d) => sum + d.amountUSD, 0);

            const result = processPaymentLiquidation({
                monto_pago_recibido_bs: payment.totalAmount,
                tasa_cambio_bcv: payment.exchangeRate,
                deuda_usd: totalDebtUSD,
                saldo_a_favor_anterior_bs: ownerData?.balance || 0
            });

            setSimulation({
                ...result,
                ownerName: beneficiary.ownerName,
                pendingDebts: pendingDebts.sort((a,b) => a.year - b.year || a.month - b.month)
            });
        } catch (e) {
            console.error("Simulation Error:", e);
        }
    };

    const handleApprove = async () => {
        if (!selectedPayment || !simulation) return;
        
        requestAuthorization(async () => {
            setIsVerifying(true);
            try {
                const ownersCol = condoId === 'condo_01' ? 'owners' : 'propietarios';
                const method = (selectedPayment.paymentMethod || "").toLowerCase();
                const isDigital = method.includes('movil') || method.includes('transferencia');
                const targetAccountId = isDigital ? BDV_ACCOUNT_ID : CAJA_PRINCIPAL_ID;
                const targetAccountName = isDigital ? "BANCO DE VENEZUELA" : "CAJA PRINCIPAL";

                await runTransaction(db, async (transaction) => {
                    const ownerRef = doc(db, 'condominios', condoId, ownersCol, selectedPayment.beneficiaries[0].ownerId);
                    
                    // 1. Actualizar Saldo Propietario
                    transaction.update(ownerRef, { balance: simulation.saldo_a_favor_actual_bs });

                    // 2. Liquidar Deudas (Si el abono cubrió alguna)
                    let fundsToLiquiateUSD = simulation.monto_pag_bs / selectedPayment.exchangeRate;
                    const debtsSnap = await getDocs(query(
                        collection(db, 'condominios', condoId, 'debts'),
                        where('ownerId', '==', selectedPayment.beneficiaries[0].ownerId),
                        where('status', 'in', ['pending', 'vencida']),
                        orderBy('year', 'asc'),
                        orderBy('month', 'asc')
                    ));

                    for (const d of debtsSnap.docs) {
                        const debtData = d.data();
                        if (fundsToLiquiateUSD >= debtData.amountUSD) {
                            transaction.update(d.ref, { 
                                status: 'paid', 
                                paymentId: selectedPayment.id,
                                paymentDate: selectedPayment.paymentDate
                            });
                            fundsToLiquiateUSD -= debtData.amountUSD;
                        } else break;
                    }

                    // 3. Tesorería
                    const accountRef = doc(db, 'condominios', condoId, 'cuentas', targetAccountId);
                    transaction.update(accountRef, { saldoActual: increment(selectedPayment.totalAmount) });

                    // 4. Libro Diario
                    const transRef = doc(collection(db, 'condominios', condoId, 'transacciones'));
                    transaction.set(transRef, {
                        monto: selectedPayment.totalAmount,
                        tipo: 'ingreso',
                        cuentaId: targetAccountId,
                        nombreCuenta: targetAccountName,
                        descripcion: `PAGO: ${simulation.ownerName}`.toUpperCase(),
                        referencia: selectedPayment.reference,
                        fecha: selectedPayment.paymentDate,
                        sourcePaymentId: selectedPayment.id,
                        createdAt: serverTimestamp()
                    });

                    // 5. Finalizar Pago con nueva estructura contable
                    transaction.update(doc(db, 'condominios', condoId, 'payments', selectedPayment.id), {
                        status: 'aprobado',
                        saldoAnterior: simulation.saldo_a_favor_anterior_bs,
                        montoRecibido: simulation.monto_pago_recibido_bs,
                        totalAbonadoDeudas: simulation.monto_pagado_bs,
                        saldoActual: simulation.saldo_a_favor_actual_bs,
                        totalPagado: simulation.monto_pago_recibido_bs,
                        observations: 'LIQUIDACIÓN DE PRECISIÓN APLICADA.'
                    });
                });

                toast({ title: "Pago Aprobado", description: "Saldos actualizados y libros asentados." });
                setSelectedPayment(null);
            } catch (e: any) {
                toast({ variant: 'destructive', title: "Error", description: e.message });
            } finally {
                setIsVerifying(false);
            }
        });
    };

    const handleReject = async () => {
        if (!rejectionReason) return;
        requestAuthorization(async () => {
            try {
                await updateDoc(doc(db, 'condominios', condoId, 'payments', selectedPayment.id), {
                    status: 'rechazado',
                    observations: rejectionReason.toUpperCase()
                });
                toast({ title: "Pago Rechazado" });
                setSelectedPayment(null);
            } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
        });
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {payments.map(p => (
                    <Card key={p.id} className="rounded-[2rem] border-none shadow-xl bg-slate-900 overflow-hidden border border-white/5 group hover:border-primary/30 transition-all">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <Badge className="bg-yellow-500/10 text-yellow-500 border-none font-black text-[9px] uppercase italic">Esperando Auditoría</Badge>
                                <span className="text-[9px] font-bold text-white/20 uppercase italic">{format(p.reportedAt.toDate(), 'dd/MM HH:mm')}</span>
                            </div>
                            <CardTitle className="text-white font-black uppercase italic text-sm mt-3 leading-tight">
                                {p.beneficiaries.map((b: any) => b.ownerName).join(", ")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-black text-white italic">Bs. {formatCurrency(p.totalAmount)}</div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">Ref: {p.reference} • {p.paymentMethod}</div>
                        </CardContent>
                        <CardFooter className="bg-white/5 p-4 border-t border-white/5">
                            <Button onClick={() => runSimulation(p)} className="w-full rounded-xl bg-white/10 hover:bg-primary hover:text-slate-900 text-white font-black uppercase text-[10px] h-10 transition-all italic">Ver y Simular <ChevronRight className="ml-2 h-4 w-4"/></Button>
                        </CardFooter>
                    </Card>
                ))}
                {payments.length === 0 && !loading && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                        <p className="text-white/20 font-black uppercase italic text-xs tracking-widest">No hay pagos pendientes por validar</p>
                    </div>
                )}
            </div>

            <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
                <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Simulación de <span className="text-primary">Liquidación</span></DialogTitle>
                        <DialogDescription className="text-slate-400 font-bold text-[10px] uppercase">Auditoría previa a la escritura en base de datos.</DialogDescription>
                    </DialogHeader>
                    
                    {simulation && (
                        <div className="space-y-6 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-5 bg-white/5 rounded-3xl border border-white/5">
                                    <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Pago Recibido</p>
                                    <p className="text-xl font-black text-white italic">Bs. {formatCurrency(simulation.monto_pago_recibido_bs)}</p>
                                    <p className="text-[9px] text-primary mt-1">Tasa: Bs. {formatCurrency(selectedPayment.exchangeRate)}</p>
                                </div>
                                <div className="p-5 bg-white/5 rounded-3xl border border-white/5">
                                    <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Saldo Anterior</p>
                                    <p className="text-xl font-black text-emerald-400 italic">Bs. {formatCurrency(simulation.saldo_a_favor_anterior_bs)}</p>
                                </div>
                            </div>

                            <div className="bg-slate-950/50 p-6 rounded-[2rem] border border-white/5">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-xs font-black uppercase text-primary">Plan de Aplicación</h4>
                                    <Badge variant="outline" className="text-[9px] border-primary/20 text-primary">Fondo: Bs. {formatCurrency(simulation.total_fondo_disponible)}</Badge>
                                </div>
                                <div className="space-y-2">
                                    {simulation.pendingDebts.map((d: any, i: number) => (
                                        <div key={i} className="flex justify-between text-[10px] font-bold py-1 border-b border-white/5">
                                            <span className="text-white/60 uppercase">{monthsLocale[d.month]} {d.year}</span>
                                            <span className="text-white">Bs. {formatCurrency(d.amountUSD * selectedPayment.exchangeRate)}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between pt-4 text-xs font-black uppercase">
                                        <span className="text-slate-500">Total a Liquidar:</span>
                                        <span className="text-red-500">Bs. {formatCurrency(simulation.monto_pagado_bs)}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 text-sm font-black uppercase italic">
                                        <span className="text-primary">Nuevo Saldo a Favor:</span>
                                        <span className="text-emerald-500">Bs. {formatCurrency(simulation.saldo_a_favor_actual_bs)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2">Observaciones / Motivo Rechazo</Label>
                                <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="rounded-2xl bg-slate-800 border-none text-white font-bold" placeholder="Escribe aquí si vas a rechazar el pago..." />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-3">
                        <Button variant="ghost" onClick={() => setSelectedPayment(null)} className="text-white/40 font-black uppercase text-[10px]">Cerrar</Button>
                        <Button onClick={handleReject} variant="outline" className="border-red-500/30 text-red-500 font-black uppercase text-[10px] h-12 rounded-xl">Rechazar Pago</Button>
                        <Button onClick={handleApprove} disabled={isVerifying} className="bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 rounded-xl flex-1 shadow-lg shadow-primary/20 italic">
                            {isVerifying ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 h-4 w-4" />} Aprobar y Liquidar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ============================================
// COMPONENTE: HISTORIAL DE PAGOS
// ============================================

function HistoryComponent({ condoId }: { condoId: string }) {
    const { toast } = useToast();
    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!condoId) return;
        const q = query(
            collection(db, 'condominios', condoId, 'payments'), 
            where('status', 'in', ['aprobado', 'rechazado']),
            orderBy('reportedAt', 'desc')
        );
        return onSnapshot(q, (snapshot) => {
            setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
    }, [condoId]);

    const filtered = payments.filter(p => {
        const search = searchTerm.toLowerCase();
        return p.reference?.toLowerCase().includes(search) || 
               p.beneficiaries?.some((b: any) => b.ownerName?.toLowerCase().includes(search));
    });

    const handleExportPDF = async (payment: any, ownerId: string) => {
        try {
            const beneficiary = payment.beneficiaries.find((b: any) => b.ownerId === ownerId);
            const settingsSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            const companyInfo = settingsSnap.data()?.companyInfo;

            // Mapear conceptos (Deudas liquidadas)
            const debtsSnap = await getDocs(query(
                collection(db, 'condominios', condoId, 'debts'),
                where('paymentId', '==', payment.id),
                where('ownerId', '==', ownerId)
            ));
            
            const concepts = debtsSnap.docs.map(d => {
                const data = d.data();
                return [
                    `${monthsLocale[data.month]} ${data.year}`,
                    data.description.toUpperCase(),
                    `$ ${data.amountUSD.toFixed(2)}`,
                    formatCurrency(data.amountUSD * payment.exchangeRate)
                ];
            });

            // Si sobró dinero en este pago, añadir línea de excedente
            const totalDebtsBs = debtsSnap.docs.reduce((sum, d) => sum + (d.data().amountUSD * payment.exchangeRate), 0);
            const diff = payment.totalAmount - totalDebtsBs;
            if (diff > 0.05) {
                concepts.push([
                    'EXCEDENTE',
                    'EXCEDENTE DE PAGO APLICADO A SALDO A FAVOR',
                    '',
                    formatCurrency(diff)
                ]);
            }

            const data = {
                condoName: companyInfo?.name || 'CONDOMINIO',
                rif: companyInfo?.rif || 'J-00000000-0',
                receiptNumber: payment.receiptNumbers?.[ownerId] || `REC-${payment.id.slice(-6).toUpperCase()}`,
                ownerName: beneficiary.ownerName,
                property: `${beneficiary.street || ''} ${beneficiary.house || ''}`,
                method: payment.paymentMethod.toUpperCase(),
                bank: payment.bank || 'EFECTIVO',
                reference: payment.reference,
                date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
                rate: formatCurrency(payment.exchangeRate),
                receivedAmount: formatCurrency(payment.montoRecibido || payment.totalAmount),
                totalDebtPaid: formatCurrency(payment.totalAbonadoDeudas || totalDebtsBs),
                prevBalance: formatCurrency(payment.saldoAnterior || 0),
                currentBalance: formatCurrency(payment.saldoActual || 0),
                observations: payment.observations,
                concepts
            };

            await generatePaymentReceipt(data, companyInfo?.logo, 'download');
            toast({ title: "Recibo generado" });
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: "Error al generar PDF" });
        }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5 italic">
            <CardHeader className="bg-slate-950 p-8 border-b border-white/5">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <CardTitle className="text-white font-black uppercase text-xl tracking-tighter">Archivo de <span className="text-primary">Pagos</span></CardTitle>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input placeholder="Buscar por nombre o ref..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-11 bg-slate-800 border-none rounded-xl text-white font-bold" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-slate-950/50"><TableRow className="border-white/5">
                        <TableHead className="px-8 py-6 text-[10px] font-black uppercase text-white/40 italic">Fecha</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-white/40 italic">Residente</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-white/40 italic">Monto</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-white/40 italic">Estatus</TableHead>
                        <TableHead className="text-right pr-8 text-[10px] font-black uppercase text-white/40 italic">Recibos</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                        {filtered.map(p => (
                            <TableRow key={p.id} className="hover:bg-white/5 border-white/5 transition-colors">
                                <TableCell className="px-8 font-bold text-slate-500 text-xs italic">{format(p.paymentDate.toDate(), 'dd/MM/yy')}</TableCell>
                                <TableCell>
                                    <div className="font-black text-white uppercase text-xs italic">{p.beneficiaries.map((b:any)=>b.ownerName).join(", ")}</div>
                                    <div className="text-[9px] font-bold text-slate-600 uppercase">Ref: {p.reference}</div>
                                </TableCell>
                                <TableCell className="font-black text-white italic">Bs. {formatCurrency(p.totalAmount)}</TableCell>
                                <TableCell><Badge className={p.status === 'aprobado' ? "bg-emerald-500/10 text-emerald-500 border-none font-black italic" : "bg-red-500/10 text-red-500 border-none font-black italic"}>{p.status.toUpperCase()}</Badge></TableCell>
                                <TableCell className="text-right pr-8">
                                    {p.status === 'aprobado' && (
                                        <div className="flex justify-end gap-2">
                                            {p.beneficiaries.map((b:any) => (
                                                <Button key={b.ownerId} variant="ghost" size="sm" onClick={() => handleExportPDF(p, b.ownerId)} className="h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary font-black uppercase text-[9px] italic">PDF {b.ownerName.split(' ')[0]}</Button>
                                            ))}
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENTE: REPORTE MANUAL
// ============================================

function ReportPaymentComponent() {
    const { toast } = useToast();
    const { user: authUser } = useAuth();
    const params = useParams();
    const condoId = params?.condoId as string;
    
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<string>('movil');
    const [bank, setBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);

    const isDolares = paymentMethod === 'efectivo_usd';
    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, "condominios", condoId, ownersCollectionName), where("role", "==", "propietario"));
        return onSnapshot(q, (snapshot) => {
            setAllOwners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)).filter(o => o.email !== 'vallecondo@gmail.com').sort((a,b)=>a.name.localeCompare(b.name)));
        });
    }, [condoId, ownersCollectionName]);

    useEffect(() => {
        if (!condoId) return;
        const fetchRate = async () => {
            const docSnap = await getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings'));
            if (docSnap.exists() && paymentDate) {
                const allRates = (docSnap.data().exchangeRates || []);
                const applicable = allRates.filter((r:any) => r.date <= format(paymentDate, 'yyyy-MM-dd')).sort((a:any, b:any) => b.date.localeCompare(a.date));
                setExchangeRate(applicable.length > 0 ? applicable[0].rate : null);
            }
        };
        fetchRate();
    }, [paymentDate, condoId]);

    const assignedTotal = beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
    const balance = (Number(totalAmount) || 0) - assignedTotal;

    const handleOwnerSelect = (rowId: string, owner: Owner) => {
        setBeneficiaryRows(rows => rows.map(row => row.id === rowId ? { ...row, owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null } : row));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser || !condoId || !exchangeRate || !totalAmount) return;
        if (Math.abs(balance) > 0.01) return toast({ variant: 'destructive', title: "Error de distribución" });

        setIsSubmitting(true);
        try {
            const beneficiaries = beneficiaryRows.map(row => ({
                ownerId: row.owner!.id,
                ownerName: row.owner!.name,
                amount: Number(row.amount),
                street: row.selectedProperty?.street,
                house: row.selectedProperty?.house
            }));

            await addDoc(collection(db, "condominios", condoId, "payments"), { 
                reportedBy: authUser.uid, 
                beneficiaries,
                beneficiaryIds: beneficiaries.map(b => b.ownerId), 
                totalAmount: Number(totalAmount), 
                exchangeRate, 
                paymentDate: Timestamp.fromDate(paymentDate!), 
                paymentMethod, 
                bank: (paymentMethod === 'efectivo_bs' || isDolares) ? 'Efectivo' : bank, 
                reference: isDolares ? 'EFECTIVO USD' : paymentMethod === 'efectivo_bs' ? 'EFECTIVO' : reference, 
                status: 'pendiente', 
                reportedAt: serverTimestamp() 
            });
            toast({ title: 'Reporte Enviado' });
            setTotalAmount(''); setReference(''); setBeneficiaryRows([]);
        } catch (error) { toast({ variant: "destructive", title: "Error" }); }
        finally { setIsSubmitting(false); }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden font-montserrat italic">
            <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-white font-black uppercase italic text-2xl tracking-tighter">Reporte <span className="text-primary">Manual</span></CardTitle></CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="p-8 space-y-10">
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Fecha Pago</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left"><CalendarIcon className="mr-3 h-5 w-5 text-primary" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : "Seleccione"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 bg-slate-900 border-white/10"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} /></PopoverContent></Popover></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Tasa Bs.</Label><Input type="number" value={isDolares ? '1.00' : (exchangeRate || '')} readOnly className="h-14 rounded-2xl bg-slate-800 border-none text-primary font-black italic" /></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Método</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}><SelectTrigger className="h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs"><SelectValue/></SelectTrigger><SelectContent className="bg-slate-900 border-white/10 text-white"><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem><SelectItem value="efectivo_bs">Efectivo Bs.</SelectItem><SelectItem value="efectivo_usd">💲 Efectivo USD</SelectItem></SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Banco Emisor</Label><Button type="button" variant="outline" className="w-full h-14 rounded-2xl font-black bg-slate-800 border-none text-white uppercase italic text-xs text-left" onClick={() => setIsBankModalOpen(true)} disabled={paymentMethod === 'efectivo_bs' || isDolares}>{isDolares ? 'EFECTIVO USD' : (bank || "Seleccionar...")}</Button></div>
                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Referencia</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={paymentMethod === 'efectivo_bs' || isDolares} className="h-14 rounded-2xl bg-slate-800 border-none text-white font-black italic" placeholder="N° REF" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Monto {isDolares ? 'USD' : 'Bs.'}</Label><Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="h-14 rounded-2xl bg-slate-800 border-none font-black text-2xl italic text-right pr-6" placeholder="0,00" /></div>
                            <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">Equiv. {isDolares ? 'Bs.' : 'USD'}</Label><Input value={isDolares ? formatCurrency((parseFloat(totalAmount) || 0) * (exchangeRate || 0)) : ((parseFloat(totalAmount) || 0) / (exchangeRate || 1)).toFixed(2)} readOnly className="h-14 rounded-2xl bg-slate-800 border-none text-emerald-500 font-black text-2xl italic text-right pr-6" /></div>
                        </div>
                    </div>
                    
                    <div className="space-y-6">
                        <Label className="text-[10px] font-black uppercase text-primary tracking-widest ml-2">Asignación de Beneficiarios</Label>
                        {beneficiaryRows.map((row) => (
                            <div key={row.id} className="p-6 bg-white/5 border border-white/5 rounded-[2rem] space-y-4">
                                {!row.owner ? (
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                                        <Input placeholder="Buscar Residente..." className="pl-12 h-14 rounded-2xl bg-slate-800 border-none text-white font-black uppercase text-xs" value={row.searchTerm} onChange={(e) => setBeneficiaryRows(rows => rows.map(r => r.id === row.id ? { ...r, searchTerm: e.target.value } : r))} />
                                        {row.searchTerm.length >= 2 && (
                                            <Card className="absolute z-50 w-full mt-2 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden">
                                                <ScrollArea className="h-48">
                                                    {allOwners.filter(o => o.name.toLowerCase().includes(row.searchTerm.toLowerCase())).map(o => (
                                                        <div key={o.id} onClick={() => handleOwnerSelect(row.id, o)} className="p-4 hover:bg-white/5 cursor-pointer font-black text-sm uppercase text-white border-b border-white/5">{o.name}</div>
                                                    ))}
                                                </ScrollArea>
                                            </Card>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col"><span className="font-black text-primary text-xs uppercase">{row.owner.name}</span>{row.selectedProperty && <span className="text-[9px] font-bold text-slate-500 uppercase">{row.selectedProperty.street} - {row.selectedProperty.house}</span>}</div>
                                        <Input type="number" value={row.amount} onChange={e => setBeneficiaryRows(rows => rows.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))} className="w-32 h-10 bg-slate-800 border-none text-white font-black text-right" />
                                        <Button type="button" variant="ghost" size="icon" onClick={() => setBeneficiaryRows(rows => rows.filter(r => r.id !== row.id))} className="text-red-500 h-10 w-10"><Trash2/></Button>
                                    </div>
                                )}
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => setBeneficiaryRows([...beneficiaryRows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }])} className="rounded-xl font-black uppercase text-[10px] border-white/10 text-slate-400 hover:bg-white/5"><UserPlus className="mr-2 h-4 w-4 text-primary"/> Añadir Beneficiario</Button>
                    </div>
                </CardContent>
                <CardFooter className="bg-white/5 p-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className={cn("font-black text-2xl italic tracking-tighter uppercase", balance !== 0 ? 'text-red-500' : 'text-emerald-500')}>Diferencia: {formatCurrency(Math.abs(balance))}</div>
                    <Button type="submit" disabled={isSubmitting || Math.abs(balance) > 0.01 || beneficiaryRows.length === 0} className="h-16 px-12 rounded-2xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95">
                        {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-5 w-5" />} REGISTRAR PAGO Y ASENTAR
                    </Button>
                </CardFooter>
            </form>
            <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(v) => { setBank(v); setIsBankModalOpen(false); }} />
        </Card>
    );
}

// ============================================
// COMPONENTE: CALCULADORA ADMINISTRATIVA
// ============================================

function CalculatorComponent({ condoId }: { condoId: string }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [debts, setDebts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);

    const ownersCol = condoId === 'condo_01' ? 'owners' : 'propietarios';

    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, ownersCol), where('role', '==', 'propietario'));
        return onSnapshot(q, snap => {
            setAllOwners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Owner)).filter(o => o.email !== 'vallecondo@gmail.com').sort((a,b) => a.name.localeCompare(b.name)));
        });
    }, [condoId, ownersCol]);

    useEffect(() => {
        if (!condoId) return;
        getDoc(doc(db, 'condominios', condoId, 'config', 'mainSettings')).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                setCondoFee(data.condoFee || 0);
                const active = (data.exchangeRates || []).find((r:any) => r.active);
                setActiveRate(active?.rate || 0);
            }
        });
    }, [condoId]);

    useEffect(() => {
        if (!selectedOwner || !condoId) return;
        setLoading(true);
        const q = query(collection(db, 'condominios', condoId, 'debts'), where('ownerId', '==', selectedOwner.id), where('status', 'in', ['pending', 'vencida']));
        return onSnapshot(q, snap => {
            setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
    }, [selectedOwner, condoId]);

    const totals = useMemo(() => {
        const selectedAmountUSD = debts.filter(d => selectedDebts.includes(d.id)).reduce((sum, d) => sum + d.amountUSD, 0);
        const advanceAmountUSD = selectedAdvanceMonths.length * condoFee;
        const subTotalBs = (selectedAmountUSD + advanceAmountUSD) * activeRate;
        const balanceBs = selectedOwner?.balance || 0;
        return { subTotalBs, balanceBs, totalToPayBs: Math.max(0, subTotalBs - balanceBs) };
    }, [debts, selectedDebts, selectedAdvanceMonths, condoFee, activeRate, selectedOwner]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 font-montserrat italic text-white">
            <div className="lg:col-span-2 space-y-6">
                <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[2rem]">
                    <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-xl font-black uppercase italic tracking-tighter">1. Seleccionar Residente</CardTitle></CardHeader>
                    <CardContent className="p-8">
                        {!selectedOwner ? (
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5"/>
                                <Input placeholder="BUSCAR PROPIETARIO..." className="pl-12 h-14 rounded-2xl bg-slate-800 border-none font-black text-sm uppercase" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                                {searchTerm.length >= 2 && (
                                    <Card className="absolute z-50 w-full mt-2 bg-slate-950 border border-white/10 shadow-2xl rounded-2xl overflow-hidden ring-1 ring-primary/20">
                                        <ScrollArea className="h-64">
                                            {allOwners.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase())).map(o => (
                                                <div key={o.id} onClick={() => setSelectedOwner(o)} className="p-5 hover:bg-white/10 cursor-pointer font-black text-sm uppercase border-b border-white/5 transition-colors text-white">
                                                    {o.name}
                                                </div>
                                            ))}
                                        </ScrollArea>
                                    </Card>
                                )}
                            </div>
                        ) : (
                            <div className="flex justify-between items-center p-6 bg-slate-800 rounded-3xl border border-primary/20">
                                <div className="flex items-center gap-4">
                                    <div className="bg-primary/10 p-3 rounded-2xl text-primary"><UserPlus /></div>
                                    <div>
                                        <p className="font-black text-xl uppercase tracking-tighter">{selectedOwner.name}</p>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedOwner.properties.map(p => `${p.street} ${p.house}`).join(' | ')}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => { setSelectedOwner(null); setSelectedDebts([]); setSelectedAdvanceMonths([]); }} className="text-red-500 hover:bg-red-500/10 rounded-full h-12 w-12"><XCircle /></Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {selectedOwner && (
                    <>
                        <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[2rem]">
                            <CardHeader className="bg-white/5 p-8 border-b border-white/5"><CardTitle className="text-xl font-black uppercase italic tracking-tighter">2. Deudas Pendientes</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                {loading ? <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-primary h-10 w-10"/></div> : (
                                    <Table>
                                        <TableHeader className="bg-slate-800/30">
                                            <TableRow className="border-white/5">
                                                <TableHead className="w-16 px-8 py-6 text-center">PAGAR</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase text-slate-400">PERÍODO</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase text-slate-400">CONCEPTO</TableHead>
                                                <TableHead className="text-right pr-8 text-[10px] font-black uppercase text-slate-400">MONTO BS.</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {debts.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-slate-500 font-bold uppercase text-[10px]">Sin deudas pendientes</TableCell></TableRow> : 
                                            debts.sort((a,b) => a.year - b.year || a.month - b.month).map(d => (
                                                <TableRow key={d.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                                    <TableCell className="px-8 py-6 text-center">
                                                        <Checkbox 
                                                            className="border-primary data-[state=checked]:bg-primary"
                                                            checked={selectedDebts.includes(d.id)} 
                                                            onCheckedChange={c => setSelectedDebts(p => c ? [...p, d.id] : p.filter(id => id !== d.id))}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-black text-white text-xs uppercase">{monthsLocale[d.month]} {d.year}</TableCell>
                                                    <TableCell className="text-[10px] font-bold text-slate-500 uppercase">{d.description}</TableCell>
                                                    <TableCell className="text-right pr-8 font-black text-white italic">Bs. {formatCurrency(d.amountUSD * activeRate)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[2rem]">
                            <CardHeader className="bg-white/5 p-8 border-b border-white/5">
                                <CardTitle className="text-xl font-black uppercase italic tracking-tighter">3. Meses por Adelantado</CardTitle>
                                <CardDescription className="text-white/40 font-bold text-[10px] uppercase">Cuota actual: ${condoFee.toFixed(2)}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {Array.from({ length: 12 }, (_, i) => {
                                        const date = addMonths(new Date(), i);
                                        const value = format(date, 'yyyy-MM');
                                        return (
                                            <Button 
                                                key={value}
                                                variant={selectedAdvanceMonths.includes(value) ? 'default' : 'outline'}
                                                className={cn(
                                                    "h-14 rounded-2xl font-black uppercase text-[10px] tracking-tighter transition-all",
                                                    selectedAdvanceMonths.includes(value) ? "bg-primary text-slate-900" : "border-white/10 text-white hover:bg-white/5"
                                                )}
                                                onClick={() => setSelectedAdvanceMonths(p => p.includes(value) ? p.filter(m => m !== value) : [...p, value])}
                                            >
                                                {selectedAdvanceMonths.includes(value) && <Check className="h-3 w-3 mr-1" />}
                                                {format(date, 'MMMM yyyy', { locale: es }).toUpperCase()}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            <div className="lg:sticky lg:top-24">
                <Card className="bg-slate-900 border-none shadow-2xl overflow-hidden rounded-[3rem] border border-white/5">
                    <CardHeader className="bg-primary text-slate-900 p-8 text-center"><CardTitle className="text-2xl font-black uppercase italic tracking-tighter flex items-center justify-center gap-3"><Calculator /> Liquidación</CardTitle></CardHeader>
                    <CardContent className="p-8 space-y-6">
                        <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-slate-500">TASA BCV</span><Badge variant="outline" className="font-black text-primary border-primary/20">Bs. {formatCurrency(activeRate)}</Badge></div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase text-slate-400">Sub-Total Deuda</span>
                                <span className="font-black text-white italic">Bs. {formatCurrency(totals.subTotalBs)}</span>
                            </div>
                            <div className="flex justify-between items-center text-emerald-500">
                                <span className="text-[10px] font-black uppercase">(-) Saldo a Favor</span>
                                <span className="font-black italic">Bs. {formatCurrency(totals.balanceBs)}</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 text-center bg-white/5 p-6 rounded-[2rem] border border-white/5 shadow-inner">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">TOTAL A PAGAR</span>
                            <span className="text-4xl font-black text-white italic drop-shadow-2xl">Bs. {formatCurrency(totals.totalToPayBs)}</span>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase mt-1">EQUIV: ${formatToTwoDecimals(totals.totalToPayBs / (activeRate || 1))}</span>
                        </div>
                    </CardContent>
                    <CardFooter className="px-8 pb-8"><Button onClick={() => {}} disabled={!selectedOwner || totals.totalToPayBs <= 0} className="w-full h-16 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase italic tracking-widest shadow-2xl shadow-primary/20 transition-all active:scale-95">PROCEDER AL REPORTE <Receipt className="ml-2"/></Button></CardFooter>
                </Card>
            </div>
        </div>
    );
}

// ============================================
// PÁGINA PRINCIPAL
// ============================================

function PaymentsPage() {
    const searchParams = useSearchParams();
    const condoId = useParams()?.condoId as string;
    const router = useRouter();
    const activeTab = searchParams?.get('tab') ?? 'verify';

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-primary">Pagos</span></h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">Control de Ingresos y Auditoría Contable.</p>
            </div>
            
            <Tabs value={activeTab} onValueChange={(v) => router.push(`/${condoId}/admin/payments?tab=${v}`)}>
                <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 h-16 rounded-2xl p-1 border border-white/5">
                    <TabsTrigger value="verify" className="rounded-xl font-black uppercase text-xs tracking-widest italic">En Tránsito</TabsTrigger>
                    <TabsTrigger value="history" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Historial</TabsTrigger>
                    <TabsTrigger value="report" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Reporte Manual</TabsTrigger>
                    <TabsTrigger value="calculator" className="rounded-xl font-black uppercase text-xs tracking-widest italic">Calculadora</TabsTrigger>
                </TabsList>
                
                <TabsContent value="verify" className="mt-8"><VerificationComponent condoId={condoId} /></TabsContent>
                <TabsContent value="history" className="mt-8"><HistoryComponent condoId={condoId} /></TabsContent>
                <TabsContent value="report" className="mt-8"><ReportPaymentComponent /></TabsContent>
                <TabsContent value="calculator" className="mt-8"><CalculatorComponent condoId={condoId} /></TabsContent>
            </Tabs>
        </div>
    );
}

export default function PaymentsPageWrapper() {
    return (<Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#1A1D23]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}><PaymentsPage /></Suspense>);
}

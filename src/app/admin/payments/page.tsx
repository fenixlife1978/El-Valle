

'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, CheckCircle2, Trash2, PlusCircle, Loader2, Search, XCircle, Wand2, UserPlus, Banknote, Info, Receipt, Calculator, Minus, Equal, Check, MoreHorizontal, Filter, Eye, AlertTriangle, Paperclip, Upload } from 'lucide-react';
import { format, parseISO, isBefore, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, compressImage } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp, setDoc, writeBatch, updateDoc, deleteDoc, runTransaction, limit, orderBy, deleteField } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { inferPaymentDetails } from '@/ai/flows/infer-payment-details';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { BankSelectionModal } from '@/components/bank-selection-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { useAuthorization } from '@/hooks/use-authorization';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import Decimal from 'decimal.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter, useSearchParams } from 'next/navigation';


// --- Type Definitions (Shared) ---
type Owner = {
    id: string;
    name: string;
    balance: number;
    properties: { street: string, house: string }[];
    receiptCounter?: number;
};
type ExchangeRate = { id: string; date: string; rate: number; active: boolean; };
type Debt = { id: string; ownerId: string; year: number; month: number; amountUSD: number; description: string; status: 'pending' | 'paid' | 'vencida'; property: {street:string, house:string}; paymentId?:string; paidAmountUSD?: number; paymentDate?:Timestamp};
type PaymentDetails = { paymentMethod: 'movil' | 'transferencia' | ''; bank: string; otherBank: string; reference: string; };
type BeneficiaryRow = { id: string; owner: Owner | null; searchTerm: string; amount: string; selectedProperty: { street: string, house: string } | null; };
type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil' | 'adelanto' | 'conciliacion';
type Beneficiary = { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; };
type FullPayment = { id: string; beneficiaries: Beneficiary[]; beneficiaryIds: string[]; totalAmount: number; exchangeRate: number; paymentDate: Timestamp; status: PaymentStatus; user?: string; unit: string; amount: number; date: string; bank: string; type: PaymentMethod; reference: string; receiptNumber?: string; receiptNumbers?: { [ownerId: string]: string }; receiptUrl?: string; reportedBy: string; reportedAt?: Timestamp; observations?: string; isReconciled?: boolean; };
type CompanyInfo = { name: string; address: string; rif: string; phone: string; email: string; logo: string;};
type ReceiptData = { payment: FullPayment; beneficiary: Beneficiary; ownerName: string; ownerUnit: string; paidDebts: Debt[]; previousBalance: number; currentBalance: number; qrCodeUrl?: string; receiptNumber: string; } | null;

// --- Constants ---
const ADMIN_USER_ID = 'valle-admin-main-account';
const monthsLocale: { [key: number]: string } = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
const venezuelanBanks = [ { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' }, { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' }, { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'tesoro', label: 'Banco del Tesoro' }, { value: 'otro', label: 'Otro' }];
const statusVariantMap: { [key in PaymentStatus]: 'warning' | 'success' | 'destructive' } = { pendiente: 'warning', aprobado: 'success', rechazado: 'destructive' };
const statusTextMap: { [key in PaymentStatus]: string } = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };
const formatToTwoDecimals = (num: number) => { if (typeof num !== 'number' || isNaN(num)) return '0,00'; const truncated = Math.trunc(num * 100) / 100; return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };


// ===================================================================================
// VERIFY PAYMENTS COMPONENT
// ===================================================================================
function VerifyPaymentsTab() {
    const [payments, setPayments] = useState<FullPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<PaymentStatus | 'todos'>('todos');
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [condoFee, setCondoFee] = useState(0);
    const [paymentToDelete, setPaymentToDelete] = useState<FullPayment | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const [ownersMap, setOwnersMap] = useState<Map<string, Owner>>(new Map());
    const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
    const [receiptImageToView, setReceiptImageToView] = useState<string | null>(null);

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "owners")), (snapshot) => {
            const newOwnersMap = new Map<string, Owner>();
            snapshot.forEach(doc => newOwnersMap.set(doc.id, { id: doc.id, ...doc.data() } as Owner));
            setOwnersMap(newOwnersMap);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (ownersMap.size === 0) return;
        setLoading(true);
        const q = query(collection(db, "payments"), orderBy('reportedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const paymentsData: FullPayment[] = snapshot.docs.map(doc => {
                const data = doc.data();
                const firstBeneficiary = data.beneficiaries?.[0];
                let userName = 'Beneficiario no identificado';
                let unit = 'Propiedad no especificada';
                if (firstBeneficiary?.ownerId) {
                    const owner = ownersMap.get(firstBeneficiary.ownerId);
                    if (owner) {
                        userName = owner.name;
                        if (data.beneficiaries?.length > 1) unit = "Múltiples Propiedades";
                        else if (firstBeneficiary.street && firstBeneficiary.house) unit = `${firstBeneficiary.street} - ${firstBeneficiary.house}`;
                        else if (owner.properties && owner.properties.length > 0) unit = `${owner.properties[0].street} - ${owner.properties[0].house}`;
                    }
                }
                return { id: doc.id, user: userName, unit: unit, amount: data.totalAmount, date: new Date(data.paymentDate.seconds * 1000).toISOString(), bank: data.bank, type: data.paymentMethod, reference: data.reference, ...data } as FullPayment;
            });
            setPayments(paymentsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching payments: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos.' });
            setLoading(false);
        });

        const fetchSettings = async () => {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                const settings = docSnap.data();
                setCompanyInfo(settings.companyInfo as CompanyInfo);
                setCondoFee(settings.condoFee || 0);
            }
        };
        fetchSettings();

        return () => unsubscribe();
    }, [toast, ownersMap]);

    const handleStatusChange = async (id: string, newStatus: PaymentStatus) => {
        const paymentRef = doc(db, 'payments', id);
      
        requestAuthorization(async () => {
            if (newStatus === 'rechazado') {
              try {
                await updateDoc(paymentRef, { status: 'rechazado' });
                toast({ title: 'Pago Rechazado', description: `El pago ha sido marcado como rechazado.` });
              } catch (error) {
                console.error("Error rejecting payment: ", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
              }
              return;
            }
          
            if (newStatus === 'aprobado') {
                try {
                    await runTransaction(db, async (transaction) => {
                        const paymentDoc = await transaction.get(paymentRef);
                        if (!paymentDoc.exists() || paymentDoc.data().status === 'aprobado') throw new Error('El pago no existe o ya fue aprobado anteriormente.');
                        const paymentData = { id: paymentDoc.id, ...paymentDoc.data() } as FullPayment;
        
                        const settingsRef = doc(db, 'config', 'mainSettings');
                        const settingsSnap = await transaction.get(settingsRef);
                        if (!settingsSnap.exists()) throw new Error('No se encontró el documento de configuración.');
                        
                        const settingsData = settingsSnap.data();
                        const allRates = (settingsData.exchangeRates || []) as {date: string, rate: number}[];
                        const currentCondoFee = new Decimal(settingsData.condoFee || 0);
                        
                        if (currentCondoFee.lessThanOrEqualTo(0) && paymentData.type !== 'adelanto') throw new Error('La cuota de condominio debe ser mayor a cero. Por favor, configúrela.');
        
                        const paymentDateString = format(paymentData.paymentDate.toDate(), 'yyyy-MM-dd');
                        const applicableRates = allRates.filter(r => r.date <= paymentDateString).sort((a, b) => b.date.localeCompare(a.date));
                        const exchangeRate = new Decimal(applicableRates.length > 0 ? applicableRates[0].rate : 0);
                        
                        if (exchangeRate.lessThanOrEqualTo(0) && paymentData.type !== 'adelanto') throw new Error(`No se encontró una tasa de cambio válida para la fecha del pago (${paymentDateString}).`);
                        paymentData.exchangeRate = exchangeRate.toNumber();
        
                        const allBeneficiaryIds = Array.from(new Set(paymentData.beneficiaries.map(b => b.ownerId)));
                        if (allBeneficiaryIds.length === 0) throw new Error("El pago no tiene beneficiarios definidos.");
        
                        const ownerDocs = await Promise.all(allBeneficiaryIds.map(ownerId => transaction.get(doc(db, 'owners', ownerId))));
                        const ownerDataMap = new Map<string, any>();
                        ownerDocs.forEach((ownerDoc) => {
                            if (!ownerDoc.exists()) throw new Error(`El propietario ${ownerDoc.id} no fue encontrado.`);
                            ownerDataMap.set(ownerDoc.id, ownerDoc.data());
                        });
        
                        const newReceiptNumbers: { [key: string]: string } = {};
        
                        for (const beneficiary of paymentData.beneficiaries) {
                            const ownerId = beneficiary.ownerId;
                            const ownerData = ownerDataMap.get(ownerId);
                            if (!ownerData) continue;
        
                            const ownerRef = doc(db, 'owners', ownerId);
                            const receiptCounter = ownerData.receiptCounter || 0;
                            const newReceiptCounter = receiptCounter + 1;
                            const receiptNumber = `REC-${ownerId.substring(0, 4).toUpperCase()}-${String(newReceiptCounter).padStart(5, '0')}`;
                            newReceiptNumbers[ownerId] = receiptNumber;
        
                            let availableFunds = new Decimal(beneficiary.amount).plus(new Decimal(ownerData.balance || 0));
                            
                            const debtsQuery = query(collection(db, 'debts'), where('ownerId', '==', ownerId));
                            const debtsSnapshot = await getDocs(debtsQuery); 
                            
                            const allOwnerDebts = debtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
                            const pendingDebts = allOwnerDebts.filter(d => d.status === 'pending').sort((a, b) => a.year - b.year || a.month - b.month);
                            
                            for (const debt of pendingDebts) {
                                const debtRef = doc(db, 'debts', debt.id);
                                const debtAmountBs = new Decimal(debt.amountUSD).times(exchangeRate);
                                if (availableFunds.greaterThanOrEqualTo(debtAmountBs)) {
                                    availableFunds = availableFunds.minus(debtAmountBs);
                                    transaction.update(debtRef, { status: 'paid', paidAmountUSD: debt.amountUSD, paymentDate: paymentData.paymentDate, paymentId: paymentData.id });
                                } else break; 
                            }
                            
                            if (currentCondoFee.greaterThan(0)) {
                                const condoFeeBs = currentCondoFee.times(exchangeRate);
                                const allPaidPeriods = new Set(allOwnerDebts.map(d => `${d.year}-${d.month}`));
                                let lastPaidPeriod = { year: 1970, month: 1 };
                                allOwnerDebts.forEach(d => { if (d.status === 'paid' || pendingDebts.some(pd => pd.id === d.id)) { if (d.year > lastPaidPeriod.year || (d.year === lastPaidPeriod.year && d.month > lastPaidPeriod.month)) lastPaidPeriod = { year: d.year, month: d.month }; }});
                                let nextPeriodDate = addMonths(new Date(lastPaidPeriod.year, lastPaidPeriod.month - 1), 1);
                                
                                const ownerProperties = ownerData.properties || [];
                                if (ownerProperties.length > 0) {
                                    const property = ownerProperties[0];
                                    for (let i = 0; i < 24; i++) {
                                        if (availableFunds.lessThan(condoFeeBs)) break;
                                        const futureYear = nextPeriodDate.getFullYear();
                                        const futureMonth = nextPeriodDate.getMonth() + 1;
                                        const periodKey = `${futureYear}-${futureMonth}`;
                                        if (allPaidPeriods.has(periodKey)) { nextPeriodDate = addMonths(nextPeriodDate, 1); continue; }
                                        availableFunds = availableFunds.minus(condoFeeBs);
                                        const debtRef = doc(collection(db, 'debts'));
                                        transaction.set(debtRef, { ownerId: ownerId, property: property, year: futureYear, month: futureMonth, amountUSD: currentCondoFee.toNumber(), description: "Cuota de Condominio (Pagada por adelantado)", status: 'paid', paidAmountUSD: currentCondoFee.toNumber(), paymentDate: paymentData.paymentDate, paymentId: paymentData.id });
                                        allPaidPeriods.add(periodKey);
                                        nextPeriodDate = addMonths(nextPeriodDate, 1);
                                    }
                                }
                            }
                            
                            const finalBalance = availableFunds.toDecimalPlaces(2).toNumber();
                            transaction.update(ownerRef, { balance: finalBalance, receiptCounter: newReceiptCounter });
                            
                            const notificationsRef = doc(collection(ownerRef, "notifications"));
                            await setDoc(notificationsRef, { title: "Pago Aprobado", body: `Tu pago de Bs. ${formatToTwoDecimals(beneficiary.amount)} ha sido aprobado y aplicado.`, createdAt: Timestamp.now(), read: false, href: `/owner/dashboard`, paymentId: paymentData.id });
                        }
                        const observationNote = `Pago aprobado. Tasa aplicada: Bs. ${exchangeRate.toDecimalPlaces(2).toNumber()}.`;
                        transaction.update(paymentRef, { status: 'aprobado', observations: observationNote, exchangeRate: exchangeRate.toNumber(), receiptNumbers: newReceiptNumbers });
                    });
            
                    toast({ title: 'Pago Aprobado y Procesado', description: 'El saldo de los propietarios y las deudas han sido actualizados.', className: 'bg-green-100 border-green-400 text-green-800' });
                } catch (error) {
                    console.error("Error processing payment approval: ", error);
                    const errorMessage = error instanceof Error ? error.message : 'No se pudo aprobar y procesar el pago.';
                    toast({ variant: 'destructive', title: 'Error en la Operación', description: errorMessage });
                }
            }
        });
      };
    
    // ... Other handlers from verify/page.tsx ...
    const confirmDelete = async () => {
        if (!paymentToDelete) return;
        requestAuthorization(async () => {
            const paymentRef = doc(db, "payments", paymentToDelete.id);
            try {
                if (paymentToDelete.status === 'aprobado') {
                     const batch = writeBatch(db);
                    for (const beneficiary of paymentToDelete.beneficiaries) {
                        const ownerRef = doc(db, 'owners', beneficiary.ownerId);
                        const ownerDoc = await getDoc(ownerRef);
                        if (ownerDoc.exists()) {
                            const currentBalance = ownerDoc.data().balance || 0;
                            const amountToRevert = beneficiary.amount || 0;
                            batch.update(ownerRef, { balance: currentBalance + amountToRevert });
                        }
                    }
                    const debtsToRevertQuery = query(collection(db, 'debts'), where('paymentId', '==', paymentToDelete.id));
                    const debtsToRevertSnapshot = await getDocs(debtsToRevertQuery);
                    debtsToRevertSnapshot.forEach(debtDoc => {
                        if (debtDoc.data().description.includes('Pagada por adelantado')) batch.delete(debtDoc.ref);
                        else batch.update(debtDoc.ref, { status: 'pending', paymentDate: deleteField(), paidAmountUSD: deleteField(), paymentId: deleteField() });
                    });
                    batch.delete(paymentRef);
                    await batch.commit();
                    toast({ title: "Pago Revertido", description: "El pago ha sido eliminado y las deudas y saldos han sido revertidos." });
                } else {
                    await deleteDoc(paymentRef);
                    toast({ title: "Pago Eliminado", description: "El registro del pago pendiente/rechazado ha sido eliminado." });
                }
            } catch (error) {
                console.error("Error deleting/reverting payment: ", error);
                const errorMessage = error instanceof Error ? error.message : "No se pudo completar la operación.";
                toast({ variant: "destructive", title: "Error en la Operación", description: errorMessage });
            } finally {
                setIsDeleteConfirmationOpen(false);
                setPaymentToDelete(null);
            }
        });
    };

    const filteredPayments = payments.filter(p => filter === 'todos' || p.status === filter);
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Pagos Registrados</CardTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline"><Filter className="mr-2 h-4 w-4" />Filtrar por: <span className="font-semibold ml-1 capitalize">{filter === 'todos' ? 'Todos' : statusTextMap[filter]}</span></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setFilter('todos')}>Todos</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('pendiente')}>{statusTextMap['pendiente']}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('aprobado')}>{statusTextMap['aprobado']}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('rechazado')}>{statusTextMap['rechazado']}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader><TableRow><TableHead>Beneficiario</TableHead><TableHead>Monto</TableHead><TableHead>Fecha</TableHead><TableHead>Referencia</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {loading ? <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                         : filteredPayments.length === 0 ? <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No hay pagos que coincidan con el filtro seleccionado.</TableCell></TableRow>
                         : filteredPayments.map((payment) => (
                            <TableRow key={payment.id}>
                                <TableCell className="font-medium">{payment.user}</TableCell>
                                <TableCell>{payment.type === 'adelanto' ? `$${formatToTwoDecimals(payment.amount)}` : `Bs. ${formatToTwoDecimals(payment.amount)}`}</TableCell>
                                <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                                <TableCell>{payment.reference}</TableCell>
                                <TableCell><Badge variant={statusVariantMap[payment.status]}>{statusTextMap[payment.status]}</Badge></TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                             {payment.receiptUrl && <DropdownMenuItem onClick={() => setReceiptImageToView(payment.receiptUrl!)}><Paperclip className="mr-2 h-4 w-4" /> Ver Comprobante</DropdownMenuItem>}
                                            {payment.status === 'pendiente' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'aprobado')}><CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />Aprobar</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'rechazado')} className="text-destructive"><XCircle className="mr-2 h-4 w-4" />Rechazar</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                </>
                                            )}
                                             <DropdownMenuItem onClick={() => setPaymentToDelete(payment)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Está seguro?</DialogTitle>
                        <DialogDescription>Esta acción no se puede deshacer. Esto eliminará permanentemente el registro del pago. Si el pago ya fue aprobado, se revertirán las deudas y saldos del propietario afectado.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar pago</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={!!receiptImageToView} onOpenChange={() => setReceiptImageToView(null)}>
                <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Comprobante de Pago</DialogTitle></DialogHeader><div className="p-4 flex justify-center"><img src={receiptImageToView!} alt="Comprobante de pago" className="max-w-full max-h-[80vh] object-contain"/></div></DialogContent>
            </Dialog>
        </Card>
    );
}

// ===================================================================================
// REPORT PAYMENT COMPONENT
// ===================================================================================
function ReportPaymentTab() {
    const { toast } = useToast();
    const router = useRouter();
    const { user: authUser } = useAuth();
    const [allOwners, setAllOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>();
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<any>('');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [beneficiaryRows, setBeneficiaryRows] = useState<BeneficiaryRow[]>([]);
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
    const [receiptImage, setReceiptImage] = useState<string | null>(null);


    useEffect(() => {
        const q = query(collection(db, "owners"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setAllOwners(ownersData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const fetchRate = async () => {
             try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    if (paymentDate) {
                        setExchangeRate(null);
                        setExchangeRateMessage('Buscando tasa...');
                        const allRates = (settings.exchangeRates || []) as ExchangeRate[];
                        const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                        const applicableRates = allRates.filter(r => r.date <= paymentDateString).sort((a, b) => b.date.localeCompare(a.date));
                        if (applicableRates.length > 0) {
                             setExchangeRate(applicableRates[0].rate);
                             setExchangeRateMessage('');
                        } else setExchangeRateMessage('No hay tasa para esta fecha.');
                    } else { setExchangeRate(null); setExchangeRateMessage(''); }
                } else setExchangeRateMessage('No hay configuraciones.');
            } catch (e) { setExchangeRateMessage('Error al buscar tasa.'); }
        }
        fetchRate();
    }, [paymentDate]);

    useEffect(() => {
        setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    }, []);
    
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        try {
            const compressedBase64 = await compressImage(file, 800, 800);
            setReceiptImage(compressedBase64);
            toast({ title: 'Comprobante cargado', description: 'La imagen se ha optimizado y está lista para ser enviada.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error de imagen', description: 'No se pudo procesar la imagen.' });
        } finally {
            setLoading(false);
        }
    };


    const assignedTotal = useMemo(() => beneficiaryRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0), [beneficiaryRows]);
    const balance = useMemo(() => (Number(totalAmount) || 0) - assignedTotal, [totalAmount, assignedTotal]);

    const resetForm = () => {
        setPaymentDate(undefined); setExchangeRate(null); setExchangeRateMessage(''); setPaymentMethod(''); setBank(''); setOtherBank(''); setReference(''); setTotalAmount('');
        setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
        setReceiptImage(null);
    }

    const updateBeneficiaryRow = (id: string, updates: Partial<BeneficiaryRow>) => setBeneficiaryRows(rows => rows.map(row => (row.id === id ? { ...row, ...updates } : row)));
    const handleOwnerSelect = (rowId: string, owner: Owner) => updateBeneficiaryRow(rowId, { owner, searchTerm: '', selectedProperty: owner.properties?.[0] || null });
    const addBeneficiaryRow = () => setBeneficiaryRows(rows => [...rows, { id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    const removeBeneficiaryRow = (id: string) => {
        if (beneficiaryRows.length > 1) setBeneficiaryRows(rows => rows.filter(row => row.id !== id));
        else setBeneficiaryRows([{ id: Date.now().toString(), owner: null, searchTerm: '', amount: '', selectedProperty: null }]);
    };
    const getFilteredOwners = (searchTerm: string) => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return allOwners.filter(owner => owner.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setLoading(true);
        const validationResult = await validateForm();
        if (!validationResult.isValid) { toast({ variant: 'destructive', title: 'Error de Validación', description: validationResult.error, duration: 6000 }); setLoading(false); return; }
        try {
            const beneficiaries = beneficiaryRows.map(row => ({ ownerId: row.owner!.id, ownerName: row.owner!.name, ...(row.selectedProperty || {}), amount: Number(row.amount) }));
            const paymentData = { paymentDate: Timestamp.fromDate(paymentDate!), exchangeRate, paymentMethod, bank: bank === 'Otro' ? otherBank : bank, reference, totalAmount: Number(totalAmount), beneficiaries, beneficiaryIds: Array.from(new Set(beneficiaries.map(b => b.ownerId))), status: 'pendiente', reportedAt: serverTimestamp(), reportedBy: authUser?.uid || 'unknown_admin', receiptUrl: receiptImage };
            await addDoc(collection(db, "payments"), paymentData);
            resetForm(); setIsInfoDialogOpen(true);
        } catch (error) { console.error("Error submitting payment:", error); toast({ variant: "destructive", title: "Error Inesperado", description: "No se pudo enviar el reporte." });
        } finally { setLoading(false); }
    };
    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        if (!paymentDate || !exchangeRate || !paymentMethod || !bank || !totalAmount || Number(totalAmount) <= 0 || reference.length < 4) return { isValid: false, error: 'Por favor, complete todos los campos de la transacción (referencia min. 4 dígitos).' };
        if (beneficiaryRows.some(row => !row.owner || !row.amount || Number(row.amount) <= 0 || !row.selectedProperty)) return { isValid: false, error: 'Por favor, complete todos los campos para cada beneficiario.' };
        if (Math.abs(balance) > 0.01) return { isValid: false, error: 'El monto total no coincide con la suma de los montos asignados.' };
        try {
            const q = query(collection(db, "payments"), where("reference", "==", reference), where("totalAmount", "==", Number(totalAmount)), where("paymentDate", "==", Timestamp.fromDate(paymentDate)));
            if (!(await getDocs(q)).empty) return { isValid: false, error: 'Ya existe un reporte de pago con esta misma referencia, monto y fecha.' };
        } catch (dbError) { return { isValid: false, error: "No se pudo verificar si el pago ya existe." }; }
        return { isValid: true };
    };

    return (
        <Card>
            <CardHeader><CardTitle>Reportar Pago por Propietario</CardTitle><CardDescription>Use este formulario para registrar pagos en nombre de los propietarios.</CardDescription></CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="space-y-8">
                    <Card><CardHeader><CardTitle>1. Detalles de la Transacción</CardTitle></CardHeader>
                        <CardContent className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2"><Label htmlFor="paymentDate">Fecha del Pago</Label><Popover><PopoverTrigger asChild><Button id="paymentDate" variant={"outline"} className={cn("w-full justify-start", !paymentDate && "text-muted-foreground")} disabled={loading}><CalendarIcon className="mr-2 h-4 w-4" />{paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} /></PopoverContent></Popover></div>
                            <div className="space-y-2"><Label>Tasa de Cambio (Bs. por USD)</Label><Input type="text" value={exchangeRate ? `Bs. ${exchangeRate.toFixed(2)}` : exchangeRateMessage || 'Seleccione una fecha'} readOnly className={cn("bg-muted/50")} /></div>
                            <div className="space-y-2"><Label htmlFor="paymentMethod">Tipo de Pago</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)} disabled={loading}><SelectTrigger id="paymentMethod"><SelectValue placeholder="Seleccione..." /></SelectTrigger><SelectContent><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="movil">Pago Móvil</SelectItem></SelectContent></Select></div>
                            <div className="space-y-2"><Label htmlFor="bank">Banco Emisor</Label><Button type="button" id="bank" variant="outline" className="w-full justify-start text-left font-normal" onClick={() => setIsBankModalOpen(true)} disabled={loading}>{bank ? <><Banknote className="mr-2 h-4 w-4" />{bank}</> : <span>Seleccione un banco...</span>}</Button></div>
                            {bank === 'Otro' && <div className="space-y-2 md:col-span-2"><Label htmlFor="otherBank">Nombre del Otro Banco</Label><Input id="otherBank" value={otherBank} onChange={(e) => setOtherBank(e.target.value)} disabled={loading}/></div>}
                            <div className="space-y-2"><Label htmlFor="reference">Últimos 6 dígitos de la Referencia</Label><Input id="reference" value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} disabled={loading} /><p className="text-xs text-muted-foreground">La referencia debe tener al menos 4 dígitos.</p></div>
                             <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="receipt">Comprobante de Pago (Opcional)</Label>
                                <Input id="receipt" type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} disabled={loading}/>
                                {receiptImage && (
                                    <div className="mt-2 relative w-32 h-32 border p-1 rounded-md">
                                        <img src={receiptImage} alt="Vista previa del comprobante" className="w-full h-full object-contain" />
                                        <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => setReceiptImage(null)}>
                                            <XCircle className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                    <Card><CardHeader><CardTitle>2. Detalles de los Beneficiarios</CardTitle><CardDescription>Asigne el monto total del pago entre uno o más beneficiarios.</CardDescription></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6"><div className="space-y-2"><Label htmlFor="totalAmount">Monto Total del Pago (Bs.)</Label><Input id="totalAmount" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" disabled={loading}/></div></div>
                            <div className="space-y-4"><Label className="font-semibold">Asignación de Montos</Label>
                                {beneficiaryRows.map((row, index) => (
                                    <Card key={row.id} className="p-4 bg-muted/50 relative">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2"><Label htmlFor={`search-${row.id}`}>Beneficiario {index + 1}</Label>
                                                {!row.owner ? (<><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id={`search-${row.id}`} placeholder="Buscar por nombre..." className="pl-9" value={row.searchTerm} onChange={(e) => updateBeneficiaryRow(row.id, { searchTerm: e.target.value })} disabled={loading} /></div>{row.searchTerm.length >= 3 && getFilteredOwners(row.searchTerm).length > 0 && <Card className="border rounded-md"><ScrollArea className="h-32">{getFilteredOwners(row.searchTerm).map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(row.id, owner)} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium text-sm">{owner.name}</p></div>))}</ScrollArea></Card>}</>)
                                                : (<div className="p-3 bg-background rounded-md flex items-center justify-between"><div><p className="font-semibold text-primary">{row.owner.name}</p></div><Button variant="ghost" size="icon" onClick={() => updateBeneficiaryRow(row.id, { owner: null, selectedProperty: null })} disabled={loading}><XCircle className="h-5 w-5 text-destructive" /></Button></div>)}
                                            </div>
                                            <div className="space-y-2"><Label htmlFor={`amount-${row.id}`}>Monto Asignado (Bs.)</Label><Input id={`amount-${row.id}`} type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBeneficiaryRow(row.id, { amount: e.target.value })} disabled={loading || !row.owner} /></div>
                                        </div>
                                        {row.owner && <div className="mt-4 space-y-2"><Label>Asignar a Propiedad</Label><Select onValueChange={(v) => updateBeneficiaryRow(row.id, { selectedProperty: row.owner!.properties.find(p => `${p.street}-${p.house}` === v) || null })} value={row.selectedProperty ? `${row.selectedProperty.street}-${row.selectedProperty.house}` : ''} disabled={loading || !row.owner}><SelectTrigger><SelectValue placeholder="Seleccione una propiedad..." /></SelectTrigger><SelectContent>{row.owner.properties.map(p => (<SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{`${p.street} - ${p.house}`}</SelectItem>))}</SelectContent></Select></div>}
                                        <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => removeBeneficiaryRow(row.id)} disabled={loading}><Trash2 className="h-4 w-4"/></Button>
                                    </Card>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={addBeneficiaryRow} disabled={loading}><UserPlus className="mr-2 h-4 w-4"/>Añadir Otro Beneficiario</Button>
                                <CardFooter className="p-4 bg-background/50 rounded-lg space-y-2 mt-4 flex-col items-stretch">
                                    <div className="flex justify-between text-sm font-medium"><span>Monto Total del Pago:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                    <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div><hr className="my-1 border-border"/><div className={cn("flex justify-between text-base font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                                </CardFooter>
                            </div>
                        </CardContent>
                    </Card>
                </CardContent>
                <CardFooter><Button type="submit" className="w-full md:w-auto ml-auto" onClick={() => router.push('/admin/payments?tab=report')} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}{loading ? 'Enviando...' : 'Enviar Reporte'}</Button></CardFooter>
                <BankSelectionModal isOpen={isBankModalOpen} onOpenChange={setIsBankModalOpen} selectedValue={bank} onSelect={(value) => { setBank(value); if (value !== 'Otro') setOtherBank(''); setIsBankModalOpen(false); }} />
                <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><Info className="h-6 w-6 text-blue-500" />Reporte Enviado para Revisión</DialogTitle><div className="pt-4 text-sm text-muted-foreground space-y-4"><p>¡Gracias! Hemos recibido el reporte de pago. Será procesado en un máximo de <strong>24 horas</strong>.</p></div></DialogHeader><DialogFooter><Button onClick={() => setIsInfoDialogOpen(false)}>Entendido</Button></DialogFooter></DialogContent></Dialog>
            </form>
        </Card>
    );
}

// ===================================================================================
// CALCULATOR COMPONENT
// ===================================================================================
function CalculatorTab() {
    const { toast } = useToast();
    const router = useRouter();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [ownerDebts, setOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    
    useEffect(() => {
        const fetchPrerequisites = async () => {
            setLoading(true);
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    setCondoFee(settings.condoFee || 0);
                    const rates = settings.exchangeRates || [];
                    const activeRateObj = rates.find((r: any) => r.active);
                    if (activeRateObj) setActiveRate(activeRateObj.rate);
                    else if (rates.length > 0) setActiveRate([...rates].sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].rate);
                }
                const ownersSnapshot = await getDocs(query(collection(db, "owners")));
                setOwners(ownersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)));
            } catch (error) { toast({ variant: 'destructive', title: 'Error de Carga' });
            } finally { setLoading(false); }
        };
        fetchPrerequisites();
    }, [toast]);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(o => o.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm, owners]);

    const handleSelectOwner = async (owner: Owner) => {
        setSelectedOwner(owner); setSearchTerm(''); setLoadingDebts(true); setSelectedPendingDebts([]); setSelectedAdvanceMonths([]);
        try {
            const q = query(collection(db, "debts"), where("ownerId", "==", owner.id));
            const querySnapshot = await getDocs(q);
            const debtsData: Debt[] = [];
            querySnapshot.forEach((doc) => debtsData.push({ id: doc.id, ...doc.data() } as Debt));
            setOwnerDebts(debtsData.sort((a, b) => a.year - a.year || a.month - b.month));
        } catch (error) { toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las deudas.' });
        } finally { setLoadingDebts(false); }
    };
    
    const pendingDebts = useMemo(() => ownerDebts.filter(d => d.status === 'pending' || d.status === 'vencida').sort((a, b) => a.year - b.year || a.month - b.month), [ownerDebts]);
    const handlePendingDebtSelection = (debtId: string) => {
        setSelectedPendingDebts(prev => prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]);
    };
    
    const handleAdvanceMonthSelection = (monthValue: string) => {
        setSelectedAdvanceMonths(prev => prev.includes(monthValue) ? prev.filter(m => m !== monthValue) : [...prev, monthValue]);
    };
    
    const futureMonths = useMemo(() => {
        const paidAdvanceMonths = ownerDebts.filter(d => d.status === 'paid' && d.description.includes('Adelantado')).map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);
        return Array.from({ length: 12 }, (_, i) => { const date = addMonths(new Date(), i); const value = format(date, 'yyyy-MM'); return { value, label: format(date, 'MMMM yyyy', { locale: es }), disabled: paidAdvanceMonths.includes(value) }; });
    }, [ownerDebts]);
    
    const paymentCalculator = useMemo(() => {
        if (!selectedOwner) return { totalToPay: 0, hasSelection: false, dueMonthsCount: 0, advanceMonthsCount: 0, totalDebtBs: 0, balanceInFavor: 0 };
        const dueMonthsTotalUSD = pendingDebts.filter(debt => selectedPendingDebts.includes(debt.id)).reduce((sum, debt) => sum + debt.amountUSD, 0);
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalDebtUSD = dueMonthsTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - selectedOwner.balance);
        return { totalToPay, hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0, dueMonthsCount: selectedPendingDebts.length, advanceMonthsCount: selectedAdvanceMonths.length, totalDebtBs, balanceInFavor: selectedOwner.balance, condoFee };
    }, [selectedPendingDebts, selectedAdvanceMonths, pendingDebts, activeRate, condoFee, selectedOwner]);
    
    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

    return (
        <Card>
            <CardHeader><CardTitle>Calculadora de Pagos de Propietarios</CardTitle><CardDescription>Calcule y registre pagos de deudas y adelantos.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2 space-y-4">
                        <Card><CardHeader><CardTitle>1. Buscar Propietario</CardTitle></CardHeader>
                            <CardContent>
                                <div className="relative mt-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar por nombre..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                                 {searchTerm.length >= 3 && filteredOwners.length > 0 && <Card className="border rounded-md mt-2"><ScrollArea className="h-48">{filteredOwners.map(owner => (<div key={owner.id} onClick={() => handleSelectOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p></div>))}</ScrollArea></Card>}
                                {selectedOwner && <Card className="bg-muted/50 p-4 mt-4"><p className="font-semibold text-primary">{selectedOwner.name}</p></Card>}
                            </CardContent>
                        </Card>
                        {selectedOwner && (<>
                            <Card><CardHeader><CardTitle>2. Deudas Pendientes</CardTitle></CardHeader>
                                <CardContent className="p-0">
                                    <Table><TableHeader><TableRow><TableHead>Pagar</TableHead><TableHead>Período</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Monto (Bs.)</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {loadingDebts ? <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2/></TableCell></TableRow>
                                            : pendingDebts.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center">No tiene deudas.</TableCell></TableRow>
                                            : pendingDebts.map((debt) => { const isOverdue = isBefore(startOfMonth(new Date(debt.year, debt.month - 1)), startOfMonth(new Date())); return (<TableRow key={debt.id} data-state={selectedPendingDebts.includes(debt.id) ? 'selected' : ''}><TableCell><Checkbox onCheckedChange={() => handlePendingDebtSelection(debt.id)} checked={selectedPendingDebts.includes(debt.id)} /></TableCell><TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell><TableCell><Badge variant={isOverdue ? 'destructive' : 'warning'}>{isOverdue ? 'Vencida' : 'Pendiente'}</Badge></TableCell><TableCell className="text-right">Bs. {formatToTwoDecimals(debt.amountUSD * activeRate)}</TableCell></TableRow>) })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                            <Card><CardHeader><CardTitle>3. Pagar Meses por Adelantado</CardTitle></CardHeader>
                                <CardContent><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{futureMonths.map(month => (<Button key={month.value} type="button" variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'} onClick={() => handleAdvanceMonthSelection(month.value)} disabled={month.disabled}>{selectedAdvanceMonths.includes(month.value) && <Check />} {month.label}</Button>))}</div></CardContent>
                            </Card>
                        </>)}
                    </div>
                    <div className="lg:sticky lg:top-20">
                         {paymentCalculator.hasSelection && (
                            <Card><CardHeader><CardTitle>4. Resumen de Pago</CardTitle></CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex justify-between"><span>Sub-Total:</span><span>Bs. {formatToTwoDecimals(paymentCalculator.totalDebtBs)}</span></div>
                                    <div className="flex justify-between"><span>Saldo a Favor:</span><span>- Bs. {formatToTwoDecimals(paymentCalculator.balanceInFavor)}</span></div><hr/>
                                    <div className="flex justify-between font-bold text-lg"><span>TOTAL A PAGAR:</span><span>Bs. {formatToTwoDecimals(paymentCalculator.totalToPay)}</span></div>
                                </CardContent>
                                <CardFooter>
                                    <Button className="w-full" onClick={() => router.push('/admin/payments?tab=report')} disabled={!paymentCalculator.hasSelection || paymentCalculator.totalToPay <= 0}>
                                        Reportar Pago
                                    </Button>
                                </CardFooter>
                            </Card>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}


// ===================================================================================
// MAIN PAGE COMPONENT
// ===================================================================================
function AdminPaymentsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState('verify');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'report' || tab === 'calculator') {
            setActiveTab(tab);
        } else {
            setActiveTab('verify');
        }
    }, [searchParams]);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        router.push(`/admin/payments?tab=${value}`, { scroll: false });
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Gestión de Pagos</h1>
                <p className="text-muted-foreground">Verifique, reporte o calcule pagos para los propietarios.</p>
            </div>
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="verify">Verificar Pagos</TabsTrigger>
                    <TabsTrigger value="report">Reportar Pago</TabsTrigger>
                    <TabsTrigger value="calculator">Calculadora de Pagos</TabsTrigger>
                </TabsList>
                <TabsContent value="verify" className="mt-6">
                    <VerifyPaymentsTab />
                </TabsContent>
                <TabsContent value="report" className="mt-6">
                    <ReportPaymentTab />
                </TabsContent>
                <TabsContent value="calculator" className="mt-6">
                    <CalculatorTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function AdminPaymentsPageWithSuspense() {
    return (
        <Suspense fallback={<div className="flex h-64 w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <AdminPaymentsPage />
        </Suspense>
    );
}

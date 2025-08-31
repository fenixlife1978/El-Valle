
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Info, Calculator, Minus, Equal, Check, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, getDocs, writeBatch, Timestamp, orderBy, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';

type Owner = {
    id: string;
    name: string;
    house: string;
    street: string;
    balance: number;
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
};

type PaymentDetails = {
    paymentMethod: 'movil' | 'transferencia' | '';
    bank: string;
    otherBank: string;
    reference: string;
};

const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'tesoro', label: 'Banco del Tesoro' },
    { value: 'otro', label: 'Otro' },
];

const monthsLocale = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, 'label': 'Agosto' }, { value: 9, 'label': 'Septiembre' },
    { value: 10, 'label': 'Octubre' }, { value: 11, 'label': 'Noviembre' }, { value: 12, 'label': 'Diciembre' }
];

export default function PaymentCalculatorPage() {
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
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({ paymentMethod: '', bank: '', otherBank: '', reference: '' });

    const { toast } = useToast();

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
                    else if (rates.length > 0) {
                        const sortedRates = [...rates].sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        setActiveRate(sortedRates[0].rate);
                    }
                }

                const ownersQuery = query(collection(db, "owners"));
                const ownersSnapshot = await getDocs(ownersQuery);
                const ownersData: Owner[] = ownersSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, name: data.name, 
                        house: (data.properties && data.properties.length > 0) ? data.properties[0].house : data.house,
                        street: (data.properties && data.properties.length > 0) ? data.properties[0].street : data.street,
                        balance: data.balance || 0,
                    };
                });
                setOwners(ownersData);

            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los datos necesarios.' });
            } finally {
                setLoading(false);
            }
        };
        fetchPrerequisites();
    }, [toast]);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(owner => 
            owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(owner.house).toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, owners]);

    const handleSelectOwner = async (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
        setLoadingDebts(true);
        setSelectedPendingDebts([]);
        setSelectedAdvanceMonths([]);

        try {
            const q = query(collection(db, "debts"), where("ownerId", "==", owner.id));
            const querySnapshot = await getDocs(q);
            const debtsData: Debt[] = [];
            querySnapshot.forEach((doc) => debtsData.push({ id: doc.id, ...doc.data() } as Debt));
            setOwnerDebts(debtsData.sort((a, b) => a.year - b.year || a.month - b.month));
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las deudas del propietario.' });
        } finally {
            setLoadingDebts(false);
        }
    };
    
    const handlePendingDebtSelection = (debtId: string) => {
        setSelectedPendingDebts(prev => prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]);
    };
    
    const handleAdvanceMonthSelection = (monthValue: string) => {
        setSelectedAdvanceMonths(prev => prev.includes(monthValue) ? prev.filter(m => m !== monthValue) : [...prev, monthValue]);
    };

    const futureMonths = useMemo(() => {
        const paidAdvanceMonths = ownerDebts
            .filter(d => d.status === 'paid' && d.description.includes('Adelantado'))
            .map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);

        return Array.from({ length: 12 }, (_, i) => {
            const date = addMonths(new Date(), i);
            const value = format(date, 'yyyy-MM');
            return {
                value,
                label: format(date, 'MMMM yyyy', { locale: es }),
                disabled: paidAdvanceMonths.includes(value),
            };
        });
    }, [ownerDebts]);

    const paymentCalculator = useMemo(() => {
        if (!selectedOwner) return { totalToPay: 0, hasSelection: false, dueMonthsCount: 0, advanceMonthsCount: 0 };
        
        const dueMonthsTotalUSD = ownerDebts
            .filter(debt => selectedPendingDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
        
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalDebtUSD = dueMonthsTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - selectedOwner.balance);

        return {
            totalToPay,
            hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0,
            dueMonthsCount: selectedPendingDebts.length,
            advanceMonthsCount: selectedAdvanceMonths.length,
            totalDebtBs: totalDebtBs,
            balanceInFavor: selectedOwner.balance,
            condoFee
        };
    }, [selectedPendingDebts, selectedAdvanceMonths, ownerDebts, activeRate, condoFee, selectedOwner]);

    const handleRegisterPayment = async () => {
        if (!paymentDetails.paymentMethod || !paymentDetails.bank || !paymentDetails.reference) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, complete todos los detalles del pago.' });
            return;
        }
        if (paymentDetails.bank === 'otro' && !paymentDetails.otherBank) {
            toast({ variant: 'destructive', title: 'Campo requerido', description: 'Por favor, especifique el nombre del otro banco.' });
            return;
        }

        setProcessingPayment(true);
        if (!selectedOwner) return;

        try {
            const batch = writeBatch(db);
            const paymentDate = Timestamp.now();
            let totalPaidUSD = 0;
            const ownerRef = doc(db, 'owners', selectedOwner.id);

            // 1. Update pending debts
            const debtsToUpdate = ownerDebts.filter(d => selectedPendingDebts.includes(d.id));
            debtsToUpdate.forEach(debt => {
                const debtRef = doc(db, 'debts', debt.id);
                batch.update(debtRef, { status: 'paid', paymentDate, paidAmountUSD: debt.amountUSD });
                totalPaidUSD += debt.amountUSD;
            });
            
            // 2. Create new debts for advance months
            selectedAdvanceMonths.forEach(monthStr => {
                const [year, month] = monthStr.split('-').map(Number);
                const debtRef = doc(collection(db, "debts"));
                batch.set(debtRef, {
                    ownerId: selectedOwner.id, year, month, amountUSD: condoFee,
                    description: "Cuota de Condominio (Pagada por adelantado)",
                    status: 'paid', paymentDate, paidAmountUSD: condoFee,
                });
                totalPaidUSD += condoFee;
            });

            // 3. Create payment document
            const paymentRef = doc(collection(db, 'payments'));
            const paymentData = {
                reportedBy: selectedOwner.id, // Admin reporting for owner
                beneficiaries: [{ ownerId: selectedOwner.id, house: selectedOwner.house, street: selectedOwner.street, amount: paymentCalculator.totalDebtBs }],
                totalAmount: paymentCalculator.totalDebtBs,
                exchangeRate: activeRate,
                paymentDate: paymentDate,
                reportedAt: paymentDate,
                paymentMethod: paymentDetails.paymentMethod,
                bank: paymentDetails.bank === 'otro' ? paymentDetails.otherBank : paymentDetails.bank,
                reference: paymentDetails.reference,
                status: 'aprobado',
                observations: 'Pago registrado desde calculadora.'
            };
            batch.set(paymentRef, paymentData);

            // 4. Update owner balance
            const newBalance = Math.max(0, selectedOwner.balance - paymentCalculator.totalDebtBs);
            batch.update(ownerRef, { balance: newBalance });

            await batch.commit();

            toast({ title: 'Pago Registrado Exitosamente', description: 'Las deudas y el saldo del propietario han sido actualizados.', className: 'bg-green-100 border-green-400 text-green-800' });
            setIsPaymentDialogOpen(false);
            setPaymentDetails({ paymentMethod: '', bank: '', otherBank: '', reference: '' });
            // Refresh owner data
            handleSelectOwner(selectedOwner);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar el pago.' });
        } finally {
            setProcessingPayment(false);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-3xl font-bold font-headline">Calculadora de Pagos</h1>
                <p className="text-muted-foreground">Calcule y registre pagos de deudas pendientes y adelantos de cuotas.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Buscar Propietario</CardTitle>
                            <div className="relative mt-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar por nombre o casa (mínimo 3 caracteres)..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                <ScrollArea className="border rounded-md h-48">
                                    {filteredOwners.map(owner => (
                                        <div key={owner.id} onClick={() => handleSelectOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                            <p className="font-medium">{owner.name}</p>
                                            <p className="text-sm text-muted-foreground">{owner.street} - {owner.house}</p>
                                        </div>
                                    ))}
                                </ScrollArea>
                            )}
                             {selectedOwner && (
                                <Card className="bg-muted/50 p-4 mt-4">
                                    <p className="font-semibold text-primary">{selectedOwner.name}</p>
                                    <p className="text-sm text-muted-foreground">{selectedOwner.street} - {selectedOwner.house}</p>
                                </Card>
                            )}
                        </CardContent>
                    </Card>

                    {selectedOwner && (
                    <>
                        <Card>
                            <CardHeader><CardTitle>2. Deudas Pendientes</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-72">
                                    <Table>
                                        <TableHeader><TableRow><TableHead className="w-[50px] text-center">Pagar</TableHead><TableHead>Período</TableHead><TableHead>Monto (USD)</TableHead><TableHead className="text-right">Monto (Bs.)</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {loadingDebts ? <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                                            : ownerDebts.filter(d => d.status === 'pending').length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center"><Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />No tiene deudas pendientes.</TableCell></TableRow>
                                            : ownerDebts.filter(d => d.status === 'pending').map((debt) => (
                                                <TableRow key={debt.id} data-state={selectedPendingDebts.includes(debt.id) ? 'selected' : ''}>
                                                    <TableCell className="text-center"><Checkbox onCheckedChange={() => handlePendingDebtSelection(debt.id)} checked={selectedPendingDebts.includes(debt.id)} /></TableCell>
                                                    <TableCell className="font-medium">{monthsLocale.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
                                                    <TableCell>${debt.amountUSD.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right">Bs. {(debt.amountUSD * activeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle>3. Pagar Meses por Adelantado</CardTitle><CardDescription>Cuota mensual actual: ${condoFee.toFixed(2)}</CardDescription></CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {futureMonths.map(month => (
                                        <Button key={month.value} type="button" variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'}
                                            className="flex items-center justify-center gap-2 capitalize" onClick={() => handleAdvanceMonthSelection(month.value)} disabled={month.disabled}>
                                            {selectedAdvanceMonths.includes(month.value) && <Check className="h-4 w-4" />}
                                            {month.label}
                                        </Button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                    )}
                </div>
                
                <div className="lg:sticky lg:top-20">
                     {paymentCalculator.hasSelection && (
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center"><Calculator className="mr-2 h-5 w-5"/> 4. Resumen de Pago</CardTitle>
                                <CardDescription>Cálculo basado en su selección.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {paymentCalculator.dueMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.dueMonthsCount} mes(es) adeudado(s) seleccionado(s).</p>}
                                {paymentCalculator.advanceMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.advanceMonthsCount} mes(es) por adelanto seleccionado(s) x ${paymentCalculator.condoFee.toFixed(2)} c/u.</p>}
                                <hr className="my-2"/>
                                <div className="flex justify-between items-center text-lg">
                                    <span className="text-muted-foreground">Sub-Total Deuda:</span>
                                    <span className="font-medium">Bs. {paymentCalculator.totalDebtBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between items-center text-md">
                                    <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                    <span className="font-medium text-green-500">Bs. {paymentCalculator.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                                <hr className="my-2"/>
                                <div className="flex justify-between items-center text-2xl font-bold">
                                    <span className="flex items-center"><Equal className="mr-2 h-5 w-5"/> TOTAL A PAGAR:</span>
                                    <span className="text-primary">Bs. {paymentCalculator.totalToPay.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                            </CardContent>
                            <CardFooter className="flex-col items-stretch gap-2 pt-6">
                                <Button onClick={() => setIsPaymentDialogOpen(true)} disabled={!paymentCalculator.hasSelection}>
                                    <Receipt className="mr-2 h-4 w-4" />
                                    Registrar Pago
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                </div>
            </div>

             <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Registrar Pago</DialogTitle>
                        <DialogDescription>
                            Ingrese los detalles de la transacción para completar el registro.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                           <Label htmlFor="paymentMethod">Tipo de Pago</Label>
                           <Select value={paymentDetails.paymentMethod} onValueChange={(v) => setPaymentDetails(d => ({...d, paymentMethod: v as any}))}>
                                <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="movil">Pago Móvil</SelectItem>
                                </SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bank">Banco Emisor</Label>
                            <Select value={paymentDetails.bank} onValueChange={(v) => setPaymentDetails(d => ({...d, bank: v}))}>
                                <SelectTrigger><SelectValue placeholder="Seleccione un banco..." /></SelectTrigger>
                                <SelectContent>{venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {paymentDetails.bank === 'otro' && (
                            <div className="space-y-2">
                                <Label htmlFor="otherBank">Nombre del Otro Banco</Label>
                                <Input id="otherBank" value={paymentDetails.otherBank} onChange={(e) => setPaymentDetails(d => ({...d, otherBank: e.target.value}))} />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="reference">Referencia</Label>
                            <Input id="reference" value={paymentDetails.reference} onChange={(e) => setPaymentDetails(d => ({...d, reference: e.target.value.replace(/\D/g, '')}))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)} disabled={processingPayment}>Cancelar</Button>
                        <Button onClick={handleRegisterPayment} disabled={processingPayment}>
                            {processingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                            Confirmar y Guardar Pago
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


    
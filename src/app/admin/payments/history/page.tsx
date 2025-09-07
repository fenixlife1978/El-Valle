
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Search, XCircle, Info } from 'lucide-react';
import { format, differenceInCalendarMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
};

type HistoricalPayment = {
    id?: string;
    ownerId: string;
    ownerName: string;
    property: { street: string, house: string };
    referenceMonth: number;
    referenceYear: number;
    paymentDate: Timestamp;
    amountUSD: number; // Changed from amount to amountUSD
    observations?: string;
    createdAt?: Timestamp;
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, 'label': 'Diciembre' }
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 15 }, (_, i) => currentYear - i);

export default function HistoricalPaymentsPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [historicalPayments, setHistoricalPayments] = useState<HistoricalPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    // State for the new range-based form
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedProperty, setSelectedProperty] = useState<{ street: string, house: string } | null>(null);
    const [fromMonth, setFromMonth] = useState(new Date().getMonth() + 1);
    const [fromYear, setFromYear] = useState(currentYear);
    const [toMonth, setToMonth] = useState(new Date().getMonth() + 1);
    const [toYear, setToYear] = useState(currentYear);
    const [amountUSD, setAmountUSD] = useState('');
    const [observations, setObservations] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [historySearchTerm, setHistorySearchTerm] = useState('');

    const [paymentToDelete, setPaymentToDelete] = useState<HistoricalPayment | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);

    const { toast } = useToast();

    useEffect(() => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
            setOwners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)));
        });

        const paymentsQuery = query(collection(db, "historical_payments"), orderBy("createdAt", "desc"));
        const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
            setHistoricalPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HistoricalPayment)));
            setLoading(false);
        });

        return () => {
            ownersUnsubscribe();
            paymentsUnsubscribe();
        };
    }, []);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(owner =>
            owner.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, owners]);

    const filteredHistoricalPayments = useMemo(() => {
        if (!historySearchTerm) return historicalPayments;
        const lowerCaseSearch = historySearchTerm.toLowerCase();
        return historicalPayments.filter(payment =>
            payment.ownerName.toLowerCase().includes(lowerCaseSearch) ||
            (payment.property.street && payment.property.street.toLowerCase().includes(lowerCaseSearch)) ||
            (payment.property.house && payment.property.house.toLowerCase().includes(lowerCaseSearch))
        );
    }, [historySearchTerm, historicalPayments]);

    const handleAddPayment = () => {
        setSelectedOwner(null);
        setSelectedProperty(null);
        setSearchTerm('');
        setFromMonth(new Date().getMonth() + 1);
        setFromYear(currentYear);
        setToMonth(new Date().getMonth() + 1);
        setToYear(currentYear);
        setAmountUSD('');
        setObservations('');
        setIsDialogOpen(true);
    };

    const handleDeletePayment = (payment: HistoricalPayment) => {
        setPaymentToDelete(payment);
        setIsDeleteConfirmationOpen(true);
    };

    const confirmDelete = async () => {
        if (!paymentToDelete?.id) return;
        try {
            await deleteDoc(doc(db, "historical_payments", paymentToDelete.id));
            toast({ title: "Pago eliminado", description: "El registro del pago histórico ha sido eliminado." });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el registro.' });
        } finally {
            setIsDeleteConfirmationOpen(false);
            setPaymentToDelete(null);
        }
    };
    
    const handleSavePayment = async () => {
        if (!selectedOwner || !selectedProperty || !amountUSD || parseFloat(amountUSD) <= 0) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Debe seleccionar un propietario, una propiedad y un monto mensual válido en USD.' });
            return;
        }

        const startDate = new Date(fromYear, fromMonth - 1);
        const endDate = new Date(toYear, toMonth - 1);

        if (startDate > endDate) {
            toast({ variant: 'destructive', title: 'Rango Inválido', description: 'La fecha de inicio no puede ser posterior a la fecha final.' });
            return;
        }

        setIsSubmitting(true);

        try {
            const batch = writeBatch(db);
            const monthsToGenerate = differenceInCalendarMonths(endDate, startDate) + 1;
            let paymentsCreated = 0;

            const existingDebtsQuery = query(collection(db, 'debts'), 
                where('ownerId', '==', selectedOwner.id),
                where('property.street', '==', selectedProperty.street),
                where('property.house', '==', selectedProperty.house)
            );
            const existingHistoricalPaymentsQuery = query(collection(db, 'historical_payments'),
                where('ownerId', '==', selectedOwner.id),
                where('property.street', '==', selectedProperty.street),
                where('property.house', '==', selectedProperty.house)
            );

            const [existingDebtsSnapshot, existingHistoricalSnapshot] = await Promise.all([
                getDocs(existingDebtsQuery),
                getDocs(existingHistoricalPaymentsQuery)
            ]);

            const occupiedPeriods = new Set([
                ...existingDebtsSnapshot.docs.map(d => `${d.data().year}-${d.data().month}`),
                ...existingHistoricalSnapshot.docs.map(d => `${d.data().referenceYear}-${d.data().referenceMonth}`)
            ]);

            for (let i = 0; i < monthsToGenerate; i++) {
                const currentDate = addMonths(startDate, i);
                const currentYear = currentDate.getFullYear();
                const currentMonth = currentDate.getMonth() + 1;
                
                if (occupiedPeriods.has(`${currentYear}-${currentMonth}`)) {
                    continue; // Skip if a debt or historical payment already exists
                }

                const paymentRef = doc(collection(db, "historical_payments"));
                batch.set(paymentRef, {
                    ownerId: selectedOwner.id,
                    ownerName: selectedOwner.name,
                    property: selectedProperty,
                    referenceMonth: currentMonth,
                    referenceYear: currentYear,
                    amountUSD: parseFloat(amountUSD),
                    paymentDate: Timestamp.fromDate(new Date(currentYear, currentMonth -1)), // Use the reference date as payment date
                    createdAt: serverTimestamp(),
                    observations,
                });
                paymentsCreated++;
            }
            
            if (paymentsCreated > 0) {
                await batch.commit();
                toast({
                    title: "Pagos Registrados",
                    description: `Se han guardado ${paymentsCreated} pagos históricos.`,
                    className: "bg-green-100 text-green-800"
                });
            } else {
                 toast({
                    title: "Sin Cambios",
                    description: "Todos los meses en el rango seleccionado ya tienen un pago o deuda registrada.",
                    variant: "default"
                });
            }

            setIsDialogOpen(false);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el registro de los pagos.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSelectOwner = (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
        if (owner.properties && owner.properties.length > 0) {
            setSelectedProperty(owner.properties[0]);
        }
    };
    
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Pagos Históricos</h1>
                    <p className="text-muted-foreground">Registre pagos de períodos pasados de forma masiva. Estos no afectarán los ingresos corrientes.</p>
                </div>
                <Button onClick={handleAddPayment}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Registrar Pagos Históricos
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Historial de Pagos Registrados</CardTitle>
                    <div className="relative mt-2">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input
                            placeholder="Buscar por propietario, propiedad..."
                            className="pl-9"
                            value={historySearchTerm}
                            onChange={(e) => setHistorySearchTerm(e.target.value)}
                         />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Propietario</TableHead>
                                <TableHead>Propiedad</TableHead>
                                <TableHead>Período de Referencia</TableHead>
                                <TableHead>Monto (USD)</TableHead>
                                <TableHead>Fecha de Registro</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                            ) : filteredHistoricalPayments.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay pagos históricos que coincidan con la búsqueda.</TableCell></TableRow>
                            ) : (
                                filteredHistoricalPayments.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell>{p.ownerName}</TableCell>
                                        <TableCell>{p.property.street} - {p.property.house}</TableCell>
                                        <TableCell>{months.find(m=>m.value === p.referenceMonth)?.label} {p.referenceYear}</TableCell>
                                        <TableCell>$ {p.amountUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}</TableCell>
                                        <TableCell>{p.createdAt ? format(p.createdAt.toDate(), "dd/MM/yyyy") : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p)}>
                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Registrar Pagos Históricos por Rango</DialogTitle>
                        <DialogDescription>Seleccione un propietario, un rango de fechas y un monto fijo en USD por mes.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto pr-6 -mr-6">
                        <div className="grid gap-6 py-4">
                            {!selectedOwner ? (
                                <div className='space-y-2'>
                                    <Label htmlFor="owner-search">1. Buscar Propietario</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input id="owner-search" placeholder="Buscar por nombre (mín. 3 caracteres)..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                    </div>
                                    {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                        <Card className="border rounded-md">
                                            <ScrollArea className="h-48">{filteredOwners.map(owner => (<div key={owner.id} onClick={() => handleSelectOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p></div>))}</ScrollArea>
                                        </Card>
                                    )}
                                </div>
                            ) : (
                                <Card className="bg-muted/50 p-4 space-y-4">
                                    <div className='flex items-center justify-between'>
                                        <div><p className="font-semibold text-primary">{selectedOwner.name}</p></div>
                                        <Button variant="ghost" size="icon" onClick={() => setSelectedOwner(null)}><XCircle className="h-5 w-5 text-destructive"/></Button>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>2. Propiedad</Label>
                                        <Select onValueChange={(v) => setSelectedProperty(selectedOwner.properties.find(p => `${p.street}-${p.house}` === v) || null)} value={selectedProperty ? `${selectedProperty.street}-${selectedProperty.house}` : ''}>
                                            <SelectTrigger><SelectValue placeholder="Seleccione una propiedad..." /></SelectTrigger>
                                            <SelectContent>{selectedOwner.properties.map(p => (<SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{`${p.street} - ${p.house}`}</SelectItem>))}</SelectContent>
                                        </Select>
                                    </div>
                                </Card>
                            )}
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>3. Desde</Label>
                                     <div className="flex gap-2">
                                        <Select value={String(fromMonth)} onValueChange={(v) => setFromMonth(Number(v))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Select value={String(fromYear)} onValueChange={(v) => setFromYear(Number(v))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                     </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>4. Hasta</Label>
                                     <div className="flex gap-2">
                                        <Select value={String(toMonth)} onValueChange={(v) => setToMonth(Number(v))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Select value={String(toYear)} onValueChange={(v) => setToYear(Number(v))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label htmlFor="amountUSD">5. Monto Pagado por Mes (USD)</Label>
                                <Input id="amountUSD" type="number" value={amountUSD} onChange={(e) => setAmountUSD(e.target.value)} placeholder="Ej: 25.00"/>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="observations">Observaciones (Opcional)</Label>
                                <Input id="observations" value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={250} />
                            </div>

                             <Card className="bg-muted/50">
                                <CardContent className="p-4 text-sm text-muted-foreground">
                                    <Info className="inline h-4 w-4 mr-2"/>
                                    Se creará un registro de pago para cada mes en el rango que no tenga ya una deuda o pago histórico asociado.
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSavePayment} disabled={isSubmitting || !selectedOwner}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            Guardar Pagos
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Está seguro?</DialogTitle>
                        <DialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente el registro del pago histórico.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


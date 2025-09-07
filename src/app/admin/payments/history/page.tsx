
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Search, XCircle, CalendarIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
};

type PaymentType = 'Actual' | 'Pasado' | 'Adelantado';

type HistoricalPayment = {
    id?: string;
    ownerId: string;
    property: { street: string, house: string };
    referenceMonth: number;
    referenceYear: number;
    paymentDate: Date;
    amount: number;
    paymentType: PaymentType;
    paymentMethod?: string;
    referenceNumber?: string;
    observations?: string;
    createdAt?: Timestamp;
};

type FullHistoricalPayment = HistoricalPayment & {
    id: string;
    ownerName: string;
};


const emptyPayment: Omit<HistoricalPayment, 'ownerId' | 'property'> = {
    referenceMonth: new Date().getMonth() + 1,
    referenceYear: new Date().getFullYear(),
    paymentDate: new Date(),
    amount: 0,
    paymentType: 'Actual',
    paymentMethod: 'Transferencia',
    referenceNumber: '',
    observations: '',
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, 'Diciembre': 12 }
];

const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);


export default function HistoricalPaymentsPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [historicalPayments, setHistoricalPayments] = useState<FullHistoricalPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentPayment, setCurrentPayment] = useState<Partial<HistoricalPayment>>(emptyPayment);
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedProperty, setSelectedProperty] = useState<{ street: string, house: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [historySearchTerm, setHistorySearchTerm] = useState('');

    const [paymentToDelete, setPaymentToDelete] = useState<FullHistoricalPayment | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);

    const { toast } = useToast();

    useEffect(() => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
            setOwners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)));
        });

        const paymentsQuery = query(collection(db, "historical_payments"), orderBy("createdAt", "desc"));
        const paymentsUnsubscribe = onSnapshot(paymentsQuery, async (snapshot) => {
            const paymentsData = await Promise.all(snapshot.docs.map(async (doc) => {
                const data = doc.data();
                const ownerDoc = await getDocs(query(collection(db, 'owners'), where('name', '==', data.ownerName)));
                const ownerName = ownerDoc.docs.length > 0 ? ownerDoc.docs[0].data().name : 'Propietario no encontrado';
                return {
                    id: doc.id,
                    ...data,
                    paymentDate: data.paymentDate.toDate(),
                    ownerName: ownerName
                } as FullHistoricalPayment;
            }));
            setHistoricalPayments(paymentsData);
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
            (payment.property.house && payment.property.house.toLowerCase().includes(lowerCaseSearch)) ||
            (payment.referenceNumber && payment.referenceNumber.toLowerCase().includes(lowerCaseSearch))
        );
    }, [historySearchTerm, historicalPayments]);


    const handleAddPayment = () => {
        setCurrentPayment(emptyPayment);
        setSelectedOwner(null);
        setSelectedProperty(null);
        setSearchTerm('');
        setIsDialogOpen(true);
    };

    const handleEditPayment = (payment: FullHistoricalPayment) => {
        const owner = owners.find(o => o.id === payment.ownerId);
        setSelectedOwner(owner || null);
        setSelectedProperty(payment.property)
        setCurrentPayment(payment);
        setIsDialogOpen(true);
    };

    const handleDeletePayment = (payment: FullHistoricalPayment) => {
        setPaymentToDelete(payment);
        setIsDeleteConfirmationOpen(true);
    };

    const confirmDelete = async () => {
        if (!paymentToDelete) return;
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
        if (!selectedOwner || !selectedProperty || !currentPayment.referenceMonth || !currentPayment.referenceYear || !currentPayment.paymentDate || !currentPayment.amount) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, complete todos los campos obligatorios.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const debtsQuery = query(collection(db, 'debts'), 
                where('ownerId', '==', selectedOwner.id),
                where('property.street', '==', selectedProperty.street),
                where('property.house', '==', selectedProperty.house),
                where('year', '==', currentPayment.referenceYear),
                where('month', '==', currentPayment.referenceMonth)
            );
            const existingDebtSnapshot = await getDocs(debtsQuery);
            if (!existingDebtSnapshot.empty && !currentPayment.id) {
                toast({ variant: 'destructive', title: 'Mes ya registrado', description: 'Ya existe una deuda (pagada o pendiente) para este propietario y período.' });
                setIsSubmitting(false);
                return;
            }

            const dataToSave = {
                ownerId: selectedOwner.id,
                ownerName: selectedOwner.name,
                property: selectedProperty,
                ...currentPayment,
                paymentDate: Timestamp.fromDate(currentPayment.paymentDate),
                amount: Number(currentPayment.amount),
                createdAt: currentPayment.id ? currentPayment.createdAt : serverTimestamp(),
            };

            if (currentPayment.id) {
                const paymentRef = doc(db, "historical_payments", currentPayment.id);
                await updateDoc(paymentRef, dataToSave);
                toast({ title: "Pago actualizado", description: "El pago histórico ha sido actualizado." });
            } else {
                await addDoc(collection(db, "historical_payments"), dataToSave);
                toast({ title: "Pago registrado", description: "El nuevo pago histórico ha sido guardado." });
            }
            setIsDialogOpen(false);
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el registro del pago.' });
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
                    <p className="text-muted-foreground">Registre y consulte pagos de períodos pasados, actuales o futuros.</p>
                </div>
                <Button onClick={handleAddPayment}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Registrar Pago Histórico
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Historial de Pagos</CardTitle>
                    <div className="relative mt-2">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input
                            placeholder="Buscar por propietario, propiedad, referencia..."
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
                                <TableHead>Período</TableHead>
                                <TableHead>Fecha de Pago</TableHead>
                                <TableHead>Monto (Bs.)</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                            ) : filteredHistoricalPayments.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center">No hay pagos históricos que coincidan con la búsqueda.</TableCell></TableRow>
                            ) : (
                                filteredHistoricalPayments.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell>{p.ownerName}</TableCell>
                                        <TableCell>{p.property.street} - {p.property.house}</TableCell>
                                        <TableCell>{months.find(m=>m.value === p.referenceMonth)?.label} {p.referenceYear}</TableCell>
                                        <TableCell>{format(p.paymentDate, "dd/MM/yyyy")}</TableCell>
                                        <TableCell>Bs. {p.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                        <TableCell>{p.paymentType}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleEditPayment(p)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDeletePayment(p)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{currentPayment.id ? 'Editar' : 'Registrar'} Pago Histórico</DialogTitle>
                        <DialogDescription>Complete todos los campos para registrar el pago.</DialogDescription>
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
                                        <Label>Propiedad</Label>
                                        <Select onValueChange={(v) => setSelectedProperty(selectedOwner.properties.find(p => `${p.street}-${p.house}` === v) || null)} value={selectedProperty ? `${selectedProperty.street}-${selectedProperty.house}` : ''}>
                                            <SelectTrigger><SelectValue placeholder="Seleccione una propiedad..." /></SelectTrigger>
                                            <SelectContent>{selectedOwner.properties.map(p => (<SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>{`${p.street} - ${p.house}`}</SelectItem>))}</SelectContent>
                                        </Select>
                                    </div>
                                </Card>
                            )}
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Mes de Referencia</Label>
                                    <Select value={String(currentPayment.referenceMonth)} onValueChange={(v) => setCurrentPayment(p => ({...p, referenceMonth: Number(v)}))}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Año de Referencia</Label>
                                    <Select value={String(currentPayment.referenceYear)} onValueChange={(v) => setCurrentPayment(p => ({...p, referenceYear: Number(v)}))}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Fecha de Pago</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start", !currentPayment.paymentDate && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {currentPayment.paymentDate ? format(currentPayment.paymentDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={currentPayment.paymentDate} onSelect={(d) => setCurrentPayment(p=>({...p, paymentDate: d}))} initialFocus locale={es} /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="amount">Monto Pagado (Bs.)</Label>
                                    <Input id="amount" type="number" value={currentPayment.amount} onChange={(e) => setCurrentPayment(p => ({...p, amount: Number(e.target.value)}))} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Tipo de Pago</Label>
                                    <Select value={currentPayment.paymentType} onValueChange={(v) => setCurrentPayment(p => ({...p, paymentType: v as PaymentType}))}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Actual">Actual</SelectItem>
                                            <SelectItem value="Pasado">Pasado</SelectItem>
                                            <SelectItem value="Adelantado">Adelantado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Método de Pago</Label>
                                    <Select value={currentPayment.paymentMethod} onValueChange={(v) => setCurrentPayment(p => ({...p, paymentMethod: v}))}>
                                        <SelectTrigger><SelectValue placeholder="Seleccione..."/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Transferencia">Transferencia</SelectItem>
                                            <SelectItem value="Efectivo">Efectivo</SelectItem>
                                            <SelectItem value="Pago móvil">Pago móvil</SelectItem>
                                            <SelectItem value="Otro">Otro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label htmlFor="referenceNumber">Referencia / Comprobante</Label>
                                <Input id="referenceNumber" value={currentPayment.referenceNumber} onChange={(e) => setCurrentPayment(p => ({...p, referenceNumber: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="observations">Observaciones</Label>
                                <Input id="observations" value={currentPayment.observations} onChange={(e) => setCurrentPayment(p => ({...p, observations: e.target.value}))} maxLength={250} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSavePayment} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            Guardar Pago
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


'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Info, ArrowRight, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Owner = {
    id: string;
    name: string;
    house: string;
    street: string;
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amount: number;
    description: string;
    status: 'pending' | 'paid';
};

type OwnerDebtSummary = {
    owner: Owner;
    debtCount: number;
    totalDebt: number;
    periodFrom?: string;
    periodTo?: string;
};

type View = 'summary' | 'detail';

const emptyDebt: Omit<Debt, 'id' | 'ownerId'> = { 
    year: new Date().getFullYear(), 
    month: new Date().getMonth() + 1, 
    amount: 0, 
    description: '',
    status: 'pending' 
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
];

const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);


export default function DebtManagementPage() {
    const [view, setView] = useState<View>('summary');
    const [owners, setOwners] = useState<Owner[]>([]);
    const [allDebts, setAllDebts] = useState<Debt[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeRate, setActiveRate] = useState<number | null>(null);

    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedOwnerDebts, setSelectedOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentDebt, setCurrentDebt] = useState<Omit<Debt, 'id' | 'ownerId'> & { id?: string }>(emptyDebt);
    
    const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    
    const { toast } = useToast();

    // Fetch All Data (Owners, Debts, Rate)
    useEffect(() => {
        const fetchAllData = async () => {
            setLoading(true);
            try {
                // Fetch Owners
                const ownersQuery = query(collection(db, "owners"));
                const ownersSnapshot = await getDocs(ownersQuery);
                const ownersData: Owner[] = [];
                ownersSnapshot.forEach(doc => {
                    const data = doc.data();
                    ownersData.push({ id: doc.id, name: data.name, house: data.house, street: data.street });
                });
                setOwners(ownersData);

                // Fetch All Pending Debts
                const debtsQuery = query(collection(db, "debts"), where("status", "==", "pending"));
                const debtsSnapshot = await getDocs(debtsQuery);
                const debtsData: Debt[] = [];
                debtsSnapshot.forEach(doc => {
                    debtsData.push({ id: doc.id, ...doc.data() } as Debt);
                });
                setAllDebts(debtsData);

                // Fetch Active Rate
                const settingsRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    const rate = settings.exchangeRates?.find((r: any) => r.active);
                    if (rate) setActiveRate(rate.rate);
                }
            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los datos iniciales.' });
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
    }, [toast]);

    const debtSummary = useMemo<OwnerDebtSummary[]>(() => {
        const summaryMap = new Map<string, OwnerDebtSummary>();
        
        allDebts.forEach(debt => {
            const owner = owners.find(o => o.id === debt.ownerId);
            if (!owner) return;

            let entry = summaryMap.get(owner.id);
            if (!entry) {
                entry = { owner, debtCount: 0, totalDebt: 0 };
            }
            
            entry.debtCount += 1;
            entry.totalDebt += debt.amount;
            
            const debtDate = new Date(debt.year, debt.month - 1);
            const debtPeriod = `${months.find(m => m.value === debt.month)?.label} ${debt.year}`;

            if (!entry.periodFrom || new Date(entry.periodFrom) > debtDate) {
                 entry.periodFrom = debtPeriod;
            }
             if (!entry.periodTo || new Date(entry.periodTo) < debtDate) {
                 entry.periodTo = debtPeriod;
            }

            summaryMap.set(owner.id, entry);
        });

        return Array.from(summaryMap.values()).sort((a,b) => b.totalDebt - a.totalDebt);
    }, [allDebts, owners]);

    // Fetch Debts for selected owner when view changes to 'detail'
    useEffect(() => {
        if (view !== 'detail' || !selectedOwner) {
            setSelectedOwnerDebts([]);
            return;
        }

        setLoadingDebts(true);
        const q = query(collection(db, "debts"), where("ownerId", "==", selectedOwner.id));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const debtsData: Debt[] = [];
            querySnapshot.forEach((doc) => {
                debtsData.push({ id: doc.id, ...doc.data() } as Debt);
            });
            setSelectedOwnerDebts(debtsData.sort((a,b) => b.year - a.year || b.month - a.month));
            setLoadingDebts(false);
        }, (error) => {
            console.error("Error fetching owner debts:", error);
            setLoadingDebts(false);
        });

        return () => unsubscribe();
    }, [view, selectedOwner]);

    const handleManageOwnerDebts = (owner: Owner) => {
        setSelectedOwner(owner);
        setView('detail');
    };

    const handleAddDebt = () => {
        if (!selectedOwner) return;
        setCurrentDebt(emptyDebt);
        setIsDialogOpen(true);
    };

    const handleEditDebt = (debt: Debt) => {
        setCurrentDebt(debt);
        setIsDialogOpen(true);
    };

    const handleDeleteDebt = (debt: Debt) => {
        setDebtToDelete(debt);
        setIsDeleteConfirmationOpen(true);
    }
    
    const confirmDelete = async () => {
        if (!debtToDelete) return;
        try {
            await deleteDoc(doc(db, "debts", debtToDelete.id));
            toast({ title: 'Deuda Eliminada', description: `La deuda ha sido eliminada exitosamente.` });
        } catch (error) {
            console.error("Error deleting debt: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la deuda.' });
        } finally {
            setIsDeleteConfirmationOpen(false);
            setDebtToDelete(null);
        }
    }

    const handleSaveDebt = async () => {
        if (!selectedOwner) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar un propietario.' });
            return;
        }
         if (!currentDebt.description || currentDebt.amount <= 0) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: 'La descripción y un monto mayor a cero son obligatorios.' });
            return;
        }

        try {
            if (currentDebt.id) { // Editing
                const debtRef = doc(db, "debts", currentDebt.id);
                const { id, ...dataToUpdate } = currentDebt;
                await updateDoc(debtRef, dataToUpdate);
                toast({ title: 'Deuda Actualizada', description: 'Los datos de la deuda han sido guardados.' });
            } else { // New
                await addDoc(collection(db, "debts"), { ...currentDebt, ownerId: selectedOwner.id, status: 'pending' });
                toast({ title: 'Deuda Agregada', description: 'La nueva deuda ha sido registrada.' });
            }
        } catch (error) {
             console.error("Error saving debt: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setIsDialogOpen(false);
            setCurrentDebt(emptyDebt);
        }
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setCurrentDebt({ 
            ...currentDebt, 
            [id]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
        });
    };
    
    const handleSelectChange = (field: 'year' | 'month' | 'status') => (value: string) => {
        setCurrentDebt({ ...currentDebt, [field]: (field === 'status' ? value : parseInt(value)) as any });
    };

    if (loading) {
         return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    // Summary View
    if (view === 'summary') {
        return (
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Deudas</h1>
                    <p className="text-muted-foreground">Resumen de propietarios con deudas pendientes.</p>
                </div>
                 <Card>
                    <CardHeader>
                        <CardTitle>Resumen de Morosidad</CardTitle>
                        <CardDescription>Lista de propietarios con deudas y el total acumulado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Propietario</TableHead>
                                    <TableHead>Período Adeudado</TableHead>
                                    <TableHead className="text-center">Meses</TableHead>
                                    <TableHead className="text-right">Total Deuda (Bs.)</TableHead>
                                    <TableHead className="text-right">Total Deuda ($)</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {debtSummary.length === 0 ? (
                                     <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                <Info className="h-8 w-8" />
                                                <span>¡Excelente! No hay propietarios con deudas pendientes.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    debtSummary.map(({ owner, debtCount, totalDebt, periodFrom, periodTo }) => (
                                        <TableRow key={owner.id}>
                                            <TableCell>
                                                <div className="font-medium">{owner.name}</div>
                                                <div className="text-sm text-muted-foreground">{owner.street} - {owner.house}</div>
                                            </TableCell>
                                            <TableCell>
                                                {periodFrom === periodTo ? periodFrom : `${periodFrom} - ${periodTo}`}
                                            </TableCell>
                                            <TableCell className="text-center">{debtCount}</TableCell>
                                            <TableCell className="text-right">Bs. {totalDebt.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">
                                                {activeRate ? `$ ${(totalDebt / activeRate).toFixed(2)}` : 'N/A'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleManageOwnerDebts(owner)}>
                                                    Gestionar <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    // Detail View
    if (view === 'detail' && selectedOwner) {
        return (
            <div className="space-y-8">
                 <Button variant="outline" onClick={() => setView('summary')}>
                    <ArrowRight className="mr-2 h-4 w-4 transform rotate-180" />
                    Volver al Resumen
                </Button>

                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Deudas de: <span className="text-primary">{selectedOwner.name}</span></CardTitle>
                            <CardDescription>Lista de todas las deudas (pendientes y pagadas).</CardDescription>
                        </div>
                        <Button onClick={handleAddDebt}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Agregar Deuda
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Año</TableHead>
                                    <TableHead>Mes</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead>Monto (Bs.)</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingDebts ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : selectedOwnerDebts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                <Info className="h-8 w-8" />
                                                <span>Este propietario no tiene deudas registradas.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    selectedOwnerDebts.map((debt) => (
                                        <TableRow key={debt.id}>
                                            <TableCell>{debt.year}</TableCell>
                                            <TableCell>{months.find(m => m.value === debt.month)?.label}</TableCell>
                                            <TableCell className="font-medium">{debt.description}</TableCell>
                                            <TableCell>Bs. {debt.amount.toFixed(2)}</TableCell>
                                            <TableCell className="capitalize">
                                                <span className={`px-2 py-1 text-xs rounded-full ${debt.status === 'pending' ? 'bg-warning/20 text-warning-foreground' : 'bg-success/20 text-success-foreground'}`}>
                                                    {debt.status === 'pending' ? 'Pendiente' : 'Pagada'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                 <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <span className="sr-only">Abrir menú</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEditDebt(debt)}>
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDeleteDebt(debt)} className="text-destructive">
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Eliminar
                                                        </DropdownMenuItem>
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

                 {/* Add/Edit Debt Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader>
                            <DialogTitle>{currentDebt.id ? 'Editar Deuda' : 'Agregar Nueva Deuda'}</DialogTitle>
                            <DialogDescription>Complete la información de la deuda. Haga clic en guardar cuando termine.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                             <div className="space-y-2">
                                <Label htmlFor="description">Descripción</Label>
                                <Input id="description" value={currentDebt.description} onChange={handleInputChange} placeholder="Ej: Cuota de condominio" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="year">Año</Label>
                                    <Select onValueChange={handleSelectChange('year')} value={String(currentDebt.year)}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="month">Mes</Label>
                                    <Select onValueChange={handleSelectChange('month')} value={String(currentDebt.month)}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="amount">Monto (Bs.)</Label>
                                <Input id="amount" type="number" value={currentDebt.amount} onChange={handleInputChange} placeholder="0.00" />
                            </div>
                              {currentDebt.id && (
                                <div className="space-y-2">
                                    <Label htmlFor="status">Estado</Label>
                                    <Select onValueChange={handleSelectChange('status')} value={String(currentDebt.status)}>
                                        <SelectTrigger id="status"><SelectValue/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="pending">Pendiente</SelectItem>
                                            <SelectItem value="paid">Pagada</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveDebt}>Guardar Cambios</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>¿Está seguro?</DialogTitle>
                            <DialogDescription>
                                Esta acción no se puede deshacer. Esto eliminará permanentemente la deuda de la base de datos.
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
    
    // Fallback while loading or if view is invalid
    return null;
}

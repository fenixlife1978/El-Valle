
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Owner = {
    id: string;
    name: string;
    house: string;
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
    const [owners, setOwners] = useState<Owner[]>([]);
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
    const [debts, setDebts] = useState<Debt[]>([]);
    const [loadingOwners, setLoadingOwners] = useState(true);
    const [loadingDebts, setLoadingDebts] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentDebt, setCurrentDebt] = useState<Omit<Debt, 'id' | 'ownerId'> & { id?: string }>(emptyDebt);
    
    const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    
    const { toast } = useToast();

    // Fetch Owners
    useEffect(() => {
        const q = query(collection(db, "owners"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const ownersData: Owner[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                ownersData.push({ id: doc.id, name: data.name, house: data.house });
            });
            setOwners(ownersData.sort((a, b) => a.name.localeCompare(b.name)));
            setLoadingOwners(false);
        });
        return () => unsubscribe();
    }, []);

    // Fetch Debts for selected owner
    useEffect(() => {
        if (!selectedOwnerId) {
            setDebts([]);
            return;
        }

        setLoadingDebts(true);
        const q = query(collection(db, "debts"), where("ownerId", "==", selectedOwnerId));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const debtsData: Debt[] = [];
            querySnapshot.forEach((doc) => {
                debtsData.push({ id: doc.id, ...doc.data() } as Debt);
            });
            setDebts(debtsData.sort((a,b) => b.year - a.year || b.month - a.month));
            setLoadingDebts(false);
        });

        return () => unsubscribe();
    }, [selectedOwnerId]);


    const handleAddDebt = () => {
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
        if (!selectedOwnerId) {
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
                await addDoc(collection(db, "debts"), { ...currentDebt, ownerId: selectedOwnerId });
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
    
    const handleSelectChange = (field: 'year' | 'month') => (value: string) => {
        setCurrentDebt({ ...currentDebt, [field]: parseInt(value) });
    };

    const selectedOwnerName = owners.find(o => o.id === selectedOwnerId)?.name || '';

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Gestión de Deudas</h1>
                <p className="text-muted-foreground">Cargue, modifique y elimine deudas de los propietarios.</p>
            </div>
            
            <Card className="max-w-xl">
                 <CardHeader>
                    <CardTitle>Seleccionar Propietario</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingOwners ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin"/> Cargando propietarios...
                        </div>
                    ) : (
                        <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccione un propietario para ver sus deudas..." />
                            </SelectTrigger>
                            <SelectContent>
                                {owners.map(owner => (
                                    <SelectItem key={owner.id} value={owner.id}>{owner.name} ({owner.house})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </CardContent>
            </Card>

            {selectedOwnerId && (
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Deudas de: <span className="text-primary">{selectedOwnerName}</span></CardTitle>
                            <CardDescription>Lista de deudas pendientes o pagadas.</CardDescription>
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
                                ) : debts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                <Info className="h-8 w-8" />
                                                <span>Este propietario no tiene deudas registradas.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    debts.map((debt) => (
                                        <TableRow key={debt.id}>
                                            <TableCell>{debt.year}</TableCell>
                                            <TableCell>{months.find(m => m.value === debt.month)?.label}</TableCell>
                                            <TableCell className="font-medium">{debt.description}</TableCell>
                                            <TableCell>Bs. {debt.amount.toFixed(2)}</TableCell>
                                            <TableCell className="capitalize">{debt.status === 'pending' ? 'Pendiente' : 'Pagada'}</TableCell>
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
            )}

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


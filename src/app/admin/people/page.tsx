
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Owner = {
    id: number;
    name: string;
    street: string;
    house: string;
    email?: string;
    balance?: number;
};

const initialOwners: Owner[] = [
    { id: 1, name: 'Ana Rodriguez', street: 'Calle 1', house: 'Casa 3', email: 'ana.r@email.com', balance: 50.00 },
    { id: 2, name: 'Carlos Perez', street: 'Calle 2', house: 'Casa 5', email: 'carlos.p@email.com', balance: 0 },
    { id: 3, name: 'Maria Garcia', street: 'Calle 3', house: 'Casa 1', email: 'maria.g@email.com' },
    { id: 4, name: 'Luis Hernandez', street: 'Calle 1', house: 'Casa 2', email: 'luis.h@email.com', balance: 120.50 },
    { id: 5, name: 'Sofia Martinez', street: 'Calle 8', house: 'Casa 14' },
];

const emptyOwner: Owner = { id: 0, name: '', street: '', house: '', email: '', balance: 0 };

const streets = Array.from({ length: 8 }, (_, i) => `Calle ${i + 1}`);

const getHousesForStreet = (street: string) => {
    const streetNumber = parseInt(street.replace('Calle ', ''));
    const houseCount = streetNumber === 1 ? 4 : 14;
    return Array.from({ length: houseCount }, (_, i) => `Casa ${i + 1}`);
};


export default function PeopleManagementPage() {
    const [owners, setOwners] = useState<Owner[]>(initialOwners);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [currentOwner, setCurrentOwner] = useState<Owner>(emptyOwner);
    const [ownerToDelete, setOwnerToDelete] = useState<Owner | null>(null);

    const houseOptions = useMemo(() => {
        if (!currentOwner.street) return [];
        return getHousesForStreet(currentOwner.street);
    }, [currentOwner.street]);


    const handleAddOwner = () => {
        setCurrentOwner(emptyOwner);
        setIsDialogOpen(true);
    };

    const handleEditOwner = (owner: Owner) => {
        setCurrentOwner(owner);
        setIsDialogOpen(true);
    };

    const handleDeleteOwner = (owner: Owner) => {
        setOwnerToDelete(owner);
        setIsDeleteConfirmationOpen(true);
    }

    const confirmDelete = () => {
        if (ownerToDelete) {
            setOwners(owners.filter(o => o.id !== ownerToDelete.id));
            setIsDeleteConfirmationOpen(false);
            setOwnerToDelete(null);
        }
    }

    const handleSaveOwner = () => {
        if (currentOwner.id === 0) { // New Owner
            const newId = owners.length > 0 ? Math.max(...owners.map(o => o.id)) + 1 : 1;
            setOwners([...owners, { ...currentOwner, id: newId }]);
        } else { // Editing Owner
            setOwners(owners.map(o => o.id === currentOwner.id ? currentOwner : o));
        }
        setIsDialogOpen(false);
        setCurrentOwner(emptyOwner);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setCurrentOwner({ 
            ...currentOwner, 
            [id]: type === 'number' ? (value === '' ? undefined : parseFloat(value)) : value
        });
    };

    const handleSelectChange = (field: 'street' | 'house') => (value: string) => {
         const updatedOwner = { ...currentOwner, [field]: value };
        // If street changes, reset house
        if (field === 'street' && value !== currentOwner.street) {
            updatedOwner.house = '';
        }
        setCurrentOwner(updatedOwner);
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Personas</h1>
                    <p className="text-muted-foreground">Agrega, edita y elimina propietarios y residentes.</p>
                </div>
                <Button onClick={handleAddOwner}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar Propietario
                </Button>
            </div>

            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Calle</TableHead>
                            <TableHead>Casa</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Saldo a Favor (Bs.)</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {owners.map((owner) => (
                            <TableRow key={owner.id}>
                                <TableCell className="font-medium">{owner.name}</TableCell>
                                <TableCell>{owner.street}</TableCell>
                                <TableCell>{owner.house}</TableCell>
                                <TableCell>{owner.email || '-'}</TableCell>
                                <TableCell>{owner.balance?.toFixed(2) ?? '-'}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Abrir menú</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handleEditOwner(owner)}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Editar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDeleteOwner(owner)} className="text-destructive">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Eliminar
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{currentOwner.id === 0 ? 'Agregar Nuevo Propietario' : 'Editar Propietario'}</DialogTitle>
                        <DialogDescription>
                            Completa la información del propietario aquí. Haz clic en guardar cuando termines.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Nombre</Label>
                            <Input id="name" value={currentOwner.name} onChange={handleInputChange} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="street" className="text-right">Calle</Label>
                             <Select onValueChange={handleSelectChange('street')} value={currentOwner.street}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Seleccione una calle" />
                                </SelectTrigger>
                                <SelectContent>
                                    {streets.map((street) => (
                                        <SelectItem key={street} value={street}>{street}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="house" className="text-right">Casa</Label>
                             <Select onValueChange={handleSelectChange('house')} value={currentOwner.house} disabled={!currentOwner.street}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Seleccione una casa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {houseOptions.map((house) => (
                                        <SelectItem key={house} value={house}>{house}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="email" className="text-right">Email</Label>
                            <Input id="email" type="email" value={currentOwner.email || ''} onChange={handleInputChange} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="balance" className="text-right">Saldo a Favor</Label>
                            <Input id="balance" type="number" value={currentOwner.balance || ''} onChange={handleInputChange} className="col-span-3" placeholder="0.00" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveOwner}>Guardar Cambios</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Estás seguro?</DialogTitle>
                        <DialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente al propietario <span className="font-semibold">{ownerToDelete?.name}</span>.
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


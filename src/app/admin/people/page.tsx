
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, MoreHorizontal, Edit, Trash2, FileUp, FileDown, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';


type Role = 'propietario' | 'administrador';

type Owner = {
    id: string; // Firestore IDs are strings
    name: string;
    street: string;
    house: string;
    email?: string;
    balance?: number;
    role: Role;
};

const emptyOwner: Omit<Owner, 'id'> = { name: '', street: '', house: '', email: '', balance: 0, role: 'propietario' };

const streets = Array.from({ length: 8 }, (_, i) => `Calle ${i + 1}`);

const getHousesForStreet = (street: string) => {
    if (!street) return [];
    const streetString = String(street); // Ensure street is a string
    const streetNumber = parseInt(streetString.replace('Calle ', ''));
    if (isNaN(streetNumber)) return [];
    const houseCount = streetNumber === 1 ? 4 : 14;
    return Array.from({ length: houseCount }, (_, i) => `Casa ${i + 1}`);
};


export default function PeopleManagementPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [currentOwner, setCurrentOwner] = useState<Omit<Owner, 'id'> & { id?: string }>(emptyOwner);
    const [ownerToDelete, setOwnerToDelete] = useState<Owner | null>(null);
    const importFileRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

     // --- Firestore Data Fetching ---
    useEffect(() => {
        const q = query(collection(db, "owners"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const ownersData: Owner[] = [];
            querySnapshot.forEach((doc) => {
                ownersData.push({ id: doc.id, ...doc.data() } as Owner);
            });
            setOwners(ownersData.sort((a, b) => a.name.localeCompare(b.name)));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching owners: ", error);
            toast({ variant: 'destructive', title: 'Error de Conexión', description: 'No se pudieron cargar los propietarios. Revisa la configuración de Firebase.' });
            setLoading(false);
        });

        return () => unsubscribe(); // Cleanup subscription on unmount
    }, [toast]);


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

    const confirmDelete = async () => {
        if (ownerToDelete) {
             try {
                await deleteDoc(doc(db, "owners", ownerToDelete.id));
                toast({ title: 'Propietario Eliminado', description: `${ownerToDelete.name} ha sido eliminado.` });
            } catch (error) {
                console.error("Error deleting document: ", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el propietario.' });
            } finally {
                setIsDeleteConfirmationOpen(false);
                setOwnerToDelete(null);
            }
        }
    }

    const handleSaveOwner = async () => {
         if (!currentOwner.name || !currentOwner.street || !currentOwner.house) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: 'Nombre, calle y casa son obligatorios.' });
            return;
        }

        try {
            if (currentOwner.id) { // Editing Owner
                const ownerRef = doc(db, "owners", currentOwner.id);
                const { id, ...dataToUpdate } = currentOwner;
                await updateDoc(ownerRef, dataToUpdate);
                toast({ title: 'Propietario Actualizado', description: 'Los datos han sido guardados en la base de datos.' });
            } else { // New Owner
                const { id, ...dataToAdd } = currentOwner;
                await addDoc(collection(db, "owners"), dataToAdd);
                toast({ title: 'Propietario Agregado', description: 'La nueva persona ha sido guardada en la base de datos.' });
            }
        } catch (error) {
            console.error("Error saving owner: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios en la base de datos.' });
        } finally {
            setIsDialogOpen(false);
            setCurrentOwner(emptyOwner);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setCurrentOwner({ 
            ...currentOwner, 
            [id]: type === 'number' ? (value === '' ? undefined : parseFloat(value)) : value
        });
    };

    const handleSelectChange = (field: 'street' | 'house' | 'role') => (value: string) => {
         const updatedOwner = { ...currentOwner, [field]: value };
        if (field === 'street' && value !== currentOwner.street) {
            updatedOwner.house = '';
        }
        setCurrentOwner(updatedOwner as typeof currentOwner);
    };
    
    const handleExportExcel = () => {
        const worksheet = XLSX.utils.json_to_sheet(owners.map(o => ({
            Nombre: o.name,
            Calle: o.street,
            Casa: o.house,
            Email: o.email || '',
            'Saldo a Favor (Bs.)': o.balance ?? 0,
            Rol: o.role,
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Propietarios");
        XLSX.writeFile(workbook, "propietarios.xlsx");
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.text("Lista de Propietarios", 14, 16);
        (doc as any).autoTable({
            head: [['Nombre', 'Calle', 'Casa', 'Email', 'Saldo a Favor (Bs.)', 'Rol']],
            body: owners.map(o => [
                o.name,
                o.street,
                o.house,
                o.email || '-',
                (o.balance ?? 0).toFixed(2),
                o.role
            ]),
            startY: 20,
        });
        doc.save('propietarios.pdf');
    };

    const handleImportClick = () => {
        importFileRef.current?.click();
    };

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: ["name", "street", "house", "email", "balance", "role"], range: 1 });
                
                const newOwners = json.map((item: any) => ({
                    name: item.name || 'Sin Nombre',
                    street: item.street || 'Sin Calle',
                    house: item.house || 'Sin Casa',
                    email: item.email || '',
                    balance: parseFloat(item.balance) || 0,
                    role: (item.role === 'administrador' || item.role === 'propietario') ? item.role : 'propietario',
                }));
                
                for (const ownerData of newOwners) {
                    await addDoc(collection(db, "owners"), ownerData);
                }

                toast({
                    title: 'Importación Exitosa',
                    description: `${newOwners.length} propietarios han sido agregados a la base de datos.`,
                    className: 'bg-green-100 border-green-400 text-green-800'
                });

            } catch (error) {
                console.error("Error al importar el archivo:", error);
                toast({
                    variant: 'destructive',
                    title: 'Error de Importación',
                    description: 'Hubo un problema al leer o guardar los datos. Asegúrate de que el formato es correcto.',
                });
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = ''; // Reset input
    };


    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Personas</h1>
                    <p className="text-muted-foreground">Agrega, edita y consulta personas en la base de datos.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button onClick={handleImportClick} variant="outline">
                        <FileUp className="mr-2 h-4 w-4" />
                        Importar Excel
                    </Button>
                     <input type="file" ref={importFileRef} onChange={handleFileImport} accept=".xlsx, .xls" className="hidden"/>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <FileDown className="mr-2 h-4 w-4" />
                                Exportar
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={handleExportExcel}>Exportar a Excel</DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPDF}>Exportar a PDF</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={handleAddOwner}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Agregar Persona
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Calle</TableHead>
                                    <TableHead>Casa</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Saldo a Favor (Bs.)</TableHead>
                                    <TableHead>Rol</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : owners.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                            No hay personas registradas.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    owners.map((owner) => (
                                        <TableRow key={owner.id}>
                                            <TableCell className="font-medium">{owner.name}</TableCell>
                                            <TableCell>{owner.street}</TableCell>
                                            <TableCell>{owner.house}</TableCell>
                                            <TableCell>{owner.email || '-'}</TableCell>
                                            <TableCell>Bs. {(owner.balance ?? 0).toFixed(2)}</TableCell>
                                            <TableCell className="capitalize">{owner.role}</TableCell>
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
                                                        <DropdownMenuItem onClick={() => handleDeleteOwner(owner)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
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
                    </div>
                </CardContent>
            </Card>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{currentOwner.id ? 'Editar Persona' : 'Agregar Nueva Persona'}</DialogTitle>
                        <DialogDescription>
                            Completa la información aquí. Haz clic en guardar cuando termines.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Nombre</Label>
                            <Input id="name" value={currentOwner.name} onChange={handleInputChange} className="col-span-3" />
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="role" className="text-right">Rol</Label>
                             <Select onValueChange={handleSelectChange('role')} value={currentOwner.role}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Seleccione un rol" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="propietario">Propietario</SelectItem>
                                    <SelectItem value="administrador">Administrador</SelectItem>
                                </SelectContent>
                            </Select>
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
                            <Input id="balance" type="number" value={currentOwner.balance ?? ''} onChange={handleInputChange} className="col-span-3" placeholder="0.00" />
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
                            Esta acción no se puede deshacer. Esto eliminará permanentemente a <span className="font-semibold">{ownerToDelete?.name}</span> de la base de datos.
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

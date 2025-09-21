
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, MoreHorizontal, Edit, Trash2, FileUp, FileDown, Loader2, MinusCircle, KeyRound, Search, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';


type Role = 'propietario' | 'administrador';

type Property = {
    street: string;
    house: string;
};

type Owner = {
    id: string; 
    name: string;
    properties: Property[];
    email?: string;
    balance: number;
    role: Role;
    mustChangePass?: boolean;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const emptyOwner: Omit<Owner, 'id' | 'balance'> & { id?: string; balance: number | string; } = { 
    name: '', 
    properties: [{ street: '', house: '' }], 
    email: '', 
    balance: 0, 
    role: 'propietario',
    mustChangePass: true
};

const streets = Array.from({ length: 8 }, (_, i) => `Calle ${i + 1}`);

const getHousesForStreet = (street: string) => {
    if (!street) return [];
    const streetString = String(street);
    const streetNumber = parseInt(streetString.replace('Calle ', '') || '0');
    if (isNaN(streetNumber)) return [];
    const houseCount = streetNumber === 1 ? 4 : 14;
    return Array.from({ length: houseCount }, (_, i) => `Casa ${i + 1}`);
};

const ADMIN_USER_ID = 'G2jhcEnp05TcvjYj8SwhzVCHbW83'; 

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PeopleManagementPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [currentOwner, setCurrentOwner] = useState<Omit<Owner, 'id'> & { id?: string; balance: number | string; }>(emptyOwner);
    const [ownerToDelete, setOwnerToDelete] = useState<Owner | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const importFileRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, "owners"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                ownersData.push({ id: doc.id, ...data, balance: data.balance ?? 0 } as Owner);
            });
            
            const getSortKeys = (owner: Owner) => {
                const prop = (owner.properties && owner.properties.length > 0) ? owner.properties[0] : { street: 'N/A', house: 'N/A' };
                const streetNum = parseInt(String(prop.street || '').replace('Calle ', '') || '999');
                const houseNum = parseInt(String(prop.house || '').replace('Casa ', '') || '999');
                return { streetNum, houseNum };
            };

            ownersData.sort((a, b) => {
                const aKeys = getSortKeys(a);
                const bKeys = getSortKeys(b);
                if (aKeys.streetNum !== bKeys.streetNum) {
                    return aKeys.streetNum - bKeys.streetNum;
                }
                return aKeys.houseNum - bKeys.houseNum;
            });

            setOwners(ownersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching owners: ", error);
            toast({ variant: 'destructive', title: 'Error de Conexión', description: 'No se pudieron cargar los propietarios.' });
            setLoading(false);
        });

        const fetchCompanyInfo = async () => {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
            }
        };
        fetchCompanyInfo();

        return () => unsubscribe();
    }, [toast]);
    
    const filteredOwners = useMemo(() => {
        if (!searchTerm) return owners;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return owners.filter(owner => {
            const ownerName = owner.name.toLowerCase();
            const propertiesMatch = owner.properties?.some(p => 
                (p.house && String(p.house).toLowerCase().includes(lowerCaseSearch)) ||
                (p.street && String(p.street).toLowerCase().includes(lowerCaseSearch))
            );
            return ownerName.includes(lowerCaseSearch) || propertiesMatch;
        });
    }, [searchTerm, owners]);

    const handleAddOwner = () => {
        setCurrentOwner(emptyOwner);
        setIsDialogOpen(true);
    };

    const handleEditOwner = (owner: Owner) => {
        const editableOwner = {
            ...owner,
            mustChangePass: owner.mustChangePass ?? false,
            properties: owner.properties && owner.properties.length > 0 
                ? owner.properties 
                : [{ street: '', house: '' }]
        };
        setCurrentOwner(editableOwner);
        setIsDialogOpen(true);
    };

    const handleDeleteOwner = (owner: Owner) => {
        setOwnerToDelete(owner);
        setIsDeleteConfirmationOpen(true);
    }

    const confirmDelete = async () => {
        if (ownerToDelete) {
             try {
                // We don't delete the Firebase Auth user to avoid orphans and allow re-linking
                await deleteDoc(doc(db, "owners", ownerToDelete.id));
                toast({ title: 'Propietario Eliminado', description: `${ownerToDelete.name} ha sido eliminado de la base de datos.` });
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
        if (!currentOwner.name || !currentOwner.email || currentOwner.properties.some(p => !p.street || !p.house)) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: 'Nombre, Email, calle y casa son obligatorios.' });
            return;
        }

        const { id, ...ownerData } = currentOwner;
        const balanceValue = parseFloat(String(ownerData.balance).replace(',', '.') || '0');
        const dataToSave: any = {
            name: ownerData.name,
            email: ownerData.email,
            properties: ownerData.properties,
            role: ownerData.role,
            balance: isNaN(balanceValue) ? 0 : balanceValue,
            mustChangePass: ownerData.role === 'propietario'
        };
        
        try {
            if (id) { // Editing existing owner
                const ownerRef = doc(db, "owners", id);
                await updateDoc(ownerRef, dataToSave);
                toast({ title: 'Propietario Actualizado', description: 'Los datos han sido guardados exitosamente.' });
            } else { // Creating new owner
                const password = ownerData.role === 'administrador' ? 'M110710.m' : '123456';
                
                try {
                    // 1. Create auth user
                    const userCredential = await createUserWithEmailAndPassword(auth, ownerData.email!, password);
                    const newUserId = userCredential.user.uid;
                    
                    // 2. Create firestore document with the auth user's UID
                    await setDoc(doc(db, "owners", newUserId), dataToSave);
                    
                    toast({ title: 'Propietario Agregado', description: 'La nueva persona ha sido guardada.' });

                } catch (error: any) {
                    if (error.code === 'auth/email-already-in-use') {
                        toast({ variant: 'destructive', title: 'Email ya existe', description: 'El correo electrónico ya está registrado en el sistema de autenticación.'});
                    } else {
                        throw error; // Re-throw other auth errors
                    }
                }
            }
        } catch (error: any) {
            console.error("Error saving owner: ", error);
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudieron guardar los cambios.' });
        } finally {
            setIsDialogOpen(false);
            setCurrentOwner(emptyOwner);
        }
    };


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setCurrentOwner({ 
            ...currentOwner, 
            [id]: value
        });
    };

    const handleRoleChange = (value: string) => {
        setCurrentOwner({ ...currentOwner, role: value as Role });
    };

    const handlePropertyChange = (index: number, field: 'street' | 'house', value: string) => {
        const newProperties = [...currentOwner.properties];
        newProperties[index] = { ...newProperties[index], [field]: value };
        if (field === 'street') {
            newProperties[index].house = ''; // Reset house when street changes
        }
        setCurrentOwner({ ...currentOwner, properties: newProperties });
    };

    const addProperty = () => {
        setCurrentOwner({ ...currentOwner, properties: [...currentOwner.properties, { street: '', house: '' }] });
    };

    const removeProperty = (index: number) => {
        const newProperties = currentOwner.properties.filter((_, i) => i !== index);
        setCurrentOwner({ ...currentOwner, properties: newProperties });
    };
    
    const handleExportExcel = () => {
        const dataToExport = owners.flatMap(o => {
            if (o.id === ADMIN_USER_ID) return []; // Exclude admin
            const properties = (o.properties && o.properties.length > 0) ? o.properties : [{ street: 'N/A', house: 'N/A'}];
            return properties.map(p => ({
                Nombre: o.name,
                Calle: p.street,
                Casa: p.house,
                Email: o.email || '',
                'Saldo a Favor (Bs.)': parseFloat(String(o.balance)) || 0,
                Rol: o.role,
            }));
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Propietarios");
        XLSX.writeFile(workbook, "propietarios.xlsx");
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) {
            doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        }
        if (companyInfo) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(companyInfo.name, margin + 30, margin + 8);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
            doc.text(companyInfo.address, margin + 30, margin + 19);
        }
        doc.setFontSize(10);
        doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setLineWidth(0.5);
        doc.line(margin, margin + 32, pageWidth - margin, margin + 32);
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text("Lista de Propietarios", pageWidth / 2, margin + 45, { align: 'center' });

        (doc as any).autoTable({
            head: [['Nombre', 'Propiedades', 'Email', 'Rol', 'Saldo a Favor (Bs.)']],
            body: owners.filter(o => o.id !== ADMIN_USER_ID).map(o => { // Exclude admin
                const properties = (o.properties && o.properties.length > 0) 
                    ? o.properties.map(p => `${p.street} - ${p.house}`).join('\n') 
                    : 'N/A';
                const balanceNum = parseFloat(String(o.balance));
                const balanceDisplay = balanceNum > 0 ? `Bs. ${formatToTwoDecimals(balanceNum)}` : '-';
                return [o.name, properties, o.email || '-', o.role, balanceDisplay];
            }),
            startY: margin + 55,
            headStyles: { fillColor: [30, 80, 180] },
            styles: { cellPadding: 2, fontSize: 8 },
        });

        doc.save('propietarios.pdf');
    };
    
    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                if (!data) throw new Error("File data is empty.");

                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: ["name", "street", "house", "email", "balance", "role"], range: 1 });
                
                const ownersMap: { [key: string]: Partial<Owner> } = {};
                (json as any[]).forEach(item => {
                    if (!item.name) return; // Name is the minimum requirement
                    const key = (item.email || item.name).toLowerCase(); // Use name as key if email is missing
                    if (!ownersMap[key]) {
                        const balanceNum = parseFloat(item.balance);
                        ownersMap[key] = {
                            name: item.name,
                            email: item.email || undefined,
                            balance: isNaN(balanceNum) ? 0 : parseFloat(balanceNum.toFixed(2)),
                            role: (item.role === 'administrador' || item.role === 'propietario') ? item.role : 'propietario',
                            properties: []
                        };
                    }
                    if (item.street && item.house && ownersMap[key].properties) {
                        (ownersMap[key].properties as Property[]).push({ street: String(item.street), house: String(item.house) });
                    }
                });

                const newOwners = Object.values(ownersMap);
                
                let successCount = 0;
                for (const ownerData of newOwners) {
                    if (ownerData.name === 'EDWIN AGUIAR') continue; // Skip admin
                    if (ownerData.properties && ownerData.properties.length > 0) {
                         try {
                            await addDoc(collection(db, "owners"), ownerData);
                            successCount++;
                         } catch (error: any) {
                            console.warn(`Could not import user ${ownerData.email || ownerData.name}: ${error.message}`);
                         }
                    }
                }

                toast({
                    title: 'Importación Completada',
                    description: `${successCount} de ${newOwners.length} registros han sido agregados. Revisa la consola para ver errores.`,
                    className: 'bg-green-100 border-green-400 text-green-800'
                });

            } catch (error) {
                console.error("Error al importar el archivo:", error);
                toast({
                    variant: 'destructive',
                    title: 'Error de Importación',
                    description: 'Hubo un problema al leer o guardar los datos. Asegúrate de que el formato es correcto.',
                });
            } finally {
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };


    const handleImportClick = () => {
        importFileRef.current?.click();
    };

    const handleSyncProfiles = async () => {
        setLoading(true);
        toast({ title: 'Sincronizando perfiles...', description: 'Esta operación puede tardar unos segundos.' });
        try {
            // This is a placeholder for getting auth users, as client SDK cannot list all users.
            // This function will now check for users in Firestore that might not have an Auth account
            // and try to create one. This is the reverse of what might be expected but safer to implement client-side.
            
            const ownersSnapshot = await getDocs(collection(db, "owners"));
            let createdCount = 0;
            
            for (const ownerDoc of ownersSnapshot.docs) {
                const ownerData = ownerDoc.data() as Owner;
                // A simple heuristic: if a user has an email but their doc ID isn't a Firebase UID, they might be unsynced.
                // A more robust check would be to try to fetch the user by email from auth.
                // For this purpose, we assume if an email exists, we can try to create an auth user if needed.
                if (ownerData.email) {
                    // This is complex and risky client-side. A better approach is ensuring creation is atomic.
                    // The `handleSaveOwner` function now handles this correctly.
                    // This sync function will be simplified to a log for now.
                }
            }

            toast({
                title: "Función no implementable de forma segura",
                description: "La sincronización de perfiles desde el cliente es compleja. La creación de perfiles debe hacerse individualmente para garantizar la consistencia.",
                variant: "destructive"
            });

        } catch (error) {
            console.error("Error syncing profiles:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la sincronización.' });
        } finally {
            setLoading(false);
        }
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
                <CardHeader>
                    <CardTitle>Lista de Propietarios</CardTitle>
                    <div className="relative mt-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nombre, calle o casa..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Propiedades</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Rol</TableHead>
                                    <TableHead>Saldo a Favor (Bs.)</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOwners.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            No se encontraron personas que coincidan con la búsqueda.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOwners.map((owner) => (
                                        <TableRow key={owner.id}>
                                            <TableCell className="font-medium">{owner.name}</TableCell>
                                            <TableCell>
                                                {owner.properties && owner.properties.length > 0 
                                                    ? owner.properties.map(p => `${p.street} - ${p.house}`).join(', ') 
                                                    : 'N/A'
                                                }
                                            </TableCell>
                                            <TableCell>{owner.email || '-'}</TableCell>
                                            <TableCell className="capitalize">{owner.role}</TableCell>
                                            <TableCell>
                                                 {owner.balance > 0
                                                    ? `Bs. ${formatToTwoDecimals(owner.balance)}` 
                                                    : '-'}
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
                                                        <DropdownMenuItem onClick={() => handleEditOwner(owner)}>
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            Editar
                                                        </DropdownMenuItem>
                                                        {owner.id !== ADMIN_USER_ID && ( // Prevent admin deletion
                                                            <DropdownMenuItem onClick={() => handleDeleteOwner(owner)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Eliminar
                                                            </DropdownMenuItem>
                                                        )}
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

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{currentOwner.id ? 'Editar Persona' : 'Agregar Nueva Persona'}</DialogTitle>
                        <DialogDescription>
                            Completa la información aquí. Haz clic en guardar cuando termines.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto pr-6 -mr-6">
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre</Label>
                                <Input id="name" value={currentOwner.name} onChange={handleInputChange} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" value={currentOwner.email || ''} onChange={handleInputChange} disabled={!!currentOwner.id}/>
                                {currentOwner.id && <p className="text-xs text-muted-foreground">El email no se puede cambiar para un usuario existente.</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Rol</Label>
                                <Select onValueChange={handleRoleChange} value={currentOwner.role}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccione un rol" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="propietario">Propietario</SelectItem>
                                        <SelectItem value="administrador">Administrador</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-4">
                                <Label>Propiedades</Label>
                                {currentOwner.properties.map((prop, index) => {
                                    const houseOptions = getHousesForStreet(prop.street);
                                    return (
                                    <div key={index} className="grid grid-cols-10 gap-2 items-center p-2 rounded-md border">
                                        <div className="col-span-4 space-y-1">
                                            <Label htmlFor={`street-${index}`} className="text-xs">Calle</Label>
                                            <Select onValueChange={(v) => handlePropertyChange(index, 'street', v)} value={prop.street}>
                                                <SelectTrigger><SelectValue placeholder="Calle..." /></SelectTrigger>
                                                <SelectContent>{streets.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-4 space-y-1">
                                            <Label htmlFor={`house-${index}`} className="text-xs">Casa</Label>
                                            <Select onValueChange={(v) => handlePropertyChange(index, 'house', v)} value={prop.house} disabled={!prop.street}>
                                                <SelectTrigger><SelectValue placeholder="Casa..." /></SelectTrigger>
                                                <SelectContent>{houseOptions.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-2 flex items-end justify-end h-full">
                                        {currentOwner.properties.length > 1 && (
                                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeProperty(index)}>
                                                <MinusCircle className="h-5 w-5"/>
                                            </Button>
                                        )}
                                        </div>
                                    </div>
                                )})}
                                <Button variant="outline" size="sm" onClick={addProperty}>
                                    <PlusCircle className="mr-2 h-4 w-4"/>
                                    Agregar Propiedad
                                </Button>
                            </div>

                           
                            <div className="space-y-2">
                                <Label htmlFor="balance">Saldo a Favor (Bs.)</Label>
                                <Input id="balance" type="number" value={String(currentOwner.balance)} onChange={handleInputChange} placeholder="0.00" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveOwner}>Guardar Cambios</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Estás seguro?</DialogTitle>
                        <DialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente a <span className="font-semibold">{ownerToDelete?.name}</span> de la base de datos de la app.
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

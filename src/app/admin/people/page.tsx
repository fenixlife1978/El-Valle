

'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, MoreHorizontal, Edit, Trash2, FileUp, FileDown, Loader2, MinusCircle, KeyRound, Search, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';


type Role = 'propietario' | 'administrador';

type Property = {
    street: string;
    house: string;
};

type Owner = {
    id: string; 
    uid?: string;
    name: string;
    properties: Property[];
    email?: string;
    balance: number;
    role: Role;
    passwordChanged?: boolean;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const emptyOwner: Omit<Owner, 'id' | 'balance' | 'uid'> & { id?: string; balance: number | string; } = { 
    name: '', 
    properties: [{ street: '', house: '' }], 
    email: '', 
    balance: 0, 
    role: 'propietario',
    passwordChanged: false,
};

const streets = ["N/A", ...Array.from({ length: 8 }, (_, i) => `Calle ${i + 1}`)];

const getHousesForStreet = (street: string) => {
    if (!street) return [];
    if (street === "N/A") return ["N/A"];
    
    const streetString = String(street);
    const streetNumber = parseInt(streetString.replace('Calle ', '') || '0');
    if (isNaN(streetNumber)) return [];
    const houseCount = streetNumber === 1 ? 4 : 14;
    return Array.from({ length: houseCount }, (_, i) => `Casa ${i + 1}`);
};

const ADMIN_USER_ID = 'valle-admin-main-account'; 
const ADMIN_EMAIL = 'vallecondo@gmail.com';

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getSortKeys = (owner: Owner) => {
    const prop = (owner.properties && owner.properties.length > 0) ? owner.properties[0] : { street: 'N/A', house: 'N/A' };
    const streetNum = parseInt(String(prop.street || '').replace('Calle ', '') || '999');
    const houseNum = parseInt(String(prop.house || '').replace('Casa ', '') || '999');
    return { streetNum, houseNum };
};

export default function PeopleManagementPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [currentOwner, setCurrentOwner] = useState<Omit<Owner, 'id' | 'balance' | 'uid'> & { id?: string; balance: number | string; }>(emptyOwner);
    const [ownerToDelete, setOwnerToDelete] = useState<Owner | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const importFileRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        const firestore = db();
        const q = query(collection(firestore, "owners"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (doc.id !== ADMIN_USER_ID) {
                    ownersData.push({ id: doc.id, ...data, balance: data.balance ?? 0 } as Owner);
                }
            });

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
            const settingsRef = doc(firestore, 'config', 'mainSettings');
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
            const ownerNameMatch = owner.name && owner.name.toLowerCase().includes(lowerCaseSearch);
            const propertiesMatch = owner.properties?.some(p => 
                (p.house && String(p.house).toLowerCase().includes(lowerCaseSearch)) ||
                (p.street && String(p.street).toLowerCase().includes(lowerCaseSearch))
            );
            return ownerNameMatch || propertiesMatch;
        });
    }, [searchTerm, owners]);

    const handleAddOwner = () => {
        setCurrentOwner(emptyOwner);
        setIsDialogOpen(true);
    };

    const handleEditOwner = (owner: Owner) => {
        const editableOwner = {
            ...owner,
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
                await deleteDoc(doc(db(), "owners", ownerToDelete.id));
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
        const isEditing = !!currentOwner.id;
    
        // Validation: Stricter for new users, more lenient for edits.
        if (!isEditing && (!currentOwner.name || !currentOwner.email)) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: 'Nombre y Email son obligatorios para crear un nuevo propietario.' });
            return;
        }
    
        const firestore = db();
        const balanceValue = parseFloat(String(currentOwner.balance).replace(',', '.') || '0');
        
        // Base data object, excludes email initially
        const dataToSave: any = {
            name: currentOwner.name,
            properties: currentOwner.properties,
            role: currentOwner.role,
            balance: isNaN(balanceValue) ? 0 : balanceValue,
            passwordChanged: currentOwner.passwordChanged || false,
        };
    
        try {
            if (isEditing) {
                const ownerRef = doc(firestore, "owners", currentOwner.id!);
                // Only update data, email is not included here to avoid changing it.
                await updateDoc(ownerRef, dataToSave);
                toast({ title: 'Propietario Actualizado', description: 'Los datos han sido guardados exitosamente.' });
            } else { 
                // Creating a new user, email is required and added to the data object
                dataToSave.email = currentOwner.email;
    
                const userCredential = await createUserWithEmailAndPassword(auth(), currentOwner.email!, 'Condominio2025.');
                const newUserId = userCredential.user.uid;
    
                const ownerDocRef = doc(firestore, "owners", newUserId);
                await setDoc(ownerDocRef, { ...dataToSave, uid: newUserId });
    
                toast({
                    title: 'Propietario Creado Exitosamente',
                    description: `${dataToSave.name} ha sido creado. La contraseña inicial es 'Condominio2025.'`
                });
            }
    
            setIsDialogOpen(false);
            setCurrentOwner(emptyOwner);
        } catch (error: any) {
            console.error("Error saving owner: ", error);
            let errorMessage = 'No se pudieron guardar los cambios.';
            if (error.code) {
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        errorMessage = 'El correo electrónico ya está en uso por otra cuenta.';
                        break;
                    case 'auth/invalid-email':
                        errorMessage = 'El formato del correo electrónico no es válido.';
                        break;
                    case 'auth/weak-password':
                        errorMessage = 'La contraseña es demasiado débil (esto es un error interno, contacte soporte).';
                        break;
                    default:
                        errorMessage = `Error de autenticación: ${error.message}`;
                }
            }
            toast({ variant: 'destructive', title: 'Error', description: errorMessage });
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
        const dataToExport = owners.filter(o => o.id !== ADMIN_USER_ID).flatMap(o => {
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
            body: owners.filter(o => o.id !== ADMIN_USER_ID).map(o => {
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
            const firestore = db();
            try {
                const data = event.target?.result;
                if (!data) throw new Error("File data is empty.");

                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: ["name", "street", "house", "email", "balance", "role"], range: 1 });
                
                const ownersMap: { [key: string]: Partial<Owner> } = {};
                (json as any[]).forEach(item => {
                    if (!item.name || !item.email) return; 
                    const key = item.email.toLowerCase();
                    if (!ownersMap[key]) {
                        const balanceNum = parseFloat(item.balance);
                        ownersMap[key] = {
                            name: item.name,
                            email: item.email,
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
                const batch = writeBatch(firestore);
                let successCount = 0;
                
                for (const ownerData of newOwners) {
                    if (ownerData.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) continue;
                    if (ownerData.properties && ownerData.properties.length > 0) {
                        const ownerDocRef = doc(collection(firestore, "owners")); // Always generate new ID for imports
                         batch.set(ownerDocRef, { ...ownerData, passwordChanged: false });
                         successCount++;
                    }
                }

                await batch.commit();

                toast({
                    title: 'Importación Completada',
                    description: `${successCount} de ${newOwners.length} registros han sido agregados. La creación de cuentas de autenticación debe realizarse manualmente.`,
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

    const handleResetPassword = async (email: string) => {
        if (!email) {
            toast({ variant: 'destructive', title: 'Error', description: 'El propietario no tiene un correo electrónico registrado.' });
            return;
        }

        try {
            await sendPasswordResetEmail(auth(), email);
            toast({
                title: 'Correo Enviado',
                description: `Se ha enviado un correo para restablecer la contraseña a ${email}.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });
        } catch (error: any) {
            console.error("Password reset error:", error);
            let description = 'No se pudo enviar el correo de restablecimiento.';
            if (error.code === 'auth/user-not-found') {
                description = 'No existe una cuenta de autenticación para este correo. El usuario debe usar "Olvidé mi contraseña" para crearla o puede actualizar su correo aquí.'
            }
            toast({ variant: 'destructive', title: 'Error', description });
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
                                                         <DropdownMenuItem onClick={() => handleResetPassword(owner.email || '')}>
                                                            <KeyRound className="mr-2 h-4 w-4" />
                                                            Restablecer Contraseña
                                                        </DropdownMenuItem>
                                                        {owner.id !== ADMIN_USER_ID && (
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
                           {currentOwner.id ? 'Modifique la información y haga clic en guardar.' : "Complete el perfil. La contraseña inicial para el primer acceso será 'Condominio2025.'"}
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
                                <Input id="email" type="email" value={currentOwner.email || ''} onChange={handleInputChange} disabled={!!currentOwner.id} />
                                {currentOwner.id && <p className="text-xs text-muted-foreground">El correo no puede ser modificado después de la creación. Utilice la página de Sincronización para cambios.</p>}
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
    
    

    


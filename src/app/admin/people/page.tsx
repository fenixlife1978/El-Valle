"use client"; // Habilita el uso de React Hooks para este componente de página

import { 
    useState, 
    useEffect, 
    useRef, 
    useMemo 
} from 'react';
import { 
    collection, 
    onSnapshot, 
    doc, 
    setDoc, 
    deleteDoc, 
    writeBatch, 
    query,
    where 
} from 'firebase/firestore';
import { 
    createUserWithEmailAndPassword, 
    sendPasswordResetEmail, 
    getAuth 
} from 'firebase/auth';
import { db } from '@/lib/firebase'; 

// Importación corregida a la ubicación real
import { useToast } from '@/hooks/use-toast'; 
import { useAuthorization } from '@/hooks/use-authorization';

// Componentes UI de shadcn/ui 
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Iconos
import { PlusCircle, Edit, Trash2, Loader2, KeyRound, Search, FileDown, FileUp, MoreHorizontal, Eye, EyeOff, MinusCircle } from 'lucide-react';

// Dependencias de exportación
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as ExcelJS from 'exceljs';

// --- DEFINICIÓN DE TIPOS Y CONSTANTES ---

// Definición de tipos
type Role = 'propietario' | 'administrador';

interface Property {
    street: string;
    house: string;
}

interface Owner {
    id: string;
    name: string;
    email: string | null;
    role: Role;
    balance: number;
    properties: Property[];
    password?: string; // Solo para crear/actualizar
}

interface CompanyInfo {
    name: string;
    rif: string;
    phone: string;
    address: string;
    logo?: string; // Base64 or URL
}

// Constantes
const ADMIN_USER_ID = 'admin-user-id'; // ID del administrador principal
const ADMIN_EMAIL = 'admin@admin.com'; // Correo del administrador principal

const emptyOwner: Owner = {
    id: '',
    name: '',
    email: null,
    role: 'propietario',
    balance: 0,
    properties: [{ street: '', house: '' }],
    password: '',
};

// Simulación de datos de la empresa y calles/casas (ajusta según tu lógica de negocio)
const companyInfo: CompanyInfo = {
    name: 'Condominio Central',
    rif: 'J-12345678-9',
    phone: '(0212) 555-1234',
    address: 'Calle Principal, Edificio Central',
    // logo: 'data:image/png;base64,...' (aquí iría el logo)
};

const streetHouseMap: Record<string, string[]> = {
    'Calle A': ['A-1', 'A-2', 'A-3'],
    'Calle B': ['B-1', 'B-2', 'B-3', 'B-4'],
    'Calle C': ['C-1', 'C-2'],
};
const streets = Object.keys(streetHouseMap);
const getHousesForStreet = (street: string) => streetHouseMap[street] || [];

const formatToTwoDecimals = (num: number | string): string => {
    const value = parseFloat(String(num));
    return isNaN(value) ? '0.00' : value.toFixed(2);
}

// --- COMPONENTE PRINCIPAL ---

export default function OwnersManagement() {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const auth = getAuth();

    // Estados
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentOwner, setCurrentOwner] = useState<Owner>(emptyOwner);
    const [searchTerm, setSearchTerm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [ownerToDelete, setOwnerToDelete] = useState<Owner | null>(null);

    // Ref para el input de archivo
    const importFileRef = useRef<HTMLInputElement>(null);

    // Lógica de filtrado
    const filteredOwners = useMemo(() => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return owners.filter(owner => {
            // Excluir al administrador principal de la lista
            if (owner.id === ADMIN_USER_ID) return false; 

            // Búsqueda por nombre
            if (owner.name.toLowerCase().includes(lowerCaseSearchTerm)) return true;

            // Búsqueda por email
            if (owner.email && owner.email.toLowerCase().includes(lowerCaseSearchTerm)) return true;

            // Búsqueda por propiedades
            if (owner.properties && owner.properties.some(p => 
                p.street.toLowerCase().includes(lowerCaseSearchTerm) || 
                p.house.toLowerCase().includes(lowerCaseSearchTerm)
            )) return true;

            return false;
        });
    }, [owners, searchTerm]);

    // Hook para cargar datos de Firestore
    useEffect(() => {
        setLoading(true);
        const q = query(collection(db, 'owners'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedOwners = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            } as Owner));
            setOwners(fetchedOwners);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching owners:", error);
            toast({
                variant: 'destructive',
                title: 'Error de Carga',
                description: 'No se pudieron cargar los datos de los propietarios.',
            });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);

    // --- MANEJO DE ESTADOS Y EVENTOS DE UI ---

    const handleAddOwner = () => {
        setCurrentOwner(emptyOwner);
        setIsDialogOpen(true);
    };

    const handleEditOwner = (owner: Owner) => {
        setCurrentOwner({ ...owner, password: '' });
        setIsDialogOpen(true);
    };

    const handleDeleteOwner = (owner: Owner) => {
        setOwnerToDelete(owner);
        setIsDeleteConfirmationOpen(true);
    };

    const confirmDelete = async () => {
        if (!ownerToDelete) return;

        requestAuthorization(async () => {
            try {
                // 1. Eliminar documento de Firestore
                await deleteDoc(doc(db, 'owners', ownerToDelete.id!));
    
                // 2. Intentar eliminar usuario de Authentication (NOTA: Requiere Admin SDK/Cloud Function)
                if (ownerToDelete.email) {
                     console.warn("La eliminación de la cuenta de Firebase Auth para este usuario debe ser manejada por una Cloud Function o Admin SDK.");
                }
    
                toast({
                    title: 'Persona Eliminada',
                    description: `El registro de ${ownerToDelete.name} ha sido eliminado.`,
                    variant: 'default',
                });
            } catch (error: any) {
                console.error("Error deleting owner: ", error);
                // El error de Auth es común si el usuario no tiene una cuenta de autenticación
                const authError = error.code && error.code.startsWith('auth/');
                
                toast({
                    variant: 'destructive',
                    title: 'Error al Eliminar',
                    description: authError 
                        ? `Se eliminó el registro en la base de datos, pero hubo un error al interactuar con Firebase Auth. La eliminación de Auth debe hacerse desde el servidor.`
                        : 'No se pudieron eliminar los datos.',
                });
            } finally {
                setIsDeleteConfirmationOpen(false);
                setOwnerToDelete(null);
            }
        });
    };

    const handleSaveOwner = async () => {
        requestAuthorization(async () => {
            if (!currentOwner.name || !currentOwner.email || currentOwner.properties.length === 0 || !currentOwner.properties[0].street) {
                toast({ variant: 'destructive', title: 'Error', description: 'Nombre, Email, Calle y Casa son obligatorios.' });
                return;
            }
            if (!currentOwner.id && !currentOwner.password) {
                toast({ variant: 'destructive', title: 'Error', description: 'Se requiere una contraseña para crear un nuevo usuario.' });
                return;
            }
    
            const dataToSave = {
                ...currentOwner,
                email: currentOwner.email.toLowerCase(),
                balance: parseFloat(String(currentOwner.balance)) || 0,
                properties: currentOwner.properties.filter(p => p.street && p.house)
            };
            // Eliminar el password de los datos que van a Firestore
            delete (dataToSave as Partial<Owner>).password;
    
            try {
                if (currentOwner.id) {
                    // Modo Edición: Actualizar solo datos en Firestore
                    const ownerRef = doc(db, 'owners', currentOwner.id);
                    await setDoc(ownerRef, dataToSave, { merge: true });
    
                    toast({
                        title: 'Cambios Guardados',
                        description: `La información de ${dataToSave.name} ha sido actualizada.`,
                    });
    
                } else {
                    // Modo Creación: Crear Auth user y luego Firestore doc
                    if (!currentOwner.password) throw new Error("Missing password for new user.");
                    
                    // 1. Crear usuario en Firebase Auth
                    const userCredential = await createUserWithEmailAndPassword(auth, currentOwner.email!, currentOwner.password);
                    const uid = userCredential.user.uid;
    
                    // 2. Crear documento en Firestore usando el UID como ID
                    const ownerRef = doc(db, 'owners', uid);
                    await setDoc(ownerRef, {
                        ...dataToSave,
                        id: uid,
                        passwordChanged: false // Flag para forzar cambio de password inicial
                    });
    
                    toast({
                        title: 'Propietario Creado Exitosamente',
                        description: `${dataToSave.name} ha sido creado con la contraseña proporcionada.`,
                        className: 'bg-green-100 border-green-400 text-green-800'
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
                            errorMessage = 'La contraseña es demasiado débil (mínimo 6 caracteres).';
                            break;
                        default:
                            errorMessage = `Error de autenticación: ${error.message}`;
                    }
                }
                toast({ variant: 'destructive', title: 'Error', description: errorMessage });
            }
        });
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
    
    // --- EXPORTACIÓN DE DATOS (Excel) ---

    const handleExportExcel = async () => {
        const dataToExport = owners.filter(o => o.id !== ADMIN_USER_ID).flatMap(o => {
            // Asegurar que si no hay propiedades, exporte una fila con N/A
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
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Propietarios");
        
        worksheet.columns = [
            { header: 'Nombre', key: 'Nombre', width: 30 },
            { header: 'Calle', key: 'Calle', width: 15 },
            { header: 'Casa', key: 'Casa', width: 15 },
            { header: 'Email', key: 'Email', width: 30 },
            { header: 'Saldo a Favor (Bs.)', key: 'Saldo a Favor (Bs.)', width: 20, style: { numFmt: '#,##0.00' } },
            { header: 'Rol', key: 'Rol', width: 15 },
        ];
        
        worksheet.addRows(dataToExport);

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'propietarios.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    // --- EXPORTACIÓN DE DATOS (PDF) ---

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
            doc.setFont('helvetica', 'bold', 'normal'); 
            doc.text(companyInfo.name, margin + 30, margin + 8);
            doc.setFont('helvetica', 'normal', 'normal');
            doc.setFontSize(9);
            doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
            doc.text(companyInfo.address, margin + 30, margin + 19);
        }
        doc.setFontSize(10);
        doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setLineWidth(0.5);
        doc.line(margin, margin + 32, pageWidth - margin, margin + 32);
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold', 'normal');
        doc.text("Lista de Propietarios", pageWidth / 2, margin + 45, { align: 'center' });

        autoTable(doc, {
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
    
    // --- IMPORTACIÓN DE DATOS (Excel) ---

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const firestore = db;
            try {
                const data = event.target?.result;
                if (!data) throw new Error("File data is empty.");

                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(data as ArrayBuffer);
                const worksheet = workbook.getWorksheet(1); 

                if (!worksheet) {
                    toast({
                        variant: 'destructive',
                        title: 'Error de Archivo',
                        description: 'La primera hoja de cálculo del archivo Excel no fue encontrada.',
                    });
                    if (e.target) e.target.value = '';
                    return; 
                }
                
                const ownersMap: { [key: string]: Partial<Owner> } = {};

                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    if (rowNumber === 1) return; // Saltar cabecera

                    const rowData = {
                        name: row.getCell(1).value as string,
                        street: row.getCell(2).value as string,
                        house: row.getCell(3).value as string,
                        email: row.getCell(4).value as string,
                        balance: row.getCell(5).value as number,
                        role: row.getCell(6).value as Role,
                    };

                    if (!rowData.name || !rowData.email) return; // Saltar filas sin datos esenciales
                    const key = String(rowData.email).toLowerCase();

                    if (!ownersMap[key]) {
                        const balanceNum = parseFloat(String(rowData.balance));
                        ownersMap[key] = {
                            name: rowData.name,
                            email: rowData.email,
                            balance: isNaN(balanceNum) ? 0 : parseFloat(balanceNum.toFixed(2)),
                            role: (rowData.role === 'administrador' || rowData.role === 'propietario') ? rowData.role : 'propietario',
                            properties: []
                        };
                    }
                    if (rowData.street && rowData.house && ownersMap[key].properties) {
                        (ownersMap[key].properties as Property[]).push({ street: String(rowData.street), house: String(rowData.house) });
                    }
                });

                const newOwners = Object.values(ownersMap);
                const batch = writeBatch(firestore);
                let successCount = 0;
                
                for (const ownerData of newOwners) {
                    // Evitar importar al administrador principal
                    if (ownerData.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) continue;
                    
                    // Solo importar si tienen al menos una propiedad válida
                    if (ownerData.properties && ownerData.properties.length > 0) {
                        // Importación masiva: no crea cuentas de Auth, solo registros de Firestore
                        const ownerDocRef = doc(collection(firestore, "owners")); // Genera un ID nuevo
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
        reader.readAsArrayBuffer(file);
    };

    const handleImportClick = () => {
        importFileRef.current?.click();
    };

    // --- GESTIÓN DE AUTENTICACIÓN ---

    const handleResetPassword = async (email: string) => {
        if (!email) {
            toast({ variant: 'destructive', title: 'Error', description: 'El propietario no tiene un correo electrónico registrado.' });
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
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


    // --- RENDERIZADO DEL COMPONENTE ---

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
                           {currentOwner.id ? 'Modifique la información y haga clic en guardar.' : "Complete el perfil para crear la cuenta de usuario."}
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

                            {!currentOwner.id && (
                                <div className="space-y-2">
                                    <Label htmlFor="password">Contraseña</Label>
                                       <div className="relative">
                                            <Input
                                                id="password"
                                                type={showPassword ? "text" : "password"}
                                                value={currentOwner.password || ''}
                                                onChange={handleInputChange}
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                                                onClick={() => setShowPassword((prev) => !prev)}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                                <span className="sr-only">Toggle password visibility</span>
                                            </Button>
                                        </div>
                                    <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
                                </div>
                            )}

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

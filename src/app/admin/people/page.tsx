

"use client";

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
    where,
    addDoc,
    serverTimestamp
} from 'firebase/firestore';
import { 
    createUserWithEmailAndPassword, 
    sendPasswordResetEmail, 
    getAuth 
} from 'firebase/auth';
import { db } from '@/lib/firebase'; 
import { useToast } from '@/hooks/use-toast'; 
import { useAuthorization } from '@/hooks/use-authorization';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Edit, Trash2, Loader2, KeyRound, Search, FileDown, MoreHorizontal, Eye, EyeOff, MinusCircle, Building, User, Save, FileSpreadsheet, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

// --- DEFINICIÓN DE TIPOS Y CONSTANTES ---
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
    logo?: string;
}

const ADMIN_USER_ID = 'valle-admin-main-account';

const emptyOwner: Owner = {
    id: '', name: '', email: null, role: 'propietario', balance: 0,
    properties: [{ street: '', house: '' }], password: '',
};

const streets = Array.from({ length: 8 }, (_, i) => `Calle ${i + 1}`);
const houses = Array.from({ length: 14 }, (_, i) => `Casa ${i + 1}`);
const getHousesForStreet = (street: string) => houses;

const formatToTwoDecimals = (num: number | string): string => {
    const value = parseFloat(String(num));
    return isNaN(value) ? '0.00' : value.toFixed(2);
}

const getSortKeys = (owner: Owner) => {
    if (!owner.properties || owner.properties.length === 0) return { streetNum: 999, houseNum: 999 };
    const prop = owner.properties[0];
    const streetNum = parseInt(String(prop.street || '').replace(/\D/g, '') || '999');
    const houseNum = parseInt(String(prop.house || '').replace(/\D/g, '') || '999');
    return { streetNum, houseNum };
};

// --- COMPONENTE PRINCIPAL ---
export default function OwnersManagement() {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const { user: currentUser, role: currentUserRole, companyInfo } = useAuth();
    const auth = getAuth();

    const [owners, setOwners] = useState<Owner[]>([]);
    const [admins, setAdmins] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<Owner | null>(null);
    const [currentOwner, setCurrentOwner] = useState<Owner>(emptyOwner);
    const [isEditingAdmin, setIsEditingAdmin] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const isMainAdmin = currentUser?.uid === ADMIN_USER_ID;

    const filterUsers = (users: Owner[], term: string) => {
        const lowerCaseSearchTerm = term.toLowerCase();
        return users.filter(user => 
            user.name.toLowerCase().includes(lowerCaseSearchTerm) ||
            (user.email && user.email.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (user.properties && user.properties.some(p => 
                p.street.toLowerCase().includes(lowerCaseSearchTerm) || 
                p.house.toLowerCase().includes(lowerCaseSearchTerm)
            ))
        );
    };

    const filteredOwners = useMemo(() => filterUsers(owners, searchTerm), [owners, searchTerm]);
    const filteredAdmins = useMemo(() => filterUsers(admins, searchTerm), [admins, searchTerm]);

    useEffect(() => {
        setLoading(true);
        const q = query(collection(db, 'owners'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            const propietarios = allUsers.filter(u => u.role === 'propietario')
                .sort((a, b) => {
                    const aKeys = getSortKeys(a);
                    const bKeys = getSortKeys(b);
                    if (aKeys.streetNum !== bKeys.streetNum) return aKeys.streetNum - bKeys.streetNum;
                    return bKeys.houseNum - bKeys.houseNum;
                });
            setOwners(propietarios);
            setAdmins(allUsers.filter(u => u.role === 'administrador'));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching users:", error);
            toast({ variant: 'destructive', title: 'Error de Carga' });
            setLoading(false);
        });
        return () => unsubscribe();
    }, [toast]);

    const handleAddUser = (role: Role) => {
        setCurrentOwner({ ...emptyOwner, role, properties: role === 'administrador' ? [] : [{ street: '', house: '' }] });
        setIsEditingAdmin(role === 'administrador');
        setIsDialogOpen(true);
    };

    const handleEditOwner = (owner: Owner) => {
        setCurrentOwner({ ...owner, password: '' });
        setIsEditingAdmin(owner.role === 'administrador');
        setIsDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete || !currentUser) return;
        requestAuthorization(async () => {
            try {
                await deleteDoc(doc(db, "owners", userToDelete.id));
                toast({ title: 'Usuario Eliminado' });
            } catch (error) {
                console.error("Error deleting owner document: ", error);
                toast({ variant: 'destructive', title: 'Error al Eliminar' });
            } finally {
                setIsDeleteConfirmationOpen(false);
                setUserToDelete(null);
            }
        });
    };

    const handleDeleteOwner = (owner: Owner) => {
        if (owner.id === ADMIN_USER_ID) {
            toast({ variant: 'destructive', title: 'Acción no permitida' });
            return;
        }
        setUserToDelete(owner);
        setIsDeleteConfirmationOpen(true);
    };
    
    const handleSaveOwner = async () => {
        const { id, name, email, role, balance, properties, password } = currentOwner;
        if (!name || !email) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Nombre y correo son obligatorios.' });
            return;
        }

        if (role === 'propietario' && properties.some(p => !p.street || !p.house)) {
            toast({ variant: 'destructive', title: 'Propiedad incompleta', description: 'Debe seleccionar calle y casa para cada propiedad.' });
            return;
        }
        
        requestAuthorization(async () => {
            setLoading(true);
            try {
                if (id) { // --- EDITING ---
                    const userRef = doc(db, "owners", id);
                    await setDoc(userRef, {
                        name, role, balance: Number(balance), properties
                    }, { merge: true });
                    toast({ title: "Usuario actualizado" });
                } else { // --- CREATING ---
                    if (!password || password.length < 6) {
                        toast({ variant: 'destructive', title: 'Contraseña inválida', description: 'La contraseña debe tener al menos 6 caracteres.' });
                        setLoading(false);
                        return;
                    }
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    const user = userCredential.user;
                    
                    const userRef = doc(db, 'owners', user.uid);
                    await setDoc(userRef, {
                        uid: user.uid,
                        name, email, role, balance: Number(balance), properties,
                        passwordChanged: false,
                        createdAt: serverTimestamp()
                    });
                    toast({ title: "Usuario creado exitosamente", description: `${name} ha sido agregado al sistema.` });
                }
                setIsDialogOpen(false);
                setCurrentOwner(emptyOwner);
            } catch (error: any) {
                console.error("Error saving owner:", error);
                let description = 'Ocurrió un error inesperado.';
                if (error.code === 'auth/email-already-in-use') {
                    description = 'Este correo electrónico ya está en uso por otra cuenta.';
                } else if (error.code === 'auth/invalid-email') {
                    description = 'El formato del correo electrónico no es válido.';
                }
                toast({ variant: 'destructive', title: 'Error al Guardar', description });
            } finally {
                setLoading(false);
            }
        });
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setCurrentOwner({ ...currentOwner, [e.target.id]: e.target.value });
    const handleRoleChange = (value: string) => setCurrentOwner({ ...currentOwner, role: value as Role, properties: value === 'administrador' ? [] : [{ street: '', house: '' }] });
    const addProperty = () => setCurrentOwner({ ...currentOwner, properties: [...currentOwner.properties, { street: '', house: '' }] });
    const removeProperty = (index: number) => setCurrentOwner({ ...currentOwner, properties: currentOwner.properties.filter((_, i) => i !== index) });
    const handlePropertyChange = (index: number, field: 'street' | 'house', value: string) => {
        const newProperties = [...currentOwner.properties];
        newProperties[index] = { ...newProperties[index], [field]: value };
        if (field === 'street') newProperties[index].house = '';
        setCurrentOwner({ ...currentOwner, properties: newProperties });
    };

    const handleExportExcel = async () => {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();

        // Owners sheet
        const ownersWorksheet = workbook.addWorksheet('Propietarios');
        ownersWorksheet.columns = [
            { header: 'Nombre', key: 'name', width: 30 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Propiedades', key: 'properties', width: 40 },
            { header: 'Saldo a Favor (Bs.)', key: 'balance', width: 20, style: { numFmt: '#,##0.00' } },
        ];
        filteredOwners.forEach(owner => {
            ownersWorksheet.addRow({
                name: owner.name,
                email: owner.email,
                properties: (owner.properties || []).map(p => `${p.street} - ${p.house}`).join(', '),
                balance: owner.balance
            });
        });

        // Admins sheet
        const adminsWorksheet = workbook.addWorksheet('Administradores');
        adminsWorksheet.columns = [
            { header: 'Nombre', key: 'name', width: 30 },
            { header: 'Email', key: 'email', width: 30 },
        ];
        filteredAdmins.forEach(admin => {
            adminsWorksheet.addRow({
                name: admin.name,
                email: admin.email
            });
        });
        
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `lista_de_personas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(link.href);
    };
    const handleExportPDF = async () => {
        if (!companyInfo) {
            toast({ variant: "destructive", title: "Falta información", description: "No se pueden cargar los datos de la empresa." });
            return;
        }
        
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        
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
        }
        doc.setFontSize(10);
        doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text("Lista de Personas Registradas", pageWidth / 2, margin + 45, { align: 'center' });

        let startY = margin + 55;

        if (filteredOwners.length > 0) {
            autoTable(doc, {
                head: [['Propietarios', 'Propiedades', 'Email']],
                body: filteredOwners.map(o => [
                    o.name, 
                    (o.properties || []).map(p => `${p.street} - ${p.house}`).join(', '),
                    o.email || 'N/A'
                ]),
                startY: startY,
                headStyles: { fillColor: [30, 80, 180] },
                styles: { cellPadding: 2, fontSize: 8 },
            });
            startY = (doc as any).lastAutoTable.finalY + 10;
        }

        if (filteredAdmins.length > 0) {
            autoTable(doc, {
                head: [['Administradores', 'Email']],
                body: filteredAdmins.map(a => [a.name, a.email || 'N/A']),
                startY: startY,
                headStyles: { fillColor: [30, 80, 180] },
                styles: { cellPadding: 2, fontSize: 8 },
            });
        }
        
        doc.save('lista_de_personas.pdf');
    };
    const handleResetPassword = async (email: string) => {
        if (!email) {
            toast({ variant: "destructive", title: "No hay correo" });
            return;
        }
        requestAuthorization(async () => {
            try {
                await sendPasswordResetEmail(auth, email);
                toast({ title: 'Correo enviado', description: `Se ha enviado un enlace de restablecimiento a ${email}.` });
            } catch (error) {
                console.error("Error sending password reset email:", error);
                toast({ variant: "destructive", title: "Error al enviar correo" });
            }
        });
    };

    const UserCard = ({ user }: { user: Owner }) => (
        <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                <div className="flex-grow">
                    <CardTitle className="text-lg">{user.name}</CardTitle>
                    <CardDescription>{user.email || 'Sin correo'}</CardDescription>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {currentUserRole === 'administrador' && <DropdownMenuItem onClick={() => handleEditOwner(user)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => handleResetPassword(user.email || '')}><KeyRound className="mr-2 h-4 w-4" />Restablecer Contraseña</DropdownMenuItem>
                        {currentUserRole === 'administrador' && user.id !== currentUser?.uid && user.id !== ADMIN_USER_ID && <DropdownMenuItem onClick={() => handleDeleteOwner(user)} className="text-destructive focus:text-destructive focus:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>}
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>
            <CardContent className="flex-grow">
                <div className="space-y-2 text-sm">
                    {user.role === 'propietario' ? (
                        <>
                            <div className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /> <span>{(user.properties || []).map(p => `${p.street} - ${p.house}`).join(', ')}</span></div>
                            <div className="flex items-center gap-2"><Badge variant={user.balance > 0 ? "success" : "outline"}>Saldo a favor: Bs. {formatToTwoDecimals(user.balance)}</Badge></div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2"><Badge variant="secondary">ADMINISTRADOR</Badge></div>
                    )}
                </div>
            </CardContent>
        </Card>
    );

    const renderUserGrid = (users: Owner[]) => (
        loading ? 
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({length: 8}).map((_, i) => <Card key={i} className="h-40 animate-pulse bg-muted"></Card>)}
            </div> :
        users.length === 0 ? 
            <div className="text-center py-12 text-muted-foreground">No se encontraron usuarios.</div> :
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {users.map(user => <UserCard key={user.id} user={user} />)}
            </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Personas</h1>
                    <p className="text-muted-foreground">Agrega, edita y consulta personas en la base de datos.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline"><FileDown className="mr-2 h-4 w-4" />Exportar</Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPDF}><FileText className="mr-2 h-4 w-4" />PDF</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={() => handleAddUser('propietario')}><PlusCircle className="mr-2 h-4 w-4" />Propietario</Button>
                    {isMainAdmin && <Button onClick={() => handleAddUser('administrador')} variant="secondary"><PlusCircle className="mr-2 h-4 w-4" />Admin</Button>}
                </div>
            </div>
            
            <Card>
                <CardHeader className="bg-primary text-primary-foreground rounded-t-2xl">
                    <CardTitle>Listas de Usuarios</CardTitle>
                    <div className="flex justify-between items-center gap-4">
                        <CardDescription className="text-primary-foreground/90">Filtre y gestione propietarios y administradores por separado.</CardDescription>
                        <div className="relative mt-2 max-w-sm w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar por nombre, calle o casa..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="owners">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="owners">Propietarios</TabsTrigger>
                            <TabsTrigger value="admins">Administradores</TabsTrigger>
                        </TabsList>
                        <TabsContent value="owners">{renderUserGrid(filteredOwners)}</TabsContent>
                        <TabsContent value="admins">{renderUserGrid(filteredAdmins)}</TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{currentOwner.id ? `Editar ${isEditingAdmin ? 'Administrador' : 'Propietario'}` : `Agregar Nuev${isEditingAdmin ? 'o Administrador' : 'a Persona'}`}</DialogTitle>
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
                            
                            {!isEditingAdmin && (
                                <>
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
                                </>
                            )}
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveOwner} disabled={loading}>
                           {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                           Guardar Cambios
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Está seguro?</DialogTitle>
                        <DialogDescription>
                            Esta acción es irreversible. Se eliminará permanentemente el perfil de '{userToDelete?.name}' de la base de datos de la aplicación. La cuenta de autenticación no se verá afectada.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleConfirmDelete}>Sí, eliminar perfil</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

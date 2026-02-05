
"use client";

import { 
    useState, 
    useEffect, 
    useMemo 
} from 'react';
import { useParams } from 'next/navigation'; // NUEVO: Para detectar el ID de la ruta
import { 
    collection, 
    onSnapshot, 
    doc, 
    setDoc, 
    deleteDoc, 
    serverTimestamp
} from 'firebase/firestore';
import { 
    createUserWithEmailAndPassword, 
    signOut 
} from 'firebase/auth';
import { db, auth, secondaryAuth } from '@/lib/firebase'; 
import { useToast } from '@/hooks/use-toast'; 
import { useAuthorization } from '@/hooks/use-authorization';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Edit, Trash2, Loader2, Search, MoreHorizontal, Building, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Role = 'propietario' | 'administrador';
interface Property { street: string; house: string; }
interface Owner {
    id: string;
    name: string;
    email: string | null;
    role: Role;
    balance: number;
    properties: Property[];
    password?: string;
    condominioId?: string;
}

const emptyOwner: Owner = {
    id: '', name: '', email: null, role: 'propietario', balance: 0,
    properties: [{ street: '', house: '' }], password: '',
};

export default function OwnersManagement() {
    const params = useParams(); // Detectar [condoId]
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const { user: currentUser, activeCondoId } = useAuth();

    /**
     * LÓGICA DE IDENTIFICACIÓN DE EFAS CondoSys
     * Prioridad: URL > Soporte > AuthActivo
     */
    const urlCondoId = params?.condoId as string;
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const isSuperAdmin = currentUser?.email === 'vallecondo@gmail.com';
    const workingCondoId = urlCondoId || (isSuperAdmin ? sId : activeCondoId);
    
    const ownersCollectionName = workingCondoId === 'condo_01' ? 'owners' : 'propietarios';

    const [owners, setOwners] = useState<Owner[]>([]);
    const [admins, setAdmins] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<Owner | null>(null);
    const [currentOwner, setCurrentOwner] = useState<Owner>(emptyOwner);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!workingCondoId) return;

        setLoading(true);
        // Todas las queries apuntan estrictamente al condominio en uso
        const ownersRef = collection(db, 'condominios', workingCondoId, ownersCollectionName);
        
        const unsubscribe = onSnapshot(ownersRef, (snapshot) => {
            const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setOwners(allUsers.filter(u => u.role === 'propietario').sort((a, b) => (a.name || "").localeCompare(b.name || "")));
            setAdmins(allUsers.filter(u => u.role === 'administrador'));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching users:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [workingCondoId, ownersCollectionName]);

    const filteredOwners = useMemo(() => owners.filter(o => {
        const search = searchTerm.toLowerCase();
        const nameMatch = (o.name || "").toLowerCase().includes(search);
        const houseMatch = o.properties?.some(p => 
            (p.house || "").toLowerCase().includes(search) ||
            (p.street || "").toLowerCase().includes(search)
        );
        return nameMatch || houseMatch;
    }), [owners, searchTerm]);

    const filteredAdmins = useMemo(() => admins.filter(a => {
        const search = searchTerm.toLowerCase();
        return (a.name || "").toLowerCase().includes(search) || 
               (a.email || "").toLowerCase().includes(search);
    }), [admins, searchTerm]);

    const handleSaveOwner = async () => {
        if (!workingCondoId) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se detectó un ID de condominio válido.' });
            return;
        }
        
        const { id, name, email, role, balance, properties, password } = currentOwner;

        if (!name.trim()) {
            toast({ variant: 'destructive', title: 'Faltan datos', description: 'El nombre es obligatorio.' });
            return;
        }

        requestAuthorization(async () => {
            setLoading(true);
            try {
                if (id) {
                    // Actualización
                    const userRef = doc(db, "condominios", workingCondoId, ownersCollectionName, id);
                    await setDoc(userRef, {
                        name, role, balance: Number(balance), properties,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                    toast({ title: "Usuario actualizado" });
                } else {
                    // Creación (Usa secondaryAuth para no cerrar la sesión del admin actual)
                    if (!password || password.length < 6) {
                        toast({ variant: 'destructive', title: 'Contraseña débil', description: 'Mínimo 6 caracteres.' });
                        setLoading(false);
                        return;
                    }
                    
                    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email!, password);
                    const newUser = userCredential.user;

                    // Cerrar sesión del secundario inmediatamente
                    await signOut(secondaryAuth);

                    const userRef = doc(db, "condominios", workingCondoId, ownersCollectionName, newUser.uid);
                    await setDoc(userRef, {
                        uid: newUser.uid,
                        name, email, role, 
                        balance: Number(balance), 
                        properties,
                        condominioId: workingCondoId, // Vínculo obligatorio
                        createdAt: serverTimestamp()
                    });
                    
                    toast({ title: "Usuario creado exitosamente" });
                }
                setIsDialogOpen(false);
                setCurrentOwner(emptyOwner);
            } catch (error: any) {
                console.error("Error al guardar:", error);
                toast({ variant: 'destructive', title: 'Error de operación', description: error.message });
            } finally {
                setLoading(false);
            }
        });
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete || !workingCondoId) return;
        try {
            await deleteDoc(doc(db, "condominios", workingCondoId, ownersCollectionName, userToDelete.id));
            toast({ title: 'Perfil eliminado del condominio' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al eliminar' });
        } finally {
            setUserToDelete(null);
        }
    };

    // Componente interno para tarjetas de usuario
    const UserCard = ({ user }: { user: Owner }) => (
        <Card className="flex flex-col bg-card border-border hover:border-primary/50 shadow-sm hover:shadow-lg transition-all duration-300 rounded-[2rem]">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                <div className="flex-grow">
                    <CardTitle className="text-lg text-foreground font-black uppercase italic">{user.name || "Sin nombre"}</CardTitle>
                    <CardDescription className="text-muted-foreground text-xs font-medium truncate">{user.email}</CardDescription>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setCurrentOwner(user); setIsDialogOpen(true); }}>
                            <Edit className="mr-2 h-4 w-4" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUserToDelete(user)} className="text-red-500 font-bold">
                            <Trash2 className="mr-2 h-4 w-4" />Eliminar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>
            <CardContent className="flex-grow space-y-3">
                {user.role === 'propietario' ? (
                    <>
                        <div className="flex items-start gap-2 text-sm text-muted-foreground font-bold">
                            <Building className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span className="uppercase tracking-tight">
                                {user.properties?.length > 0 
                                    ? user.properties.map(p => `${p.street} ${p.house}`).join(' | ') 
                                    : "Sin ubicación"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                             <Badge variant={user.balance > 0 ? "success" : "outline"} className={user.balance > 0 ? "bg-success/10 text-success border-success/20 font-black" : "font-bold"}>
                                Bs. {(user.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </Badge>
                            <span className="text-[9px] uppercase font-black text-muted-foreground/50">Propietario</span>
                        </div>
                    </>
                ) : (
                     <div className="flex justify-start items-center mt-2">
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs font-black uppercase tracking-widest px-3">
                            Administrador
                        </Badge>
                    </div>
                )}
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic leading-none">
                        Gestión de <span className="text-primary">Personas</span>
                    </h2>
                    <p className="text-muted-foreground font-bold text-[10px] uppercase tracking-[0.3em] mt-2">
                        ID ACTIVO: <span className="text-primary">{workingCondoId || "VERIFICANDO..."}</span>
                    </p>
                </div>
                <Button onClick={() => { setCurrentOwner(emptyOwner); setIsDialogOpen(true); }} className="bg-primary hover:bg-primary/90 font-bold uppercase text-xs tracking-widest px-6 h-12 rounded-xl">
                    <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Registro
                </Button>
            </div>

            <div className="space-y-6">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar por nombre, correo, calle o casa..." 
                        className="pl-10 h-12 w-full rounded-full bg-card border-2 border-border focus-visible:ring-primary"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <Tabs defaultValue="owners" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-secondary/30 h-12 rounded-2xl">
                        <TabsTrigger value="owners">Propietarios ({filteredOwners.length})</TabsTrigger>
                        <TabsTrigger value="admins">Administradores ({filteredAdmins.length})</TabsTrigger>
                    </TabsList>
                    
                    <div className="mt-6">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.4em]">Sincronizando Base de Datos</span>
                            </div>
                        ) : (
                            <>
                                <TabsContent value="owners" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredOwners.length > 0 ? (
                                        filteredOwners.map(o => <UserCard key={o.id} user={o} />)
                                    ) : (
                                        <div className="col-span-full py-20 text-center text-muted-foreground font-bold uppercase text-xs">No hay propietarios registrados</div>
                                    )}
                                </TabsContent>
                                <TabsContent value="admins" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredAdmins.length > 0 ? (
                                        filteredAdmins.map(a => <UserCard key={a.id} user={a} />)
                                    ) : (
                                        <div className="col-span-full py-20 text-center text-muted-foreground font-bold uppercase text-xs">No hay administradores registrados</div>
                                    )}
                                </TabsContent>
                            </>
                        )}
                    </div>
                </Tabs>
            </div>

            {/* Diálogos de Gestión */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">
                            {currentOwner.id ? 'Editar' : 'Nuevo'} <span className="text-primary">Perfil</span>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre Completo</Label>
                            <Input 
                                className="font-bold uppercase"
                                value={currentOwner.name}
                                onChange={(e) => setCurrentOwner({...currentOwner, name: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Correo Electrónico</Label>
                            <Input 
                                type="email"
                                disabled={!!currentOwner.id}
                                className="font-bold"
                                value={currentOwner.email || ''}
                                onChange={(e) => setCurrentOwner({...currentOwner, email: e.target.value})}
                            />
                        </div>
                        {!currentOwner.id && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Contraseña Inicial</Label>
                                <Input 
                                    type="password"
                                    placeholder="Mínimo 6 caracteres"
                                    onChange={(e) => setCurrentOwner({...currentOwner, password: e.target.value})}
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Rol de Usuario</Label>
                            <Select 
                                value={currentOwner.role}
                                onValueChange={(v: Role) => setCurrentOwner({...currentOwner, role: v})}
                            >
                                <SelectTrigger className="font-bold uppercase text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="propietario">Propietario</SelectItem>
                                    <SelectItem value="administrador">Administrador</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="font-bold uppercase text-[10px]">Cancelar</Button>
                        <Button onClick={handleSaveOwner} disabled={loading} className="bg-primary hover:bg-primary/90 font-bold uppercase text-[10px]">
                            {loading ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar Registro
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Diálogo de Eliminación */}
            <Dialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
                <DialogContent className="rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-red-600 font-black uppercase tracking-tighter italic">¿Eliminar Registro?</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground font-medium">Esta acción desvinculará a <b>{userToDelete?.name}</b> de <b>{workingCondoId}</b>. No se eliminarán sus pagos históricos, pero perderá acceso.</p>
                    <DialogFooter className="mt-6 gap-2">
                        <Button variant="ghost" onClick={() => setUserToDelete(null)} className="font-bold uppercase text-[10px]">Cancelar</Button>
                        <Button variant="destructive" onClick={handleConfirmDelete} className="font-bold uppercase text-[10px]">Confirmar Eliminación</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

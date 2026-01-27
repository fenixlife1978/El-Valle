"use client";

import { 
    useState, 
    useEffect, 
    useMemo 
} from 'react';
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
// Importamos auth (principal) y secondaryAuth (maestra)
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

// --- TIPOS ---
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
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const { user: currentUser, activeCondoId } = useAuth();

    // Lógica de soporte para el Super Admin vallecondo@gmail.com
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const workingCondoId = (sId && currentUser?.email === 'vallecondo@gmail.com') ? sId : activeCondoId;

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
        const ownersRef = collection(db, 'condominios', workingCondoId, 'owners');
        
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
    }, [workingCondoId]);

    // FILTROS BLINDADOS (Solución al error toLowerCase)
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
            toast({ variant: 'destructive', title: 'Error', description: 'No hay un condominio seleccionado.' });
            return;
        }
        
        const { id, name, email, role, balance, properties, password } = currentOwner;

        if (!name || !email) {
            toast({ variant: 'destructive', title: 'Faltan datos', description: 'Nombre y correo son obligatorios.' });
            return;
        }

        requestAuthorization(async () => {
            setLoading(true);
            try {
                if (id) {
                    // ACTUALIZAR DOCUMENTO EXISTENTE
                    const userRef = doc(db, "condominios", workingCondoId, "owners", id);
                    await setDoc(userRef, {
                        name, role, balance: Number(balance), properties
                    }, { merge: true });
                    toast({ title: "Usuario actualizado" });
                } else {
                    // CREAR NUEVO USUARIO USANDO LA INSTANCIA SECUNDARIA
                    if (!password || password.length < 6) {
                        toast({ variant: 'destructive', title: 'Contraseña débil', description: 'Mínimo 6 caracteres.' });
                        setLoading(false);
                        return;
                    }
                    
                    // Esto evita que el Super Admin sea deslogueado
                    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                    const newUser = userCredential.user;

                    // Cerramos la sesión del nuevo usuario inmediatamente en la instancia secundaria
                    await signOut(secondaryAuth);

                    // Guardamos en Firestore usando la sesión de Super Admin que sigue activa en 'auth'
                    const userRef = doc(db, "condominios", workingCondoId, "owners", newUser.uid);
                    await setDoc(userRef, {
                        uid: newUser.uid,
                        name, email, role, 
                        balance: Number(balance), 
                        properties,
                        condominioId: workingCondoId,
                        createdAt: serverTimestamp()
                    });
                    
                    toast({ title: "Usuario creado exitosamente" });
                }
                setIsDialogOpen(false);
                setCurrentOwner(emptyOwner);
            } catch (error: any) {
                console.error("Error al guardar:", error);
                toast({ variant: 'destructive', title: 'Error de permisos', description: error.message });
            } finally {
                setLoading(false);
            }
        });
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete || !workingCondoId) return;
        try {
            await deleteDoc(doc(db, "condominios", workingCondoId, "owners", userToDelete.id));
            toast({ title: 'Perfil eliminado del condominio' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al eliminar' });
        } finally {
            setUserToDelete(null);
        }
    };

    const UserCard = ({ user }: { user: Owner }) => (
        <Card className="flex flex-col bg-slate-900/40 border-slate-800">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                <div className="flex-grow">
                    <CardTitle className="text-lg text-white">{user.name || "Sin nombre"}</CardTitle>
                    <CardDescription className="text-slate-400">{user.email}</CardDescription>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 text-slate-400"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-white">
                        <DropdownMenuItem onClick={() => { setCurrentOwner(user); setIsDialogOpen(true); }}>
                            <Edit className="mr-2 h-4 w-4" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUserToDelete(user)} className="text-red-400">
                            <Trash2 className="mr-2 h-4 w-4" />Eliminar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>
            <CardContent className="flex-grow">
                {user.role === 'propietario' ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Building className="h-4 w-4 text-[#0081c9]" />
                            {user.properties?.length > 0 
                                ? user.properties.map(p => `${p.street} - ${p.house}`).join(', ') 
                                : "Sin propiedad asignada"}
                        </div>
                        <Badge className={user.balance > 0 ? "bg-green-500/20 text-green-400" : "bg-slate-800 text-slate-400"}>
                            Saldo: Bs. {(user.balance || 0).toFixed(2)}
                        </Badge>
                    </div>
                ) : (
                    <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-none">ADMINISTRADOR</Badge>
                )}
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-8 p-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">
                        Gestión de <span className="text-[#0081c9]">Personas</span>
                    </h2>
                    <p className="text-slate-500 font-bold text-sm uppercase">
                        Condominio ID: <span className="text-amber-500">{workingCondoId || "Cargando..."}</span>
                    </p>
                </div>
                <Button onClick={() => { setCurrentOwner(emptyOwner); setIsDialogOpen(true); }} className="bg-[#0081c9] hover:bg-[#006bb3]">
                    <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Registro
                </Button>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input 
                            placeholder="Buscar por nombre, correo o casa..." 
                            className="pl-10 bg-slate-950 border-slate-800 text-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="owners" className="text-white">
                        <TabsList className="bg-slate-950 border border-slate-800">
                            <TabsTrigger value="owners">Propietarios ({filteredOwners.length})</TabsTrigger>
                            <TabsTrigger value="admins">Administradores ({filteredAdmins.length})</TabsTrigger>
                        </TabsList>
                        {loading ? (
                            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#0081c9]" /></div>
                        ) : (
                            <>
                                <TabsContent value="owners" className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                    {filteredOwners.map(o => <UserCard key={o.id} user={o} />)}
                                </TabsContent>
                                <TabsContent value="admins" className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                    {filteredAdmins.map(a => <UserCard key={a.id} user={a} />)}
                                </TabsContent>
                            </>
                        )}
                    </Tabs>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{currentOwner.id ? 'Editar Perfil' : 'Nuevo Registro'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nombre Completo</Label>
                            <Input 
                                className="bg-slate-950 border-slate-700"
                                value={currentOwner.name}
                                onChange={(e) => setCurrentOwner({...currentOwner, name: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Correo Electrónico</Label>
                            <Input 
                                type="email"
                                disabled={!!currentOwner.id}
                                className="bg-slate-950 border-slate-700"
                                value={currentOwner.email || ''}
                                onChange={(e) => setCurrentOwner({...currentOwner, email: e.target.value})}
                            />
                        </div>
                        {!currentOwner.id && (
                            <div className="space-y-2">
                                <Label>Contraseña Inicial</Label>
                                <Input 
                                    type="password"
                                    placeholder="Mín. 6 caracteres"
                                    className="bg-slate-950 border-slate-700"
                                    onChange={(e) => setCurrentOwner({...currentOwner, password: e.target.value})}
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Rol</Label>
                            <Select 
                                value={currentOwner.role}
                                onValueChange={(v: Role) => setCurrentOwner({...currentOwner, role: v})}
                            >
                                <SelectTrigger className="bg-slate-950 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                    <SelectItem value="propietario">Propietario</SelectItem>
                                    <SelectItem value="administrador">Administrador</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveOwner} disabled={loading} className="bg-[#0081c9]">
                            {loading ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white">
                    <DialogHeader><DialogTitle className="text-red-500">¿Eliminar registro?</DialogTitle></DialogHeader>
                    <p className="text-slate-300">Esta acción eliminará el perfil del usuario del condominio actual.</p>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setUserToDelete(null)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleConfirmDelete}>Confirmar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

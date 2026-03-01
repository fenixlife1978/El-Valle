
"use client";

import { 
    useState, 
    useEffect, 
    useMemo 
} from 'react';
import { useParams } from 'next/navigation';
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
import { PlusCircle, Edit, Trash2, Loader2, Search, MoreHorizontal, Building, Save, Home, Banknote } from 'lucide-react';
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
    const params = useParams();
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const { user: currentUser, activeCondoId, userProfile } = useAuth();

    const urlCondoId = params?.condoId as string;
    const workingCondoId = userProfile?.workingCondoId || userProfile?.condominioId || urlCondoId;
    
    const ownersCollectionName = workingCondoId === 'condo_01' ? 'owners' : 'propietarios';

    const [owners, setOwners] = useState<Owner[]>([]);
    const [admins, setAdmins] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<Owner | null>(null);
    const [currentOwner, setCurrentOwner] = useState<Owner>(emptyOwner);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!workingCondoId || workingCondoId === '[condoId]') return;

        setLoading(true);
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

        if (role === 'propietario' && (!properties[0]?.street || !properties[0]?.house)) {
            toast({ variant: 'destructive', title: 'Ubicación requerida', description: 'Calle y Casa son obligatorios para propietarios.' });
            return;
        }

        requestAuthorization(async () => {
            setLoading(true);
            try {
                if (id) {
                    const userRef = doc(db, "condominios", workingCondoId, ownersCollectionName, id);
                    await setDoc(userRef, {
                        name, role, balance: Number(balance), 
                        properties: role === 'propietario' ? properties : [],
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                    toast({ title: "Usuario actualizado" });
                } else {
                    if (!password || password.length < 6) {
                        toast({ variant: 'destructive', title: 'Contraseña débil', description: 'Mínimo 6 caracteres.' });
                        setLoading(false);
                        return;
                    }
                    
                    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email!, password);
                    const newUser = userCredential.user;
                    await signOut(secondaryAuth);

                    const userRef = doc(db, "condominios", workingCondoId, ownersCollectionName, newUser.uid);
                    await setDoc(userRef, {
                        uid: newUser.uid,
                        name, email, role, 
                        balance: Number(balance), 
                        properties: role === 'propietario' ? properties : [],
                        condominioId: workingCondoId,
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

    const UserCard = ({ user }: { user: Owner }) => (
        <Card className="flex flex-col bg-slate-900 border-white/5 hover:border-primary/50 shadow-sm hover:shadow-lg transition-all duration-300 rounded-[2rem]">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                <div className="flex-grow">
                    <CardTitle className="text-lg text-white font-black uppercase italic">{user.name || "Sin nombre"}</CardTitle>
                    <CardDescription className="text-white/40 text-xs font-medium truncate italic">{user.email}</CardDescription>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 text-white/20 hover:text-white"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-slate-950 border-white/10">
                        <DropdownMenuItem onClick={() => { setCurrentOwner(user); setIsDialogOpen(true); }} className="text-white/80 font-black uppercase text-[10px] gap-2">
                            <Edit className="h-3 w-3 text-sky-500" /> Editar Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUserToDelete(user)} className="text-red-500 font-black uppercase text-[10px] gap-2">
                            <Trash2 className="h-3 w-3" /> Eliminar Registro
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>
            <CardContent className="flex-grow space-y-3">
                {user.role === 'propietario' ? (
                    <>
                        <div className="flex items-start gap-2 text-sm text-white/60 font-bold">
                            <Building className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span className="uppercase tracking-tight italic">
                                {user.properties?.length > 0 
                                    ? user.properties.map(p => `${p.street} ${p.house}`).join(' | ') 
                                    : "Sin ubicación"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                             <Badge variant="outline" className={user.balance > 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-black italic" : "font-black text-white/20 italic"}>
                                Bs. {(user.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </Badge>
                            <span className="text-[9px] uppercase font-black text-white/20 italic tracking-widest">Residente</span>
                        </div>
                    </>
                ) : (
                     <div className="flex justify-start items-center mt-2">
                        <Badge variant="secondary" className="bg-sky-500/10 text-sky-400 border-sky-500/20 text-[9px] font-black uppercase tracking-[0.2em] px-3 italic">
                            ADMINISTRADOR MASTER
                        </Badge>
                    </div>
                )}
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-montserrat bg-[#1A1D23] min-h-screen p-4 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic leading-none">
                        Gestión de <span className="text-primary">Personas</span>
                    </h2>
                    <p className="text-white/40 font-bold text-[10px] uppercase tracking-[0.3em] mt-3">
                        COMUNIDAD ACTIVA EN: <span className="text-primary">{workingCondoId || "VERIFICANDO..."}</span>
                    </p>
                </div>
                <Button onClick={() => { setCurrentOwner(emptyOwner); setIsDialogOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[10px] px-8 h-12 rounded-xl shadow-lg shadow-primary/20 italic">
                    <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Registro
                </Button>
            </div>

            <div className="space-y-6">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input 
                        placeholder="Buscar por nombre, ubicación o correo..." 
                        className="pl-12 h-14 w-full rounded-2xl bg-slate-900 border-white/5 text-white font-black uppercase italic text-xs focus-visible:ring-primary"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <Tabs defaultValue="owners" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-slate-900/50 h-14 rounded-[2rem] p-1 border border-white/5">
                        <TabsTrigger value="owners" className="rounded-2xl font-black uppercase text-[10px] italic">Propietarios ({filteredOwners.length})</TabsTrigger>
                        <TabsTrigger value="admins" className="rounded-2xl font-black uppercase text-[10px] italic">Administradores ({filteredAdmins.length})</TabsTrigger>
                    </TabsList>
                    
                    <div className="mt-8">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                                <span className="text-[10px] font-black uppercase text-white/20 tracking-[0.4em] italic">Sincronizando Archivos...</span>
                            </div>
                        ) : (
                            <>
                                <TabsContent value="owners" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredOwners.length > 0 ? (
                                        filteredOwners.map(o => <UserCard key={o.id} user={o} />)
                                    ) : (
                                        <div className="col-span-full py-20 text-center text-white/20 font-black uppercase italic text-xs tracking-widest border-2 border-dashed border-white/5 rounded-[3rem]">No se registran propietarios</div>
                                    )}
                                </TabsContent>
                                <TabsContent value="admins" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredAdmins.length > 0 ? (
                                        filteredAdmins.map(a => <UserCard key={a.id} user={a} />)
                                    ) : (
                                        <div className="col-span-full py-20 text-center text-white/20 font-black uppercase italic text-xs tracking-widest border-2 border-dashed border-white/5 rounded-[3rem]">No se registran administradores</div>
                                    )}
                                </TabsContent>
                            </>
                        )}
                    </div>
                </Tabs>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-slate-900 text-white italic">
                    <DialogHeader className="bg-white/5 p-8 -m-6 mb-4">
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">
                            {currentOwner.id ? 'Editar' : 'Nuevo'} <span className="text-primary">Perfil</span>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Rol de Usuario</Label>
                            <Select 
                                value={currentOwner.role}
                                onValueChange={(v: Role) => setCurrentOwner({...currentOwner, role: v})}
                            >
                                <SelectTrigger className="font-black uppercase text-[10px] h-12 rounded-xl bg-white/5 border-none">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-950 border-white/10 text-white">
                                    <SelectItem value="propietario" className="font-black italic">PROPIETARIO</SelectItem>
                                    <SelectItem value="administrador" className="font-black italic">ADMINISTRADOR</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Nombre Completo</Label>
                            <Input 
                                className="font-black uppercase h-12 rounded-xl bg-white/5 border-none text-white italic"
                                placeholder="NOMBRE Y APELLIDO"
                                value={currentOwner.name}
                                onChange={(e) => setCurrentOwner({...currentOwner, name: e.target.value})}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-primary ml-2 tracking-widest flex items-center gap-2">
                                <Banknote className="h-3 w-3" /> Saldo a Favor (Bs.)
                            </Label>
                            <Input 
                                type="number"
                                step="0.01"
                                className="font-black h-12 rounded-xl bg-white/5 border-none text-emerald-500 text-xl italic"
                                placeholder="0.00"
                                value={currentOwner.balance}
                                onChange={(e) => setCurrentOwner({...currentOwner, balance: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        {currentOwner.role === 'propietario' && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Calle / Sector</Label>
                                    <div className="relative">
                                        <Input 
                                            className="font-black uppercase h-12 rounded-xl bg-white/5 border-none pl-10 text-white italic"
                                            placeholder="CALLE 1"
                                            value={currentOwner.properties?.[0]?.street || ''}
                                            onChange={(e) => {
                                                const props = [...(currentOwner.properties || [])];
                                                if (props.length === 0) props.push({ street: '', house: '' });
                                                props[0].street = e.target.value;
                                                setCurrentOwner({...currentOwner, properties: props});
                                            }}
                                        />
                                        <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Casa / Unidad</Label>
                                    <div className="relative">
                                        <Input 
                                            className="font-black uppercase h-12 rounded-xl bg-white/5 border-none pl-10 text-white italic"
                                            placeholder="CASA 10"
                                            value={currentOwner.properties?.[0]?.house || ''}
                                            onChange={(e) => {
                                                const props = [...(currentOwner.properties || [])];
                                                if (props.length === 0) props.push({ street: '', house: '' });
                                                props[0].house = e.target.value;
                                                setCurrentOwner({...currentOwner, properties: props});
                                            }}
                                        />
                                        <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Correo Electrónico</Label>
                            <Input 
                                type="email"
                                disabled={!!currentOwner.id}
                                className="font-bold h-12 rounded-xl bg-white/5 border-none text-white italic"
                                placeholder="correo@ejemplo.com"
                                value={currentOwner.email || ''}
                                onChange={(e) => setCurrentOwner({...currentOwner, email: e.target.value})}
                            />
                        </div>

                        {!currentOwner.id && (
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Contraseña Inicial</Label>
                                <Input 
                                    type="password"
                                    placeholder="••••••"
                                    className="h-12 rounded-xl bg-white/5 border-none text-white"
                                    onChange={(e) => setCurrentOwner({...currentOwner, password: e.target.value})}
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 mt-4">
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="font-black uppercase text-[10px] rounded-xl h-12 text-white/40">Cancelar</Button>
                        <Button onClick={handleSaveOwner} disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[10px] tracking-[0.2em] flex-1 h-14 rounded-2xl shadow-xl italic">
                            {loading ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {currentOwner.id ? 'Guardar Cambios' : 'Crear Perfil'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
                <DialogContent className="rounded-[2rem] border-none bg-slate-900 text-white italic">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 font-black uppercase italic text-xl tracking-tighter">¿Confirmar Eliminación?</DialogTitle>
                    </DialogHeader>
                    <p className="text-white/40 font-bold text-sm leading-relaxed mt-4">Esta acción desvinculará permanentemente a <b>{userToDelete?.name}</b> del sistema. Se perderá su historial de acceso, pero sus movimientos contables permanecerán auditables.</p>
                    <DialogFooter className="mt-8 gap-2">
                        <Button variant="ghost" onClick={() => setUserToDelete(null)} className="font-black uppercase text-[10px] h-12 rounded-xl">Cancelar</Button>
                        <Button variant="destructive" onClick={handleConfirmDelete} className="font-black uppercase text-[10px] h-12 rounded-xl italic">Eliminar Ahora</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

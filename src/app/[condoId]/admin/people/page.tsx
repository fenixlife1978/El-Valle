
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
    serverTimestamp,
    query,
    where,
    getDocs,
    runTransaction,
    Timestamp
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/tabs';
import { PlusCircle, Edit, Trash2, Loader2, Search, MoreHorizontal, Building, Save, Home, Banknote, Plus, X, ArrowLeftRight, History, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    cedula?: string;
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
    const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<Owner | null>(null);
    const [currentOwner, setCurrentOwner] = useState<Owner>(emptyOwner);
    const [searchTerm, setSearchTerm] = useState('');

    // Estados para Traspaso
    const [transferSource, setTransferSource] = useState<Owner | null>(null);
    const [transferProperty, setTransferProperty] = useState<string>('');
    const [transferTarget, setTransferTarget] = useState<Owner | null>(null);
    const [isProcessingTransfer, setIsProcessingTransfer] = useState(false);

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
        if (!workingCondoId) return;
        const { id, name, email, role, balance, properties, password } = currentOwner;

        if (!name.trim()) {
            toast({ variant: 'destructive', title: 'Faltan datos', description: 'El nombre es obligatorio.' });
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
                    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email!, password!);
                    const newUser = userCredential.user;
                    await signOut(secondaryAuth);

                    const userRef = doc(db, "condominios", workingCondoId, ownersCollectionName, newUser.uid);
                    await setDoc(userRef, {
                        uid: newUser.uid, name, email, role, 
                        balance: Number(balance), properties: role === 'propietario' ? properties : [],
                        condominioId: workingCondoId, createdAt: serverTimestamp()
                    });
                    toast({ title: "Usuario creado" });
                }
                setIsDialogOpen(false);
                setCurrentOwner(emptyOwner);
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error', description: error.message });
            } finally {
                setLoading(false);
            }
        });
    };

    const handleExecuteTransfer = async () => {
        if (!workingCondoId || !transferSource || !transferTarget || !transferProperty) return;
        
        requestAuthorization(async () => {
            setIsProcessingTransfer(true);
            try {
                const [street, house] = transferProperty.split('|');

                await runTransaction(db, async (transaction) => {
                    // 1. Obtener referencias
                    const sourceRef = doc(db, 'condominios', workingCondoId, ownersCollectionName, transferSource.id);
                    const targetRef = doc(db, 'condominios', workingCondoId, ownersCollectionName, transferTarget.id);
                    
                    const sSnap = await transaction.get(sourceRef);
                    const tSnap = await transaction.get(targetRef);

                    if (!sSnap.exists() || !tSnap.exists()) throw new Error("Uno de los perfiles ya no existe.");

                    // 2. Modificar arreglos de propiedades
                    const sProps = (sSnap.data().properties || []).filter((p: any) => !(p.street === street && p.house === house));
                    const tProps = [...(tSnap.data().properties || []), { street, house }];

                    transaction.update(sourceRef, { properties: sProps });
                    transaction.update(targetRef, { properties: tProps });

                    // 3. Migrar Deudas (Historial)
                    const debtsRef = collection(db, 'condominios', workingCondoId, 'debts');
                    const qDebts = query(debtsRef, where('ownerId', '==', transferSource.id));
                    const debtsSnap = await getDocs(qDebts);
                    
                    debtsSnap.docs.forEach(d => {
                        const data = d.data();
                        if (data.property?.street === street && data.property?.house === house) {
                            transaction.update(d.ref, { ownerId: transferTarget.id });
                        }
                    });
                });

                toast({ title: "Traspaso Exitoso", description: `La propiedad y su historial han sido transferidos a ${transferTarget.name}.` });
                setIsTransferDialogOpen(false);
                setTransferSource(null);
                setTransferTarget(null);
                setTransferProperty('');
            } catch (e: any) {
                toast({ variant: 'destructive', title: "Fallo en Traspaso", description: e.message });
            } finally {
                setIsProcessingTransfer(false);
            }
        });
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete || !workingCondoId) return;
        try {
            await deleteDoc(doc(db, "condominios", workingCondoId, ownersCollectionName, userToDelete.id));
            toast({ title: 'Perfil eliminado' });
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
                        <DropdownMenuItem onClick={() => { setCurrentOwner(user); setIsDialogOpen(true); }} className="text-white/80 font-black uppercase text-[10px] gap-2 italic">
                            <Edit className="h-3 w-3 text-sky-500" /> Editar Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setTransferSource(user); setIsTransferDialogOpen(true); }} className="text-primary font-black uppercase text-[10px] gap-2 italic">
                            <ArrowLeftRight className="h-3 w-3" /> Traspasar Propiedad
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUserToDelete(user)} className="text-red-500 font-black uppercase text-[10px] gap-2 italic">
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
                            <span className="uppercase tracking-tight italic leading-tight">
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
        <div className="space-y-8 animate-in fade-in duration-500 font-montserrat bg-[#1A1D23] min-h-screen p-4 md:p-8 italic">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic leading-none">
                        Gestión de <span className="text-primary">Personas</span>
                    </h2>
                    <p className="text-white/40 font-bold text-[10px] uppercase tracking-[0.3em] mt-3">Sincronización Atómica de Comunidad</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setIsTransferDialogOpen(true)} variant="outline" className="border-primary text-primary font-black uppercase text-[10px] px-6 h-12 rounded-xl italic">
                        <ArrowLeftRight className="mr-2 h-4 w-4" /> Traspasar Propiedad
                    </Button>
                    <Button onClick={() => { setCurrentOwner(emptyOwner); setIsDialogOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[10px] px-8 h-12 rounded-xl shadow-lg shadow-primary/20 italic">
                        <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Registro
                    </Button>
                </div>
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

            {/* DIÁLOGO DE REGISTRO / EDICIÓN */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-slate-900 text-white italic">
                    <DialogHeader className="bg-white/5 p-8 -m-6 mb-4">
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">
                            {currentOwner.id ? 'Editar' : 'Nuevo'} <span className="text-primary">Perfil</span>
                        </DialogTitle>
                    </DialogHeader>
                    
                    <ScrollArea className="max-h-[60vh] pr-4">
                        <div className="space-y-5 py-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Rol de Usuario</Label>
                                <Select value={currentOwner.role} onValueChange={(v: Role) => setCurrentOwner({...currentOwner, role: v})}>
                                    <SelectTrigger className="font-black uppercase text-[10px] h-12 rounded-xl bg-white/5 border-none"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-950 border-white/10 text-white"><SelectItem value="propietario" className="font-black italic">PROPIETARIO</SelectItem><SelectItem value="administrador" className="font-black italic">ADMINISTRADOR</SelectItem></SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Nombre Completo</Label>
                                <Input className="font-black uppercase h-12 rounded-xl bg-white/5 border-none text-white italic" placeholder="NOMBRE Y APELLIDO" value={currentOwner.name} onChange={(e) => setCurrentOwner({...currentOwner, name: e.target.value})} />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-primary ml-2 tracking-widest flex items-center gap-2"><Banknote className="h-3 w-3" /> Saldo a Favor (Bs.)</Label>
                                <Input type="number" step="0.01" className="font-black h-12 rounded-xl bg-white/5 border-none text-emerald-500 text-xl italic" placeholder="0.00" value={currentOwner.balance} onChange={(e) => setCurrentOwner({...currentOwner, balance: parseFloat(e.target.value) || 0})} />
                            </div>

                            {currentOwner.role === 'propietario' && (
                                <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center justify-between px-2"><Label className="text-[10px] font-black uppercase text-primary tracking-widest">Unidades Vinculadas</Label><Button variant="ghost" size="sm" onClick={() => { const props = [...(currentOwner.properties || [])]; props.push({ street: '', house: '' }); setCurrentOwner({...currentOwner, properties: props}); }} className="h-7 text-[9px] font-black uppercase border border-primary/20 text-primary hover:bg-primary/10 rounded-lg"><Plus className="h-3 w-3 mr-1" /> Añadir Unidad</Button></div>
                                    {currentOwner.properties.map((prop, index) => (
                                        <div key={index} className="p-4 bg-white/5 rounded-2xl border border-white/5 relative group/prop">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5"><Label className="text-[9px] font-bold uppercase text-white/30 ml-2 tracking-widest">Calle / Sector</Label><div className="relative"><Input className="font-black uppercase h-10 rounded-xl bg-slate-800 border-none pl-9 text-white italic text-xs" placeholder="CALLE 1" value={prop.street || ''} onChange={(e) => { const props = [...currentOwner.properties]; props[index].street = e.target.value; setCurrentOwner({...currentOwner, properties: props}); }} /><Building className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" /></div></div>
                                                <div className="space-y-1.5"><Label className="text-[9px] font-bold uppercase text-white/30 ml-2 tracking-widest">Casa / Unidad</Label><div className="relative"><Input className="font-black uppercase h-10 rounded-xl bg-slate-800 border-none pl-9 text-white italic text-xs" placeholder="CASA 10" value={prop.house || ''} onChange={(e) => { const props = [...currentOwner.properties]; props[index].house = e.target.value; setCurrentOwner({...currentOwner, properties: props}); }} /><Home className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" /></div></div>
                                            </div>
                                            {currentOwner.properties.length > 1 && (<Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg" onClick={() => { const props = currentOwner.properties.filter((_, i) => i !== index); setCurrentOwner({...currentOwner, properties: props}); }}><X className="h-3 w-3" /></Button>)}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Correo Electrónico</Label>
                                <Input type="email" disabled={!!currentOwner.id} className="font-bold h-12 rounded-xl bg-white/5 border-none text-white italic" placeholder="correo@ejemplo.com" value={currentOwner.email || ''} onChange={(e) => setCurrentOwner({...currentOwner, email: e.target.value})} />
                            </div>

                            {!currentOwner.id && (
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-white/40 ml-2 tracking-widest">Contraseña Inicial</Label>
                                    <Input type="password" placeholder="••••••" className="h-12 rounded-xl bg-white/5 border-none text-white" onChange={(e) => setCurrentOwner({...currentOwner, password: e.target.value})} />
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    <DialogFooter className="gap-2 mt-4">
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="font-black uppercase text-[10px] rounded-xl h-12 text-white/40">Cancelar</Button>
                        <Button onClick={handleSaveOwner} disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[10px] tracking-[0.2em] flex-1 h-14 rounded-2xl shadow-xl italic">
                            {loading ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {currentOwner.id ? 'Guardar Cambios' : 'Crear Perfil'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIÁLOGO DE TRASPASO ATÓMICO */}
            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-slate-900 text-white italic font-montserrat">
                    <DialogHeader className="bg-primary text-slate-900 p-8 -m-6 mb-4">
                        <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3"><ArrowLeftRight /> Traspaso de <span className="underline">Unidad</span></DialogTitle>
                        <DialogDescription className="text-slate-900/60 font-bold text-[10px] uppercase">Migración atómica de propiedad e historial de solvencia.</DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-6 py-4">
                        {/* ORIGEN */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2">1. Propietario de Origen (Vendedor)</Label>
                            <Select onValueChange={(id) => { const o = owners.find(x => x.id === id); setTransferSource(o || null); setTransferProperty(''); }}>
                                <SelectTrigger className="h-12 bg-white/5 border-none font-bold uppercase text-xs italic rounded-xl"><SelectValue placeholder="SELECCIONAR..." /></SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">{owners.map(o => (<SelectItem key={o.id} value={o.id} className="italic font-bold">{o.name}</SelectItem>))}</SelectContent>
                            </Select>
                        </div>

                        {/* PROPIEDAD A TRASPASAR */}
                        {transferSource && (
                            <div className="space-y-2 animate-in slide-in-from-top-4">
                                <Label className="text-[10px] font-black uppercase text-primary ml-2">2. Unidad a Transferir</Label>
                                <Select onValueChange={setTransferProperty}>
                                    <SelectTrigger className="h-12 bg-slate-800 border-primary/20 font-black uppercase text-xs italic rounded-xl"><SelectValue placeholder="ELIGE LA PROPIEDAD..." /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        {transferSource.properties.map((p, i) => (<SelectItem key={i} value={`${p.street}|${p.house}`} className="italic font-bold">{p.street} - {p.house}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* DESTINO */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-white/40 ml-2">3. Propietario de Destino (Comprador)</Label>
                            <Select onValueChange={(id) => setTransferTarget(owners.find(x => x.id === id) || null)}>
                                <SelectTrigger className="h-12 bg-white/5 border-none font-bold uppercase text-xs italic rounded-xl"><SelectValue placeholder="SELECCIONAR..." /></SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    {owners.filter(o => o.id !== transferSource?.id).map(o => (<SelectItem key={o.id} value={o.id} className="italic font-bold">{o.name}</SelectItem>))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
                            <History className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-[9px] font-bold text-amber-200 uppercase leading-relaxed">Nota: Esta acción moverá automáticamente todas las deudas (pagadas y pendientes) de esta unidad al nuevo propietario.</p>
                        </div>
                    </div>

                    <DialogFooter className="mt-4">
                        <Button onClick={handleExecuteTransfer} disabled={isProcessingTransfer || !transferSource || !transferTarget || !transferProperty} className="w-full bg-primary hover:bg-primary/90 text-slate-900 h-14 rounded-2xl font-black uppercase italic tracking-widest shadow-2xl">
                            {isProcessingTransfer ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />} EJECUTAR TRASPASO ATÓMICO
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
                <DialogContent className="rounded-[2rem] border-none bg-slate-900 text-white italic">
                    <DialogHeader><DialogTitle className="text-red-500 font-black uppercase italic text-xl tracking-tighter">¿Confirmar Eliminación?</DialogTitle></DialogHeader>
                    <p className="text-white/40 font-bold text-sm leading-relaxed mt-4">Esta acción desvinculará permanentemente a <b>{userToDelete?.name}</b> del sistema.</p>
                    <DialogFooter className="mt-8 gap-2"><Button variant="ghost" onClick={() => setUserToDelete(null)} className="font-black uppercase text-[10px] h-12 rounded-xl">Cancelar</Button><Button variant="destructive" onClick={handleConfirmDelete} className="font-black uppercase text-[10px] h-12 rounded-xl italic">Eliminar Ahora</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

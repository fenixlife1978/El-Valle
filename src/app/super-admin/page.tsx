'use client';

import React, { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
    Loader2, Plus, ShieldAlert, ShieldCheck, ExternalLink, 
    LogOut, RefreshCw, Trash2, Edit2, Check, X 
} from "lucide-react";
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

// DEFINIMOS LA ESTRUCTURA DEL CONDOMINIO PARA TYPESCRIPT
interface CondoMaster {
    id: string;
    name: string;
    registrationKey: string;
    status: 'active' | 'suspended';
    createdAt: string;
}

export default function SuperAdminPanel() {
    const [condos, setCondos] = useState<CondoMaster[]>([]); // Usamos la interfaz aquí
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newCondoName, setNewCondoName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ name: '', registrationKey: '' });
    
    const { toast } = useToast();
    const router = useRouter();

    const fetchCondos = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, 'system_management'));
            const list = querySnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            })) as CondoMaster[]; // Forzamos el tipo aquí
            
            // Ordenar por fecha de creación (los más nuevos arriba)
            const sortedList = list.sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            
            setCondos(sortedList);
        } catch (e) { 
            toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos maestros." }); 
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchCondos(); }, []);

    const handleCreateCondo = async () => {
        if (!newCondoName) return;
        setIsCreating(true);
        
        const isManualId = newCondoName.toLowerCase().startsWith('condo_');
        const condoId = isManualId ? newCondoName.toLowerCase().trim() : 
                        newCondoName.toLowerCase().trim().replace(/\s+/g, '-') + '-' + Math.floor(1000 + Math.random() * 9000);
        
        const dynamicKey = Math.random().toString(36).substring(2, 10).toUpperCase();

        try {
            await setDoc(doc(db, 'system_management', condoId), {
                name: isManualId ? `Condominio ${condoId}` : newCondoName, 
                registrationKey: dynamicKey, 
                status: 'active', 
                createdAt: new Date().toISOString()
            });
            toast({ title: "¡Servicio Activado!" });
            setNewCondoName(''); 
            await fetchCondos();
        } catch (e) { toast({ variant: "destructive", title: "Error al crear" }); } 
        finally { setIsCreating(false); }
    };

    const startEditing = (condo: CondoMaster) => {
        setEditingId(condo.id);
        setEditForm({ name: condo.name, registrationKey: condo.registrationKey });
    };

    const saveEdit = async (id: string) => {
        try {
            await updateDoc(doc(db, 'system_management', id), {
                name: editForm.name,
                registrationKey: editForm.registrationKey
            });
            toast({ title: "Cambios guardados" });
            setEditingId(null);
            fetchCondos();
        } catch (e) { toast({ variant: "destructive", title: "Error al guardar" }); }
    };

    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        try {
            await updateDoc(doc(db, 'system_management', id), { status: newStatus });
            fetchCondos();
        } catch (e) { toast({ variant: "destructive", title: "Error" }); }
    };

    const handleDeleteCondo = async (id: string) => {
        if (window.confirm("¿Eliminar acceso maestro?")) {
            try {
                await deleteDoc(doc(db, 'system_management', id));
                fetchCondos();
            } catch (e) { toast({ variant: "destructive", title: "Error" }); }
        }
    };

    const handleSupportMode = (condoId: string) => {
        localStorage.setItem('support_condo_id', condoId);
        router.push('/admin/dashboard');
    };

    if (loading && condos.length === 0) return (
        <div className="flex h-screen items-center justify-center bg-[#020617] text-[#f59e0b] font-black italic">
            <Loader2 className="animate-spin mr-2" /> CARGANDO PANEL MAESTRO...
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-montserrat">
            <div className="max-w-7xl mx-auto space-y-8">
                
                <header className="flex justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter">
                            <span className="text-[#f59e0b]">EFAS</span>
                            <span className="text-[#0081c9]">CondoSys</span>
                            <span className="ml-2 text-slate-300 text-xl not-italic font-bold tracking-tight">MASTER</span>
                        </h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">vallecondo@gmail.com</p>
                    </div>
                    <Button onClick={() => signOut(auth)} variant="destructive" className="rounded-xl font-black uppercase text-xs px-6">
                        <LogOut className="w-4 h-4 mr-2" /> Salir
                    </Button>
                </header>

                <Card className="rounded-[2rem] border-none shadow-xl bg-white overflow-hidden">
                    <CardHeader className="bg-[#020617] text-white py-4 px-8">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Plus className="w-4 h-4 text-[#f59e0b]" /> Nuevo Registro (ID Manual o Automático)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8 flex flex-col md:flex-row gap-4">
                        <Input 
                            placeholder="Escribe 'condo_01' o el nombre del condominio" 
                            value={newCondoName} 
                            onChange={e => setNewCondoName(e.target.value)} 
                            className="h-14 rounded-2xl bg-slate-100 border-slate-200 font-bold text-slate-900 placeholder:text-slate-400 text-lg px-6" 
                        />
                        <Button onClick={handleCreateCondo} disabled={isCreating || !newCondoName} className="bg-[#0081c9] hover:bg-sky-700 h-14 rounded-2xl font-black uppercase text-sm px-12 transition-all shadow-xl shadow-sky-200">
                            {isCreating ? <Loader2 className="animate-spin" /> : 'ACTIVAR SERVICIO'}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-none shadow-2xl overflow-hidden bg-white">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="p-6 font-black text-slate-400 uppercase text-[9px]">Cliente / Identificador</TableHead>
                                <TableHead className="font-black text-slate-400 uppercase text-[9px]">Llave (Key)</TableHead>
                                <TableHead className="font-black text-slate-400 uppercase text-[9px]">Estado</TableHead>
                                <TableHead className="text-right p-6 font-black text-slate-400 uppercase text-[9px]">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {condos.map(c => (
                                <TableRow key={c.id} className="hover:bg-slate-50">
                                    <TableCell className="p-6">
                                        {editingId === c.id ? (
                                            <Input 
                                                value={editForm.name} 
                                                onChange={e => setEditForm({...editForm, name: e.target.value})}
                                                className="h-10 font-bold text-slate-900 border-[#0081c9]"
                                            />
                                        ) : (
                                            <>
                                                <div className="font-black text-slate-900 uppercase italic text-base leading-none">{c.name}</div>
                                                <div className="text-[10px] text-[#0081c9] font-mono mt-1 font-bold">{c.id}</div>
                                            </>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {editingId === c.id ? (
                                            <Input 
                                                value={editForm.registrationKey} 
                                                onChange={e => setEditForm({...editForm, registrationKey: e.target.value})}
                                                className="h-10 font-mono font-bold text-[#0081c9]"
                                            />
                                        ) : (
                                            <span className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg font-mono font-black text-xs border uppercase">
                                                {c.registrationKey}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={cn("rounded-full font-black px-4 text-[9px]", c.status === 'active' ? "bg-emerald-500 text-white" : "bg-red-500 text-white")}>
                                            {c.status === 'active' ? 'ACTIVO' : 'SUSPENDIDO'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right p-6 flex justify-end gap-2">
                                        {editingId === c.id ? (
                                            <>
                                                <Button size="sm" onClick={() => saveEdit(c.id)} className="bg-emerald-500 h-10 w-10 p-0 rounded-xl"><Check className="w-5 h-5" /></Button>
                                                <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-10 w-10 p-0 rounded-xl"><X className="w-5 h-5" /></Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button size="sm" onClick={() => handleSupportMode(c.id)} className="bg-slate-900 text-white font-black hover:bg-black text-[9px] h-10 px-4 rounded-xl">GESTIONAR</Button>
                                                <Button variant="outline" size="sm" onClick={() => startEditing(c)} className="h-10 w-10 p-0 rounded-xl text-slate-400"><Edit2 className="w-4 h-4" /></Button>
                                                <Button variant="outline" size="sm" onClick={() => toggleStatus(c.id, c.status)} className={cn("h-10 w-10 p-0 rounded-xl", c.status === 'active' ? "text-amber-500" : "text-emerald-500")}>
                                                    {c.status === 'active' ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => handleDeleteCondo(c.id)} className="h-10 w-10 p-0 rounded-xl text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></Button>
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </div>
    );
}
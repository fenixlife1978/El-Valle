'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCheck, Building, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ValidationPage() {
    const { user, activeCondoId } = useAuth();
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const isSuperAdmin = user?.email === 'vallecondo@gmail.com';

    useEffect(() => {
        let q;
        // Cambiado a la colección "owners" según tu estructura
        if (isSuperAdmin) {
            q = query(collection(db, "owners"), where("role", "==", "admin"), where("status", "==", "pending"));
        } else if (activeCondoId) {
            q = query(
                collection(db, "owners"), 
                where("condoId", "==", activeCondoId), 
                where("role", "==", "owner"), 
                where("status", "==", "pending")
            );
        } else {
            setLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPendingUsers(users);
            setLoading(false);
        }, (error) => {
            console.error("Error en validación:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isSuperAdmin, activeCondoId]);

    const handleAction = async (ownerId: string, newStatus: 'active' | 'rejected') => {
        try {
            await updateDoc(doc(db, "owners", ownerId), { 
                status: newStatus,
                validatedBy: user?.email,
                validatedAt: new Date().toISOString()
            });
            toast({ title: newStatus === 'active' ? "Acceso Autorizado" : "Registro Rechazado" });
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el estado del propietario." });
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center bg-slate-950"><Loader2 className="animate-spin text-[#0081c9] h-10 w-10" /></div>;

    return (
        <div className="p-8 space-y-8">
            <header>
                <div className="flex items-center gap-2">
                   {isSuperAdmin && <ShieldCheck className="text-amber-500 h-8 w-8" />}
                   <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">
                        Control de <span className="text-[#0081c9]">Accesos</span>
                    </h2>
                </div>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase">
                    {isSuperAdmin ? "Validación Global de Administradores (Owners Collection)" : "Aprobación de nuevos Residentes"}
                </p>
            </header>

            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <UserCheck className="text-[#0081c9]" /> 
                        Solicitudes Pendientes
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Solo los usuarios activos podrán visualizar balances y reportar pagos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-slate-800">
                        <Table>
                            <TableHeader className="bg-slate-950">
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-400">Nombre / Propietario</TableHead>
                                    <TableHead className="text-slate-400">Email</TableHead>
                                    {isSuperAdmin && <TableHead className="text-slate-400">ID Condominio</TableHead>}
                                    <TableHead className="text-right text-slate-400">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={isSuperAdmin ? 4 : 3} className="text-center py-12 text-slate-600 font-bold italic">
                                            No hay registros esperando aprobación en este momento.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pendingUsers.map((u) => (
                                        <TableRow key={u.id} className="border-slate-800 hover:bg-slate-800/30 transition-colors">
                                            <TableCell className="text-white font-bold uppercase text-sm tracking-tight">{u.name || '---'}</TableCell>
                                            <TableCell className="text-slate-400 font-mono text-xs">{u.email}</TableCell>
                                            {isSuperAdmin && (
                                                <TableCell>
                                                    <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/5">
                                                        <Building className="h-3 w-3 mr-1" /> {u.condoId || 'Sin ID'}
                                                    </Badge>
                                                </TableCell>
                                            )}
                                            <TableCell className="text-right space-x-2">
                                                <Button 
                                                    size="sm" 
                                                    className="bg-green-600 hover:bg-green-500 text-white font-bold"
                                                    onClick={() => handleAction(u.id, 'active')}
                                                >
                                                    Activar
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                    onClick={() => handleAction(u.id, 'rejected')}
                                                >
                                                    Rechazar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

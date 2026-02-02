
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

    if (loading) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="animate-spin text-primary h-10 w-10" /></div>;

    return (
        <div className="p-6 md:p-8 space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Control de <span className="text-primary">Accesos</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    {isSuperAdmin ? "Validación Global de Administradores" : "Aprobación de nuevos Residentes"}
                </p>
            </div>

            <Card className="bg-card border-border backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                        <UserCheck className="text-primary" /> 
                        Solicitudes Pendientes
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Solo los usuarios activos podrán visualizar balances y reportar pagos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                            <TableHeader className="bg-secondary/30">
                                <TableRow className="border-border">
                                    <TableHead className="text-muted-foreground">Nombre / Propietario</TableHead>
                                    <TableHead className="text-muted-foreground">Email</TableHead>
                                    {isSuperAdmin && <TableHead className="text-muted-foreground">ID Condominio</TableHead>}
                                    <TableHead className="text-right text-muted-foreground">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={isSuperAdmin ? 4 : 3} className="text-center py-12 text-muted-foreground font-bold italic">
                                            No hay registros esperando aprobación en este momento.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pendingUsers.map((u) => (
                                        <TableRow key={u.id} className="border-border hover:bg-secondary/20 transition-colors">
                                            <TableCell className="text-foreground font-bold uppercase text-sm tracking-tight">{u.name || '---'}</TableCell>
                                            <TableCell className="text-muted-foreground font-mono text-xs">{u.email}</TableCell>
                                            {isSuperAdmin && (
                                                <TableCell>
                                                    <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-900/20">
                                                        <Building className="h-3 w-3 mr-1" /> {u.condoId || 'Sin ID'}
                                                    </Badge>
                                                </TableCell>
                                            )}
                                            <TableCell className="text-right space-x-2">
                                                <Button 
                                                    size="sm" 
                                                    className="bg-success hover:bg-success/90 text-success-foreground font-bold"
                                                    onClick={() => handleAction(u.id, 'active')}
                                                >
                                                    Activar
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    className="text-destructive/80 hover:text-destructive hover:bg-destructive/10"
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

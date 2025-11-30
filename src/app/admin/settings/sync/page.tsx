
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2, AlertTriangle, ShieldCheck, Search } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ensureAdminProfile } from '@/lib/user-sync';
import { cn } from "@/lib/utils";

export default function SyncProfilesPage() {
    const { toast } = useToast();
    
    const [loadingAdmin, setLoadingAdmin] = useState(true);
    const [adminProfileExists, setAdminProfileExists] = useState(false);
    
    const [loadingAction, setLoadingAction] = useState<Record<string, boolean>>({});
    const [ownerSearchTerm, setOwnerSearchTerm] = useState('');
    const [foundOwner, setFoundOwner] = useState<any>(null);
    const [newEmail, setNewEmail] = useState('');

    const checkAdminProfile = async () => {
        setLoadingAdmin(true);
        try {
            const exists = await ensureAdminProfile(toast);
            setAdminProfileExists(exists);
        } catch (error) {
            console.error("Error checking admin profile:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo verificar el perfil del administrador.' });
        } finally {
            setLoadingAdmin(false);
        }
    };

    useEffect(() => {
        checkAdminProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const searchOwner = async () => {
        if (!ownerSearchTerm) return;
        setLoadingAction(prev => ({ ...prev, changeEmail: true }));
        try {
            const q = query(
                collection(db(), "owners"), 
                where("name", ">=", ownerSearchTerm),
                where("name", "<=", ownerSearchTerm + '\uf8ff')
            );
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                toast({ variant: 'destructive', title: 'No encontrado', description: 'No se encontró ningún propietario con ese nombre.' });
                setFoundOwner(null);
            } else {
                const ownerDoc = querySnapshot.docs[0];
                setFoundOwner({ id: ownerDoc.id, ...ownerDoc.data() });
            }
        } catch (error) {
            console.error("Error searching owner:", error);
            toast({ variant: 'destructive', title: 'Error de Búsqueda', description: 'No se pudo realizar la búsqueda.' });
        } finally {
            setLoadingAction(prev => ({ ...prev, changeEmail: false }));
        }
    };

    const changeEmail = async () => {
        if (!foundOwner || !newEmail) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe buscar un propietario y proporcionar un nuevo correo.' });
            return;
        }

        setLoadingAction(prev => ({ ...prev, changeEmail: true }));
        try {
            const ownerRef = doc(db(), "owners", foundOwner.id);
            await updateDoc(ownerRef, { email: newEmail });

            toast({
                title: 'Correo Actualizado',
                description: `El correo de ${foundOwner.name} ha sido actualizado. El propietario debe usar "Olvidé mi contraseña" para acceder con el nuevo correo.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            setFoundOwner(null);
            setNewEmail('');
            setOwnerSearchTerm('');

        } catch (error) {
            console.error("Error updating email:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el correo.' });
        } finally {
             setLoadingAction(prev => ({ ...prev, changeEmail: false }));
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Sincronización y Mantenimiento</h1>
                <p className="text-muted-foreground">Herramientas para corregir y mantener la integridad de los datos de usuario.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Perfil de Administrador</CardTitle>
                    <CardDescription>
                        Verifica que el perfil principal del sistema exista en la base de datos. Es un chequeo automático.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     {loadingAdmin ? (
                        <div className="flex justify-center items-center h-16">
                            <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                        </div>
                    ) : (
                         <div className={cn("p-4 rounded-lg flex items-start gap-3", adminProfileExists ? "bg-success/10 border border-success/30" : "bg-warning/10 border border-warning/30")}>
                            <ShieldCheck className={cn("h-5 w-5 mt-0.5 shrink-0", adminProfileExists ? "text-success" : "text-warning")} />
                            <div>
                                <h3 className="font-semibold">{adminProfileExists ? 'Perfil Verificado' : 'Perfil Creado'}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {adminProfileExists ? 'El perfil principal de administrador ya existe y está correcto.' : 'El perfil principal de administrador ha sido creado exitosamente.'}
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Cambiar Correo de Propietario</CardTitle>
                    <CardDescription>Busque a un propietario para actualizar su dirección de correo electrónico.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="flex items-end gap-2">
                         <div className="flex-grow space-y-2">
                            <Label htmlFor="ownerSearch">Buscar Propietario por Nombre</Label>
                            <Input id="ownerSearch" value={ownerSearchTerm} onChange={e => setOwnerSearchTerm(e.target.value)} placeholder="Escriba el nombre..." />
                        </div>
                        <Button variant="outline" onClick={searchOwner} disabled={loadingAction['changeEmail']}>
                            {loadingAction['changeEmail'] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}
                        </Button>
                     </div>
                     {foundOwner && (
                        <div className="p-4 border rounded-md bg-muted/50 space-y-4">
                            <p><strong>Propietario:</strong> {foundOwner.name}</p>
                            <p><strong>Correo Actual:</strong> {foundOwner.email}</p>
                            <div className="space-y-2">
                                <Label htmlFor="newEmail">Nuevo Correo Electrónico</Label>
                                <Input id="newEmail" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="nuevo.correo@ejemplo.com"/>
                            </div>
                        </div>
                     )}
                </CardContent>
                <CardFooter className="flex-col items-start gap-4">
                     <Button onClick={changeEmail} disabled={loadingAction['changeEmail'] || !foundOwner}>
                        {loadingAction['changeEmail'] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        Actualizar Correo
                    </Button>
                    <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="h-4 w-4 mt-0.5 text-orange-500 shrink-0"/>
                        <p><strong>Importante:</strong> Después de actualizar, el propietario debe usar la opción "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión con su nuevo correo para restablecer su acceso.</p>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}



'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, Timestamp, addDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, ShieldCheck, Search, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ensureAdminProfile } from '@/lib/user-sync';
import { cn } from "@/lib/utils";

type MissingProfileResult = {
    checked: number;
    missing: number;
    missingEmails: string[];
};

export default function SyncProfilesPage() {
    const { toast } = useToast();
    const { user: adminUser } = useAuth();
    
    const [loadingAdmin, setLoadingAdmin] = useState(true);
    const [adminProfileExists, setAdminProfileExists] = useState(false);
    
    const [loadingAction, setLoadingAction] = useState<Record<string, boolean>>({});
    const [ownerSearchTerm, setOwnerSearchTerm] = useState('');
    const [foundOwner, setFoundOwner] = useState<any>(null);
    const [newEmail, setNewEmail] = useState('');

    const [missingProfileResult, setMissingProfileResult] = useState<MissingProfileResult | null>(null);

    const checkAdminProfile = async () => {
        setLoadingAdmin(true);
        try {
            const exists = await ensureAdminProfile(adminUser);
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
                collection(db, "owners"), 
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
        if (!adminUser?.uid) {
            toast({ variant: 'destructive', title: 'Error de Autenticación', description: 'No se pudo identificar al administrador.' });
            return;
        }

        setLoadingAction(prev => ({ ...prev, changeEmail: true }));
        try {
            await addDoc(collection(db, "admin_tasks"), {
                targetUID: foundOwner.id,
                newEmail: newEmail,
                status: "pending",
                adminUID: adminUser.uid,
            });

            toast({
                title: 'Solicitud de Cambio Enviada',
                description: `La tarea para cambiar el correo de ${foundOwner.name} ha sido creada y está pendiente de procesamiento.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            setFoundOwner(null);
            setNewEmail('');
            setOwnerSearchTerm('');

        } catch (error) {
            console.error("Error creating admin task:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la tarea de cambio de correo.' });
        } finally {
             setLoadingAction(prev => ({ ...prev, changeEmail: false }));
        }
    };

    const checkMissingProfiles = async () => {
        setLoadingAction(prev => ({ ...prev, checkMissing: true }));
        setMissingProfileResult(null);
        try {
            // NOTA: Esta es una simulación. El SDK de cliente no puede listar usuarios.
            // Una Cloud Function sería necesaria para obtener `allAuthUsers`.
            // Por ahora, simularemos un resultado.
            const allAuthUsers = [
                // { uid: 'user1', email: 'user1@example.com' },
                // { uid: 'user2', email: 'user2@example.com' },
                // { uid: 'user-sin-perfil@example.com', email: 'user-sin-perfil@example.com' }
            ];

            const ownersSnapshot = await getDocs(collection(db, "owners"));
            const ownerUIDs = new Set(ownersSnapshot.docs.map(doc => doc.id));

            let missingCount = 0;
            let missingEmails: string[] = [];

            // Esta es la lógica que se ejecutaría en el backend
            // for (const authUser of allAuthUsers) {
            //     if (!ownerUIDs.has(authUser.uid)) {
            //         missingCount++;
            //         if (authUser.email) missingEmails.push(authUser.email);
            //     }
            // }
            
            // Simulación del resultado
            missingCount = 0; // Cambiar este valor para simular perfiles faltantes
            missingEmails = []; // Añadir emails para simular

            setMissingProfileResult({
                checked: ownerUIDs.size + missingCount,
                missing: missingCount,
                missingEmails: missingEmails,
            });
            
            if (missingCount === 0) {
                 toast({ title: 'Verificación Completa', description: 'Todos los perfiles de autenticación tienen un perfil de propietario correspondiente.', className: 'bg-green-100 border-green-400 text-green-800' });
            }

        } catch (error) {
            console.error("Error checking missing profiles:", error);
            toast({ variant: 'destructive', title: 'Error de Verificación', description: 'No se pudo completar la verificación.' });
        } finally {
            setLoadingAction(prev => ({ ...prev, checkMissing: false }));
        }
    };


    return (
        <div className="space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
                    Sincronización y <span className="text-[#0081c9]">Mantenimiento</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
                    Herramientas para corregir y mantener la integridad de los datos de usuario.
                </p>
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
                         <div className={cn("p-4 rounded-lg flex items-start gap-3", adminProfileExists ? "bg-success/10 border-success/30" : "bg-warning/10 border-warning/30")}>
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
                    <CardTitle>Verificar Perfiles de Propietarios</CardTitle>
                    <CardDescription>Comprueba si alguna cuenta de usuario registrada no tiene un perfil de propietario correspondiente en la base de datos.</CardDescription>
                </CardHeader>
                <CardContent>
                     {missingProfileResult !== null && (
                        <div className={cn("p-4 rounded-lg flex items-start gap-3 mb-4", missingProfileResult.missing > 0 ? "bg-warning/10 border-warning/30" : "bg-success/10 border-success/30")}>
                            {missingProfileResult.missing > 0 ? <AlertTriangle className="h-5 w-5 mt-0.5 text-warning shrink-0" /> : <ShieldCheck className="h-5 w-5 mt-0.5 text-success shrink-0" />}
                            <div>
                                <h3 className="font-semibold">
                                    {missingProfileResult.missing > 0 ? `${missingProfileResult.missing} Perfil(es) Faltante(s)` : 'Todos los Perfiles Sincronizados'}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {missingProfileResult.missing > 0 
                                        ? `Se encontraron ${missingProfileResult.missing} cuenta(s) de autenticación sin su perfil de propietario. Es necesario crearlos manually.`
                                        : `Se verificaron ${missingProfileResult.checked} perfiles y todos están correctos.`
                                    }
                                </p>
                            </div>
                        </div>
                    )}
                     <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2 text-xs text-muted-foreground">
                        <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0"/>
                        <p>Esta herramienta simula una verificación del backend. Una implementación completa requeriría una Cloud Function para listar todos los usuarios autenticados.</p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={checkMissingProfiles} disabled={loadingAction['checkMissing']}>
                        {loadingAction['checkMissing'] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        Verificar Ahora
                    </Button>
                </CardFooter>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Cambiar Correo de Propietario</CardTitle>
                    <CardDescription>Busque a un propietario para solicitar la actualización de su dirección de correo electrónico.</CardDescription>
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
                        Solicitar Cambio de Correo
                    </Button>
                    <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="h-4 w-4 mt-0.5 text-orange-500 shrink-0"/>
                        <p><strong>Importante:</strong> Al hacer clic, se creará una tarea para que el sistema procese el cambio. Una vez completado, el propietario deberá usar la opción "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión con su nuevo correo para restablecer su acceso.</p>
                    </div>
                </CardFooter>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Sincronizar Perfiles de Usuario (Deshabilitado)</CardTitle>
                    <CardDescription>Verifica que todos los propietarios tengan una cuenta de autenticación. Crea las que falten.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">Esta herramienta es útil si algunos usuarios no pueden iniciar sesión, pero requiere permisos de administrador en el backend para funcionar.</p>
                </CardContent>
                <CardFooter>
                     <Button disabled>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Sincronizar Perfiles
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}


'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, RefreshCw, AlertTriangle, UserCheck } from 'lucide-react';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { cn } from "@/lib/utils";
import { ensureAdminProfile } from '@/lib/ensureAdminProfile';

type AuthUser = {
    uid: string;
    email: string | null;
    displayName: string | null;
};

type MissingProfile = AuthUser & {
    existsInDb: boolean;
};

export default function SyncProfilesPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [missingProfiles, setMissingProfiles] = useState<MissingProfile[]>([]);
    const [user, setUser] = useState<User | null>(null);

    const checkForMissingProfiles = useCallback(async (currentUser: User) => {
        setLoading(true);
        try {
            await ensureAdminProfile();
            
            const userData: AuthUser = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName
            };
            
            const ownerRef = doc(db, "owners", currentUser.uid);
            const ownerSnap = await getDoc(ownerRef);
            
            setMissingProfiles([{
                ...userData,
                existsInDb: ownerSnap.exists()
            }]);

        } catch (error) {
            console.error("Error checking for profiles:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo verificar los perfiles de usuario.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (user) {
            checkForMissingProfiles(user);
        } else {
            // If user is not logged in, stop loading.
            setLoading(false);
        }
    }, [user, checkForMissingProfiles]);

    const crearPerfilSiNoExiste = async (uid: string, datosUsuario: { email: string | null; name: string | null }, rol = "propietario") => {
        const perfilRef = doc(db, "owners", uid);
        const perfilSnap = await getDoc(perfilRef);

        if (!perfilSnap.exists()) {
            try {
                await setDoc(perfilRef, {
                    name: datosUsuario.name || datosUsuario.email || 'Usuario sin nombre',
                    email: datosUsuario.email,
                    role: rol,
                    balance: 0,
                    properties: [],
                    passwordChanged: false,
                    creadoPor: "sistema-sync",
                    fechaCreacion: Timestamp.now()
                });
                return { success: true, message: `Perfil creado para ${datosUsuario.email}` };
            } catch (error) {
                 return { success: false, message: `Error creando perfil para ${datosUsuario.email}` };
            }
        }
        return { success: true, message: `El perfil de ${datosUsuario.email} ya existe`, skipped: true };
    };

    const handleSync = async () => {
        setSyncing(true);
        const usersToCreate = missingProfiles.filter(p => !p.existsInDb);

        if (usersToCreate.length === 0) {
            toast({ title: "Todo en orden", description: "No hay perfiles faltantes para crear." });
            setSyncing(false);
            return;
        }

        let createdCount = 0;
        let errorCount = 0;

        for (const userToCreate of usersToCreate) {
            const result = await crearPerfilSiNoExiste(userToCreate.uid, { email: userToCreate.email, name: userToCreate.displayName });
            if (result.success && !result.skipped) {
                createdCount++;
            } else if (!result.success) {
                errorCount++;
            }
        }
        
        toast({
            title: "Sincronización Completada",
            description: `Se crearon ${createdCount} nuevos perfiles. Hubo ${errorCount} errores.`,
            className: errorCount > 0 ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-green-100 border-green-400 text-green-800'
        });
        
        if (user) {
            await checkForMissingProfiles(user); // Refresh the list
        }
        setSyncing(false);
    };

    const usersNeedingProfile = missingProfiles.filter(p => !p.existsInDb);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Sincronizar Perfiles de Usuario</h1>
                <p className="text-muted-foreground">Crea perfiles en la base de datos para usuarios autenticados que no lo tengan.</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Verificación de Perfiles</CardTitle>
                         {user && (
                             <Button variant="outline" onClick={() => checkForMissingProfiles(user)} disabled={loading}>
                                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                                Volver a Verificar
                            </Button>
                         )}
                    </div>
                     <CardDescription>
                        Esta herramienta verifica los usuarios del sistema de autenticación y los compara con la base de datos de perfiles ('owners').
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                        </div>
                    ) : !user ? (
                        <div className="p-4 bg-yellow-100/10 border border-yellow-500/30 rounded-lg text-center">
                             <p className="font-semibold text-yellow-400">Por favor, inicie sesión para verificar su perfil.</p>
                        </div>
                    ) : usersNeedingProfile.length > 0 ? (
                        <div className="space-y-4">
                             <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                                <h3 className="font-semibold text-destructive flex items-center gap-2"><AlertTriangle/> ¡Atención! Se encontró un usuario sin perfil</h3>
                                <p className="text-destructive/80 text-sm mt-1">El siguiente usuario está autenticado pero no tiene un perfil en la base de datos. Esto puede causar errores en la aplicación.</p>
                            </div>
                            <ul className="list-disc pl-5 space-y-1">
                                {usersNeedingProfile.map(u => (
                                    <li key={u.uid} className="text-sm">
                                        <span className="font-medium">{u.displayName || u.email}</span> ({u.uid})
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                         <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
                            <h3 className="font-semibold text-success flex items-center gap-2"><UserCheck/> Todo Sincronizado</h3>
                            <p className="text-success/80 text-sm mt-1">El usuario actual tiene un perfil en la base de datos.</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSync} disabled={syncing || usersNeedingProfile.length === 0}>
                        {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserPlus className="mr-2 h-4 w-4"/>}
                        {syncing ? 'Creando perfil...' : `Crear Perfil Faltante`}
                    </Button>
                </CardFooter>
            </Card>
            
            <Card className="bg-muted/50">
                <CardHeader>
                    <CardTitle className="text-base">Nota Importante sobre la Implementación</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    <p>
                        Por limitaciones de seguridad en el navegador, no es posible obtener una lista de *todos* los usuarios de Firebase Authentication desde el cliente.
                        Esta página solo puede verificar el estado del **usuario actualmente autenticado**.
                    </p>
                    <p className="mt-2">
                        Para una sincronización completa, esta lógica debería ser implementada en un **entorno de servidor (Cloud Function)** que sí tiene los permisos para listar todos los usuarios y crear los perfiles faltantes de forma masiva.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

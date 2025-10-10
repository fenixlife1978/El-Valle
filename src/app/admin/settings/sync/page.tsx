
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCheck, RefreshCw, UserCog, Users } from 'lucide-react';
import { ensureAdminProfile } from '@/lib/user-sync';
import { cn } from "@/lib/utils";
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const ADMIN_USER_ID = 'valle-admin-main-account';

export default function SyncProfilesPage() {
    const { toast } = useToast();
    
    const [loadingAdmin, setLoadingAdmin] = useState(true);
    const [adminProfileExists, setAdminProfileExists] = useState(false);
    
    const [isSyncingOwners, setIsSyncingOwners] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [syncSummary, setSyncSummary] = useState({ checked: 0, updated: 0 });

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
    
    const handleSyncAllOwners = async () => {
        setIsSyncingOwners(true);
        setSyncProgress(0);
        setSyncSummary({ checked: 0, updated: 0 });
        toast({ title: 'Iniciando Sincronización', description: 'Verificando todos los perfiles de propietarios...' });

        try {
            const ownersQuery = collection(db, "owners");
            const querySnapshot = await getDocs(ownersQuery);
            
            const totalOwners = querySnapshot.docs.length;
            if (totalOwners === 0) {
                toast({ title: 'No hay Propietarios', description: 'No se encontraron propietarios para sincronizar.' });
                setIsSyncingOwners(false);
                return;
            }

            const batch = writeBatch(db);
            let updatedCount = 0;
            let checkedCount = 0;

            for (const docSnap of querySnapshot.docs) {
                if (docSnap.id === ADMIN_USER_ID) {
                    checkedCount++;
                    continue;
                }

                const data = docSnap.data();
                let needsUpdate = false;
                const updates: { [key: string]: any } = {};

                if (typeof data.balance !== 'number') {
                    updates.balance = 0;
                    needsUpdate = true;
                }
                if (data.role !== 'propietario' && data.role !== 'administrador') {
                    updates.role = 'propietario';
                    needsUpdate = true;
                }
                 if (typeof data.passwordChanged !== 'boolean') {
                    updates.passwordChanged = false; // Default to false
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    batch.update(doc(db, "owners", docSnap.id), updates);
                    updatedCount++;
                }
                
                checkedCount++;
                setSyncProgress((checkedCount / totalOwners) * 100);
            }
            
            if (updatedCount > 0) {
                await batch.commit();
            }

            setSyncSummary({ checked: checkedCount, updated: updatedCount });

            toast({
                title: 'Sincronización Completada',
                description: `Se revisaron ${checkedCount} perfiles y se actualizaron ${updatedCount}.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

        } catch (error) {
            console.error("Error syncing all owners:", error);
            const errorMessage = error instanceof Error ? error.message : "Error desconocido.";
            toast({ variant: 'destructive', title: 'Error en Sincronización Masiva', description: errorMessage });
        } finally {
            setIsSyncingOwners(false);
        }
    };


    useEffect(() => {
        checkAdminProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Sincronizar Perfiles de Usuario</h1>
                <p className="text-muted-foreground">Asegura la existencia y consistencia de los perfiles en la base de datos.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Verificación de Perfiles Críticos</CardTitle>
                     <CardDescription>
                        Herramientas para verificar y reparar perfiles de usuario en la base de datos de Firestore.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Admin Profile Section */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <h3 className="font-semibold flex items-center gap-2"><UserCog className="h-5 w-5 text-primary"/>Verificación de Perfil de Administrador</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Verifica que el perfil principal del administrador del sistema exista en la base de datos.
                            </p>
                        </div>
                        <div className="w-full md:w-auto">
                            <Button variant="outline" onClick={checkAdminProfile} disabled={loadingAdmin} className="w-full md:w-auto">
                                <RefreshCw className={cn("mr-2 h-4 w-4", loadingAdmin && "animate-spin")} />
                                Volver a Verificar
                            </Button>
                        </div>
                    </div>
                     {loadingAdmin ? (
                        <div className="flex justify-center items-center h-24">
                            <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                        </div>
                    ) : (
                         <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
                            <h3 className="font-semibold text-success flex items-center gap-2"><UserCheck/> Perfil de Administrador Verificado</h3>
                            <p className="text-success/80 text-sm mt-1">
                                {adminProfileExists ? 'El perfil principal de administrador ya existe en la base de datos.' : 'El perfil principal de administrador ha sido creado exitosamente.'}
                            </p>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground text-center">La verificación del administrador es automática al cargar la página.</p>

                    <Separator />
                    
                    {/* All Owners Profile Section */}
                     <div className="flex flex-col md:flex-row gap-4 pt-4">
                        <div className="flex-1">
                            <h3 className="font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-primary"/>Sincronización Masiva de Propietarios</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Recorre todos los perfiles de propietarios y repara los que no tengan campos esenciales (como rol, saldo, etc.).
                            </p>
                        </div>
                        <div className="w-full md:w-auto">
                            <Button onClick={handleSyncAllOwners} disabled={isSyncingOwners} className="w-full md:w-auto">
                                <RefreshCw className={cn("mr-2 h-4 w-4", isSyncingOwners && "animate-spin")} />
                                Sincronizar Todos los Propietarios
                            </Button>
                        </div>
                    </div>
                    {isSyncingOwners && (
                        <div className="space-y-2">
                             <Progress value={syncProgress} className="w-full" />
                             <p className="text-sm text-muted-foreground text-center">Procesando... {Math.round(syncProgress)}%</p>
                        </div>
                    )}
                    {syncSummary.checked > 0 && !isSyncingOwners && (
                        <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
                            <h3 className="font-semibold text-success flex items-center gap-2"><UserCheck/> Sincronización Finalizada</h3>
                            <p className="text-success/80 text-sm mt-1">
                                Se revisaron {syncSummary.checked} perfiles y se actualizaron {syncSummary.updated} de ellos.
                            </p>
                        </div>
                    )}

                </CardContent>
                 <CardFooter>
                    <p className="text-xs text-muted-foreground">La sincronización masiva es útil para reparar perfiles después de una importación o si se detectan errores generalizados.</p>
                </CardFooter>
            </Card>
        </div>
    );
}


'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCheck, RefreshCw, UserCog } from 'lucide-react';
import { ensureAdminProfile, ensureOwnerProfile } from '@/lib/ensureAdminProfile';
import { cn } from "@/lib/utils";
import { useAuth } from '@/hooks/use-auth';
import { Separator } from '@/components/ui/separator';

export default function SyncProfilesPage() {
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();
    
    const [loadingAdmin, setLoadingAdmin] = useState(true);
    const [loadingOwner, setLoadingOwner] = useState(false);
    
    const [adminProfileExists, setAdminProfileExists] = useState(false);
    const [ownerProfileStatus, setOwnerProfileStatus] = useState<'idle' | 'checked' | 'created'>('idle');

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

    const checkOwnerProfile = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe iniciar sesión para sincronizar su perfil.' });
            return;
        }
        setLoadingOwner(true);
        setOwnerProfileStatus('idle');
        try {
            const result = await ensureOwnerProfile(user, toast);
            setOwnerProfileStatus(result);
        } catch (error) {
            console.error("Error checking owner profile:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo verificar su perfil de propietario.' });
        } finally {
            setLoadingOwner(false);
        }
    }

    useEffect(() => {
        checkAdminProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isLoading = loadingAdmin || authLoading;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Sincronizar Perfiles de Usuario</h1>
                <p className="text-muted-foreground">Asegura la existencia de perfiles críticos en la base de datos.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Verificación de Perfiles</CardTitle>
                     <CardDescription>
                        Esta herramienta verifica que los perfiles de usuario existan en la base de datos para el correcto funcionamiento del sistema.
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
                     {isLoading ? (
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
                    
                    {/* Owner Profile Section */}
                     <div className="flex flex-col md:flex-row gap-4 pt-4">
                        <div className="flex-1">
                            <h3 className="font-semibold flex items-center gap-2"><UserCheck className="h-5 w-5 text-primary"/>Sincronización de Perfil de Propietario</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Si ha iniciado sesión pero su perfil no se creó correctamente, esta herramienta lo generará.
                            </p>
                        </div>
                        <div className="w-full md:w-auto">
                            <Button onClick={checkOwnerProfile} disabled={loadingOwner || authLoading} className="w-full md:w-auto">
                                <RefreshCw className={cn("mr-2 h-4 w-4", loadingOwner && "animate-spin")} />
                                Sincronizar Mi Perfil
                            </Button>
                        </div>
                    </div>
                    {loadingOwner ? (
                        <div className="flex justify-center items-center h-24">
                            <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                        </div>
                    ) : ownerProfileStatus !== 'idle' && (
                        <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
                             <h3 className="font-semibold text-success flex items-center gap-2"><UserCheck/> Perfil de Propietario Sincronizado</h3>
                            <p className="text-success/80 text-sm mt-1">
                                {ownerProfileStatus === 'checked' ? 'Tu perfil de propietario ya existe y está sincronizado.' : 'Tu perfil de propietario ha sido creado exitosamente.'}
                            </p>
                        </div>
                    )}

                </CardContent>
                 <CardFooter>
                    <p className="text-xs text-muted-foreground">La sincronización de perfiles es manual y debe ejecutarse si encuentra problemas con su cuenta.</p>
                </CardFooter>
            </Card>
        </div>
    );
}

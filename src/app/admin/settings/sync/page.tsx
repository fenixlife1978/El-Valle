
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCheck, RefreshCw, UserCog } from 'lucide-react';
import { ensureAdminProfile } from '@/lib/user-sync';
import { cn } from "@/lib/utils";

export default function SyncProfilesPage() {
    const { toast } = useToast();
    
    const [loadingAdmin, setLoadingAdmin] = useState(true);
    const [adminProfileExists, setAdminProfileExists] = useState(false);

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

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Sincronización de Perfiles</h1>
                <p className="text-muted-foreground">Verifica la integridad de los perfiles de usuario críticos.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Verificación de Perfil de Administrador</CardTitle>
                     <CardDescription>
                        Esta herramienta verifica que el perfil principal del sistema exista en la base de datos. La sincronización ahora es automática al iniciar sesión para todos los usuarios.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <h3 className="font-semibold flex items-center gap-2"><UserCog className="h-5 w-5 text-primary"/>Estado del Perfil de Administrador</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Comprueba si el perfil de administrador del sistema está correctamente configurado en Firestore.
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
                            <h3 className="font-semibold text-success flex items-center gap-2"><UserCheck/> Perfil Verificado</h3>
                            <p className="text-success/80 text-sm mt-1">
                                {adminProfileExists ? 'El perfil principal de administrador ya existe y está correcto.' : 'El perfil principal de administrador ha sido creado exitosamente.'}
                            </p>
                        </div>
                    )}
                </CardContent>
                 <CardFooter>
                    <p className="text-xs text-muted-foreground">La verificación del administrador es automática al cargar esta página. Si un usuario (propietario o admin) no tiene perfil al iniciar sesión, se le creará uno automáticamente.</p>
                </CardFooter>
            </Card>
        </div>
    );
}

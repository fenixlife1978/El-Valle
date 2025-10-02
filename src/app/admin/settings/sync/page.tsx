
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCheck, RefreshCw } from 'lucide-react';
import { ensureAdminProfile } from '@/lib/ensureAdminProfile';
import { cn } from "@/lib/utils";

export default function SyncProfilesPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [adminProfileExists, setAdminProfileExists] = useState(false);

    const checkAdminProfile = async () => {
        setLoading(true);
        try {
            const exists = await ensureAdminProfile(toast);
            setAdminProfileExists(exists);
        } catch (error) {
            console.error("Error checking admin profile:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo verificar el perfil del administrador.' });
        } finally {
            setLoading(false);
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
                <p className="text-muted-foreground">Asegura la existencia de perfiles críticos en la base de datos.</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Verificación de Perfil de Administrador</CardTitle>
                         <Button variant="outline" onClick={checkAdminProfile} disabled={loading}>
                            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                            Volver a Verificar
                        </Button>
                    </div>
                     <CardDescription>
                        Esta herramienta verifica que el perfil principal del administrador exista en la base de datos para el correcto funcionamiento del sistema.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center items-center h-40">
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
                </CardContent>
                <CardFooter>
                    <p className="text-xs text-muted-foreground">Esta operación es automática al cargar la página.</p>
                </CardFooter>
            </Card>
            
            <Card className="bg-muted/50">
                <CardHeader>
                    <CardTitle className="text-base">Nota Importante sobre la Implementación</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    <p>
                        Ya que no hay un sistema de autenticación activo, esta página se limita a verificar y/o crear el perfil del administrador del sistema.
                    </p>
                    <p className="mt-2">
                        Para una sincronización completa de múltiples usuarios, se necesitaría un sistema de autenticación y un entorno de servidor (como Cloud Functions) para listar y comparar todos los usuarios.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

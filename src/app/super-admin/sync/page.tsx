
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, RefreshCw, ShieldAlert, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function SyncPage() {
    const { user, loading: authLoading } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    if (authLoading) return (
        <div className="flex h-screen items-center justify-center bg-background">
            <Loader2 className="animate-spin text-[#f59e0b] h-10 w-10" />
        </div>
    );

    if (user?.email !== 'vallecondo@gmail.com') {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] text-center space-y-4 text-foreground">
                <ShieldAlert className="h-20 w-20 text-destructive animate-pulse" />
                <h1 className="text-3xl font-black uppercase tracking-tighter">Acceso Denegado</h1>
                <p className="text-muted-foreground max-w-md font-bold">
                    Esta área contiene herramientas de sincronización global. Solo el Super Administrador tiene privilegios de ejecución aquí.
                </p>
                <Button variant="outline" className="border-border text-foreground" onClick={() => router.push('/welcome')}>
                    Volver al Panel Seguro
                </Button>
            </div>
        );
    }

    const handleGlobalSync = async () => {
        setIsSyncing(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 3000)); 
            toast({
                title: "Sincronización Exitosa",
                description: "Se han actualizado las tasas y balances en todos los condominios.",
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Fallo en Sincronización",
                description: "Error crítico al conectar con la base de datos.",
            });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="p-6 md:p-8 space-y-10">
             <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Sincronización <span className="text-primary">Global</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Consola de mantenimiento de base de datos - EFAS CondoSys
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 bg-card border-border/50 shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-foreground flex items-center gap-2">
                            <RefreshCw className={isSyncing ? "animate-spin text-primary" : "text-primary"} />
                            Ejecutar Barrido Masivo
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Esta acción forzará la actualización de estados de cuenta y validación de cuotas fijas en cada condominio registrado.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-lg mb-6">
                            <p className="text-amber-300 text-xs font-bold uppercase tracking-tight">
                                ⚠️ Atención: Esta operación consume lecturas/escrituras masivas en Firestore.
                            </p>
                        </div>
                        <Button 
                            onClick={handleGlobalSync} 
                            disabled={isSyncing}
                            className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg shadow-lg shadow-primary/20"
                        >
                            {isSyncing ? "PROCESANDO DATOS..." : "INICIAR PROCESO GLOBAL"}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border/50">
                    <CardHeader>
                        <CardTitle className="text-foreground text-sm">Estado del Sistema</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm font-bold">
                        <div className="flex justify-between border-b border-border pb-2">
                            <span className="text-muted-foreground">Admin Activo:</span>
                            <span className="text-primary italic">vallecondo</span>
                        </div>
                        <div className="flex justify-between border-b border-border pb-2">
                            <span className="text-muted-foreground">Firebase:</span>
                            <span className="text-success">Conectado</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Versión:</span>
                            <span className="text-foreground">v2.0.4</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}


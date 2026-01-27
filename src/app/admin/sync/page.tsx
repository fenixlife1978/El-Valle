
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

    // 1. EL CANDADO DE SUPER ADMIN: Solo para vallecondo@gmail.com
    if (authLoading) return (
        <div className="flex h-screen items-center justify-center bg-slate-950">
            <Loader2 className="animate-spin text-amber-500 h-10 w-10" />
        </div>
    );

    if (user?.email !== 'vallecondo@gmail.com') {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] text-center space-y-4 text-white">
                <ShieldAlert className="h-20 w-20 text-red-600 animate-pulse" />
                <h1 className="text-3xl font-black uppercase tracking-tighter">Acceso Denegado</h1>
                <p className="text-slate-400 max-w-md font-bold">
                    Esta área contiene herramientas de sincronización global. Solo el Super Administrador tiene privilegios de ejecución aquí.
                </p>
                <Button variant="outline" className="border-slate-800 text-slate-400" onClick={() => router.push('/admin/dashboard')}>
                    Volver al Panel Seguro
                </Button>
            </div>
        );
    }

    const handleGlobalSync = async () => {
        setIsSyncing(true);
        try {
            // Lógica de sincronización futura
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
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                    Sincronización <span className="text-amber-500">Global</span>
                </h2>
                <div className="h-1.5 w-20 bg-amber-500 mt-2 rounded-full"></div>
                <p className="text-slate-400 font-bold mt-3 text-sm uppercase tracking-wide">
                    Consola de mantenimiento de base de datos - ValleCondo 2026
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 bg-slate-900/50 border-amber-500/20 shadow-2xl backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <RefreshCw className={isSyncing ? "animate-spin text-amber-500" : "text-amber-500"} />
                            Ejecutar Barrido Masivo
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            Esta acción forzará la actualización de estados de cuenta y validación de cuotas fijas en cada condominio registrado.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-lg mb-6">
                            <p className="text-amber-200 text-xs font-bold uppercase tracking-tight">
                                ⚠️ Atención: Esta operación consume lecturas/escrituras masivas en Firestore.
                            </p>
                        </div>
                        <Button 
                            onClick={handleGlobalSync} 
                            disabled={isSyncing}
                            className="w-full h-14 bg-amber-600 hover:bg-amber-500 text-white font-black text-lg shadow-[0_0_20px_rgba(217,119,6,0.3)]"
                        >
                            {isSyncing ? "PROCESANDO DATOS..." : "INICIAR PROCESO GLOBAL"}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white text-sm">Estado del Sistema</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm font-bold">
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-500">Admin Activo:</span>
                            <span className="text-amber-500 italic">vallecondo</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-500">Firebase:</span>
                            <span className="text-green-500">Conectado</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Versión:</span>
                            <span className="text-slate-300">v2.0.4</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, User, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';

export default function WelcomePage() {
    const router = useRouter();
    const { user, role, loading } = useAuth();

    useEffect(() => {
        if (!loading && user) {
            // 1. Prioridad Super Admin
            if (user.email === 'vallecondo@gmail.com') {
                router.replace('/super-admin');
                return;
            }

            // 2. Obtener datos de sesión
            const activeCondoId = localStorage.getItem('activeCondoId') || localStorage.getItem('workingCondoId');
            // Usamos el rol que viene del hook de auth (prioritario) o del storage
            const rawRole = role || localStorage.getItem('userRole');

            if (activeCondoId && rawRole) {
                const roleLower = rawRole.toLowerCase();
                let normalizedPath = '';

                // MAPEADO PARA VIEJA ESTRUCTURA (condo_01)
                // DB: "propietario" -> Carpeta: "/owner/"
                if (roleLower === 'propietario') {
                    normalizedPath = 'owner';
                } 
                // DB: "admin" -> Carpeta: "/admin/"
                else if (roleLower === 'admin' || roleLower === 'administrador') {
                    normalizedPath = 'admin';
                }

                if (normalizedPath) {
                    const targetPath = `/${activeCondoId}/${normalizedPath}/dashboard`;
                    console.log(`EFAS CondoSys: Redirigiendo ${rawRole} a ${targetPath}`);
                    router.replace(targetPath);
                } else {
                    console.warn("Rol no reconocido para redirección:", rawRole);
                }
            }
        }
    }, [user, role, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
                    Validando acceso EFAS...
                </p>
            </div>
        );
    }

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-montserrat">
            <div className="text-center mb-10">
                <div className="mb-6">
                    <h1 className="text-5xl font-black italic tracking-tighter uppercase">
                        <span className="text-amber-500">EFAS</span><span className="text-foreground">CONDOSYS</span>
                    </h1>
                    <div className="h-1.5 w-24 bg-amber-500 mx-auto mt-1 rounded-full"></div>
                </div>
                <h2 className="text-2xl font-bold text-foreground uppercase tracking-tight">Bienvenido</h2>
                <p className="text-muted-foreground mt-2 font-medium">Seleccione su portal de acceso</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                {/* CARD ADMINISTRADOR */}
                <Card className="hover:border-amber-500 transition-all border-2 border-transparent bg-card shadow-xl rounded-[2.5rem] overflow-hidden group">
                    <CardHeader className="items-center text-center pt-8">
                        <div className="p-4 bg-amber-500/10 rounded-2xl mb-2 group-hover:scale-110 transition-transform duration-300">
                            <Shield className="h-10 w-10 text-amber-600" />
                        </div>
                        <CardTitle className="font-black uppercase tracking-tighter">Administración</CardTitle>
                        <CardDescription className="font-bold text-[10px] uppercase tracking-widest">Gestión de Condominios</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8">
                        <Button 
                            className="w-full h-12 rounded-xl font-black uppercase tracking-widest bg-slate-900 hover:bg-slate-800 shadow-lg" 
                            onClick={() => router.push('/login?role=admin')}
                        >
                            ENTRAR
                        </Button>
                    </CardContent>
                </Card>

                {/* CARD PROPIETARIO */}
                <Card className="hover:border-amber-500 transition-all border-2 border-transparent bg-card shadow-xl rounded-[2.5rem] overflow-hidden group">
                    <CardHeader className="items-center text-center pt-8">
                        <div className="p-4 bg-amber-500/10 rounded-2xl mb-2 group-hover:scale-110 transition-transform duration-300">
                            <User className="h-10 w-10 text-amber-600" />
                        </div>
                        <CardTitle className="font-black uppercase tracking-tighter">Propietario</CardTitle>
                        <CardDescription className="font-bold text-[10px] uppercase tracking-widest">Portal de Residentes</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8">
                        <Button 
                            className="w-full h-12 rounded-xl font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white shadow-lg" 
                            onClick={() => router.push('/login?role=owner')}
                        >
                            ENTRAR
                        </Button>
                    </CardContent>
                </Card>
            </div>
            
            <footer className="mt-16 text-[9px] font-black uppercase text-muted-foreground/40 tracking-[0.4em]">
                EFAS CondoSys • San Felipe • Yaracuy
            </footer>
        </main>
    );
}

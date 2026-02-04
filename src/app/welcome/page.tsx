'use client';

import { useRouter } from 'next/navigation';
import { Shield, User, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import { SYSTEM_LOGO, COMPANY_NAME } from '@/lib/constants';

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
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
                    Validando acceso EFAS...
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full font-montserrat">
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center text-center">
                 <img src={SYSTEM_LOGO} alt={COMPANY_NAME} className="h-20 w-20 rounded-3xl object-cover border-4 border-background shadow-2xl mb-2" />
                 <h1 className="text-3xl font-black italic tracking-tighter uppercase">
                    <span className="text-primary">EFAS</span><span className="text-foreground">CONDOSYS</span>
                </h1>
                <p className="text-xs text-muted-foreground font-bold tracking-widest">Seleccione su portal</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 h-screen">
                <div 
                    onClick={() => router.push('/login?role=admin')}
                    className="relative bg-card text-foreground flex flex-col items-center justify-center p-12 text-center group cursor-pointer transition-all duration-300 hover:bg-slate-900"
                >
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/gplay.png')] opacity-[0.02] group-hover:opacity-[0.03]"></div>
                    <div className="z-10 flex flex-col items-center">
                        <div className="p-6 rounded-3xl border-2 border-border bg-background/30 group-hover:scale-110 group-hover:border-primary/50 transition-transform mb-8">
                            <Shield className="h-16 w-16 text-primary" />
                        </div>
                        <h2 className="text-4xl font-black uppercase tracking-tighter">Administrador</h2>
                        <p className="text-sm font-bold text-muted-foreground mt-2 uppercase tracking-widest">Gestión de Condominios</p>
                    </div>
                </div>
                 <div 
                    onClick={() => router.push('/login?role=owner')}
                    className="relative bg-secondary text-foreground flex flex-col items-center justify-center p-12 text-center group cursor-pointer transition-all duration-300 hover:bg-primary"
                >
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/gplay.png')] opacity-[0.03] group-hover:opacity-[0.05]"></div>
                     <div className="z-10 flex flex-col items-center">
                        <div className="p-6 rounded-3xl border-2 border-primary/50 bg-primary/20 group-hover:scale-110 group-hover:bg-white/10 group-hover:border-white transition-transform mb-8">
                            <User className="h-16 w-16 text-white" />
                        </div>
                        <h2 className="text-4xl font-black uppercase tracking-tighter text-white">Propietario</h2>
                        <p className="text-sm font-bold text-primary-foreground/70 mt-2 uppercase tracking-widest">Portal de Residentes</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
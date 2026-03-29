'use client';

import { useRouter } from 'next/navigation';
import { Shield, User, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useRef } from 'react';
import { SYSTEM_LOGO, COMPANY_NAME } from '@/lib/constants';

export default function WelcomePage() {
    const router = useRouter();
    const { user, role, loading, activeCondoId } = useAuth();
    const isRedirecting = useRef(false);

    useEffect(() => {
        // NO HACER NADA si el AuthProvider está trabajando o ya estamos redirigiendo
        if (loading || !user || isRedirecting.current) return;

        // Caso Super Admin
        if (user.email?.toLowerCase() === 'vallecondo@gmail.com') {
            isRedirecting.current = true;
            router.replace('/super-admin');
            return;
        }

        // Redirección basada en el ESTADO del Contexto, no solo del localStorage
        if (activeCondoId && role) {
            let pathSegment = '';
            const normalizedRole = role.toLowerCase();

            if (['admin', 'administrador', 'junta'].includes(normalizedRole)) {
                pathSegment = 'admin';
            } else if (['owner', 'propietario', 'residente'].includes(normalizedRole)) {
                pathSegment = 'owner';
            }

            if (pathSegment) {
                isRedirecting.current = true;
                router.replace(`/${activeCondoId}/${pathSegment}/dashboard`);
            }
        }
        // Si hay usuario pero no hay activeCondoId o role, nos quedamos aquí para que elija.
    }, [user, role, loading, activeCondoId, router]);

    // Pantalla de carga mientras se sincroniza el estado
    if (loading || (user && isRedirecting.current)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
                <Loader2 className="h-10 w-10 animate-spin text-[#F28705] mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 animate-pulse">
                    Verificando Acceso EFAS...
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full font-montserrat bg-background">
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center text-center w-full">
                 <img src={SYSTEM_LOGO} alt={COMPANY_NAME} className="h-20 w-20 rounded-3xl object-cover border-4 border-background shadow-2xl mb-2" />
                 <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter uppercase">
                    <span className="text-[#F28705]">EFAS</span><span className="text-foreground">CONDOSYS</span>
                </h1>
                <p className="text-xs text-muted-foreground font-bold tracking-widest uppercase">Seleccione su portal</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 h-screen">
                <div 
                    onClick={() => router.push('/login?role=admin')}
                    className="relative bg-card text-foreground flex flex-col items-center justify-center p-12 text-center group cursor-pointer transition-all duration-300 hover:bg-slate-900"
                >
                    <div className="z-10 flex flex-col items-center">
                        <div className="p-6 rounded-3xl border-2 border-border bg-background/30 group-hover:scale-110 group-hover:border-[#F28705]/50 transition-transform mb-8">
                            <Shield className="h-12 w-12 text-[#F28705]" />
                        </div>
                        <h2 className="text-3xl font-black uppercase italic">Administrador</h2>
                        <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-widest font-bold">Gestión y Finanzas</p>
                    </div>
                </div>

                <div 
                    onClick={() => router.push('/login?role=owner')}
                    className="relative bg-secondary text-foreground flex flex-col items-center justify-center p-12 text-center group cursor-pointer transition-all duration-300 hover:bg-[#F28705]"
                >
                    <div className="z-10 flex flex-col items-center">
                        <div className="p-6 rounded-3xl border-2 border-white/20 bg-white/10 group-hover:scale-110 group-hover:bg-white/20 transition-transform mb-8">
                            <User className="h-12 w-12 text-white" />
                        </div>
                        <h2 className="text-3xl font-black uppercase italic text-white">Propietario</h2>
                        <p className="text-[10px] text-white/60 mt-2 uppercase tracking-widest font-bold">Pagos y Consultas</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

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
        // Si no hay datos suficientes o ya estamos redirigiendo, abortamos
        if (loading || !user || isRedirecting.current) return;

        const handleNavigation = () => {
            // 1. Caso Super Admin
            if (user.email === 'vallecondo@gmail.com') {
                isRedirecting.current = true;
                router.replace('/super-admin');
                return;
            }

            // 2. Obtener ID del condominio
            const condoId = activeCondoId || localStorage.getItem('activeCondoId');
            
            if (condoId && role) {
                let pathSegment = '';
                // Normalizamos el rol para la ruta
                if (role === 'admin' || role === 'administrador') pathSegment = 'admin';
                else if (role === 'owner' || role === 'propietario') pathSegment = 'owner';

                if (pathSegment) {
                    isRedirecting.current = true;
                    const targetPath = `/${condoId}/${pathSegment}/dashboard`;
                    
                    // USAMOS TIMEOUT para evitar el error de "Failed to fetch" 
                    // permitiendo que Next.js termine de procesar el estado actual.
                    setTimeout(() => {
                        router.replace(targetPath);
                    }, 10);
                }
            }
        };

        handleNavigation();
    }, [user, role, loading, activeCondoId, router]);

    // UI DE CARGA
    if (loading || (user && isRedirecting.current)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
                <Loader2 className="h-10 w-10 animate-spin text-[#F28705] mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
                    Sincronizando EFAS CondoSys...
                </p>
            </div>
        );
    }

    return (
        // ... (Tu código de botones de Administrador / Propietario se mantiene igual)
        <div className="min-h-screen w-full font-montserrat bg-background">
             {/* Render normal del componente */}
        </div>
    );
}

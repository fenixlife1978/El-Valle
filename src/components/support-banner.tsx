'use client';

import { useAuth } from '@/hooks/use-auth';
import { ShieldAlert, LogOut } from 'lucide-react';

export function SupportBanner() {
    const { isSuperAdmin, activeCondoId } = useAuth();
    
    // Verificamos el storage directamente para el renderizado inicial
    const isImpersonating = typeof window !== 'undefined' && localStorage.getItem('support_condo_id');

    if (!isSuperAdmin || !isImpersonating) return null;

    const handleExit = () => {
        localStorage.removeItem('support_condo_id');
        window.location.href = '/super-admin';
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-[120] bg-[#f59e0b] text-slate-900 shadow-xl border-b border-black/10 animate-in slide-in-from-top duration-300">
            <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-between font-montserrat">
                <div className="flex items-center gap-2">
                    <div className="bg-slate-900 p-1 rounded">
                        <ShieldAlert className="h-3 w-3 text-white animate-pulse" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-tighter">
                        Modo Soporte Activo: <span className="bg-white/30 px-2 py-0.5 rounded ml-1 font-mono">{activeCondoId}</span>
                    </span>
                </div>
                <button 
                    onClick={handleExit}
                    className="flex items-center gap-1 bg-slate-900 hover:bg-black text-white px-4 py-1 rounded-full text-[9px] font-black transition-all shadow-lg"
                >
                    <LogOut className="h-3 w-3" />
                    FINALIZAR SESIÓN DE SOPORTE
                </button>
            </div>
        </div>
    );
}
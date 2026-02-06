'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { db, auth } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Building2, Loader2, Power } from 'lucide-react';

export default function Header() {
    const params = useParams();
    const router = useRouter();
    const { user, activeCondoId, companyInfo: authCompanyInfo, loading: authLoading } = useAuth();
    
    const [tasaBCV, setTasaBCV] = useState<number | string>("---");
    const [supportInfo, setSupportInfo] = useState<any>(null);

    const urlCondoId = params?.condoId as string;
    const sId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
    const isSuperAdmin = user?.email === 'vallecondo@gmail.com';
    
    const workingCondoId = urlCondoId || (isSuperAdmin ? sId : activeCondoId);
    const isSupportMode = !!(isSuperAdmin && (sId || urlCondoId));

    useEffect(() => {
        if (!workingCondoId) return;

        if (isSupportMode || urlCondoId) {
            getDoc(doc(db, 'condominios', workingCondoId)).then(docSnap => {
                if (docSnap.exists()) setSupportInfo(docSnap.data());
            });
        }

        const settingsRef = doc(db, 'condominios', workingCondoId, 'config', 'mainSettings');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (Array.isArray(data.exchangeRates)) {
                    const rateActive = data.exchangeRates.find((r: any) => r.active === true);
                    if (rateActive) {
                        const valor = rateActive.rate || rateActive.value || rateActive.monto;
                        setTasaBCV(typeof valor === 'number' 
                            ? valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : valor
                        );
                    }
                }
            }
        });
        return () => unsubscribe();
    }, [workingCondoId, isSupportMode, urlCondoId]);

    const info = isSupportMode ? (supportInfo || authCompanyInfo) : authCompanyInfo;

    // LÓGICA DE SALIDA DIFERENCIADA
    const handleExit = async () => {
        if (isSupportMode && isSuperAdmin) {
            localStorage.removeItem('support_mode_id');
            router.push('/super-admin');
        } else {
            try {
                await signOut(auth);
                localStorage.removeItem('activeCondoId');
                localStorage.removeItem('workingCondoId');
                localStorage.removeItem('userRole');
                router.push('/');
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
            }
        }
    };

    return (
        <header className="sticky top-4 z-40 mx-4 flex h-16 md:h-20 items-center justify-between gap-4 rounded-2xl border bg-[#1A1D23]/90 px-4 md:px-6 shadow-xl backdrop-blur-md text-white">
            <div className="flex items-center gap-4">
                <div className="relative flex h-10 w-10 md:h-14 md:w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-white shadow-lg">
                    {info?.logo ? (
                        <img src={info.logo} alt="Logo" className="h-full w-full object-cover" />
                    ) : (
                        <Building2 className="h-7 w-7 text-slate-400" />
                    )}
                </div>
                
                <div className="flex flex-col">
                    <h1 className="text-lg md:text-xl font-black uppercase tracking-tighter text-[#4A90E2] leading-tight">
                        {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (info?.name || info?.nombre || "Cargando...")}
                    </h1>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 opacity-80">
                        {info?.rif ? `RIF: ${info.rif}` : `ID: ${workingCondoId}`}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-8">
                <div className="hidden lg:flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white overflow-hidden shadow-md border border-white/10">
                        <img src="/logo-bcv.png" alt="BCV" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex flex-col leading-none">
                        <span className="text-[10px] font-black uppercase text-[#4CAF50] tracking-widest mb-0.5">Tasa Oficial BCV</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black tabular-nums tracking-tighter">{tasaBCV}</span>
                            <span className="text-xs font-bold text-slate-400 uppercase">VES</span>
                        </div>
                    </div>
                </div>

                {/* Botón Circular Rojo - Acción según rol */}
                <button 
                    onClick={handleExit}
                    title={isSupportMode ? "Finalizar Soporte" : "Cerrar Sesión"}
                    className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full border-2 border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-lg shadow-red-500/20 active:scale-90"
                >
                    <Power className="h-5 w-5 md:h-6 md:w-6 stroke-[3px]" />
                </button>
            </div>
        </header>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

export default function Header() {
    const { companyInfo: authCompanyInfo, loading: authLoading, activeCondoId: authCondoId, user } = useAuth();
    
    const [supportInfo, setSupportInfo] = useState<any>(null);
    const [isSupport, setIsSupport] = useState(false);
    const [loadingSupport, setLoadingSupport] = useState(false);
    const [tasaBCV, setTasaBCV] = useState<number | string>("---");

    useEffect(() => {
        const sId = localStorage.getItem('support_mode_id');
        const isSuperAdmin = user?.email === 'vallecondo@gmail.com';
        const currentId = (sId && isSuperAdmin) ? sId : authCondoId;

        if (sId && isSuperAdmin) {
            setIsSupport(true);
            setLoadingSupport(true);
            getDoc(doc(db, 'condominios', sId)).then(docSnap => {
                if (docSnap.exists()) {
                    const d = docSnap.data();
                    setSupportInfo({
                        name: d.name || d.nombre,
                        rif: d.rif,
                        logo: d.logo
                    });
                }
                setLoadingSupport(false);
            });
        } else {
            setIsSupport(false);
            setSupportInfo(null);
        }

        if (currentId) {
            const settingsRef = doc(db, 'condominios', currentId, 'config', 'mainSettings');
            
            const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (Array.isArray(data.exchangeRates)) {
                        const rateActive = data.exchangeRates.find((r: any) => r.active === true);
                        
                        if (rateActive) {
                            const valor = rateActive.rate || rateActive.value || rateActive.monto;
                            const formatted = typeof valor === 'number' 
                                ? valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                                : valor;
                            setTasaBCV(formatted);
                        } else {
                            setTasaBCV("---");
                        }
                    }
                }
            }, (error) => {
                console.error("Error en tiempo real (Tasa):", error);
                setTasaBCV("Error");
            });

            return () => unsubscribe();
        }
    }, [user, authCondoId]);

    const info = isSupport ? supportInfo : authCompanyInfo;
    const isLoading = isSupport ? loadingSupport : authLoading;
    const cId = isSupport ? localStorage.getItem('support_mode_id') : authCondoId;

    return (
        <header className="bg-card text-card-foreground p-4 shadow-sm border-b border-border sticky top-[6px] z-50 mx-4 mt-2 rounded-2xl">
            <div className="container mx-auto flex items-center justify-between">
                
                <div className="flex items-center gap-4">
                    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-background border border-border flex items-center justify-center shadow-inner">
                        {info?.logo ? (
                            <img src={info.logo} alt="Logo" className="object-cover w-full h-full" />
                        ) : (
                            <span className="text-[8px] font-black text-muted-foreground uppercase text-center leading-tight">Sin<br/>Logo</span>
                        )}
                    </div>

                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-black uppercase tracking-tight leading-tight text-primary">
                                {isLoading ? "Cargando..." : (info?.name || info?.nombre || "No identificado")}
                            </h1>
                        </div>
                        <p className="text-[10px] font-bold text-muted-foreground tracking-[0.2em] uppercase">
                            {info?.rif ? `RIF: ${info.rif}` : (cId ? `ID: ${cId}` : "Sin Identificación")}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 border-r border-border pr-6">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-border bg-background flex-shrink-0 shadow-lg">
                            <img 
                                src="/logo-bcv.png" 
                                alt="BCV" 
                                className="w-full h-full object-contain p-0.5"
                            />
                        </div>
                        
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase tracking-widest text-green-500">Tasa Oficial BCV</span>
                            <div className="text-xl font-black italic text-foreground tracking-tighter leading-none flex items-baseline gap-1">
                                {tasaBCV} <span className="text-[10px] text-muted-foreground not-italic font-bold">VES</span>
                            </div>
                        </div>
                    </div>

                    {isSupport && (
                        <button 
                            onClick={() => {
                                localStorage.removeItem('support_mode_id');
                                window.location.href = '/super-admin';
                            }} 
                            className="text-[9px] bg-red-100 hover:bg-red-200 px-4 py-2 rounded-lg font-black border border-red-200 transition-all uppercase italic tracking-tighter text-red-700"
                        >
                            Finalizar Soporte
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}

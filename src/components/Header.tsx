'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function Header() {
    const { companyInfo: authCompanyInfo, loading: authLoading, activeCondoId: authCondoId, user } = useAuth();
    
    const [supportInfo, setSupportInfo] = useState<any>(null);
    const [isSupport, setIsSupport] = useState(false);
    const [loadingSupport, setLoadingSupport] = useState(false);
    const [tasaBCV, setTasaBCV] = useState<number | string>("---");

    useEffect(() => {
        const loadData = async () => {
            // Identificar si estamos usando el ID de un cliente (Soporte) o el propio (Admin normal)
            const sId = localStorage.getItem('support_mode_id');
            const currentId = (sId && user?.email === 'vallecondo@gmail.com') ? sId : authCondoId;

            // 1. CARGAR INFORMACIÓN DE CABECERA (LOGO / NOMBRE / RIF)
            if (sId && user?.email === 'vallecondo@gmail.com') {
                setIsSupport(true);
                setLoadingSupport(true);
                try {
                    const docSnap = await getDoc(doc(db, 'condominios', sId));
                    if (docSnap.exists()) {
                        const d = docSnap.data();
                        setSupportInfo({
                            name: d.name || d.nombre,
                            rif: d.rif,
                            logo: d.logo
                        });
                    }
                } catch (e) { 
                    console.error("Error cargando datos de soporte:", e); 
                } finally { 
                    setLoadingSupport(false); 
                }
            } else {
                setIsSupport(false);
                setSupportInfo(null);
            }

            // 2. CARGAR TASA ACTIVA DESDE config/mainSettings -> exchangeRates (ARRAY)
            if (currentId) {
                try {
                    const settingsRef = doc(db, 'condominios', currentId, 'config', 'mainSettings');
                    const settingsSnap = await getDoc(settingsRef);
                    
                    if (settingsSnap.exists()) {
                        const data = settingsSnap.data();
                        
                        if (Array.isArray(data.exchangeRates)) {
                            // Buscamos el objeto dentro del array que esté marcado como activo
                            const rateActive = data.exchangeRates.find((r: any) => 
                                r.active === true || 
                                r.status === 'active' || 
                                r.isDefault === true
                            );
                            
                            if (rateActive) {
                                // Intentamos obtener el valor de los campos más comunes
                                const valor = rateActive.rate || rateActive.value || rateActive.monto;
                                setTasaBCV(valor || "---");
                            } else {
                                setTasaBCV("---");
                            }
                        }
                    } else {
                        setTasaBCV("---");
                    }
                } catch (e) {
                    console.error("Error cargando exchangeRates:", e);
                    setTasaBCV("---");
                }
            }
        };

        loadData();
    }, [user, authCondoId]);

    // Selección de qué información mostrar según el modo
    const info = isSupport ? supportInfo : authCompanyInfo;
    const isLoading = isSupport ? loadingSupport : authLoading;
    const cId = isSupport ? localStorage.getItem('support_mode_id') : authCondoId;

    return (
        <header className="bg-[#020617] text-white p-4 shadow-md border-b border-slate-800">
            <div className="container mx-auto flex items-center justify-between">
                
                {/* LADO IZQUIERDO: LOGO Y DATOS DEL CONDOMINIO */}
                <div className="flex items-center gap-4">
                    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center">
                        {info?.logo ? (
                            <img src={info.logo} alt="Logo" className="object-cover w-full h-full" />
                        ) : (
                            <span className="text-[8px] font-black text-slate-500 uppercase text-center">Sin Logo</span>
                        )}
                    </div>

                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-black uppercase tracking-tight leading-tight text-[#0081c9]">
                                {isLoading ? "Cargando..." : (info?.name || info?.nombre || "No identificado")}
                            </h1>
                            {isSupport && (
                                <span className="bg-orange-600 text-[7px] px-1.5 py-0.5 rounded font-black animate-pulse text-white uppercase">
                                    Modo Soporte
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">
                            {info?.rif ? `RIF: ${info.rif}` : (cId ? `ID: ${cId}` : "Sin Identificación")}
                        </p>
                    </div>
                </div>

                {/* LADO DERECHO: TASA BCV Y ACCIONES */}
                <div className="flex items-center gap-6">
                    
                    {/* CONTENEDOR TASA BCV DINÁMICA */}
                    <div className="flex items-center gap-3 border-r border-slate-700 pr-6">
                        {/* LOGO BCV REDONDO DESDE PUBLIC */}
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-600 bg-white flex-shrink-0 shadow-inner">
                            <img 
                                src="/logo-bcv.png" 
                                alt="BCV" 
                                className="w-full h-full object-cover"
                            />
                        </div>
                        
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Tasa Oficial BCV</span>
                            <div className="text-xl font-black italic text-white tracking-tighter leading-none">
                                {tasaBCV} <span className="text-[10px] text-slate-500 not-italic ml-1 font-bold tracking-normal">VES</span>
                            </div>
                        </div>
                    </div>

                    {/* BOTÓN PARA CERRAR SOPORTE (Solo Super Admin) */}
                    {isSupport && (
                        <button 
                            onClick={() => {
                                localStorage.removeItem('support_mode_id');
                                window.location.href = '/super-admin';
                            }} 
                            className="text-[9px] bg-red-900/40 hover:bg-red-900 px-4 py-2 rounded-lg font-black border border-red-800 transition-all uppercase italic tracking-tighter"
                        >
                            Finalizar Soporte
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}

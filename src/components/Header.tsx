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
        // 1. DETERMINAR ID DEL CONDOMINIO (NORMAL O SOPORTE)
        const sId = localStorage.getItem('support_mode_id');
        const isSuperAdmin = user?.email === 'vallecondo@gmail.com';
        const currentId = (sId && isSuperAdmin) ? sId : authCondoId;

        // 2. CARGAR INFORMACIÓN DE CABECERA (LOGO / NOMBRE)
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

        // 3. ESCUCHADOR EN TIEMPO REAL PARA LA TASA (onSnapshot)
        if (currentId) {
            const settingsRef = doc(db, 'condominios', currentId, 'config', 'mainSettings');
            
            // onSnapshot mantiene la conexión abierta y se activa ante cualquier cambio
            const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (Array.isArray(data.exchangeRates)) {
                        const rateActive = data.exchangeRates.find((r: any) => r.active === true);
                        
                        if (rateActive) {
                            const valor = rateActive.rate || rateActive.value || rateActive.monto;
                            // Formateo numérico para asegurar decimales
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

            // Limpiar el escuchador cuando el componente se desmonte
            return () => unsubscribe();
        }
    }, [user, authCondoId]);

    const info = isSupport ? supportInfo : authCompanyInfo;
    const isLoading = isSupport ? loadingSupport : authLoading;
    const cId = isSupport ? localStorage.getItem('support_mode_id') : authCondoId;

    return (
        <header className="bg-[#020617] text-white p-4 shadow-md border-b border-slate-800">
            <div className="container mx-auto flex items-center justify-between">
                
                {/* LADO IZQUIERDO: LOGO Y DATOS */}
                <div className="flex items-center gap-4">
                    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shadow-inner">
                        {info?.logo ? (
                            <img src={info.logo} alt="Logo" className="object-cover w-full h-full" />
                        ) : (
                            <span className="text-[8px] font-black text-slate-500 uppercase text-center leading-tight">Sin<br/>Logo</span>
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

                {/* LADO DERECHO: TASA BCV */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 border-r border-slate-700 pr-6">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-600 bg-white flex-shrink-0 shadow-lg">
                            <img 
                                src="/logo-bcv.png" 
                                alt="BCV" 
                                className="w-full h-full object-contain p-0.5"
                            />
                        </div>
                        
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Tasa Oficial BCV</span>
                            <div className="text-xl font-black italic text-white tracking-tighter leading-none flex items-baseline gap-1">
                                {tasaBCV} <span className="text-[10px] text-slate-500 not-italic font-bold">VES</span>
                            </div>
                        </div>
                    </div>

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

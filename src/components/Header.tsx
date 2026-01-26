'use client';

import { useAuth } from '@/hooks/use-auth';
import Image from 'next/image';

export default function Header() {
    const { companyInfo, loading } = useAuth();

    // Mientras carga, podemos mostrar un esqueleto o nada
    if (loading) return <div className="h-16 bg-[#020617] animate-pulse" />;

    return (
        <header className="bg-[#020617] text-white p-4 shadow-md border-b border-slate-800">
            <div className="container mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* FLECHA ROJA: Logo de la empresa */}
                    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center">
                        {companyInfo?.logo ? (
                            <img 
                                src={companyInfo.logo} 
                                alt="Logo Condominio" 
                                className="object-cover w-full h-full"
                            />
                        ) : (
                            <span className="text-[10px] font-bold text-slate-500">LOGO</span>
                        )}
                    </div>

                    {/* FLECHA AMARILLA: Nombre y RIF */}
                    <div className="flex flex-col">
                        <h1 className="text-lg font-black uppercase tracking-tight leading-tight text-[#0081c9]">
                            {companyInfo?.name || "EFAS CONDOSYS"}
                        </h1>
                        {companyInfo?.rif && (
                            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">
                                RIF: {companyInfo.rif}
                            </p>
                        )}
                    </div>
                </div>

                {/* Sección Derecha: Tasa BCV (si la tienes implementada) */}
                <div className="hidden md:flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-2xl border border-slate-800">
                     <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Tasa Referencial</span>
                        <span className="text-sm font-black text-white">Bs. 0,00</span>
                     </div>
                     <div className="w-8 h-8 rounded-full bg-[#f59e0b] flex items-center justify-center shadow-lg shadow-amber-900/20">
                        <span className="text-[10px] font-black text-[#020617]">BCV</span>
                     </div>
                </div>
            </div>
        </header>
    );
}

'use client';

import React from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';

export default function Header() {
    const { ownerData } = useAuth();

    return (
        <header className="bg-[#020617] border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-[50]">
            {/* IZQUIERDA: IDENTIDAD DEL SISTEMA (SIEMPRE FIJO) */}
            <div className="flex items-center gap-3">
                <div className="bg-white p-1 rounded-lg">
                    {/* Reemplaza con la ruta real de tu logo de marca */}
                    <Image src="/logo-efas.png" alt="EFAS Logo" width={32} height={32} />
                </div>
                <div className="flex flex-col">
                    <h1 className="text-xl font-black italic tracking-tighter leading-none">
                        <span className="text-[#f59e0b]">EFAS</span>
                        <span className="text-[#0081c9]"> CondoSys</span>
                    </h1>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                        Sistema de Autogestión de Condominios
                    </p>
                </div>
            </div>

            {/* DERECHA: IDENTIDAD DEL CONDOMINIO GESTIONADO */}
            {ownerData && (
                <div className="flex items-center gap-4 bg-slate-900/50 px-4 py-1.5 rounded-2xl border border-slate-800">
                    <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-black text-white uppercase leading-none truncate max-w-[150px]">
                            {ownerData.name}
                        </p>
                        <p className="text-[9px] font-bold text-[#0081c9] mt-0.5">
                            {ownerData.rif || 'J-00000000-0'}
                        </p>
                    </div>
                    {ownerData.logoUrl && (
                        <div className="h-8 w-8 rounded-full overflow-hidden border border-slate-700 bg-white">
                            <Image 
                                src={ownerData.logoUrl} 
                                alt="Condo Logo" 
                                width={32} 
                                height={32} 
                                className="object-contain"
                            />
                        </div>
                    )}
                </div>
            )}
        </header>
    );
}

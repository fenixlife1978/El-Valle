'use client';

import React from 'react';
import NextImage from 'next/image';
import { useAuth } from '@/hooks/use-auth';

export default function Header() {
    const { ownerData } = useAuth();

    // LÓGICA PARA LEER EL ARRAY DE LA CAPTURA:
    // 1. Verificamos si existe exchangeRates
    // 2. Verificamos si es un array y tiene al menos un elemento
    // 3. Extraemos el campo 'rate' del primer objeto [0]
    const getRate = () => {
        if (
            ownerData?.exchangeRates && 
            Array.isArray(ownerData.exchangeRates) && 
            ownerData.exchangeRates.length > 0
        ) {
            return ownerData.exchangeRates[0].rate || 0;
        }
        return 0;
    };

    const currentRate = getRate();

    return (
        <header className="bg-[#020617] border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-[100] h-20 shadow-2xl">
            
            {/* IZQUIERDA: MARCA EFAS CONDOSYS */}
            <div className="flex items-center gap-3 shrink-0">
                <div className="bg-white p-1.5 rounded-xl shadow-lg shadow-sky-500/10">
                    <NextImage 
                        src="/logo-efas.png" 
                        alt="EFAS Logo" 
                        width={28} 
                        height={28} 
                        priority 
                    />
                </div>
                <div className="flex flex-col">
                    <h1 className="text-xl font-black italic tracking-tighter leading-none">
                        <span className="text-[#f59e0b]">EFAS</span>
                        <span className="text-[#0081c9]"> CondoSys</span>
                    </h1>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mt-0.5">
                        Autogestion de Condominios
                    </p>
                </div>
            </div>

            {/* CENTRO: MÓDULO TASA BCV CIRCULAR */}
            <div className="hidden md:flex items-center gap-3 bg-slate-900/60 border border-slate-700 px-4 py-1.5 rounded-full">
                {/* Logo BCV en contenedor redondo perfecto */}
                <div className="h-7 w-7 bg-white rounded-full flex items-center justify-center overflow-hidden border border-slate-300 shrink-0">
                    <NextImage 
                        src="/logo-bcv.png" 
                        alt="BCV" 
                        width={22} 
                        height={22} 
                        className="object-contain"
                    />
                </div>
                
                <div className="flex flex-col leading-tight">
                    <span className="text-[7px] font-black text-[#f59e0b] uppercase tracking-[0.15em]">
                        Tasa Referencial
                    </span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-[10px] font-bold text-slate-500">Bs.</span>
                        <span className="text-sm font-black text-white tracking-tight">
                            {currentRate > 0 ? currentRate.toLocaleString('de-DE', { minimumFractionDigits: 2 }) : '0,00'}
                        </span>
                    </div>
                </div>
                <div className="ml-1 w-1.5 h-1.5 bg-[#0081c9] rounded-full animate-pulse"></div>
            </div>

            {/* DERECHA: IDENTIDAD DEL CONDOMINIO */}
            {ownerData && (
                <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 p-2 rounded-2xl max-w-[250px]">
                    <div className="text-right hidden sm:block overflow-hidden">
                        <p className="text-[10px] font-black text-white uppercase italic leading-none truncate">
                            {ownerData.name}
                        </p>
                        <p className="text-[8px] font-bold text-[#0081c9] uppercase mt-1 tracking-wider">
                            {ownerData.rif}
                        </p>
                    </div>
                    
                    {ownerData.logoUrl && (
                        <div className="h-9 w-9 rounded-xl overflow-hidden bg-white border border-[#0081c9]/40 flex items-center justify-center p-0.5 shrink-0 shadow-sm">
                            <NextImage 
                                src={ownerData.logoUrl} 
                                alt="Logo Condominio" 
                                width={36} 
                                height={36} 
                                className="object-contain"
                            />
                        </div>
                    )}
                </div>
            )}
        </header>
    );
}

'use client';

import { useAuth } from '@/hooks/use-auth';

export default function Header() {
    const { companyInfo, loading, activeCondoId } = useAuth();

    return (
        <header className="bg-[#020617] text-white p-4 shadow-md border-b border-slate-800">
            <div className="container mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* LOGO */}
                    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center">
                        {companyInfo?.logo ? (
                            <img src={companyInfo.logo} alt="Logo" className="object-cover w-full h-full" />
                        ) : (
                            <span className="text-[8px] font-black text-slate-500 uppercase">Logo</span>
                        )}
                    </div>

                    {/* NOMBRE Y RIF */}
                    <div className="flex flex-col">
                        <h1 className="text-lg font-black uppercase tracking-tight leading-tight text-[#0081c9]">
                            {loading ? "Cargando..." : (companyInfo?.name || "No identificado")}
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">
                            {companyInfo?.rif ? `RIF: ${companyInfo.rif}` : (activeCondoId ? `ID: ${activeCondoId}` : "Sin ID")}
                        </p>
                    </div>
                </div>
            </div>
        </header>
    );
}

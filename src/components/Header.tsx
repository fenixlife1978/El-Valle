'use client';

import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Globe, LogOut, Building2 } from 'lucide-center';
import { Globe as GlobeIcon, LogOut as LogoutIcon, Building2 as BuildingIcon } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';

export default function Header() {
  const { ownerData } = useAuth();
  const [config, setConfig] = useState<{
    logo?: string;
    name?: string;
    rif?: string;
    tasa?: number;
  }>({});

  useEffect(() => {
    const condoId = ownerData?.condominioId || 'condo_01';

    const unsubPadre = onSnapshot(doc(db, 'condominios', condoId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setConfig(prev => ({
          ...prev,
          name: data.nombre || data.name || prev.name,
          rif: data.rif || data.RIF || prev.rif,
          logo: data.logo || data.logoUrl || prev.logo
        }));
      }
    });

    const unsubSettings = onSnapshot(doc(db, 'condominios', condoId, 'config', 'settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const activeRate = (data.exchangeRates || []).find((r: any) => r.active === true);
        setConfig(prev => ({
          ...prev,
          tasa: activeRate?.rate || prev.tasa,
          name: prev.name || data.name || data.nombre,
          rif: prev.rif || data.rif || data.RIF,
          logo: prev.logo || data.logo
        }));
      }
    });

    return () => { unsubPadre(); unsubSettings(); };
  }, [ownerData]);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/login';
  };

  return (
    <header className="w-full bg-[#020617] border-b border-slate-800 h-20 flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#006241] overflow-hidden bg-slate-900 flex-shrink-0 relative flex items-center justify-center shadow-lg">
          {config.logo ? (
            <Image src={config.logo} alt="Logo" fill className="object-cover" unoptimized />
          ) : (
            <BuildingIcon className="w-6 h-6 text-slate-700" />
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <h1 className="text-slate-100 font-black tracking-tighter text-sm sm:text-lg leading-tight uppercase truncate">
            {config.name || 'Cargando...'}
          </h1>
          <p className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase">
            {config.rif || 'RIF: Pendiente'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="bg-slate-900/40 border border-slate-800 px-4 py-1.5 rounded-xl flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-1">
              <GlobeIcon className="w-3 h-3 text-[#006241]" /> TASA BCV
            </span>
            <span className="text-lg font-black text-slate-200 tabular-nums">
              Bs. {config.tasa ? config.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '0,00'}
            </span>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-red-500 transition-colors">
          <LogoutIcon className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
}

// src/components/Header.tsx
export default function Header() {
  const { ownerData } = useAuth();

  return (
      <header className="bg-[#020617] border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-[100]">
          {/* IZQUIERDA: MARCA FIJA (Nunca cambia) */}
          <div className="flex items-center gap-3">
              <div className="bg-white p-1.5 rounded-xl shadow-lg shadow-sky-500/20">
                  <Image src="/logo-efas.png" alt="EFAS" width={32} height={32} />
              </div>
              <div className="flex flex-col">
                  <h1 className="text-2xl font-black italic tracking-tighter leading-none">
                      <span className="text-[#f59e0b]">EFAS</span>
                      <span className="text-[#0081c9]"> CondoSys</span>
                  </h1>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
                      Sistema de Autogestión
                  </p>
              </div>
          </div>

          {/* DERECHA: CONDOMINIO ACTUAL (Contexto) */}
          {ownerData && (
              <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-700 p-2 rounded-2xl">
                  <div className="text-right hidden md:block">
                      <p className="text-[11px] font-black text-white uppercase italic leading-none">
                          {ownerData.name}
                      </p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                          Panel Administrativo
                      </p>
                  </div>
                  {ownerData.logoUrl && (
                      <div className="h-10 w-10 rounded-xl overflow-hidden bg-white border-2 border-[#0081c9]">
                          <Image src={ownerData.logoUrl} alt="Condominio" width={40} height={40} className="object-contain" />
                      </div>
                  )}
              </div>
          )}
      </header>
  );
}

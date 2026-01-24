'use client';

import Link from 'next/link';
import { 
  ShieldCheck, 
  Wallet, 
  LayoutDashboard, 
  ArrowRight
} from 'lucide-react';

export default function WelcomePage() {
  const modules = [
    {
      title: "Cobranza Multidivisa",
      desc: "Gestión automática basada en tasas oficiales para una contabilidad transparente y sin errores.",
      icon: <Wallet className="w-8 h-8 text-[#0081c9]" />,
      bgColor: "bg-[#f0f9ff]"
    },
    {
      title: "Panel Inteligente",
      desc: "Visualización clara de gastos, fondos de reserva y estados de cuenta en tiempo real.",
      icon: <LayoutDashboard className="w-8 h-8 text-[#f59e0b]" />,
      bgColor: "bg-[#fffbeb]"
    },
    {
      title: "Seguridad y Respaldo",
      desc: "Toda la información protegida y disponible para auditorías en cualquier momento.",
      icon: <ShieldCheck className="w-8 h-8 text-[#0081c9]" />,
      bgColor: "bg-[#f0f9ff]"
    }
  ];

  return (
    <div className="min-h-screen bg-white text-[#0f172a] selection:bg-[#0081c9]/20">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,900;1,900&family=Inter:wght@400;500;600&display=swap');
        .font-montserrat { font-family: 'Montserrat', sans-serif; }
        .font-inter { font-family: 'Inter', sans-serif; }
      `}</style>

      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="border border-slate-200 p-1 rounded-lg shadow-sm bg-white">
              <img src="/og-banner.png" alt="EFAS Logo" className="w-10 h-10 object-contain" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-montserrat text-2xl font-black italic tracking-tighter leading-none">
                <span className="text-[#f59e0b]">EFAS</span><span className="text-[#0081c9]">CondoSys</span>
              </h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                Autogestión de Condominios
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-6 md:gap-10">
            <Link href="/login-propietario" className="text-sm font-bold text-slate-600 hover:text-[#0081c9] transition-colors">
              Propietarios
            </Link>
            <Link href="/login" className="bg-[#0081c9] hover:bg-[#006da8] text-white px-7 py-2.5 rounded-full text-[11px] font-black tracking-widest uppercase transition-all shadow-lg shadow-blue-500/20">
              Acceso Admin
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main className="max-w-7xl mx-auto px-6 pt-16 pb-24">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-5 py-2 mb-10 rounded-full bg-[#fffbeb] border border-[#fef3c7]">
            <span className="text-[11px] font-bold tracking-widest text-[#f59e0b] uppercase font-inter">
              ⚡ Tecnología Residencial de Vanguardia
            </span>
          </div>
          
          <h2 className="font-montserrat text-5xl md:text-7xl lg:text-[6rem] font-black italic text-[#0f172a] tracking-tighter mb-14 leading-[0.9] uppercase">
            Potencia tu <br /> comunidad
          </h2>

          <div className="relative inline-block mb-10 group">
             <div className="absolute -inset-10 bg-blue-500/5 blur-3xl rounded-full group-hover:bg-blue-500/10 transition-colors"></div>
             <div className="relative bg-white p-5 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] border border-slate-50 transition-transform hover:scale-105 duration-500">
               <img 
                 src="/og-banner.png" 
                 alt="Logo Central EFAS" 
                 className="w-40 h-40 md:w-60 md:h-60 object-contain" 
               />
             </div>
          </div>

          {/* TEXTO DESCRIPTIVO SOLICITADO */}
          <p className="max-w-2xl mx-auto text-slate-500 text-lg md:text-xl font-medium leading-relaxed font-inter mb-20">
            El más robusto <span className="text-[#0f172a] font-bold">Sistema de Autogestión de Condominios</span> pensado para la transparencia, el control financiero y la comodidad de cada propietario.
          </p>
        </div>

        {/* SECCIÓN MÓDULOS */}
        <div className="pt-24 border-t border-slate-50">
          <div className="text-center mb-20">
            <h3 className="font-montserrat text-3xl font-black italic text-[#0f172a] uppercase tracking-tighter mb-4">
              Módulos Integrados
            </h3>
            <div className="w-16 h-1.5 bg-[#f59e0b] mx-auto rounded-full"></div>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            {modules.map((module, i) => (
              <div key={i} className="bg-white border border-slate-100/50 p-10 rounded-[3.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-3 transition-all duration-500 group flex flex-col items-center text-center">
                <div className={`w-16 h-16 ${module.bgColor} rounded-2xl flex items-center justify-center mb-8 transition-transform group-hover:rotate-12`}>
                  {module.icon}
                </div>
                <h4 className="font-montserrat text-xl font-black italic text-[#0f172a] mb-4 uppercase tracking-tight">
                  {module.title}
                </h4>
                <p className="text-slate-500 text-sm leading-relaxed font-medium font-inter">
                  {module.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="bg-slate-50 py-16 border-t border-slate-100 text-center">
        <p className="font-montserrat text-[10px] font-black italic tracking-[0.4em] uppercase text-slate-400">
          EFAS CondoSys • 2026
        </p>
      </footer>
    </div>
  );
}

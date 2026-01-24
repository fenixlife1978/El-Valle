'use client';

import Link from 'next/link';
import { 
  ShieldCheck, 
  Cpu, 
  BarChart3, 
  Smartphone, 
  CheckCircle2, 
  ArrowRight,
  Building2,
  Users
} from 'lucide-react';

export default function WelcomePage() {
  const benefits = [
    {
      title: "Transparencia Total",
      desc: "Cuentas claras y reportes automatizados para una confianza absoluta entre vecinos.",
      icon: <BarChart3 className="w-6 h-6 text-[#10b981]" />
    },
    {
      title: "Autogestión",
      desc: "Los residentes pueden reportar pagos y consultar sus estados de cuenta sin intermediarios.",
      icon: <Cpu className="w-6 h-6 text-[#10b981]" />
    },
    {
      title: "Máxima Seguridad",
      desc: "Protección de datos bajo estándares internacionales y encriptación de nivel bancario.",
      icon: <ShieldCheck className="w-6 h-6 text-[#10b981]" />
    },
    {
      title: "Multiplataforma",
      desc: "Gestión impecable desde cualquier dispositivo: móvil, tablet o computadora.",
      icon: <Smartphone className="w-6 h-6 text-[#10b981]" />
    }
  ];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 selection:bg-[#006241]/40 overflow-x-hidden font-sans">
      {/* CAPA DE SALUD VISUAL: Gradientes Suaves de Fondo */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] right-[-5%] w-[60%] h-[60%] bg-[#10b981]/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[50%] h-[50%] bg-blue-900/10 blur-[120px] rounded-full"></div>
      </div>

      {/* NAVEGACIÓN SUPERIOR */}
      <nav className="relative z-20 flex items-center justify-between px-8 py-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#10b981] to-cyan-600 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <img 
              src="/og-banner.png" 
              alt="EFAS Logo" 
              className="relative w-14 h-14 rounded-full border border-slate-800 bg-slate-950 object-contain shadow-2xl" 
            />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-black tracking-tighter text-white italic leading-none uppercase">
              EFAS <span className="text-[#10b981]">Condosys</span>
            </span>
            <span className="text-[9px] font-bold tracking-[0.3em] text-slate-500 uppercase">Gestión de Condominios</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Link href="/login-propietario" className="hidden md:flex items-center gap-2 px-6 py-3 rounded-2xl border border-slate-800 hover:bg-slate-900/50 hover:border-slate-700 transition-all text-[11px] font-black tracking-widest uppercase text-slate-400 hover:text-white">
            <Users className="w-4 h-4" /> Propietarios
          </Link>
          <Link href="/login" className="flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-[#006241] hover:bg-[#10b981] text-white transition-all text-[11px] font-black tracking-widest uppercase shadow-xl shadow-[#10b981]/10">
            <Building2 className="w-4 h-4" /> Admin Login
          </Link>
        </div>
      </nav>

      {/* HERO SECTION: Texto Masivo */}
      <main className="relative z-10 px-6 pt-20 pb-32 max-w-7xl mx-auto">
        <div className="text-center mb-32">
          <div className="inline-flex items-center gap-2 px-5 py-2 mb-8 rounded-full border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-black tracking-[0.3em] text-emerald-500 uppercase">Innovación Venezolana v2.0</span>
          </div>
          
          <h1 className="text-6xl md:text-[8.5rem] font-black text-white tracking-tighter leading-[0.85] mb-10 uppercase italic">
            GESTIONA TU <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-200 to-cyan-400">CONDOMINIO</span>
          </h1>
          
          <p className="max-w-3xl mx-auto text-slate-400 text-lg md:text-xl font-medium leading-relaxed opacity-80">
            La plataforma definitiva para juntas de condominio modernas. 
            Digitaliza la cobranza, optimiza la comunicación y garantiza transparencia absoluta.
          </p>
        </div>

        {/* GRILLA DE BENEFICIOS (Igual a la imagen) */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {benefits.map((benefit, i) => (
            <div key={i} className="group p-10 bg-slate-900/30 border border-slate-800/50 rounded-[3rem] backdrop-blur-xl hover:border-emerald-500/30 hover:bg-slate-900/50 transition-all duration-700">
              <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center mb-8 border border-slate-800 shadow-inner group-hover:scale-110 transition-transform">
                {benefit.icon}
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3 italic">{benefit.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-semibold group-hover:text-slate-400 transition-colors">
                {benefit.desc}
              </p>
            </div>
          ))}
        </div>

        {/* SECCIÓN FINAL (Banner Estilo Imagen) */}
        <div className="mt-40 relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-[4rem] blur-2xl opacity-50"></div>
          <div className="relative p-16 bg-slate-900/40 border border-slate-800 rounded-[4rem] backdrop-blur-2xl text-center overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
              <Building2 className="w-64 h-64 text-emerald-500" />
            </div>
            
            <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-8 leading-none">
              ¿Listo para el <br /> <span className="text-emerald-500">cambio?</span>
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto mb-12 font-bold text-lg leading-relaxed">
              Únete a las comunidades que ya transformaron su gestión administrativa y evitan conflictos con nuestra tecnología.
            </p>
            
            <div className="flex flex-wrap justify-center gap-8 mb-12">
              <div className="flex items-center gap-3 text-slate-300 font-black text-xs uppercase tracking-widest">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Reportes PDF
              </div>
              <div className="flex items-center gap-3 text-slate-300 font-black text-xs uppercase tracking-widest">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Pagos en Divisas
              </div>
              <div className="flex items-center gap-3 text-slate-300 font-black text-xs uppercase tracking-widest">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Cartelera Digital
              </div>
            </div>

            <Link href="/login" className="inline-flex items-center gap-3 px-10 py-5 bg-emerald-500 hover:bg-emerald-400 text-[#020617] font-black rounded-2xl transition-all shadow-2xl shadow-emerald-500/20 uppercase tracking-widest text-xs group">
              Empezar ahora <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
            </Link>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-16 border-t border-slate-900/50 text-center">
        <p className="text-slate-700 text-[10px] font-black tracking-[0.6em] uppercase">
          EFAS CONDOSYS • SAN FELIPE - YARACUY • 2026
        </p>
      </footer>
    </div>
  );
}

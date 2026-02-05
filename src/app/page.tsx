'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Wallet, LayoutDashboard, ShieldCheck, ArrowRight, Zap } from 'lucide-react';
import { SYSTEM_LOGO, COMPANY_NAME } from '@/lib/constants';

/**
 * EFAS CondoSys - Landing Page Principal
 * Esta página es el punto de entrada para usuarios no autenticados.
 * Redirige a /welcome para iniciar el flujo de selección de portal.
 */
export default function LandingPage() {
  const router = useRouter();

  // Función de navegación centralizada
  const handleStart = () => router.push('/welcome');

  return (
    <div className="min-h-screen bg-[#1A1D23] text-white font-sans selection:bg-[#F28705] selection:text-white overflow-x-hidden">
      
      {/* HEADER ESTRUCTURAL */}
      <header className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5 sticky top-0 bg-[#1A1D23]/90 backdrop-blur-xl z-50">
        <div className="flex items-center gap-4">
          <div className="border border-white/10 rounded-xl p-1 bg-white/5 shadow-2xl">
            <img 
              src={SYSTEM_LOGO} 
              alt="EFAS Logo" 
              className="h-10 w-10 object-cover rounded-lg"
            />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-[900] italic tracking-tighter leading-none uppercase">
              <span className="text-[#F28705]">EFAS</span>
              <span className="text-white">CONDOSYS</span>
            </h1>
            <p className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">
              Autogestión de Condominios
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            onClick={handleStart} 
            className="bg-[#F28705] hover:bg-[#d17504] text-white rounded-full px-6 md:px-8 h-10 font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20 active:scale-95"
          >
            Ingresar
          </Button>
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="flex flex-col items-center justify-center text-center px-6 pt-20 pb-32 relative">
        {/* Efectos de fondo (Glow) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[500px] bg-[#F28705]/5 blur-[120px] rounded-full -z-10" />
        
        <div className="relative mb-14 group">
          <div className="absolute inset-0 bg-[#F28705]/20 blur-[80px] rounded-full transition-all group-hover:bg-[#F28705]/30" />
          <img 
            src={SYSTEM_LOGO} 
            alt="EFAS Central" 
            className="relative h-56 w-56 md:h-72 md:w-72 rounded-[3rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 object-cover transition-transform duration-700 hover:rotate-2"
          />
        </div>

        <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-6 py-2 mb-10 backdrop-blur-sm">
          <Zap size={14} className="text-[#F28705] animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-100/80">
            Tecnología Residencial de Vanguardia
          </span>
        </div>

        <h2 className="text-6xl md:text-9xl font-[900] tracking-tighter text-white mb-8 max-w-6xl leading-[0.85] uppercase italic">
          Potencia tu <span className="text-[#F28705]">comunidad</span>
        </h2>

        <p className="max-w-2xl text-slate-400 text-lg md:text-xl font-medium mb-12 leading-relaxed">
          La solución definitiva de {COMPANY_NAME} para la administración moderna. 
          Transparencia absoluta, eficiencia operativa y comunicación en tiempo real.
        </p>

        <div className="flex flex-col sm:flex-row gap-5">
          <Button 
            onClick={handleStart} 
            size="lg" 
            className="h-16 px-12 rounded-2xl bg-white text-black hover:bg-slate-200 font-black uppercase italic text-lg transition-transform hover:-translate-y-1"
          >
            Comenzar Ahora
          </Button>
          <Button 
            onClick={handleStart} 
            size="lg" 
            variant="outline" 
            className="h-16 px-12 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 font-black uppercase italic text-white text-lg transition-transform hover:-translate-y-1"
          >
            Saber más <ArrowRight className="ml-2 h-5 w-5 text-[#F28705]" />
          </Button>
        </div>
      </main>

      {/* MODULES SECTION */}
      <section className="bg-[#14161B] py-32 border-t border-white/5 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col items-center text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic">
              Módulos <span className="text-[#F28705]">Integrados</span>
            </h2>
            <div className="w-24 h-2 bg-[#F28705] mt-6 rounded-full shadow-[0_0_20px_rgba(242,135,5,0.6)]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {/* Cobranza */}
            <div className="bg-[#1E2128]/50 p-12 rounded-[3.5rem] border border-white/5 flex flex-col items-center text-center group transition-all duration-500 hover:border-[#F28705]/40 hover:bg-[#1E2128] hover:shadow-2xl">
              <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mb-8 text-[#0070f3] group-hover:scale-110 transition-transform">
                <Wallet size={42} />
              </div>
              <h3 className="text-2xl font-black text-white mb-5 uppercase tracking-tight italic">Cobranza Multidivisa</h3>
              <p className="text-slate-400 font-medium leading-relaxed text-base md:text-lg">
                Gestión automatizada basada en tasas oficiales para una contabilidad impecable y transparente.
              </p>
            </div>

            {/* Panel */}
            <div className="bg-[#1E2128]/50 p-12 rounded-[3.5rem] border border-white/5 flex flex-col items-center text-center group transition-all duration-500 hover:border-[#F28705]/40 hover:bg-[#1E2128] hover:shadow-2xl">
              <div className="w-20 h-20 bg-[#F28705]/10 rounded-3xl flex items-center justify-center mb-8 text-[#F28705] group-hover:scale-110 transition-transform">
                <LayoutDashboard size={42} />
              </div>
              <h3 className="text-2xl font-black text-white mb-5 uppercase tracking-tight italic">Panel Inteligente</h3>
              <p className="text-slate-400 font-medium leading-relaxed text-base md:text-lg">
                Visualización intuitiva de gastos, fondos de reserva y solvencia en tiempo real para la junta.
              </p>
            </div>

            {/* Seguridad */}
            <div className="bg-[#1E2128]/50 p-12 rounded-[3.5rem] border border-white/5 flex flex-col items-center text-center group transition-all duration-500 hover:border-[#F28705]/40 hover:bg-[#1E2128] hover:shadow-2xl">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-8 text-emerald-500 group-hover:scale-110 transition-transform">
                <ShieldCheck size={42} />
              </div>
              <h3 className="text-2xl font-black text-white mb-5 uppercase tracking-tight italic">Seguridad Integral</h3>
              <p className="text-slate-400 font-medium leading-relaxed text-base md:text-lg">
                Infraestructura blindada y respaldos diarios para garantizar la integridad de su información.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-24 text-center border-t border-white/5 bg-[#1A1D23]">
        <div className="flex flex-col items-center gap-8">
          <div className="flex items-center gap-4 opacity-40 hover:opacity-100 transition-opacity duration-500 cursor-default">
            <img src={SYSTEM_LOGO} alt="EFAS" className="h-8 w-8 grayscale hover:grayscale-0 transition-all" />
            <span className="font-black italic tracking-tighter text-lg uppercase">EFAS CONDOSYS</span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.5em]">
              © 2026 {COMPANY_NAME}
            </p>
            <p className="text-slate-600 text-[9px] font-bold uppercase tracking-[0.2em]">
              San Felipe, Yaracuy • Innovación en Gestión Residencial
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Wallet, LayoutDashboard, ShieldCheck, ArrowRight } from 'lucide-react';
import { SYSTEM_LOGO, COMPANY_NAME } from '@/lib/constants';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#1A1D23] text-white font-sans selection:bg-[#F28705] selection:text-white">
      
      {/* HEADER - NOMBRE SEÑALADO CON FLECHA ROJA */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/5 sticky top-0 bg-[#1A1D23]/95 backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <div className="border border-white/10 rounded-xl p-1 bg-white/5 shadow-inner">
            <img 
              src={SYSTEM_LOGO} 
              alt="Logo" 
              className="h-10 w-10 object-cover rounded-lg"
            />
          </div>
          <div className="flex flex-col">
            {/* NOMBRE DE MARCA EXACTO A LA IMAGEN */}
            <h1 className="text-2xl font-[900] italic tracking-tighter leading-none uppercase">
              <span className="text-[#F28705]">EFAS</span>
              <span className="text-white">CONDOSYS</span>
            </h1>
            <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">
              Sistema de Autogestión de Condominios
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/login" className="text-xs font-black text-slate-400 hover:text-[#F28705] transition-colors uppercase tracking-widest">
              Propietarios
            </Link>
          </nav>
          <Link href="/login">
            <Button className="bg-[#0070f3] hover:bg-[#005bb5] text-white rounded-full px-8 h-10 font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20">
              Acceso Admin
            </Button>
          </Link>
        </div>
      </header>

      {/* HERO SECTION - LOGO GRANDE EN RECTÁNGULO ROJO */}
      <main className="flex flex-col items-center justify-center text-center px-6 pt-24 pb-32 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-blue-600/5 blur-[120px] rounded-full -z-10" />
        
        {/* RECTÁNGULO DEL LOGO CENTRAL */}
        <div className="relative mb-14">
          <div className="absolute inset-0 bg-[#F28705]/15 blur-[80px] rounded-full" />
          <img 
            src={SYSTEM_LOGO} 
            alt="EFAS Logo Central" 
            className="relative h-64 w-64 md:h-80 md:w-80 rounded-[3rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] border border-white/10 object-cover"
          />
        </div>

        <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-6 py-2 mb-10">
          <span className="text-[#F28705] animate-pulse font-bold">⚡</span>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-100/80">
            Tecnología Residencial de Vanguardia
          </span>
        </div>

        <h2 className="text-7xl md:text-9xl font-[900] tracking-tighter text-white mb-8 max-w-5xl leading-[0.85] uppercase italic">
          La Evolucion de Tu Condominio <br /> nunca antes fue tan sencillo
        </h2>

        <p className="max-w-2xl text-slate-400 text-lg md:text-xl font-medium mb-12 leading-relaxed">
          La solución integral para la administración moderna de condominios. 
          Transparencia, eficiencia y comunicación en un solo lugar.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/login">
            <Button size="lg" className="h-14 px-10 rounded-2xl bg-white text-black hover:bg-slate-200 font-black uppercase italic">
              Comenzar Ahora
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="h-14 px-10 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 font-black uppercase italic text-white">
              Saber más <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </main>

      {/* MÓDULOS INTEGRADOS - MANTENIENDO TODO IGUAL */}
      <section className="bg-[#14161B] py-28 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white uppercase italic">
              Módulos Integrados
            </h2>
            <div className="w-24 h-2 bg-[#F28705] mt-6 rounded-full shadow-[0_0_20px_rgba(242,135,5,0.4)]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Cobranza */}
            <div className="bg-[#1E2128] p-12 rounded-[3rem] border border-white/5 flex flex-col items-center text-center group transition-all duration-500 hover:border-[#F28705]/50">
              <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mb-8 text-[#0070f3]">
                <Wallet size={40} />
              </div>
              <h3 className="text-2xl font-black text-white mb-5 uppercase tracking-tight italic">Cobranza Multidivisa</h3>
              <p className="text-slate-400 font-medium leading-relaxed text-lg px-2">
                Gestión automática basada en tasas oficiales para una contabilidad transparente y sin errores.
              </p>
            </div>

            {/* Panel */}
            <div className="bg-[#1E2128] p-12 rounded-[3rem] border border-white/5 flex flex-col items-center text-center group transition-all duration-500 hover:border-[#F28705]/50">
              <div className="w-20 h-20 bg-[#F28705]/10 rounded-3xl flex items-center justify-center mb-8 text-[#F28705]">
                <LayoutDashboard size={40} />
              </div>
              <h3 className="text-2xl font-black text-white mb-5 uppercase tracking-tight italic">Panel Inteligente</h3>
              <p className="text-slate-400 font-medium leading-relaxed text-lg px-2">
                Visualización clara de gastos, fondos de reserva y estados de cuenta en tiempo real.
              </p>
            </div>

            {/* Seguridad */}
            <div className="bg-[#1E2128] p-12 rounded-[3rem] border border-white/5 flex flex-col items-center text-center group transition-all duration-500 hover:border-[#F28705]/50">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-8 text-emerald-500">
                <ShieldCheck size={40} />
              </div>
              <h3 className="text-2xl font-black text-white mb-5 uppercase tracking-tight italic">Seguridad y Respaldo</h3>
              <p className="text-slate-400 font-medium leading-relaxed text-lg px-2">
                Toda la información protegida y disponible para auditorías en cualquier momento.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-20 text-center border-t border-white/5 bg-[#1A1D23]">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-3 opacity-50">
            <img src={SYSTEM_LOGO} alt="EFAS" className="h-6 w-6 grayscale" />
            <span className="font-black italic tracking-tighter text-sm uppercase">EFAS CONDOSYS</span>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.5em]">
            © 2026 {COMPANY_NAME} - Elevando el estándar de gestión
          </p>
        </div>
      </footer>
    </div>
  );
}

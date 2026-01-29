'use client';

import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { SYSTEM_LOGO, COMPANY_NAME } from '@/lib/constants';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#1A1D23] text-white">
      {/* HEADER */}
      <header className="flex items-center justify-between p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img 
            src={SYSTEM_LOGO} 
            alt={COMPANY_NAME} 
            className="h-10 w-10 rounded-lg object-cover"
          />
          <div>
            <h1 className="text-xl font-black italic tracking-tighter leading-none">
              <span className="text-orange-500">EFAS</span>CONDOSYS
            </h1>
            <p className="text-[8px] uppercase tracking-widest text-muted-foreground">
              Sistema de Autogestión de Condominios
            </p>
          </div>
        </div>
        
        <nav className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-bold hover:text-orange-500 transition-colors">
            Propietarios
          </Link>
          <Link href="/login">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6">
              Acceso Admin
            </Button>
          </Link>
        </nav>
      </header>

      {/* HERO SECTION (CENTRO) */}
      <main className="flex flex-col items-center justify-center text-center px-4 pt-20">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
          <img 
            src={SYSTEM_LOGO} 
            alt={`${COMPANY_NAME} Logo`} 
            className="relative h-48 w-48 rounded-[2rem] shadow-2xl border border-white/10 object-cover"
          />
        </div>

        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1 mb-8">
          <span className="text-orange-500">⚡</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-200">
            Tecnología Residencial de Vanguardia
          </span>
        </div>

        <h2 className="text-6xl md:text-8xl font-black tracking-tighter mb-6">
          Potencia tu comunidad
        </h2>
        {/* Resto del contenido... */}
      </main>
    </div>
  );
}

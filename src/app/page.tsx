'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  ShieldCheck, 
  Zap, 
  ChevronRight, 
  LayoutDashboard, 
  Wallet,
  ArrowRight
} from 'lucide-react';

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-6 py-5 border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {/* LOGO NAV */}
          <div className="w-10 h-10 rounded-lg overflow-hidden border shadow-sm flex items-center justify-center p-1 bg-white">
            <img src="/logo-efas.png" alt="EFAS Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1 text-2xl font-black tracking-tighter leading-none">
              <span className="text-amber-500">EFAS</span>
              <span className="text-sky-500">CondoSys</span>
            </div>
            <span className="text-[7px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400">
              Sistema de Autogestión de Condominios
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/auth/login?role=owner">
            <Button variant="ghost" className="hidden md:flex font-bold text-slate-600 hover:text-sky-600">
              Propietarios
            </Button>
          </Link>
          <Link href="/auth/login?role=admin">
            <Button className="bg-sky-600 hover:bg-sky-700 font-bold shadow-md shadow-sky-100 text-white px-6">
              Acceso Admin
            </Button>
          </Link>
        </div>
      </nav>

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative px-6 py-20 md:py-28 text-center max-w-6xl mx-auto overflow-hidden">
          {/* Fondo Decorativo */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-sky-50/50 rounded-[100%] blur-3xl -z-10" />

          <div className="mb-12 flex justify-center">
            {/* LOGO MAXIMIZADO Y OPTIMIZADO */}
            <div className="w-32 h-32 md:w-44 md:h-44 rounded-[2rem] overflow-hidden bg-white border-4 border-white shadow-2xl flex items-center justify-center p-2 transform -rotate-2 hover:rotate-0 transition-all duration-500">
              <img 
                src="/logo-efas.png" 
                alt="EFAS CondoSys Logo" 
                className="w-full h-full object-contain" 
              />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-[0.25em] mb-8 border border-amber-100 shadow-sm">
            <Zap className="w-4 h-4 fill-amber-500" /> Tecnología Residencial de Vanguardia
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-slate-900 mb-8 leading-[1.05]">
            Potencia tu comunidad con <br />
            <span className="text-amber-500">EFAS</span> <span className="text-sky-600">CondoSys</span>
          </h1>

          <p className="text-xl text-slate-500 mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
            El más robusto <strong>Sistema de Autogestión de Condominios</strong> pensado para la transparencia, 
            el control financiero y la comodidad de cada propietario.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
            {/* ACCESO ADMIN CON PARÁMETRO CORRECTO */}
            <Link href="/auth/login?role=admin">
              <Button className="bg-sky-600 hover:bg-sky-700 h-16 px-10 text-xl font-black rounded-2xl shadow-xl shadow-sky-200 gap-3 group transition-all text-white w-full sm:w-auto">
                Panel Administrativo <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            
            {/* ACCESO PROPIETARIO CON PARÁMETRO CORRECTO */}
            <Link href="/auth/login?role=owner">
              <Button variant="outline" className="h-16 px-10 text-xl font-bold rounded-2xl border-2 border-slate-200 hover:bg-slate-50 text-slate-700 w-full sm:w-auto">
                Acceso Propietario
              </Button>
            </Link>
          </div>
        </section>

        {/* MÓDULOS DEL SISTEMA */}
        <section className="bg-slate-50/50 py-24 border-y border-slate-100">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Módulos Integrados</h2>
              <div className="h-1.5 w-20 bg-amber-500 mx-auto mt-4 rounded-full" />
            </div>

            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center group p-8 bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-all">
                <div className="w-16 h-16 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600 mb-6 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <Wallet className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-3">Cobranza Multidivisa</h3>
                <p className="text-slate-500 font-medium text-sm leading-relaxed">
                  Gestión automática basada en tasas oficiales para una contabilidad transparente y sin errores.
                </p>
              </div>

              <div className="flex flex-col items-center text-center group p-8 bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-all">
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-6 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  <LayoutDashboard className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-3">Panel Inteligente</h3>
                <p className="text-slate-500 font-medium text-sm leading-relaxed">
                  Visualización clara de gastos, fondos de reserva y estados de cuenta en tiempo real.
                </p>
              </div>

              <div className="flex flex-col items-center text-center group p-8 bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-all">
                <div className="w-16 h-16 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600 mb-6 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-3">Seguridad y Respaldo</h3>
                <p className="text-slate-500 font-medium text-sm leading-relaxed">
                  Toda la información protegida y disponible para auditorías en cualquier momento.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="py-16 bg-white border-t">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-10">
            <div className="flex flex-col items-center md:items-start text-center md:text-left">
              <div className="flex items-center gap-2 text-3xl font-black tracking-tighter">
                <span className="text-amber-500">EFAS</span>
                <span className="text-sky-500">CondoSys</span>
              </div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mt-2">
                Sistema de Autogestión de Condominios
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-10 text-sm font-bold text-slate-500">
              <button className="hover:text-sky-600 transition-colors">Características</button>
              <button className="hover:text-sky-600 transition-colors">Soporte</button>
              <button className="hover:text-sky-600 transition-colors">Términos</button>
            </div>

            <div className="text-center md:text-right">
              <p className="text-sm font-bold text-slate-900">© {new Date().getFullYear()} EFAS CondoSys</p>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Desarrollado para la excelencia</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

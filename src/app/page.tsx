'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  ShieldCheck, 
  Zap, 
  BarChart3, 
  ChevronRight, 
  LayoutDashboard, 
  Users2, 
  Wallet 
} from 'lucide-react';

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-6 py-5 border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden border shadow-sm flex items-center justify-center p-1 bg-white">
            <img src="/logo-efas.png" alt="EFAS Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex items-center gap-1 text-2xl font-black tracking-tighter">
            <span className="text-amber-500">EFAS</span>
            <span className="text-sky-500">CondoSys</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login?role=owner">
            <Button variant="ghost" className="hidden sm:flex font-bold text-slate-600">
              Propietarios
            </Button>
          </Link>
          <Link href="/login?role=admin">
            <Button className="bg-sky-600 hover:bg-sky-700 font-bold shadow-md shadow-sky-100 text-white">
              Acceso Admin
            </Button>
          </Link>
        </div>
      </nav>

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative px-6 py-24 md:py-32 text-center max-w-5xl mx-auto overflow-hidden">
          {/* Decoración de fondo */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-sky-50/50 rounded-[100%] blur-3xl -z-10" />

          <div className="mb-10 flex justify-center">
            {/* LOGO GRANDE Y OPTIMIZADO */}
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden bg-white border-4 border-white shadow-2xl flex items-center justify-center p-2 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
              <img 
                src="/logo-efas.png" 
                alt="EFAS CondoSys Logo" 
                className="w-full h-full object-contain" 
              />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-black uppercase tracking-[0.2em] mb-8 border border-amber-100 shadow-sm">
            <Zap className="w-3.5 h-3.5 fill-amber-500" /> Sistema de Autogestión v2.0
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-slate-900 mb-8 leading-[1.1]">
            La evolución de la <br />
            <span className="text-amber-500">gestión</span> <span className="text-sky-600">residencial.</span>
          </h1>

          <p className="text-xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
            Control total de cobranzas, transparencia financiera y comunicación directa. 
            <strong> EFAS CondoSys</strong> es la herramienta definitiva para comunidades inteligentes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/login?role=admin">
              <Button className="bg-sky-600 hover:bg-sky-700 h-14 px-10 text-xl font-black rounded-2xl shadow-xl shadow-sky-200 gap-3 group transition-all text-white">
                Panel de Control <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/login?role=owner">
              <Button variant="outline" className="h-14 px-10 text-xl font-bold rounded-2xl border-2 border-slate-200 hover:bg-slate-50 text-slate-700">
                Soy Propietario
              </Button>
            </Link>
          </div>
        </section>

        {/* FEATURES GRID */}
        <section className="bg-slate-50/50 py-24 border-y border-slate-100">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid md:grid-cols-3 gap-10">
              <div className="flex flex-col items-center text-center group">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center text-sky-600 mb-6 group-hover:scale-110 transition-transform border border-slate-50">
                  <Wallet className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-3">Cobranza BCV</h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  Cálculos automáticos basados en la tasa oficial del día. Pagos precisos y sin errores.
                </p>
              </div>

              <div className="flex flex-col items-center text-center group">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center text-amber-500 mb-6 group-hover:scale-110 transition-transform border border-slate-50">
                  <LayoutDashboard className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-3">Panel de Propietario</h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  Cada vecino puede ver su estado de cuenta, descargar recibos y reportar pagos 24/7.
                </p>
              </div>

              <div className="flex flex-col items-center text-center group">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center text-sky-600 mb-6 group-hover:scale-110 transition-transform border border-slate-50">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-3">Transparencia</h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  Historial inmutable de transacciones y documentos compartidos para toda la comunidad.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="py-12 border-t bg-white">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <div className="flex items-center gap-1.5 text-xl font-black tracking-tighter">
              <span className="text-amber-500">EFAS</span>
              <span className="text-sky-500">CondoSys</span>
            </div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
              El Futuro de la Administración
            </p>
          </div>
          
          <div className="text-sm text-slate-500 font-medium">
            © {new Date().getFullYear()} Todos los derechos reservados.
          </div>

          <div className="flex items-center gap-6 text-sm font-bold text-sky-600">
            <button className="hover:text-amber-500 transition-colors">Soporte</button>
            <button className="hover:text-amber-500 transition-colors">Privacidad</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

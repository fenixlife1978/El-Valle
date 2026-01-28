
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Lock, ArrowRight, Home, Loader2 } from 'lucide-react';

export default function OwnerLoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 selection:bg-[#0081c9]/20">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,900;1,900&family=Inter:wght@400;500;600;700&display=swap');
        .font-montserrat { font-family: 'Montserrat', sans-serif; }
        .font-inter { font-family: 'Inter', sans-serif; }
      `}</style>

      <div className="w-full max-w-[450px]">
        {/* LOGO Y TÍTULO DE PROPIETARIOS */}
        <div className="text-center mb-10">
          <Link href="/welcome" className="inline-block group transition-transform hover:scale-105 duration-300">
            <div className="bg-white p-4 rounded-[2rem] shadow-xl border border-slate-100 mb-6 inline-block">
              <img src="/og-banner.png" alt="EFAS Logo" className="w-20 h-20 object-contain" />
            </div>
          </Link>
          <h1 className="font-montserrat text-3xl font-black italic tracking-tighter leading-none mb-2">
            <span className="text-orange-500">EFAS</span><span className="text-slate-800">CONDOSYS</span>
          </h1>
          <div className="flex items-center justify-center gap-2 text-[#0081c9]">
            <Home className="w-4 h-4" />
            <p className="font-inter font-bold text-xs uppercase tracking-[0.2em]">Panel de Propietarios</p>
          </div>
        </div>

        {/* CARD DE LOGIN */}
        <div className="bg-white p-10 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-white">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2">
                Correo Electrónico
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-300 group-focus-within:text-[#0081c9] transition-colors" />
                </div>
                <input
                  type="email"
                  placeholder="ejemplo@propietario.com"
                  className="block w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-700 font-inter font-medium focus:outline-none focus:ring-2 focus:ring-[#0081c9]/10 focus:border-[#0081c9] transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 ml-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Contraseña
                </label>
                <Link 
                  href="/forgot-password" 
                  className="text-[11px] font-bold text-[#0081c9] hover:underline uppercase tracking-widest"
                >
                  ¿Olvidaste tu clave?
                </Link>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-300 group-focus-within:text-[#0081c9] transition-colors" />
                </div>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="block w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-700 font-inter font-medium focus:outline-none focus:ring-2 focus:ring-[#0081c9]/10 focus:border-[#0081c9] transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0081c9] hover:bg-[#006da8] text-white font-inter font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-3 group active:scale-[0.98]"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Ver Mi Estado de Cuenta
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* FOOTER */}
        <div className="mt-10 text-center">
          <p className="font-inter text-slate-400 text-sm font-medium">
            ¿Problemas con tu unidad? <br />
            <Link href="/welcome" className="text-[#0081c9] font-bold hover:underline">Regresar al inicio</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

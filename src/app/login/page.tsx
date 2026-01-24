'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Lock, Mail, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/admin');
    } catch (error) {
      alert('Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Efectos de Iluminación de Fondo (El diseño "Hermoso") */}
      <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-[#006241]/20 blur-[150px] rounded-full"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-blue-900/15 blur-[150px] rounded-full"></div>

      {/* Botón de Retroceso Elegante */}
      <Link 
        href="/welcome" 
        className="absolute top-10 left-10 flex items-center gap-3 text-slate-500 hover:text-slate-200 transition-all z-20 group"
      >
        <div className="w-10 h-10 rounded-full bg-slate-900/50 border border-slate-800 flex items-center justify-center group-hover:border-[#006241] transition-all">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        </div>
        <span className="text-xs font-black uppercase tracking-[0.2em]">Volver</span>
      </Link>

      <div className="w-full max-w-[440px] z-10">
        <div className="bg-slate-900/40 border border-slate-800/60 p-12 rounded-[3rem] shadow-2xl backdrop-blur-xl relative">
          <div className="text-center mb-12">
            <div className="inline-flex p-5 bg-gradient-to-br from-[#006241] to-[#004d33] rounded-3xl mb-6 shadow-lg shadow-[#006241]/20">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none">
              Admin<span className="text-[#006241]">Panel</span>
            </h1>
            <p className="text-slate-500 text-sm mt-3 font-bold tracking-wide uppercase">Gestión de Condominios</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Email Corporativo</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-4 w-5 h-5 text-slate-600 group-focus-within:text-[#006241] transition-colors" />
                <input 
                  type="email" 
                  required 
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-slate-200 focus:outline-none focus:border-[#006241] focus:ring-4 focus:ring-[#006241]/10 transition-all transition-all placeholder:text-slate-800"
                  placeholder="admin@vallecondo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Contraseña</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-4 w-5 h-5 text-slate-600 group-focus-within:text-[#006241] transition-colors" />
                <input 
                  type="password" 
                  required 
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-slate-200 focus:outline-none focus:border-[#006241] focus:ring-4 focus:ring-[#006241]/10 transition-all placeholder:text-slate-800"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#006241] hover:bg-[#007a51] text-white font-black py-5 rounded-2xl transition-all shadow-2xl shadow-[#006241]/30 flex items-center justify-center gap-3 mt-10 active:scale-[0.98] tracking-widest text-sm"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'ACCEDER AL SISTEMA'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

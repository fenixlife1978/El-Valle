
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
  const modules = [
    {
      title: "Cobranza Multidivisa",
      desc: "Gestión automática basada en tasas oficiales para una contabilidad transparente y sin errores.",
      icon: <Wallet className="w-8 h-8 text-primary" />,
      bgColor: "bg-primary/5"
    },
    {
      title: "Panel Inteligente",
      desc: "Visualización clara de gastos, fondos de reserva y estados de cuenta en tiempo real.",
      icon: <LayoutDashboard className="w-8 h-8 text-orange-500" />,
      bgColor: "bg-amber-500/5"
    },
    {
      title: "Seguridad y Respaldo",
      desc: "Toda la información protegida y disponible para auditorías en cualquier momento.",
      icon: <ShieldCheck className="w-8 h-8 text-primary" />,
      bgColor: "bg-primary/5"
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-6 py-5 border-b bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {/* LOGO NAV */}
          <div className="w-10 h-10 rounded-lg overflow-hidden border shadow-sm flex items-center justify-center p-1 bg-background">
            <img src="/efas-condosys-logo.png" alt="EFAS Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-black italic uppercase tracking-tighter">
              <span className="text-orange-500">EFAS</span>
              <span className="text-slate-800 dark:text-slate-100">CONDOSYS</span>
            </h1>
            <span className="text-[7px] sm:text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              Sistema de Autogestión de Condominios
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/login?role=owner">
            <Button variant="ghost" className="hidden md:flex font-bold text-foreground hover:text-primary">
              Propietarios
            </Button>
          </Link>
          <Link href="/login?role=admin">
            <Button className="bg-primary hover:bg-primary/90 font-bold shadow-md shadow-primary/10 text-primary-foreground px-6">
              Acceso Admin
            </Button>
          </Link>
        </div>
      </nav>

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative px-6 py-20 md:py-28 text-center max-w-6xl mx-auto overflow-hidden">
          {/* Fondo Decorativo */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/5 rounded-[100%] blur-3xl -z-10" />

          <div className="mb-12 flex justify-center">
            {/* LOGO MAXIMIZADO Y OPTIMIZADO */}
            <div className="w-32 h-32 md:w-44 md:h-44 rounded-[2rem] overflow-hidden bg-card border-4 border-card shadow-2xl flex items-center justify-center p-2 transform -rotate-2 hover:rotate-0 transition-all duration-500">
              <img 
                src="/efas-condosys-logo.png" 
                alt="EFAS CondoSys Logo" 
                className="w-full h-full object-contain" 
              />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 text-orange-500 text-[10px] font-black uppercase tracking-[0.25em] mb-8 border border-orange-500/20 shadow-sm">
            <Zap className="w-4 h-4 fill-orange-500" /> Tecnología Residencial de Vanguardia
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-foreground mb-8 leading-[1.05]">
            Potencia tu comunidad con <br />
            <span className="italic uppercase">
              <span className="text-orange-500">EFAS</span>
              <span className="text-slate-800 dark:text-slate-100">CONDOSYS</span>
            </span>
          </h1>

          <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
            El más robusto <strong>Sistema de Autogestión de Condominios</strong> pensado para la transparencia, 
            el control financiero y la comodidad de cada propietario.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
            <Link href="/login?role=admin">
              <Button className="bg-primary hover:bg-primary/90 h-16 px-10 text-xl font-black rounded-2xl shadow-xl shadow-primary/20 gap-3 group transition-all text-primary-foreground w-full sm:w-auto">
                Panel Administrativo <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            
            <Link href="/login?role=owner">
              <Button variant="outline" className="h-16 px-10 text-xl font-bold rounded-2xl border-2 border-border hover:bg-accent text-foreground w-full sm:w-auto">
                Acceso Propietario
              </Button>
            </Link>
          </div>
        </section>

        {/* MÓDULOS DEL SISTEMA */}
        <section className="bg-card/50 py-24 border-y border-border">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-black text-foreground uppercase tracking-tighter">Módulos Integrados</h2>
              <div className="h-1.5 w-20 bg-orange-500 mt-2 rounded-full mx-auto" />
            </div>

            <div className="grid md:grid-cols-3 gap-12">
              {modules.map((module, i) => (
              <div key={i} className="flex flex-col items-center text-center group p-8 bg-card rounded-3xl shadow-sm border border-border hover:shadow-xl transition-all">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {module.icon}
                </div>
                <h3 className="font-montserrat text-xl font-black text-foreground uppercase tracking-tight italic mb-3">
                  {module.title}
                </h3>
                <p className="text-muted-foreground font-medium text-sm leading-relaxed">
                  {module.desc}
                </p>
              </div>
            ))}
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="py-16 bg-card border-t">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-10">
            <div className="flex flex-col items-center md:items-start text-center md:text-left">
              <div className="flex items-center gap-2 text-3xl font-black tracking-tighter italic uppercase">
                <span className="text-orange-500">EFAS</span>
                <span className="text-slate-800 dark:text-slate-100">CONDOSYS</span>
              </div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground mt-2">
                Sistema de Autogestión de Condominios
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-10 text-sm font-bold text-muted-foreground">
              <button className="hover:text-primary transition-colors">Características</button>
              <button className="hover:text-primary transition-colors">Soporte</button>
              <button className="hover:text-primary transition-colors">Términos</button>
            </div>

            <div className="text-center md:text-right">
              <p className="text-sm font-bold text-foreground">© {new Date().getFullYear()} EFAS CondoSys</p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mt-1">Desarrollado para la excelencia</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

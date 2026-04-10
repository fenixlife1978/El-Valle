'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  LayoutDashboard, 
  CreditCard, 
  Receipt, 
  Users, 
  Building2, 
  Settings, 
  FileText, 
  BarChart3, 
  Wallet,
  Landmark,
  Calculator,
  Scale,
  BookCopy,
  LucideIcon,
  TrendingUp,
  Award,
  Calendar,
  ShieldCheck,
  HelpCircle,
  LogOut,
  Menu,
  X,
  PiggyBank
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  roles?: string[];
}

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, roles: ['admin', 'administrador'] },
  { title: 'Pagos', href: '/admin/payments', icon: CreditCard, roles: ['admin', 'administrador'] },
  { title: 'Libros Contables', href: '/admin/accounting', icon: BookCopy, roles: ['admin', 'administrador'] },
  { title: 'Balance General', href: '/admin/financial-balance', icon: Scale, roles: ['admin', 'administrador'] },
  { title: 'Fondo Extraordinario', href: '/admin/extraordinary-fund', icon: PiggyBank, roles: ['admin', 'administrador'] },
  { title: 'Tesorería', href: '/admin/accounts', icon: Landmark, roles: ['admin', 'administrador'] },
  { title: 'Gastos', href: '/admin/expenses', icon: TrendingUp, roles: ['admin', 'administrador'] },
  { title: 'Residentes', href: '/admin/residents', icon: Users, roles: ['admin', 'administrador'] },
  { title: 'Constancias', href: '/admin/certificates', icon: FileText, roles: ['admin', 'administrador'] },
  { title: 'Documentos', href: '/admin/documents', icon: FileText, roles: ['admin', 'administrador'] },
  { title: 'Encuestas', href: '/admin/surveys', icon: BarChart3, roles: ['admin', 'administrador'] },
  { title: 'Cartelera', href: '/admin/billboard', icon: Calendar, roles: ['admin', 'administrador'] },
  { title: 'Configuración', href: '/admin/settings', icon: Settings, roles: ['admin', 'administrador'] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, activeCondoId } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    const userRole = role?.toLowerCase() || '';
    return item.roles.includes(userRole);
  });

  const handleNavigation = (href: string) => {
    if (activeCondoId) {
      router.push(`/${activeCondoId}${href}`);
    } else {
      router.push(href);
    }
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/welcome');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="flex h-16 items-center justify-between px-6 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <Building2 className="h-5 w-5 text-slate-900" />
          </div>
          <span className="font-black text-white text-lg tracking-tighter italic">
            EFAS<span className="text-primary">CondoSys</span>
          </span>
        </div>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = pathname?.includes(item.href);
            return (
              <Button
                key={item.href}
                variant="ghost"
                onClick={() => handleNavigation(item.href)}
                className={cn(
                  "w-full justify-start gap-3 rounded-xl px-4 py-6 text-[10px] font-black uppercase tracking-wider transition-all duration-200",
                  isActive
                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                {item.title}
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-white/10 p-4 space-y-2">
        <Button
          variant="ghost"
          onClick={() => handleNavigation('/admin/help')}
          className="w-full justify-start gap-3 rounded-xl px-4 py-6 text-[10px] font-black uppercase tracking-wider text-white/60 hover:bg-white/10 hover:text-white"
        >
          <HelpCircle className="h-4 w-4" />
          Ayuda
        </Button>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start gap-3 rounded-xl px-4 py-6 text-[10px] font-black uppercase tracking-wider text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </Button>
        <div className="pt-4 text-center">
          <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">
            EFAS CondoSys © 2026
          </p>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileMenuOpen(true)}
          className="fixed top-4 left-4 z-50 rounded-full bg-slate-900 text-white shadow-lg lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div
          className={cn(
            "fixed inset-0 z-50 bg-black/80 transition-all lg:hidden",
            isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div
            className={cn(
              "absolute left-0 top-0 h-full w-72 transition-transform duration-300",
              isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <SidebarContent />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72">
      <SidebarContent />
    </div>
  );
}

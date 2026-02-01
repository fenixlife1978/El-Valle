
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Building2, 
  LogOut, 
  type LucideIcon, 
  ChevronDown, 
  Bell, 
  Check, 
  PanelLeftClose, 
  Menu, 
  TrendingUp, 
  Loader2 
} from 'lucide-react';
import * as React from 'react';
import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { SYSTEM_LOGO, SYSTEM_WORDMARK, COMPANY_NAME } from '@/lib/constants';

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  items?: Omit<NavItem, 'icon' | 'items'>[];
};

const CustomHeader = ({ 
  ownerData, 
  userRole, 
  navItems, 
  mobileNavItems 
}: { 
  ownerData: any, 
  userRole: string | null, 
  navItems: NavItem[], 
  mobileNavItems: NavItem[] 
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const authContext = useAuth() as any;
  const { companyInfo } = authContext;
  const activeRate = authContext.activeRate;
  const bcvLogoUrl = authContext.bcvLogoUrl;
  
  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/');
  };
  
  const userName = ownerData?.name || 'Usuario';
  const avatarSrc = userRole === 'administrador' ? companyInfo?.logo : SYSTEM_LOGO;

  return (
    <header className="sticky top-4 z-10 mx-4 flex h-20 items-center justify-between gap-2 rounded-xl border bg-card/80 px-4 shadow-lg backdrop-blur-sm sm:px-6 text-card-foreground">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">
              <span className="text-primary">EFAS</span>
              <span className="text-foreground">CONDOSYS</span>
          </h1>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-80 leading-tight">
            Sistema de Autogestión de Condominios
          </span>
        </div>

        {bcvLogoUrl && activeRate && (
          <div className="hidden lg:flex items-center gap-2 rounded-full bg-secondary/50 px-3 py-1 border ml-2">
            <div className="w-4 h-4 rounded-full overflow-hidden bg-white">
              <Image src={bcvLogoUrl} alt="BCV" width={16} height={16} className="object-contain" />
            </div>
            <span className="font-bold text-xs">
              Bs. {activeRate.rate.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      <nav className="hidden md:flex items-center gap-1">
        {navItems.map((item) => (
          item.items ? (
            <DropdownMenu key={item.label}>
              <DropdownMenuTrigger asChild>
                <Button variant={item.items.some(sub => pathname?.startsWith(sub.href)) ? "secondary" : "ghost"} size="sm" className="gap-1 font-bold">
                  {item.label}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {item.items.map(subItem => (
                  <Link key={subItem.label} href={subItem.href} passHref>
                    <DropdownMenuItem className="cursor-pointer font-bold">
                      {subItem.label}
                    </DropdownMenuItem>
                  </Link>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link key={item.label} href={item.href}>
              <Button variant={pathname === item.href ? "secondary" : "ghost"} size="sm" className="font-bold">
                {item.label}
              </Button>
            </Link>
          )
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-12 w-12 rounded-full focus-visible:ring-0">
              <Avatar className="h-12 w-12 border-2 border-primary/20 shadow-sm">
                <AvatarImage src={avatarSrc || ''} alt={userName} />
                <AvatarFallback className="bg-primary text-primary-foreground font-bold">{userName.charAt(0)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-bold leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground capitalize">{userRole}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer font-bold">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Cerrar Sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden rounded-lg h-10 w-10">
              <Menu className="h-6 w-6"/>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px]">
            <SheetHeader className="text-left border-b pb-6">
              <SheetTitle>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-white border p-1 shadow-sm flex items-center justify-center">
                    <img src={companyInfo?.logo || SYSTEM_LOGO} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex flex-col leading-none">
                    <div className="flex items-center gap-0.5">
                      <span className="font-black text-xl text-primary">EFAS</span>
                      <span className="font-bold text-xl text-foreground">CondoSys</span>
                    </div>
                  </div>
                </div>
              </SheetTitle>
            </SheetHeader>
            <nav className="mt-6 flex flex-col gap-1">
              {mobileNavItems.map((item) => (
                item.items ? (
                  <div key={item.label} className="py-2">
                    <h3 className="px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{item.label}</h3>
                    {item.items.map(subItem => (
                      <Link key={subItem.label} href={subItem.href}>
                        <Button variant={pathname === subItem.href ? "secondary" : "ghost"} className="w-full justify-start py-6 text-base font-bold">
                          {subItem.label}
                        </Button>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link key={item.label} href={item.href}>
                    <Button variant={pathname === item.href ? "secondary" : "ghost"} className="w-full justify-start py-6 text-base font-bold">
                      <item.icon className="mr-3 h-5 w-5 text-primary"/>
                      {item.label}
                    </Button>
                  </Link>
                )
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export function DashboardLayout({
  children,
  ownerData,
  userRole,
  navItems,
  mobileNavItems,
}: {
  children: React.ReactNode;
  ownerData: any;
  userRole: string | null;
  navItems: NavItem[];
  mobileNavItems?: NavItem[];
}) {
  const { loading } = useAuth();
  
  if (loading) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin h-12 w-12 text-primary"/>
        <div className="flex items-center gap-1 text-lg font-black uppercase tracking-widest animate-pulse">
            <span className="text-primary">EFAS</span>
            <span className="text-foreground">CondoSys</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <CustomHeader 
        ownerData={ownerData} 
        userRole={userRole} 
        navItems={navItems} 
        mobileNavItems={mobileNavItems || navItems} 
      />
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
      <footer className="p-8 text-center border-t bg-card/50">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1 text-base">
            <span className="font-black text-primary">EFAS</span>
            <span className="font-bold text-foreground">CondoSys</span>
            <span className="text-muted-foreground ml-1 text-xs">© {new Date().getFullYear()}</span>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-black">
            Sistema de Autogestión de Condominios
          </p>
        </div>
      </footer>
    </div>
  );
}

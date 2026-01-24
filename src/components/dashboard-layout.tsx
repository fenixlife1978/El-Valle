'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LogOut, type LucideIcon, ChevronDown, Bell, Check, PanelLeftClose, Menu, TrendingUp, Loader2 } from 'lucide-react';
import * as React from 'react';
import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  items?: Omit<NavItem, 'icon' | 'items'>[];
};

const CustomHeader = ({ ownerData, userRole, navItems, mobileNavItems }: { ownerData: any, userRole: string | null, navItems: NavItem[], mobileNavItems: NavItem[] }) => {
  const router = useRouter();
  const pathname = usePathname();
  const authContext = useAuth() as any;
  const { companyInfo } = authContext;
  const activeRate = authContext.activeRate;
  const bcvLogoUrl = authContext.bcvLogoUrl;
  
  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };
  
  const userName = ownerData?.name || 'Usuario';
  const avatarSrc = userRole === 'administrador' ? companyInfo?.logo : ownerData?.avatar;

  return (
    <header className="sticky top-4 z-10 mx-4 flex h-20 items-center justify-between gap-2 rounded-lg border bg-card/80 px-4 shadow-soft backdrop-blur-sm sm:px-6 text-card-foreground">
      <div className="flex items-center gap-4">
        {/* LOGO OPTIMIZADO - MÁS GRANDE */}
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border flex items-center justify-center shadow-md">
          <img 
            src={companyInfo?.logo || "/logo-efas.png"} 
            alt="EFAS Logo" 
            className="w-full h-full object-cover scale-105" // scale-105 elimina bordes blancos si la imagen tiene márgenes
          />
        </div>

        {/* NOMBRE DE LA MARCA CON EFAS EN AMARILLO */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1 leading-none">
            <span className="font-black text-2xl tracking-tighter text-amber-400 drop-shadow-sm">EFAS</span>
            <span className="font-bold text-2xl tracking-tighter text-sky-500">CondoSys</span>
          </div>
          {companyInfo?.name && (
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground opacity-70 leading-tight">
              {companyInfo.name}
            </span>
          )}
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
              <Avatar className="h-12 w-12 border-2 border-sky-500/20 shadow-sm">
                <AvatarImage src={avatarSrc || ''} alt={userName} />
                <AvatarFallback className="bg-sky-500 text-white font-bold">{userName.charAt(0)}</AvatarFallback>
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
                  <div className="w-12 h-12 rounded-lg bg-white border p-0.5 shadow-sm">
                    <img src={companyInfo?.logo || "/logo-efas.png"} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="font-black text-xl text-amber-400">EFAS</span>
                    <span className="font-bold text-xl text-sky-500">CondoSys</span>
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
                      <item.icon className="mr-3 h-5 w-5 text-sky-500"/>
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
        <Loader2 className="animate-spin h-12 w-12 text-sky-500"/>
        <div className="flex items-center gap-1 text-lg font-black uppercase tracking-widest animate-pulse">
            <span className="text-amber-400">EFAS</span>
            <span className="text-sky-500">CondoSys</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50/40 flex flex-col">
      <CustomHeader ownerData={ownerData} userRole={userRole} navItems={navItems} mobileNavItems={mobileNavItems || navItems} />
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
      <footer className="p-8 text-center border-t bg-white/50">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1 text-base">
            <span className="font-black text-amber-500">EFAS</span>
            <span className="font-bold text-sky-600">CondoSys</span>
            <span className="text-muted-foreground ml-1 text-xs">© {new Date().getFullYear()}</span>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-black">
            Sistema de Autogestión Residencial
          </p>
        </div>
      </footer>
    </div>
  );
}

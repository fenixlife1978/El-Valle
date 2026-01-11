

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LogOut, type LucideIcon, ChevronDown, Bell, Check, PanelLeftClose } from 'lucide-react';
import * as React from 'react';
import { doc, onSnapshot, collection, query, writeBatch, orderBy, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { signOut } from 'firebase/auth';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import Marquee from './ui/marquee';

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  items?: Omit<NavItem, 'icon' | 'items'>[];
};

const BCVRateCard = ({
  rate,
  date,
  loading,
  logoUrl,
}: {
  rate: number;
  date: string;
  loading: boolean;
  logoUrl: string | null;
}) => {
  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (!rate) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
            {logoUrl && <img src={logoUrl} alt="BCV Logo" className="w-16 h-16 object-contain" />}
          <div>
            <p className="text-sm text-muted-foreground">Tasa Oficial BCV</p>
            <p className="text-3xl font-bold">
              Bs.{" "}
              {rate.toLocaleString("es-VE", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">
            {format(new Date(date.replace(/-/g, "/")), "dd MMMM, yyyy", {
              locale: es,
            })}
          </p>
          <p className="text-xs text-muted-foreground">Vigente para hoy</p>
        </div>
      </CardContent>
    </Card>
  );
};


const CustomHeader = ({ ownerData, userRole }: { ownerData: any, userRole: string | null }) => {
    const router = useRouter();
    const { companyInfo } = useAuth();
    
    const handleLogout = async () => {
        await signOut(auth);
        router.push('/');
    };
    
    const userName = ownerData?.name || 'Usuario';
    const avatarSrc = userRole === 'administrador' ? companyInfo?.logo : ownerData?.avatar;


    return (
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
             <div className="flex items-center gap-2 sm:gap-4 flex-1">
                 <SidebarTrigger className="sm:hidden" />
                <div className="flex flex-col">
                    <h1 className="text-lg font-semibold text-foreground">Hola, {userName}</h1>
                    <p className="text-sm text-muted-foreground">Bienvenido a tu panel</p>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end">
                 <div className="hidden sm:flex items-center gap-2">
                    <SidebarTrigger />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0">
                            <Avatar className="h-10 w-10">
                            <AvatarImage src={avatarSrc || ''} alt={userName} />
                            <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
                            </Avatar>
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        <DropdownMenuLabel>
                            <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none font-headline">{userName}</p>
                            <p className="text-xs leading-none text-muted-foreground">{userRole}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Cerrar Sesión</span>
                        </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
};

function DashboardLayoutContent({
  children,
  navItems,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { ownerData, role: userRole, companyInfo, activeRate, bcvLogoUrl, loading } = useAuth();
  const pathname = usePathname();

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isSubItemActive = (parentHref: string, items?: Omit<NavItem, 'icon' | 'items'>[]) => {
    if (pathname === parentHref) return true;
    return items?.some(item => pathname === item.href) ?? false;
  }

  if (loading) {
     return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Cargando...</p>
      </div>
    );
  }
  
  return (
    <>
      <Sidebar className="hidden sm:flex">
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2 justify-center">
            {companyInfo?.logo ? <img src={companyInfo.logo} alt="Logo" className="w-8 h-8 object-contain" /> : <Building2 className="w-5 h-5 text-primary" />}
            <span className="font-semibold text-lg font-headline truncate group-data-[state=collapsed]:hidden">{companyInfo?.name || 'Cargando...'}</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => 
                item.items ? (
                  <Collapsible key={item.label} defaultOpen={isSubItemActive(item.href, item.items)}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            isActive={isSubItemActive(item.href, item.items)}
                            tooltip={{ children: item.label }}
                            className="justify-between"
                          >
                            <div className='flex gap-2 items-center'>
                              <item.icon />
                              <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                            </div>
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:-rotate-180 group-data-[state=collapsed]:hidden" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                    </SidebarMenuItem>
                    <CollapsibleContent>
                       <SidebarMenuSub>
                        {item.items.map(subItem => (
                          <SidebarMenuSubItem key={subItem.label}>
                             <Link href={subItem.href} passHref onClick={handleLinkClick}>
                                <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
                                  <span>{subItem.label}</span>
                                </SidebarMenuSubButton>
                            </Link>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.label}>
                    <Link href={item.href} onClick={handleLinkClick}>
                      <SidebarMenuButton
                        isActive={pathname === item.href}
                        tooltip={{ children: item.label }}
                      >
                          <item.icon />
                          <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )
            )}
          </SidebarMenu>
        </SidebarContent>
        
      </Sidebar>
      <SidebarInset>
        <CustomHeader ownerData={ownerData} userRole={userRole} />
        {userRole === 'propietario' && (
             <div className="relative flex w-full bg-lemon text-black font-semibold overflow-x-hidden py-2">
                 <Marquee pauseOnHover>
                    <span className="text-base">
                        Estimado Usuario, antes de realizar y reportar un pago le recomendamos usar la calculadora de pago para evitar pagos incompletos o excedentes; recuerda que la autogestión es tu responsabilidad.
                    </span>
                 </Marquee>
             </div>
        )}
        <main className="flex-1 p-4 md:p-8 bg-muted">
            <BCVRateCard rate={activeRate?.rate || 0} date={activeRate?.date || new Date().toISOString()} loading={loading} logoUrl={bcvLogoUrl} />
            {children}
        </main>
        <footer className="bg-secondary text-secondary-foreground p-4 text-center text-sm">
           © {new Date().getFullYear()} {companyInfo?.name || 'CondoConnect'}. Todos los derechos reservados.
        </footer>
      </SidebarInset>
    </>
  );
}

export function DashboardLayout({
  children,
  ownerData,
  userRole,
  navItems,
}: {
  children: React.ReactNode;
  ownerData: any;
  userRole: string | null;
  navItems: NavItem[];
}) {
  return (
    <SidebarProvider>
      <DashboardLayoutContent navItems={navItems}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

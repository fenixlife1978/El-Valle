
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LogOut, type LucideIcon, ChevronDown, TrendingUp } from 'lucide-react';
import * as React from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAuth, signOut } from 'firebase/auth';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  items?: Omit<NavItem, 'icon' | 'items'>[];
};

type CompanyInfo = {
    name: string;
    logo: string;
};

type ExchangeRate = {
    id: string;
    date: string; // Stored as 'yyyy-MM-dd'
    rate: number;
    active: boolean;
};

const BCVLogo = () => (
    <svg width="24" height="24" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 text-primary">
        <circle cx="256" cy="256" r="246" stroke="currentColor" strokeWidth="20"/>
        <circle cx="256" cy="256" r="150" stroke="currentColor" strokeWidth="20"/>
        <path d="M208 208H304V304H208V208Z" fill="currentColor"/>
        <path d="M292.5 224.25H220.5V288.75H292.5V270H246V243H292.5V224.25Z" fill="white"/>
        <g>
            {[...Array(16)].map((_, i) => {
                const angle = (i * 22.5) * (Math.PI / 180);
                const x1 = 256 + 106 * Math.cos(angle);
                const y1 = 256 + 106 * Math.sin(angle);
                const x2 = 256 + 150 * Math.cos(angle);
                const y2 = 256 + 150 * Math.sin(angle);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="6" />;
            })}
        </g>
    </svg>
);


const CustomHeader = ({ ownerData, userRole }: { ownerData: any, userRole: string | null }) => {
    const router = useRouter();
    const [activeRate, setActiveRate] = React.useState<ExchangeRate | null>(null);
    const [loadingRate, setLoadingRate] = React.useState(true);

    React.useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data();
                const rates: ExchangeRate[] = settings.exchangeRates || [];
                let currentActiveRate = rates.find(r => r.active) || null;
                if (!currentActiveRate && rates.length > 0) {
                    currentActiveRate = [...rates].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                }
                setActiveRate(currentActiveRate);
            }
            setLoadingRate(false);
        }, () => {
            setLoadingRate(false);
        });

        return () => {
            settingsUnsubscribe();
        };
    }, []);

    const handleLogout = async () => {
        const auth = getAuth();
        await signOut(auth);
        router.push('/');
    };

    const userName = ownerData?.name || 'Usuario';

    return (
        <header className="sticky top-0 z-10 flex h-auto items-center justify-between gap-2 border-b bg-background/80 p-2 backdrop-blur-sm sm:h-20 sm:px-4">
             <div className="flex items-center gap-4">
                <SidebarTrigger className="sm:hidden" />
                <div className="flex flex-col">
                    <h1 className="text-md font-semibold text-foreground">Hola, {userName}</h1>
                    <p className="text-xs text-muted-foreground">Bienvenido a tu panel</p>
                </div>
                 {loadingRate ? (
                    <Skeleton className="h-10 w-48 rounded-lg" />
                ) : activeRate ? (
                    <div className="hidden md:flex items-center gap-3 ml-6 rounded-lg bg-muted p-2">
                        <BCVLogo />
                        <div className="text-left">
                            <p className="text-sm font-bold leading-none">Bs. {activeRate.rate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-muted-foreground leading-none">
                                Tasa BCV - {format(new Date(activeRate.date.replace(/-/g, '/')), 'dd MMM', { locale: es })}
                            </p>
                        </div>
                    </div>
                ) : null}
            </div>


            <div className="flex items-center gap-4">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                        <Avatar className="h-10 w-10">
                        <AvatarImage src={ownerData?.avatar || ''} alt={userName} data-ai-hint="profile picture"/>
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
        </header>
    );
};

function DashboardLayoutContent({
  children,
  navItems,
  ownerData,
  userRole,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  ownerData: any;
  userRole: string | null;
}) {
  const [companyInfo, setCompanyInfo] = React.useState<CompanyInfo | null>(null);
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();

  React.useEffect(() => {
    const settingsRef = doc(db, 'config', 'mainSettings');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
        }
    });
    return () => unsubscribe();
  }, []);

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isSubItemActive = (parentHref: string, items?: Omit<NavItem, 'icon' | 'items'>[]) => {
    if (pathname === parentHref) return true;
    return items?.some(item => pathname === item.href) ?? false;
  }
  
  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            {companyInfo?.logo ? <img src={companyInfo.logo} alt="Logo" className="w-8 h-8 rounded-md object-cover"/> : <Building2 className="w-6 h-6 text-primary" />}
            <span className="font-semibold text-lg font-headline truncate">{companyInfo?.name || 'Cargando...'}</span>
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
                              <span>{item.label}</span>
                            </div>
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:-rotate-180" />
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
                          <span>{item.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <CustomHeader ownerData={ownerData} userRole={userRole} />
        <main className="flex-1 p-4 md:p-8 bg-background">{children}</main>
        <footer className="bg-secondary text-secondary-foreground p-4 text-center text-sm">
           © {new Date().getFullYear()} {companyInfo?.name || 'CondoConnect'}. Todos los derechos reservados.
        </footer>
      </SidebarInset>
    </>
  );
}

export function DashboardLayout(props: {
  children: React.ReactNode;
  ownerData: any;
  userRole: string | null;
  navItems: NavItem[];
  params?: any; // To catch the params prop
}) {
  const { children, ownerData, userRole, navItems } = props;
  return (
    <SidebarProvider>
      <DashboardLayoutContent navItems={navItems} ownerData={ownerData} userRole={userRole}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

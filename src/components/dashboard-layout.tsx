
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
import { Card, CardContent } from '@/components/ui/card';
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

const BCVIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <circle cx="50" cy="50" r="48" stroke="black" strokeWidth="2"/>
        <circle cx="50" cy="50" r="28" fill="black"/>
        <text x="50" y="59" fontFamily="serif" fontSize="24" fill="white" textAnchor="middle">BCV</text>
        <path d="M50 10 a 40 40 0 0 1 0 80 a 40 40 0 0 1 0 -80" fill="none" id="circlePath"/>
        <text fontSize="6" fill="black">
            <textPath href="#circlePath" startOffset="50%" textAnchor="middle">
                BANCO CENTRAL DE VENEZUELA
            </textPath>
        </text>
    </svg>
);

const BCVRateCard = ({ rate, date, loading }: { rate: number, date: string, loading: boolean }) => {
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
                    <BCVIcon className="w-16 h-16"/>
                    <div>
                        <p className="text-sm text-muted-foreground">Tasa Oficial BCV</p>
                        <p className="text-3xl font-bold">Bs. {rate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm font-semibold">{format(new Date(date.replace(/-/g, '/')), 'dd MMMM, yyyy', { locale: es })}</p>
                    <p className="text-xs text-muted-foreground">Vigente para hoy</p>
                </div>
            </CardContent>
        </Card>
    );
};


const CustomHeader = ({ ownerData, userRole }: { ownerData: any, userRole: string | null }) => {
    const router = useRouter();

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
  const [activeRate, setActiveRate] = React.useState<ExchangeRate | null>(null);
  const [loadingRate, setLoadingRate] = React.useState(true);

  React.useEffect(() => {
    const settingsRef = doc(db, 'config', 'mainSettings');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
            const rates: ExchangeRate[] = docSnap.data().exchangeRates || [];
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
        <main className="flex-1 p-4 md:p-8 bg-background">
            <BCVRateCard rate={activeRate?.rate || 0} date={activeRate?.date || new Date().toISOString()} loading={loadingRate} />
            {children}
        </main>
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

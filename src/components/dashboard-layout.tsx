
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LogOut, type LucideIcon, ChevronDown, TrendingUp } from 'lucide-react';
import * as React from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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

type UserProfile = {
    name: string;
    avatar: string;
};


const BCVLogo = () => (
    <svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <path d="M49.619 19.468C32.769 19.468 19.23 33.007 19.23 49.857C19.23 66.707 32.769 80.246 49.619 80.246C66.469 80.246 80 66.707 80 49.857C80 33.007 66.469 19.468 49.619 19.468Z" fill="#D52B1E"></path>
        <path d="M57.618 36.436H41.62V63.278H57.618V55.772H49.125V44.022H57.618V36.436Z" fill="white"></path>
    </svg>
);


const CustomHeader = ({ userRole }: { userRole: string }) => {
    const router = useRouter();
    const [session, setSession] = React.useState<any>(null);
    const [activeRate, setActiveRate] = React.useState<ExchangeRate | null>(null);
    const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);

    React.useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (userSession) {
            setSession(JSON.parse(userSession));
        }

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
        });

        let profileUnsubscribe: () => void;
        if (userSession) {
            const uid = JSON.parse(userSession).uid;
            const profileRef = doc(db, 'owners', uid);
            profileUnsubscribe = onSnapshot(profileRef, (docSnap) => {
                if(docSnap.exists()) {
                    setUserProfile(docSnap.data() as UserProfile);
                }
            });
        }
        
        return () => {
            settingsUnsubscribe();
            if(profileUnsubscribe) profileUnsubscribe();
        };

    }, []);

    const handleLogout = async () => {
        localStorage.removeItem('user-session');
        router.push('/');
    };

    const displayName = userProfile?.name || (userRole === 'Administrador' ? 'Admin' : 'Propietario');
    const avatarSrc = userProfile?.avatar;

    return (
        <header className="sticky top-0 z-10 flex h-auto flex-col items-center gap-2 border-b bg-background/80 p-2 backdrop-blur-sm sm:flex-row sm:h-16 sm:px-4">
             <div className="flex w-full items-center justify-between sm:w-auto">
                <SidebarTrigger className="sm:hidden" />
                <h1 className="text-md font-semibold text-foreground">Hola, {displayName}</h1>
            </div>

            <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:ml-auto">
                {activeRate && (
                    <Card className="flex items-center gap-3 p-2 rounded-lg bg-card/50 flex-shrink-0">
                       <BCVLogo />
                       <div>
                            <p className="text-sm font-bold leading-none">Bs. {activeRate.rate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-muted-foreground leading-none">
                                Tasa BCV - {format(new Date(activeRate.date.replace(/-/g, '/')), 'dd MMM yyyy', { locale: es })}
                            </p>
                       </div>
                    </Card>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                        <Avatar className="h-10 w-10">
                        <AvatarImage src={avatarSrc} alt={displayName} data-ai-hint="profile picture"/>
                        <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
                        </Avatar>
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none font-headline">{displayName}</p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Salir</span>
                    </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
};


export function DashboardLayout({
  children,
  userName,
  userRole,
  navItems,
}: {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  navItems: NavItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [companyInfo, setCompanyInfo] = React.useState<CompanyInfo | null>(null);

  React.useEffect(() => {
    // Check for session on mount
    const userSession = localStorage.getItem('user-session');
    if (!userSession) {
      router.push('/');
    }

    const settingsRef = doc(db, 'config', 'mainSettings');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
        }
    });
    return () => unsubscribe();
  }, [router]);


  const isSubItemActive = (parentHref: string, items?: Omit<NavItem, 'icon' | 'items'>[]) => {
    if (pathname === parentHref) return true;
    return items?.some(item => pathname === item.href) ?? false;
  }

  return (
    <SidebarProvider>
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
                             <Link href={subItem.href} passHref>
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
                    <Link href={item.href}>
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
            {/* Can add footer content here if needed */}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <CustomHeader userRole={userRole} />
        <main className="flex-1 p-4 md:p-8 bg-background">{children}</main>
        <footer className="bg-secondary text-secondary-foreground p-4 text-center text-sm">
           © {new Date().getFullYear()} {companyInfo?.name || 'CondoConnect'}. Todos los derechos reservados.
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}

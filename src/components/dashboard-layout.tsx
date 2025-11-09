
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LogOut, type LucideIcon, ChevronDown, Bell, Check, PanelLeftClose } from 'lucide-react';
import * as React from 'react';
import { doc, onSnapshot, collection, query, writeBatch, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, formatDistanceToNow } from 'date-fns';
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
    date: string; 
    rate: number;
    active: boolean;
};

type Notification = {
    id: string;
    title: string;
    body: string;
    createdAt: any;
    read: boolean;
    href?: string;
};

const BCVIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="2"/>
        <circle cx="50" cy="50" r="28" fill="currentColor"/>
        <text x="50" y="59" fontFamily="serif" fontSize="24" fill="var(--background)" textAnchor="middle">BCV</text>
        <path d="M50 10 a 40 40 0 0 1 0 80 a 40 40 0 0 1 0 -80" fill="none" id="circlePath"/>
        <text fontSize="6" fill="currentColor">
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
    const [notifications, setNotifications] = React.useState<Notification[]>([]);
    const [isSheetOpen, setIsSheetOpen] = React.useState(false);

    React.useEffect(() => {
        if (!ownerData?.id) return;
        const q = query(collection(db, `owners/${ownerData.id}/notifications`), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            setNotifications(notifs);
        });
        return () => unsubscribe();
    }, [ownerData?.id]);

    const hasUnread = notifications.some(n => !n.read);

    const handleMarkAllRead = async () => {
        const batch = writeBatch(db);
        notifications.filter(n => !n.read).forEach(n => {
            const notifRef = doc(db, `owners/${ownerData.id}/notifications/${n.id}`);
            batch.update(notifRef, { read: true });
        });
        await batch.commit();
    };

    const handleLogout = async () => {
        const auth = getAuth();
        await signOut(auth);
        router.push('/');
    };

    const userName = ownerData?.name || 'Usuario';

    return (
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
             <div className="flex items-center gap-2 sm:gap-4 flex-1">
                <div className="flex flex-col">
                    <h1 className="text-lg font-semibold text-foreground">Hola, {userName}</h1>
                    <p className="text-sm text-muted-foreground">Bienvenido a tu panel</p>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end">
                 <SidebarTrigger className="h-9 w-9 sm:flex">
                    <PanelLeftClose />
                 </SidebarTrigger>
                 <Button variant="ghost" size="icon" className="relative" onClick={() => setIsSheetOpen(true)}>
                    <Bell className="h-5 w-5" />
                    {hasUnread && <span className="absolute top-2 right-2.5 block h-2 w-2 rounded-full bg-destructive" />}
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                        <Avatar className="h-10 w-10">
                        <AvatarImage src={ownerData?.avatar} alt={userName} />
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
             <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent className="flex flex-col">
                    <SheetHeader>
                        <SheetTitle>Notificaciones</SheetTitle>
                    </SheetHeader>
                    <div className="flex-grow overflow-y-auto -mx-6 px-6">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                                <Bell className="h-12 w-12 mb-4"/>
                                <p>No tienes notificaciones nuevas.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {notifications.map(n => (
                                    <div key={n.id} className={cn("p-3 rounded-lg border flex gap-4 items-start", n.read ? "bg-transparent border-border/50" : "bg-primary/10 border-primary/30")}>
                                        {!n.read && <span className="mt-1.5 block h-2 w-2 shrink-0 rounded-full bg-primary" />}
                                        <div className="flex-grow">
                                            <p className="font-semibold">{n.title}</p>
                                            <p className="text-sm text-muted-foreground">{n.body}</p>
                                            <p className="text-xs text-muted-foreground/80 mt-1">
                                                {formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true, locale: es })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {hasUnread && (
                        <SheetFooter>
                            <Button variant="outline" onClick={handleMarkAllRead}>
                                <Check className="mr-2 h-4 w-4"/>
                                Marcar todas como leídas
                            </Button>
                        </SheetFooter>
                    )}
                </SheetContent>
            </Sheet>
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
      <Sidebar className="hidden sm:block">
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
  params?: any;
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

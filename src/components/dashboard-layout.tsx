
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LogOut, type LucideIcon, ChevronDown, Bell, Check, PanelLeftClose } from 'lucide-react';
import * as React from 'react';
import { doc, onSnapshot, collection, query, writeBatch, orderBy } from 'firebase/firestore';
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

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  items?: Omit<NavItem, 'icon' | 'items'>[];
};

type Notification = {
    id: string;
    title: string;
    body: string;
    createdAt: any; // Firestore Timestamp
    read: boolean;
};

const BCVIcon = (props: React.ImgHTMLAttributes<HTMLImageElement> & {src?: string | null}) => {
    const finalSrc = props.src ?? undefined; 

    if (finalSrc) {
        return <img src={finalSrc} alt="BCV Logo" {...props} />;
    }

    return (
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAABjGlDQ1BJQ0MgcHJvZmlsZQAAKJF9kT1Iw0AcxV9TpSIVh1YQcchQnSyIijhKFYtgobQVWnUweemP0KQhSXFxFFwLDv4sVh1cnHV1cBUEwR8QJ0cdunspscpS8v+83fev54sA9w4Z8qExgEwJ4Rz2d2c2nn+4tPl91i/T4c+s3+hOq3A4fHw353f2nfg/f2d5/sfy3wP3BAnJ5f25+X1sV3MWva3VA7v3u/UK/w3V5f1v/g5fS3sJ5MPf9L/c3h+8d2e8t9+8O/3s3+Hw5+5/v8PA+v7d/3c2g5/vD/3d/3f/8//5/f4//9/v+//9/v+//9/v////+EwAQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAABgQCgYAAAzp3wdp15h32DgIAAAAJcEhZcwAAFiUAABYlAUlSJPAAAANLSURBVHic7ZpdaFxFGMd/W/GqFqmJgqJ6EAShRz2I4g/iR2wUQXoSQQ9eFA+Cp6gXLyIllqIgu8LYBG3Ekq1q1bZatbVartv2sbe3d2fH3MzO7m3d7R+eM+9M5v/8Z87M/I8zh83bXgD0lWb/VWBfGnggDTyQBh5IAw+kgQfSwANp4IE08EAaOCANKy3QXb/fT9VqNYsWLYz43NlZGa2trUbr66vxfQBQV1+gL+5vby4vLw/L5fJ4oNPpNEVFRcbS0pL5fH7iCwCg7lSBHh4eGnPmzHGlUilRqVSkUqngvHnzxrq6OmP//v2jYDB4LwCArvRAB+rq6oxVq1bF4XAUBodHRkZGhgIDA2l2drbZuXNn3GyfOHFiyGQy0QCg61zQAaGhoWYulxuPjIwMiEQiWFlZGa+srIybm5tjz549I52dnXGnT0lJifv6+gBQ97qgw+h0uuHDw8MjsVgMRkdHR3JycmJbW1ts27ZtZGZmJp6amtp/a2pqsra2ViImAJzZDR2G0WjE5eXlsbGxMVpbW+MPHz4MVVVVRsU99O/fPzI0NMReXl54d3eXvLy8BAApSAn0oAc6OjpGbGxsxJ49eyIAkJaWFrdv3z5eWloar62tDR8fHzE6OjpCoRDIZDKcnZ0lV1dXtLa2kvX1ddLV1SVbW1u0tLSQx8fHpKurS/b29igrKyPj4+Nks1kEBweTrq6uWlpaMD093Zg7d25MmjVrYnFxMYqKinBcXJz4+fl9DwDQXm6mB3paWlrk4eEhvL290dramn379g2fnp5mSkpKtLGxEVu4cGHExsZGhUIhaGlpGbW0tMRevXplVVVVxtDQkE2ZMkUWLFjQTwCg7jSCAyIiIkR2dnbiq1euXBnJyclhdXV1RiaTiYcPH8bS0lL87t27ZGJiIla5cuWYJCUlGZs2bcqtt7d3fACgrjXDAyUnJ4eSk5NjWVlZ4vLysri5uYmVlZWxefPmxR07dsQWFxeHh4eH+NnZWSYnJ0cKCgrEFy5ciKenp3h7e8ufAdBeLpEHuqWlJVpbW4sXLlwo2traWFlZGUdHR2NjY2Osrq6Orq6uWFtbG+vqaq2wAEC7uYge6O3tLbS2toaXl5f4+Pj4HQDsXQID0F4ukge6rq4uWltbi0ajkVZWVqirq2NxcXF8ZmZG2tzc/N9/AP//44kGHiQND6TBh5DAA2nggTTwQBp4IA08kAaeSAM/AfD1/QHg4W3g4S3g4S3g4S3gX7l/AsOqGSuqshhZAAAAAElFTkSuQmCC" alt="Default BCV Logo" {...props} />
    );
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
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center overflow-hidden border p-1">
                {logoUrl && <img src={logoUrl} alt="BCV Logo" className="w-full h-full object-contain" />}
            </div>
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
        if (!ownerData?.id) return;
        const batch = writeBatch(db);
        notifications.filter(n => !n.read).forEach(n => {
            const notifRef = doc(db, `owners/${ownerData.id}/notifications/${n.id}`);
            batch.update(notifRef, { read: true });
        });
        await batch.commit();
    };

    const handleLogout = async () => {
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
                <Button variant="ghost" size="icon" className="relative" onClick={() => setIsSheetOpen(true)}>
                    <Bell className="h-5 w-5" />
                    {hasUnread && <span className="absolute top-2 right-2.5 block h-2 w-2 rounded-full bg-destructive" />}
                </Button>
                <SidebarTrigger className="h-9 w-9 sm:flex">
                    <PanelLeftClose />
                 </SidebarTrigger>
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
      <Sidebar className="hidden sm:block">
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden border p-0.5">
                {companyInfo?.logo ? <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-contain" /> : <Building2 className="w-5 h-5 text-primary" />}
            </div>
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

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LogOut, type LucideIcon, ChevronDown, Bell, Check, PanelLeftClose, Menu, TrendingUp, Loader2 } from 'lucide-react';
import * as React from 'react';
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

const CustomHeader = ({ ownerData, userRole, navItems }: { ownerData: any, userRole: string | null, navItems: NavItem[] }) => {
    const router = useRouter();
    const pathname = usePathname();
    const { companyInfo, activeRate, bcvLogoUrl } = useAuth();
    
    const handleLogout = async () => {
        await signOut(auth);
        router.push('/');
    };
    
    const userName = ownerData?.name || 'Usuario';
    const avatarSrc = userRole === 'administrador' ? companyInfo?.logo : ownerData?.avatar;

    return (
        <header className="sticky top-4 z-10 mx-4 flex h-16 items-center justify-between gap-2 rounded-lg border bg-card/80 px-4 shadow-soft backdrop-blur-sm sm:px-6">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-background border flex items-center justify-center">
                    {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-cover" />}
                </div>
                <span className="font-semibold text-lg font-headline truncate hidden sm:inline">{companyInfo?.name || 'ValleCondo'}</span>
                 {bcvLogoUrl && activeRate && (
                    <div className="hidden md:flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5 border">
                         <div className="w-5 h-5 rounded-full overflow-hidden bg-white flex items-center justify-center">
                            <Image src={bcvLogoUrl} alt="BCV Logo" width={20} height={20} className="h-full w-full object-contain" />
                         </div>
                        <span className="font-bold text-sm text-foreground">
                            Bs. {activeRate.rate.toFixed(2)}
                        </span>
                    </div>
                 )}
            </div>

            <nav className="hidden md:flex items-center gap-2">
                {navItems.map((item) => (
                    item.items ? (
                        <DropdownMenu key={item.label}>
                            <DropdownMenuTrigger asChild>
                                <Button variant={item.items.some(sub => pathname?.startsWith(sub.href)) ? "secondary" : "ghost"} size="sm" className="flex items-center gap-1">
                                    {item.label}
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {item.items.map(subItem => (
                                     <Link key={subItem.label} href={subItem.href} passHref>
                                        <DropdownMenuItem className="cursor-pointer">
                                            {subItem.label}
                                        </DropdownMenuItem>
                                    </Link>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Link key={item.label} href={item.href}>
                            <Button variant={pathname?.startsWith(item.href) ? "secondary" : "ghost"} size="sm">
                                {item.label}
                            </Button>
                        </Link>
                    )
                ))}
            </nav>

            <div className="flex items-center gap-2">
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

                {/* Mobile Menu */}
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="icon" className="md:hidden">
                            <Menu className="h-5 w-5"/>
                            <span className="sr-only">Abrir Menú</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent>
                        <SheetHeader>
                             <SheetTitle>
                                 <div className="flex items-center gap-2">
                                     {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="w-8 h-8 object-contain" />}
                                     <span className="font-semibold text-lg font-headline truncate">{companyInfo?.name || 'ValleCondo'}</span>
                                 </div>
                             </SheetTitle>
                        </SheetHeader>
                         {bcvLogoUrl && activeRate && (
                            <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5 border my-4">
                                 <Image src={bcvLogoUrl} alt="BCV Logo" width={20} height={20} className="h-5 w-auto" />
                                <span className="font-bold text-sm text-foreground">
                                    Tasa BCV: Bs. {activeRate.rate.toFixed(2)}
                                </span>
                            </div>
                         )}
                        <nav className="mt-8 flex flex-col gap-2">
                             {navItems.map((item) => (
                                 <Link key={item.label} href={item.href}>
                                     <Button variant={pathname?.startsWith(item.href) ? "secondary" : "ghost"} className="w-full justify-start text-base py-6">
                                         <item.icon className="mr-3 h-5 w-5"/>
                                         {item.label}
                                     </Button>
                                 </Link>
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
}: {
  children: React.ReactNode;
  ownerData: any;
  userRole: string | null;
  navItems: NavItem[];
}) {
  const { companyInfo, loading } = useAuth();
  
  if (loading) {
    return <div className="h-screen w-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8"/></div>
  }

  return (
    <div className="min-h-screen w-full bg-background">
        <CustomHeader ownerData={ownerData} userRole={userRole} navItems={navItems} />
        <main className="p-4 md:p-8">
            {children}
        </main>
         <footer className="bg-transparent text-muted-foreground p-4 text-center text-xs mt-8">
            © {new Date().getFullYear()} {companyInfo?.name || 'ValleCondo'}. Todos los derechos reservados.
        </footer>
    </div>
  );
}

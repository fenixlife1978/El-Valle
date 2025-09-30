
'use client';

import {
    Home,
    Landmark,
    Settings,
} from 'lucide-react';
import { type ReactNode, useState, useEffect } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';


const ownerNavItems: NavItem[] = [
    { href: "/owner/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Reportar Pago",
    },
    { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const { toast } = useToast();
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);

     useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login?role=owner');
            return;
        }
        
        const parsedSession = JSON.parse(userSession);
         if (parsedSession.role !== 'propietario') {
            toast({
                variant: 'destructive',
                title: 'Acceso Incorrecto',
                description: 'Estás intentando acceder a un panel que no te corresponde.'
            });
            localStorage.removeItem('user-session');
            router.push('/login');
            return;
        }
        setSession(parsedSession);
        setLoading(false);

    }, [router, toast]);

    if (loading) {
        return (
             <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        )
    }
    
    return (
        <DashboardLayout userName={session?.displayName || 'Propietario'} userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

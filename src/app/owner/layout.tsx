
'use client';

import {
    Home,
    Landmark,
    Settings,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';

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
    const [userName] = useState('Propietario');
    
    return (
        <DashboardLayout userName={userName} userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

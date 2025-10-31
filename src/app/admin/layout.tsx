'use client';

import {
    Home,
    Landmark,
    Users,
    Settings,
    FileSearch,
    CircleDollarSign,
    TrendingUp,
    Wallet,
    Award,
    Palette,
    ShieldCheck,
    Briefcase
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureAdminProfile } from '@/lib/user-sync';
import { Loader2 } from 'lucide-react';


const adminNavItems: NavItem[] = [
    { href: "/admin/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Pagos",
      items: [
        { href: "/admin/payments", label: "Reportar Pago" },
        { href: "/admin/payments/advance", label: "Registrar Adelanto" },
        { href: "/admin/payments/verify", label: "Verificar Pagos" },
        { href: "/admin/payments/calculator", label: "Calculadora de Pagos" },
        { href: "/admin/payments/history", label: "Pagos Históricos" },
      ]
    },
    { href: "/admin/debts", icon: CircleDollarSign, label: "Gestión de Deudas" },
    { href: "/admin/financial-balance", icon: TrendingUp, label: "Balance Financiero" },
    { href: "/admin/petty-cash", icon: Wallet, label: "Caja Chica" },
    { href: "/admin/reports", icon: FileSearch, label: "Informes" },
    { href: "/admin/certificates", icon: Award, label: "Constancias" },
    { href: "/admin/people", icon: Users, label: "Personas" },
    { href: "/admin/cases", icon: Briefcase, label: "Casos Administrativos" },
    { 
      href: "/admin/settings", 
      icon: Settings, 
      label: "Configuración",
      items: [
        { href: "/admin/settings", label: "General" },
        { href: "/admin/settings/sync", label: "Sincronizar Perfiles" },
      ]
    },
     { href: "/admin/validation", icon: ShieldCheck, label: "Validación" },
];

type MockUser = {
  uid: string;
  email: string;
};

const ADMIN_USER_ID = 'valle-admin-main-account';

export default function AdminLayout({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<MockUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);

    useEffect(() => {
        const bootstrapAdminSession = async () => {
          // Ensure the admin profile document exists in Firestore.
          await ensureAdminProfile();
          
          const adminUser: MockUser = {
            uid: ADMIN_USER_ID,
            email: 'edwinfaguiars@gmail.com', // Using a placeholder email
          };
          setUser(adminUser);
    
          const adminDocRef = doc(db, "owners", ADMIN_USER_ID);
          const adminSnap = await getDoc(adminDocRef);
    
          if (adminSnap.exists()) {
            const adminData = { id: adminSnap.id, ...adminSnap.data() };
            setOwnerData(adminData);
            setRole('administrador');
          }
          
          setLoading(false);
        };
    
        bootstrapAdminSession();
    }, []);

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    return (
        <DashboardLayout ownerData={ownerData} userRole={role} navItems={adminNavItems}>
            {children}
        </DashboardLayout>
    );
}

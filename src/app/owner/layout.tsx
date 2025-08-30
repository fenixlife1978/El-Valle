
'use client';

import {
    Home,
    Landmark,
    Settings,
} from 'lucide-react';
import { type ReactNode, useState, useEffect } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const ownerNavItems: NavItem[] = [
    { href: "/owner/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Mis Pagos",
      items: [
        { href: "/admin/payments", label: "Reportar Pago" },
      ]
    },
    { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

type UserProfile = {
    name: string;
    role: string;
};

export default function OwnerLayout({ children }: { children: ReactNode }) {
    const [user, loading] = useAuthState(auth);
    const [userProfile, setUserProfile] = useState<UserProfile>({ name: 'Propietario', role: 'Propietario' });

    useEffect(() => {
        if (user) {
            const fetchUserProfile = async () => {
                const userDocRef = doc(db, 'owners', user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const data = userDocSnap.data();
                    setUserProfile({
                        name: data.name || 'Propietario',
                        role: data.role || 'Propietario'
                    });
                }
            };
            fetchUserProfile();
        }
    }, [user]);

    if (loading) {
        return <div>Cargando...</div>;
    }

    return (
        <DashboardLayout userName={userProfile.name} userRole={userProfile.role} navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

    
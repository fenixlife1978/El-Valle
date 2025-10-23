'use client';

import {
    Home,
    Landmark,
    Settings,
    History
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { Loader2 } from 'lucide-react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const ownerNavItems: NavItem[] = [
    { href: "/owner/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Reportar Pago",
    },
    { href: "/owner/history", icon: History, label: "Historial de Reportes"},
    { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                const ownerDocRef = doc(db, "owners", firebaseUser.uid);
                const ownerSnap = await getDoc(ownerDocRef);
                if (ownerSnap.exists()) {
                    const data = { id: ownerSnap.id, ...ownerSnap.data() };
                    setOwnerData(data);

                    if (!data.passwordChanged && pathname !== '/owner/change-password') {
                        router.push('/owner/change-password');
                    }
                } else {
                    // This case might mean the user exists in Auth but not in Firestore 'owners' collection
                    // Handle as appropriate, e.g. sign out or redirect
                    router.push('/login?role=owner');
                }
            } else {
                setUser(null);
                setOwnerData(null);
                router.push('/login?role=owner');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [router, pathname]);


    if (loading || !user || !ownerData) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    // Additional check for password change redirection
    if (pathname !== '/owner/change-password' && !ownerData.passwordChanged) {
        return (
             <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <DashboardLayout ownerData={ownerData} userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

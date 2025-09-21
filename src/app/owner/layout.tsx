'use client';

import {
    Home,
    Landmark,
    Settings,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login?role=owner');
            return;
        }

        const session = JSON.parse(userSession);
        
        // If password needs changing and user is not on the change-password page, redirect.
        if (session.passwordChanged === false && window.location.pathname !== '/owner/change-password') {
            router.replace('/owner/change-password');
            return;
        }
        
        const userRef = doc(db, 'owners', session.uid);
        const unsubscribe = onSnapshot(userRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.passwordChanged === false && window.location.pathname !== '/owner/change-password') {
                    // Update localStorage and redirect if DB shows password change is still needed
                    localStorage.setItem('user-session', JSON.stringify({ ...session, passwordChanged: false }));
                    router.replace('/owner/change-password');
                } else {
                    setLoading(false);
                }
            } else {
                // User doc deleted, log them out
                localStorage.removeItem('user-session');
                router.push('/login?role=owner');
            }
        });

        return () => unsubscribe();
        
    }, [router]);

    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin"/>
            </div>
        );
    }

    return (
        <DashboardLayout userName="Propietario" userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}

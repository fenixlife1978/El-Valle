
'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface AuthContextType {
    user: User | null;
    ownerData: any | null;
    role: string | null;
    loading: boolean;
    isSuperAdmin: boolean;
    companyInfo: any | null;
    activeRate: any | null;
    bcvLogoUrl: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_EMAIL = 'vallecondo@gmail.com';
const BCV_LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/BCV_logo.svg/2048px-BCV_logo.svg.png';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any>(null);
    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [activeRate, setActiveRate] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Subscribe to company settings changes
        const settingsRef = doc(db, 'config', 'mainSettings');
        const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data();
                setCompanyInfo(settings.companyInfo || null);

                const rates = (settings.exchangeRates || []);
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) {
                    setActiveRate(activeRateObj);
                } else if (rates.length > 0) {
                    const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setActiveRate(sortedRates[0]);
                }
            }
        }, (error) => {
            console.error("Error fetching company settings:", error);
        });

        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            setLoading(true);
            if (firebaseUser) {
                setUser(firebaseUser);
                const isSuper = firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

                try {
                    const snap = await getDoc(doc(db, 'owners', firebaseUser.uid));
                    if (snap.exists()) {
                        setOwnerData(snap.data());
                    } else if (isSuper) {
                        setOwnerData({ role: 'super-admin', email: ADMIN_EMAIL, name: 'Administrador Maestro' });
                    }
                } catch (e) {
                    console.error("Error fetching owner data:", e);
                    if (isSuper) setOwnerData({ role: 'super-admin' });
                }
            } else {
                setUser(null);
                setOwnerData(null);
            }
            setLoading(false);
        });

        return () => {
            unsubscribeAuth();
            unsubscribeSettings();
        };
    }, []);

    const value: AuthContextType = {
        user,
        ownerData,
        role: ownerData?.role || (user?.email === ADMIN_EMAIL ? 'super-admin' : null),
        loading,
        isSuperAdmin: user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
        companyInfo,
        activeRate,
        bcvLogoUrl: BCV_LOGO_URL,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return context;
};

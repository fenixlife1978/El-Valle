
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
        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            setLoading(true);
            try {
                if (firebaseUser) {
                    setUser(firebaseUser);
                    const isSuper = firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

                    // For Super Admin, bypass Firestore read for profile
                    if (isSuper) {
                        setOwnerData({ role: 'super-admin', email: ADMIN_EMAIL, name: 'Super Administrador' });
                    } else {
                        // For regular users, fetch profile from Firestore
                        const snap = await getDoc(doc(db, 'owners', firebaseUser.uid));
                        if (snap.exists()) {
                            setOwnerData(snap.data());
                        } else {
                            setOwnerData(null); // Explicitly set to null if not found
                        }
                    }
                } else {
                    setUser(null);
                    setOwnerData(null);
                }
            } catch (error) {
                console.error("Auth State Change Error:", error);
                // In case of error, ensure state is clean
                setUser(null);
                setOwnerData(null);
            } finally {
                setLoading(false);
            }
        });
        
        // General config listener (publicly readable)
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
                } else {
                    setActiveRate(null);
                }
            }
        }, (error) => {
            console.error("Error fetching company settings:", error);
        });

        return () => {
            unsubscribeAuth();
            unsubscribeSettings();
        };
    }, []);

    const value: AuthContextType = {
        user,
        ownerData,
        role: ownerData?.role || null,
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

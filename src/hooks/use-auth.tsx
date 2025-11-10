
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useToast } from './use-toast';
import { db, auth } from '@/lib/firebase';
import { ensureOwnerProfile } from '@/lib/user-sync';
import { User } from 'firebase/auth';

type CompanyInfo = {
    name: string;
    logo: string;
};

type ExchangeRate = {
    id: string;
    date: string; 
    rate: number;
    active: boolean;
};

type AuthContextType = {
    user: User | null | undefined;
    ownerData: any | null;
    role: string | null;
    loading: boolean;
    companyInfo: CompanyInfo | null;
    activeRate: ExchangeRate | null;
    bcvLogoUrl: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, authLoading, authError] = useAuthState(auth);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState<ExchangeRate | null>(null);
    const [bcvLogoUrl, setBcvLogoUrl] = useState<string | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        if (authLoading) return; // Wait until auth state is determined

        let ownerUnsubscribe: (() => void) | undefined;

        if (user) {
            // Ensure profile exists and then set up listener
            ensureOwnerProfile(user, toast).then(() => {
                const ownerRef = doc(db, 'owners', user.uid);
                ownerUnsubscribe = onSnapshot(ownerRef, (snapshot) => {
                    if (snapshot.exists()) {
                        const data = snapshot.data();
                        setOwnerData({ id: snapshot.id, ...data });
                        setRole(data.role || 'propietario');
                    } else {
                        // This case should be rare after ensureOwnerProfile
                        setOwnerData(null);
                        setRole(null);
                    }
                    setProfileLoading(false);
                });
            }).catch(error => {
                console.error("Failed to ensure owner profile:", error);
                setProfileLoading(false);
            });
        } else {
            // No user, clear all data
            setOwnerData(null);
            setRole(null);
            setProfileLoading(false);
        }
        
        return () => {
            if (ownerUnsubscribe) {
                ownerUnsubscribe();
            }
        };
    }, [user, authLoading, toast]);


    useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, 
            (docSnap) => {
                if (docSnap.exists()) {
                    const settingsData = docSnap.data();
                    setCompanyInfo(settingsData.companyInfo as CompanyInfo);
                    setBcvLogoUrl(settingsData.bcvLogo || null);

                    const rates: ExchangeRate[] = settingsData.exchangeRates || [];
                    let currentActiveRate = rates.find(r => r.active) || null;
                    if (!currentActiveRate && rates.length > 0) {
                        currentActiveRate = [...rates].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                    }
                    setActiveRate(currentActiveRate);
                }
            },
            (error) => {
                console.error("Error fetching settings:", error);
            }
        );

        return () => {
            settingsUnsubscribe();
        };
    }, []);

    const loading = authLoading || profileLoading;

    const value = {
        user,
        ownerData,
        role,
        loading,
        companyInfo,
        activeRate,
        bcvLogoUrl,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

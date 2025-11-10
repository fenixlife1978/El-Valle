
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ensureOwnerProfile } from '@/lib/user-sync';
import { useToast } from './use-toast';
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
    const [firebaseUser, authLoading] = useAuthState(auth);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState<ExchangeRate | null>(null);
    const [bcvLogoUrl, setBcvLogoUrl] = useState<string | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    await ensureOwnerProfile(user, toast);
                    const ownerRef = doc(db, 'owners', user.uid);
                    
                    const unsubscribeProfile = onSnapshot(ownerRef, (snapshot) => {
                        if (snapshot.exists()) {
                            const data = snapshot.data();
                            setOwnerData({ id: snapshot.id, ...data });
                            setRole(data.role || 'propietario');
                        } else {
                            setOwnerData(null);
                            setRole(null);
                        }
                         setLoading(false);
                    }, (error) => {
                        console.error("Error listening to owner profile:", error);
                        setOwnerData(null);
                        setRole(null);
                        setLoading(false);
                    });
                     // We don't return unsubscribeProfile here because onAuthStateChanged listener is the main one.
                } catch (error) {
                    console.error("Error ensuring owner profile:", error);
                    toast({ variant: 'destructive', title: 'Error de Sincronización', description: 'No se pudo sincronizar tu perfil.' });
                    setOwnerData(null);
                    setRole(null);
                    setLoading(false);
                }
            } else {
                setOwnerData(null);
                setRole(null);
                setLoading(false);
            }
        });

        const settingsRef = doc(db, 'config', 'mainSettings');
        const unsubscribeSettings = onSnapshot(settingsRef, 
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
            unsubscribeAuth();
            unsubscribeSettings();
        };
    }, [toast]);


    const value = {
        user: firebaseUser,
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

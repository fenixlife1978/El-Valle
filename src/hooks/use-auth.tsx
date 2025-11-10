
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useToast } from './use-toast';
import { db, auth } from '@/lib/firebase';
import { ensureOwnerProfile } from '@/lib/user-sync';

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
    user: User | null;
    ownerData: any | null;
    role: string | null;
    loading: boolean;
    companyInfo: CompanyInfo | null;
    activeRate: ExchangeRate | null;
    bcvLogoUrl: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState<ExchangeRate | null>(null);
    const [bcvLogoUrl, setBcvLogoUrl] = useState<string | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                if (firebaseUser) {
                    setUser(firebaseUser);
                    await ensureOwnerProfile(firebaseUser, toast); // Ensure profile exists or is linked

                    const ownerRef = doc(db, 'owners', firebaseUser.uid);
                    const ownerUnsubscribe = onSnapshot(ownerRef, (snapshot) => {
                        if (snapshot.exists()) {
                            const data = snapshot.data();
                            setOwnerData({ id: snapshot.id, ...data });
                            setRole(data.role || 'propietario');
                        } else {
                            // This might happen briefly during profile linking
                            setOwnerData(null);
                            setRole(null);
                        }
                    });
                    
                    // Do not set loading to false here, wait for settings
                    return () => ownerUnsubscribe(); // Cleanup owner listener
                } else {
                    setUser(null);
                    setOwnerData(null);
                    setRole(null);
                    // If no user, we still need to load settings before we stop loading
                }
            } catch (error) {
                console.error("Auth process error:", error);
                toast({ variant: 'destructive', title: 'Error de Autenticación', description: 'No se pudo procesar la sesión.' });
                setUser(null);
                setOwnerData(null);
                setRole(null);
            }
        });

        // Settings listener
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
                setLoading(false); // FINALLY, set loading to false after auth check AND settings load
            },
            (error) => {
                console.error("Error fetching settings:", error);
                setLoading(false); // Also stop loading on error
            }
        );

        return () => {
            unsubscribeAuth();
            settingsUnsubscribe();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


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

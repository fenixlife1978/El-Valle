
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useToast } from './use-toast';
import { db, auth } from '@/lib/firebase';
import { ensureOwnerProfile, ensureAdminProfile } from '@/lib/user-sync';

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

export type AuthContextType = {
    user: User | null | undefined;
    ownerData: any | null;
    role: string | null;
    loading: boolean;
    companyInfo: CompanyInfo | null;
    activeRate: ExchangeRate | null;
    bcvLogoUrl: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_EMAIL = 'vallecondo@gmail.com';
const ADMIN_USER_ID = 'valle-admin-main-account';


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
        let ownerUnsubscribe: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth(), async (firebaseUser) => {
            
            if (ownerUnsubscribe) {
                ownerUnsubscribe();
            }
            setLoading(true);

            if (firebaseUser) {
                setUser(firebaseUser);
                const isAdministrator = firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                
                try {
                    let userDocRef;
                    if (isAdministrator) {
                        setRole('administrador');
                        await ensureAdminProfile(toast);
                        userDocRef = doc(db(), 'owners', ADMIN_USER_ID);
                    } else {
                        setRole('propietario');
                        await ensureOwnerProfile(firebaseUser, toast);
                        userDocRef = doc(db(), 'owners', firebaseUser.uid);
                    }

                    ownerUnsubscribe = onSnapshot(userDocRef, (snapshot) => {
                        if (snapshot.exists()) {
                            setOwnerData({ id: snapshot.id, ...snapshot.data() });
                        } else {
                            setOwnerData(null);
                        }
                        setLoading(false);
                    });

                } catch (error) {
                    console.error("Failed to ensure user profile:", error);
                    toast({variant: 'destructive', title: 'Error de Sincronización', description: 'No se pudo verificar tu perfil de usuario.'});
                    setLoading(false);
                }

            } else {
                setUser(null);
                setOwnerData(null);
                setRole(null);
                setLoading(false);
            }
        });

        const settingsRef = doc(db(), 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settingsData = docSnap.data();
                setCompanyInfo(settingsData.companyInfo || null);
                setBcvLogoUrl(settingsData.bcvLogo || null);

                const rates: ExchangeRate[] = settingsData.exchangeRates || [];
                let currentActiveRate = rates.find(r => r.active) || null;
                if (!currentActiveRate && rates.length > 0) {
                    currentActiveRate = [...rates].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                }
                setActiveRate(currentActiveRate);
            } else {
                // If settings don't exist, set to null/empty state
                setCompanyInfo(null);
                setBcvLogoUrl(null);
                setActiveRate(null);
            }
        });

        return () => {
            unsubscribeAuth();
            settingsUnsubscribe();
            if (ownerUnsubscribe) {
                ownerUnsubscribe();
            }
        };
    }, [toast]);

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

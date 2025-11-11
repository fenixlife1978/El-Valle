
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
        const unsubscribeAuth = onAuthStateChanged(auth(), async (firebaseUser) => {
            let ownerUnsubscribe: (() => void) | undefined;
            if (firebaseUser) {
                setUser(firebaseUser);
                const isAdministrator = firebaseUser.email === ADMIN_EMAIL;
                const docId = isAdministrator ? ADMIN_USER_ID : firebaseUser.uid;
                
                try {
                    if (isAdministrator) {
                        await ensureAdminProfile(toast);
                    } else {
                        await ensureOwnerProfile(firebaseUser, toast);
                    }

                    const ownerRef = doc(db(), 'owners', docId);
                    ownerUnsubscribe = onSnapshot(ownerRef, (snapshot) => {
                        if (snapshot.exists()) {
                            const data = snapshot.data();
                            setOwnerData({ id: snapshot.id, ...data });
                            const userRole = String(data.role || 'propietario').toLowerCase();
                            setRole(userRole);
                        } else {
                            setOwnerData(null);
                            setRole(null);
                        }
                        setLoading(false);
                    }, (error) => {
                        console.error("Error fetching user profile:", error);
                        toast({variant: 'destructive', title: 'Error de Perfil', description: 'No se pudo cargar tu perfil.'});
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

            return () => {
                if (ownerUnsubscribe) {
                    ownerUnsubscribe();
                }
            };
        });

        const settingsRef = doc(db(), 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settingsData = docSnap.data();
                setCompanyInfo(settingsData.companyInfo as CompanyInfo);
                setBcvLogoUrl(settingsData.bcvLogo ?? null);

                const rates: ExchangeRate[] = settingsData.exchangeRates || [];
                let currentActiveRate = rates.find(r => r.active) || null;
                if (!currentActiveRate && rates.length > 0) {
                    currentActiveRate = [...rates].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                }
                setActiveRate(currentActiveRate);
            }
        });

        return () => {
            unsubscribeAuth();
            settingsUnsubscribe();
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

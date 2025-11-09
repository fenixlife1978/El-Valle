
'use client';

import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Cookies from 'js-cookie';
import { ensureAdminProfile } from '@/lib/user-sync';
import { useToast } from './use-toast';

const ADMIN_USER_ID = 'valle-admin-main-account';

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

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [role, setRole] = useState<string | null>(null);
    
    // Internal loading states
    const [authLoading, setAuthLoading] = useState(true);
    const [settingsLoading, setSettingsLoading] = useState(true);

    // Global settings state
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState<ExchangeRate | null>(null);
    const [bcvLogoUrl, setBcvLogoUrl] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const auth = getAuth();
        const settingsRef = doc(db, 'config', 'mainSettings');

        const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
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
            setSettingsLoading(false);
        }, (error) => {
            console.error("Error fetching settings:", error);
            toast({
                variant: 'destructive',
                title: 'Error de Configuración',
                description: 'No se pudo cargar la configuración de la aplicación.'
            });
            setSettingsLoading(false);
        });
        
        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                if (firebaseUser) {
                    setUser(firebaseUser);
                    const token = await firebaseUser.getIdToken();
                    Cookies.set('firebase-auth-token', token, { expires: 1, secure: true, sameSite: 'strict' });

                    await ensureAdminProfile(); 
                    
                    const adminDocRef = doc(db, "owners", ADMIN_USER_ID);
                    const adminSnap = await getDoc(adminDocRef);

                    let userRole: string | null = null;
                    let userData: any | null = null;
                    
                    if (adminSnap.exists() && adminSnap.data()?.email?.toLowerCase() === firebaseUser.email?.toLowerCase()) {
                        userData = { id: adminSnap.id, ...adminSnap.data() };
                        userRole = 'administrador';
                    } else {
                        const ownerDocRef = doc(db, "owners", firebaseUser.uid);
                        const ownerSnap = await getDoc(ownerDocRef);
                        if (ownerSnap.exists()) {
                            userData = { id: ownerSnap.id, ...ownerSnap.data() } as { id: string; role?: string };
                            userRole = userData.role || 'propietario';
                        }
                    }

                    setOwnerData(userData);
                    setRole(userRole);
                    if (userRole) {
                        Cookies.set('user-role', userRole, { expires: 1, secure: true, sameSite: 'strict' });
                    } else {
                        Cookies.remove('user-role');
                    }

                } else {
                    setUser(null);
                    setOwnerData(null);
                    setRole(null);
                    Cookies.remove('firebase-auth-token');
                    Cookies.remove('user-role');
                }
            } catch (error) {
                 console.error("Error during authentication process:", error);
                 toast({
                    variant: 'destructive',
                    title: 'Error de Autenticación',
                    description: 'No se pudo verificar la información del usuario.'
                });
                setUser(null);
                setOwnerData(null);
                setRole(null);
            } finally {
                setAuthLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            unsubscribeSettings();
        };
    }, [toast]);

    const loading = authLoading || settingsLoading;

    return { 
        user, 
        ownerData, 
        role, 
        loading,
        companyInfo,
        activeRate,
        bcvLogoUrl
    };
}

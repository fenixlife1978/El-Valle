'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface AuthContextType {
    user: User | null;
    ownerData: any | null;
    role: string | null;
    loading: boolean;
    isSuperAdmin: boolean;
    companyInfo: any | null;
    activeCondoId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_EMAIL = 'vallecondo@gmail.com';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [mounted, setMounted] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeCondoId, setActiveCondoId] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setOwnerData(null);
                setActiveCondoId(null);
                setLoading(false);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    useEffect(() => {
        if (!user) return;

        const isSuper = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        
        if (isSuper) {
            const supportId = typeof window !== 'undefined' ? localStorage.getItem('support_condo_id') : null;
            setOwnerData({ role: 'super-admin', condominioId: supportId });
            setActiveCondoId(supportId);
            setLoading(false);
        } else {
            const userRef = doc(db, 'users', user.uid);
            const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setOwnerData(data);
                    setActiveCondoId(data.condominioId || null);
                } else {
                    setOwnerData(null);
                    setActiveCondoId(null);
                }
                setLoading(false);
            }, (error) => {
                console.error("Error fetching user profile:", error);
                setLoading(false);
            });
            return () => unsubscribeUser();
        }
    }, [user]);

    useEffect(() => {
        if (!activeCondoId) {
            setCompanyInfo(null);
            return;
        }
        const configRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                setCompanyInfo(docSnap.data().companyInfo || null);
            }
        }, () => setCompanyInfo(null));
        return () => unsubscribeConfig();
    }, [activeCondoId]);

    if (!mounted) return null;

    const isSuper = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    const value: AuthContextType = {
        user,
        ownerData,
        role: isSuper ? 'super-admin' : (ownerData?.role || null),
        loading,
        isSuperAdmin: isSuper,
        companyInfo,
        activeCondoId
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return context;
};

'use client';

import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

interface AuthContextType {
    user: User | null;
    ownerData: any | null;
    companyInfo: any | null;
    loading: boolean;
    role: string | null;
    isSuperAdmin: boolean;
    activeCondoId: string | null;
    workingCondoId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [role, setUserRole] = useState<string | null>(null);
    const [activeCondoId, setActiveCondoId] = useState<string | null>(null);
    const [workingCondoId, setWorkingCondoId] = useState<string | null>(null);
    
    const isSuperAdmin = user?.email === 'vallecondo@gmail.com';

    useEffect(() => {
        const securityTimeout = setTimeout(() => setLoading(false), 8000);

        const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setLoading(false);
                clearTimeout(securityTimeout);
            }
        });

        return () => {
            unsubAuth();
            clearTimeout(securityTimeout);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        
        if (!user) {
            setOwnerData(null);
            setCompanyInfo(null);
            setActiveCondoId(null);
            setUserRole(null);
            setWorkingCondoId(null);
            return;
        }

        const storedCondoId = localStorage.getItem('activeCondoId');
        const storedRole = localStorage.getItem('userRole');
        const storedWorkingCondoId = localStorage.getItem('workingCondoId');

        setActiveCondoId(storedCondoId);
        setUserRole(storedRole);
        setWorkingCondoId(storedWorkingCondoId || storedCondoId);

        if (isSuperAdmin) {
            setOwnerData({ name: 'Super Admin', email: user.email });
            setUserRole('super-admin');
            setLoading(false);
            return;
        }

        if (!storedCondoId || !storedRole) {
            if (!loading) {
                 console.warn("No condoId or role found in storage.");
            }
            setLoading(false);
            return;
        }
        
        const ownersCollectionName = storedCondoId === 'condo_01' ? 'owners' : 'propietarios';
        const docRef = doc(db, 'condominios', storedCondoId, ownersCollectionName, user.uid);

        const unsubSnap = onSnapshot(docRef, async (snap) => {
            if (snap.exists()) {
                const userData = snap.data();
                setOwnerData({ ...userData });
            } else {
                console.warn("Authenticated user profile not found in DB, preventing sign-out loop:", user.uid);
                setOwnerData(null);
                setUserRole(null);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error de permisos en AuthProvider:", error);
            setLoading(false); 
            setOwnerData(null);
        });

        const settingsRef = doc(db, 'condominios', storedCondoId, 'config', 'mainSettings');
        const unsubSettings = onSnapshot(settingsRef, (settingsSnap) => {
            if (settingsSnap.exists()) {
                setCompanyInfo(settingsSnap.data().companyInfo);
            } else {
                setCompanyInfo(null);
            }
        });

        return () => {
            unsubSnap();
            unsubSettings();
        };
    }, [user, isSuperAdmin, loading]);


    const value = {
        user,
        ownerData,
        companyInfo,
        loading,
        role,
        isSuperAdmin,
        activeCondoId,
        workingCondoId,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

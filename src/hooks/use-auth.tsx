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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_EMAIL = 'vallecondo@gmail.com';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [mounted, setMounted] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setMounted(true);
        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setOwnerData(null);
                setLoading(false);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    useEffect(() => {
        if (!user) {
            setLoading(false); // No user, stop loading
            return;
        }

        const isSuper = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

        if (isSuper) {
            setOwnerData({ role: 'super-admin' });
            setLoading(false); // Super admin role is set, stop loading
            return;
        }

        const ownerDocRef = doc(db, 'owners', user.uid);
        const unsubscribeOwner = onSnapshot(ownerDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setOwnerData(docSnap.data());
            } else {
                console.warn(`User ${user.uid} authenticated but no owner profile found.`);
                setOwnerData(null);
            }
            setLoading(false); // Data loaded (or not found), stop loading
        }, (error) => {
             console.error("Error fetching owner profile:", error);
             setOwnerData(null);
             setLoading(false);
        });

        return () => unsubscribeOwner();

    }, [user]);
    
    // Listen to general config separately
    useEffect(() => {
      const configRef = doc(db, 'config', 'mainSettings');
      const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
        if(docSnap.exists()) {
          setCompanyInfo(docSnap.data().companyInfo || null);
        }
      }, (error) => {
          console.warn("Could not fetch company info:", error);
      });
      return () => unsubscribeConfig();
    }, []);
    
    if (!mounted) {
        return null; // Avoid hydration mismatch by not rendering on server
    }

    const value: AuthContextType = {
        user,
        ownerData,
        role: ownerData?.role || null,
        loading,
        isSuperAdmin: user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
        companyInfo
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return context;
};

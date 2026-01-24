'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export interface AuthContextType {
    user: User | null;
    ownerData: any | null;
    role: string | null;
    loading: boolean;
    isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_EMAIL = 'vallecondo@gmail.com';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false); // Detenemos la carga pase lo que pase
        });
        return () => unsubscribe();
    }, []);

    const isSuper = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    const value: AuthContextType = {
        user,
        ownerData: isSuper ? { role: 'super-admin' } : null,
        role: isSuper ? 'super-admin' : null, // IMPORTANTE: Super Admin es un rol válido
        loading: !mounted ? true : loading,
        isSuperAdmin: isSuper
    };

    // Evitamos errores de hidratación
    if (!mounted) return null;

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

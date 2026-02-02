'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const AuthContext = createContext<any>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Establecemos un timeout de seguridad para que el loading no sea eterno
        const securityTimeout = setTimeout(() => setLoading(false), 5000);

        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
            clearTimeout(securityTimeout);
            setUser(firebaseUser);
            setLoading(false);
            console.log("EFAS Auth: Usuario detectado ->", firebaseUser?.email);
        });

        return () => unsub();
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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

    // 1. Escuchar cambios de autenticación
    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setLoading(false);
                setUserRole(null);
                setOwnerData(null);
            }
        });
        return () => unsubAuth();
    }, []);

    // 2. Cargar datos de Firestore y NORMALIZAR ROLES
    useEffect(() => {
        if (typeof window === 'undefined' || !user) return;

        const storedCondoId = localStorage.getItem('activeCondoId');
        const storedWorkingId = localStorage.getItem('workingCondoId');
        
        setActiveCondoId(storedCondoId);
        setWorkingCondoId(storedWorkingId || storedCondoId);

        if (isSuperAdmin) {
            setUserRole('super-admin');
            setLoading(false);
            return;
        }

        if (!storedCondoId) {
            setLoading(false);
            return;
        }

        // Regla EFAS: condo_01 usa 'owners', los demás 'propietarios'
        const collectionName = storedCondoId === 'condo_01' ? 'owners' : 'propietarios';
        const docRef = doc(db, 'condominios', storedCondoId, collectionName, user.uid);

        const unsubSnap = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                const userData = snap.data();
                setOwnerData(userData);
                
                // --- TRADUCCIÓN DE ROLES PARA EVITAR REBOTE ---
                const dbRole = userData.role?.toLowerCase() || '';
                if (dbRole === 'propietario') {
                    setUserRole('owner'); // Next.js busca la carpeta /owner/
                } else if (dbRole === 'administrador' || dbRole === 'admin') {
                    setUserRole('admin'); // Next.js busca la carpeta /admin/
                } else {
                    setUserRole(dbRole);
                }
            }
            setLoading(false); // Terminamos la carga aquí
        }, (error) => {
            console.error("Error en Auth Snap:", error);
            setLoading(false);
        });

        const settingsRef = doc(db, 'condominios', storedCondoId, 'config', 'mainSettings');
        const unsubSettings = onSnapshot(settingsRef, (s) => {
            if (s.exists()) setCompanyInfo(s.data().companyInfo);
        });

        return () => {
            unsubSnap();
            unsubSettings();
        };
        // ELIMINAMOS 'loading' de las dependencias para romper el bucle infinito
    }, [user, isSuperAdmin]); 

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

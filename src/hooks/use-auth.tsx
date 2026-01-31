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
    workingCondoId: string | null; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_EMAIL = 'vallecondo@gmail.com';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeCondoId, setActiveCondoId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setLoading(false); // Si no hay usuario, deja de cargar para mostrar el login
            }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!user) return;

        if (user.email === ADMIN_EMAIL) {
            const supportId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
            const storedCondoId = typeof window !== 'undefined' ? localStorage.getItem('activeCondoId') : null;
            setActiveCondoId(supportId || storedCondoId);
            setUserRole('super-admin');
            setOwnerData({ name: 'Super Admin', role: 'super-admin' });
            setLoading(false);
            return;
        }
        
        const storedCondoId = localStorage.getItem('activeCondoId');
        const storedRole = localStorage.getItem('userRole');
    
        if (!storedCondoId || !storedRole) {
            // Solo si no hay NADA en storage después de logueado, lo mandamos fuera
            if (!loading) window.location.href = '/welcome';
            return;
        }
    
        const collectionName = storedRole === 'admin' ? 'admins' : 'owners';
        const docRef = doc(db, 'condominios', storedCondoId, collectionName, user.uid);
    
        const unsubSnap = onSnapshot(docRef, (snap) => {
            if (snap.exists() && snap.data().published !== false) {
                setOwnerData(snap.data());
                setActiveCondoId(storedCondoId);
                setUserRole(storedRole);
            } else {
                // Si el documento no existe o no está publicado
                auth.signOut();
                window.location.href = '/welcome';
            }
            setLoading(false); // SOLO QUITAMOS EL LOADING AQUÍ
        }, (error) => {
            console.error("Auth Snapshot Error:", error);
            auth.signOut();
            window.location.href = '/welcome';
        });
    
        return () => unsubSnap();
    }, [user, loading]);


    // Cargar información de la empresa (EFAS CondoSys) y el Condominio
    useEffect(() => {
        if (!activeCondoId) return;
        
        // Buscamos en la ruta de configuración que definimos para cada condominio
        const configRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCompanyInfo(data.companyInfo || data);
            }
        });
        return () => unsubscribeConfig();
    }, [activeCondoId]);
    
    const value: AuthContextType = {
        user,
        ownerData,
        role: userRole,
        loading,
        isSuperAdmin: user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
        companyInfo,
        activeCondoId,
        workingCondoId: activeCondoId 
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return context;
};

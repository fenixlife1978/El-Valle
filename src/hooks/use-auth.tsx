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
    workingCondoId: string | null; // Unificado para evitar errores entre módulos
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_EMAIL = 'vallecondo@gmail.com';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeCondoId, setActiveCondoId] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setOwnerData(null);
                setActiveCondoId(null);
                setCompanyInfo(null);
                setLoading(false);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    useEffect(() => {
        if (!user) return;

        const isSuper = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        let unsubscribeSnap: () => void;

        const fetchUserData = async () => {
            if (isSuper) {
                // Buscamos el ID seleccionado en localStorage. 
                // Si no hay ninguno, forzamos 'condo_01' para ver tus datos históricos.
                const storedId = typeof window !== 'undefined' ? localStorage.getItem('activeCondoId') : null;
                const supportId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
                
                const finalId = storedId || supportId || 'condo_01';
                
                setOwnerData({ role: 'super-admin', name: 'Super Admin' });
                setActiveCondoId(finalId);
                setLoading(false);
                return;
            }
            
            const ownerRef = doc(db, 'owners', user.uid);
            unsubscribeSnap = onSnapshot(ownerRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setOwnerData(data);
                    setActiveCondoId(data.condominioId || null);
                }
                setLoading(false);
            }, () => setLoading(false));
        };

        fetchUserData();
        return () => { if (unsubscribeSnap) unsubscribeSnap(); };
    }, [user]);

    // EFAS CondoSys: Sincronización de configuración del condominio
    useEffect(() => {
        if (!activeCondoId) return;

        // CORRECCIÓN: Ruta exacta según tu DB: mainSettings (con S mayúscula)
        const configRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Si la data viene envuelta en companyInfo la extraemos, si no, tomamos el doc completo
                setCompanyInfo(data.companyInfo || data);
            } else {
                setCompanyInfo(null);
            }
        }, (err) => {
            console.error("Error cargando configuración:", err);
        });
        
        return () => unsubscribeConfig();
    }, [activeCondoId]);
    
    const value: AuthContextType = {
        user,
        ownerData,
        role: user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'super-admin' : (ownerData?.role || null),
        loading,
        isSuperAdmin: user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
        companyInfo,
        activeCondoId,
        workingCondoId: activeCondoId // Mapeamos workingCondoId al mismo ID activo
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return context;
};
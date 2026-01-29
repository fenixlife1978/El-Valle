
'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, getDocs } from 'firebase/firestore';
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
        if (!user) {
            setLoading(false);
            return;
        };

        const isSuper = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        let unsubscribeSnap: () => void | undefined;

        const findAndSubscribe = async () => {
            setLoading(true);
            if (isSuper) {
                const storedId = typeof window !== 'undefined' ? localStorage.getItem('activeCondoId') : null;
                const supportId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
                const finalId = supportId || storedId || 'condo_01';
                
                setOwnerData({ role: 'super-admin', name: 'Super Admin' });
                setActiveCondoId(finalId);
                setLoading(false);
                return;
            }

            const condominiosSnapshot = await getDocs(collection(db, "condominios"));
            let userFound = false;

            for (const condoDoc of condominiosSnapshot.docs) {
                const condoId = condoDoc.id;
                const ownerRef = doc(db, 'condominios', condoId, 'owners', user.uid);
                const ownerSnap = await getDoc(ownerRef);

                if (ownerSnap.exists()) {
                    unsubscribeSnap = onSnapshot(ownerRef, (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            setOwnerData(data);
                            setActiveCondoId(data.condominioId || condoId);
                        } else {
                            setOwnerData(null);
                            setActiveCondoId(null);
                        }
                    });
                    userFound = true;
                    break;
                }
            }

            if (!userFound) {
                console.warn(`Auth-Hook: No profile found for user ${user.uid}`);
                setOwnerData(null);
                setActiveCondoId(null);
            }
            setLoading(false);
        };

        findAndSubscribe();

        return () => {
            if (unsubscribeSnap) {
                unsubscribeSnap();
            }
        };
    }, [user]);

    // EFAS CondoSys: Sincronización de configuración del condominio
    useEffect(() => {
        if (!activeCondoId) return;

        const configRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
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

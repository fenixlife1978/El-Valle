'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
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
                const supportId = typeof window !== 'undefined' ? localStorage.getItem('support_condo_id') : null;
                setOwnerData({ role: 'super-admin', name: 'Super Admin', condominioId: supportId });
                setActiveCondoId(supportId);
                setLoading(false);
                return;
            }

            // Intentamos buscar en 'owners' (tu colección principal según captura)
            const ownerRef = doc(db, 'owners', user.uid);
            
            unsubscribeSnap = onSnapshot(ownerRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    console.log("AuthProvider: Perfil encontrado en 'owners':", data);
                    setOwnerData(data);
                    // IMPORTANTE: Asegúrate que en Firestore el campo se llame exactamente 'condominioId'
                    setActiveCondoId(data.condominioId || null);
                } else {
                    console.error("AuthProvider: No existe el documento en 'owners' para el UID:", user.uid);
                }
                setLoading(false);
            }, (err) => {
                console.error("AuthProvider: Error leyendo perfil:", err);
                setLoading(false);
            });
        };

        fetchUserData();
        return () => { if (unsubscribeSnap) unsubscribeSnap(); };
    }, [user]);

    useEffect(() => {
        if (!activeCondoId) return;

        console.log("AuthProvider: Buscando config para condo:", activeCondoId);
        const configRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("AuthProvider: Datos de empresa recibidos:", data);
                setCompanyInfo({
                    name: data.nombre || data.name || "Sin Nombre",
                    rif: data.rif || "",
                    logo: data.logo || ""
                });
            } else {
                console.warn("AuthProvider: El documento 'config/mainSettings' NO EXISTE en la ruta.");
                setCompanyInfo(null);
            }
        }, (error) => {
            console.error("AuthProvider: Error de permisos/lectura en mainSettings:", error);
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
        activeCondoId
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return context;
};
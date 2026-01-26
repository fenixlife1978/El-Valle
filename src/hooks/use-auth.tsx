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

    // 1. Escuchar cambios de autenticación
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
            setLoading(true);
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

    // 2. Cargar perfil del usuario (Búsqueda en owners o users)
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

            // Buscamos primero en 'owners' como indica tu captura
            const ownerRef = doc(db, 'owners', user.uid);
            const ownerSnap = await getDoc(ownerRef);
            let finalRef = ownerRef;

            if (!ownerSnap.exists()) {
                const userRef = doc(db, 'users', user.uid);
                const userDocSnap = await getDoc(userRef);
                if (userDocSnap.exists()) {
                    finalRef = userRef;
                } else {
                    setOwnerData(null);
                    setLoading(false);
                    return;
                }
            }

            unsubscribeSnap = onSnapshot(finalRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setOwnerData(data);
                    // Aquí capturamos el ID del condominio (ej. "condo_01")
                    setActiveCondoId(data.condominioId || null);
                }
                setLoading(false);
            });
        };

        fetchUserData();
        return () => { if (unsubscribeSnap) unsubscribeSnap(); };
    }, [user]);

    // 3. Cargar información de la Empresa (Ruta: config/mainSettings)
    useEffect(() => {
        if (!activeCondoId) {
            setCompanyInfo(null);
            return;
        }

        // RUTA CONFIRMADA: condominios > {id} > config > mainSettings
        const configRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Si tienes los datos dentro de un objeto 'companyInfo', lo extraemos.
                // Si están sueltos en el documento, usamos la raíz 'data'.
                const rawInfo = data.companyInfo || data;

                setCompanyInfo({
                    name: rawInfo.nombre || rawInfo.name || "Condominio",
                    rif: rawInfo.rif || "",
                    logo: rawInfo.logo || "",
                    // Agregamos otros campos por si acaso
                    address: rawInfo.direccion || rawInfo.address || ""
                });
                console.log("AuthProvider: Configuración cargada correctamente");
            } else {
                console.warn("AuthProvider: No se encontró el documento mainSettings");
                setCompanyInfo(null);
            }
        }, (error) => {
            console.error("AuthProvider: Error cargando mainSettings:", error);
            setCompanyInfo(null);
        });
        
        return () => unsubscribeConfig();
    }, [activeCondoId]);
    
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

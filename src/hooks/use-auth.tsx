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
                setOwnerData(null);
                setActiveCondoId(null);
                setUserRole(null);
            }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!user) {
            // User is not logged in, AuthGuard will handle it.
            return;
        };

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
            if (!loading) window.location.href = '/welcome';
            return;
        }
    
        // All user profiles (admin, owner) are stored in the 'owners' collection per condo.
        const docRef = doc(db, 'condominios', storedCondoId, 'owners', user.uid);
    
        const unsubSnap = onSnapshot(docRef, async (snap) => {
            if (snap.exists() && snap.data().published !== false) {
                const userData = snap.data();
                
                // --- LÓGICA DINÁMICA DE LOGO ---
                let finalPhoto = userData.photoURL;
        
                if (!finalPhoto) {
                    // Si el propietario no tiene foto, buscamos el logo del condominio
                    const condoDoc = await getDoc(doc(db, 'condominios', storedCondoId));
                    if (condoDoc.exists()) {
                        finalPhoto = condoDoc.data().logoUrl; // Usamos el logo del edificio
                    }
                }
        
                setOwnerData({
                    ...userData,
                    photoURL: finalPhoto || '/default-avatar.png' // Fallback final
                });
                
                setActiveCondoId(storedCondoId);
                setUserRole(storedRole);
            } else {
                auth.signOut();
                window.location.href = '/welcome';
            }
            setLoading(false);
        },
        (error) => {
            // AQUÍ ES DONDE DABA EL "PERMISSION DENIED"
            console.error("Error de permisos en Firestore:", error);
            setLoading(false); // IMPORTANTE: dejar de cargar aunque falle
            setOwnerData(null); 
        });
    
        return () => unsubSnap();
    }, [user, loading]);

    // Cargar información de la empresa (EFAS CondoSys) y el Condominio
    useEffect(() => {
        if (!activeCondoId) {
            setCompanyInfo(null);
            return;
        }
        
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

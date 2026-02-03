
'use client';

import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

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
    
    const isSuperAdmin = user?.email === 'vallecondo@gmail.com';

    useEffect(() => {
        const securityTimeout = setTimeout(() => setLoading(false), 8000);

        const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setLoading(false);
                clearTimeout(securityTimeout);
            }
        });

        return () => {
            unsubAuth();
            clearTimeout(securityTimeout);
        };
    }, []);

    useEffect(() => {
        if (!user) {
            setOwnerData(null);
            setCompanyInfo(null);
            setActiveCondoId(null);
            setUserRole(null);
            return;
        }

        const storedCondoId = localStorage.getItem('activeCondoId');
        const storedRole = localStorage.getItem('userRole');

        if (isSuperAdmin) {
            setOwnerData({ name: 'Super Admin', email: user.email });
            setUserRole('super-admin');
            setLoading(false);
            return;
        }

        if (!storedCondoId || !storedRole) {
            if (!loading) {
                // signOut(auth); // Evita bucle si hay error de storage
            }
            return;
        }
        
        const ownersCollectionName = storedCondoId === 'condo_01' ? 'owners' : 'propietarios';
        const docRef = doc(db, 'condominios', storedCondoId, ownersCollectionName, user.uid);

        const unsubSnap = onSnapshot(docRef, async (snap) => {
            if (snap.exists()) {
                const userData = snap.data();
                let finalPhoto = userData.photoURL;

                if (!finalPhoto) {
                    try {
                        const condoDoc = await getDoc(doc(db, 'condominios', storedCondoId));
                        if (condoDoc.exists()) {
                            finalPhoto = condoDoc.data()?.logoUrl;
                        }
                    } catch (e) {
                        console.error("Error obteniendo logo del condominio:", e);
                    }
                }
                
                setOwnerData({ ...userData, photoURL: finalPhoto || '/default-avatar.png' });
                setActiveCondoId(storedCondoId);
                setUserRole(storedRole);
            } else {
                console.warn("Usuario no encontrado en la base de datos o perfil no publicado:", user.uid);
                signOut(auth);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error de permisos en AuthProvider:", error);
            setLoading(false); 
            setOwnerData(null);
        });

        // Cargar companyInfo
        const settingsRef = doc(db, 'condominios', storedCondoId, 'config', 'mainSettings');
        const unsubSettings = onSnapshot(settingsRef, (settingsSnap) => {
            if (settingsSnap.exists()) {
                setCompanyInfo(settingsSnap.data().companyInfo);
            }
        });

        return () => {
            unsubSnap();
            unsubSettings();
        };
    }, [user, isSuperAdmin, loading]);


    const value = {
        user,
        ownerData,
        companyInfo,
        loading,
        role,
        isSuperAdmin,
        activeCondoId,
        workingCondoId: localStorage.getItem('workingCondoId') || activeCondoId,
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

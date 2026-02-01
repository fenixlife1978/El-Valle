'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
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

    // 1. Escuchar cambios en el estado de autenticación de Firebase
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setLoading(false);
                setOwnerData(null);
                setActiveCondoId(null);
                setUserRole(null);
            }
        });
        return () => unsub();
    }, []);

    // 2. Cargar Perfil, Rol y Logo del Condominio
    useEffect(() => {
        if (!user) return;

        // --- Lógica para Super Admin ---
        if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            const supportId = typeof window !== 'undefined' ? localStorage.getItem('support_mode_id') : null;
            const storedCondoId = typeof window !== 'undefined' ? localStorage.getItem('activeCondoId') : null;
            
            setActiveCondoId(supportId || storedCondoId);
            setUserRole('super-admin');
            setOwnerData({ name: 'Super Admin', role: 'super-admin' });
            setLoading(false);
            return;
        }
        
        // --- Lógica para Admins y Owners ---
        const storedCondoId = localStorage.getItem('activeCondoId');
        const storedRole = localStorage.getItem('userRole');
    
        if (!storedCondoId || !storedRole) {
            // Si no hay datos en localStorage, esperamos a que el Login los ponga
            // No redirigimos aquí para evitar el "rebote" durante el proceso de login
            return;
        }
    
        // Buscamos siempre en 'owners' ya que los admins también residen ahí
        const docRef = doc(db, 'condominios', storedCondoId, 'owners', user.uid);
    
        const unsubSnap = onSnapshot(docRef, async (snap) => {
            if (snap.exists()) {
                const userData = snap.data();
                
                // Bloqueo si no está publicado
                if (userData.published === false) {
                    await signOut(auth);
                    window.location.href = '/welcome';
                    return;
                }
    
                // Lógica de Foto de Perfil / Logo de EFAS CondoSys
                let finalPhoto = userData.photoURL;
                if (!finalPhoto) {
                    try {
                        const condoDoc = await getDoc(doc(db, 'condominios', storedCondoId));
                        if (condoDoc.exists()) {
                            finalPhoto = condoDoc.data()?.logoUrl;
                        }
                    } catch (e) {
                        console.error("Error obteniendo logo de condominio:", e);
                    }
                }
    
                setOwnerData({
                    ...userData,
                    photoURL: finalPhoto || '/default-avatar.png'
                });
                
                setActiveCondoId(storedCondoId);
                setUserRole(storedRole);
                setLoading(false); 
            } else {
                console.error("Perfil no encontrado en subcolección owners");
                // Solo echamos al usuario si la carga de Firebase Auth ya terminó
                if (window.location.pathname !== '/welcome') {
                    await signOut(auth);
                    window.location.href = '/welcome';
                }
            }
        }, (error) => {
            console.error("Error de permisos en Firestore:", error);
            setLoading(false);
        });
    
        return () => unsubSnap();
    }, [user]); // Nota: Solo dependemos de 'user' para evitar bucles de carga

    // 3. Cargar información de la empresa (EFAS CondoSys)
    useEffect(() => {
        if (!activeCondoId) {
            setCompanyInfo(null);
            return;
        }
        
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

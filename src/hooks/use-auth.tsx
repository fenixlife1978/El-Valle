'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  ownerData: any | null;
  userProfile: any | null;
  companyInfo: any | null;
  loading: boolean;
  role: string | null;
  isSuperAdmin: boolean;
  activeCondoId: string | null;
  workingCondoId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SUPER_ADMIN_EMAIL = 'vallecondo@gmail.com';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ownerData, setOwnerData] = useState<any | null>(null);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [role, setUserRole] = useState<string | null>(null);
  const [activeCondoId, setActiveCondoId] = useState<string | null>(null);
  const [workingCondoId, setWorkingCondoId] = useState<string | null>(null);

  const isSuperAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    // 1. Cargar estados desde localStorage al montar
    const savedCondo = localStorage.getItem('activeCondoId');
    const savedRole = localStorage.getItem('userRole');
    
    // Sanitizar valores de localStorage
    const validCondo = (savedCondo && savedCondo !== 'null' && savedCondo !== 'undefined' && savedCondo !== '[condoId]') ? savedCondo : null;
    const validRole = (savedRole && savedRole !== 'null' && savedRole !== 'undefined') ? savedRole : null;

    if (validCondo) {
        setActiveCondoId(validCondo);
        setWorkingCondoId(validCondo);
    }
    if (validRole) setUserRole(validRole);

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setOwnerData(null);
          setUserRole(null);
          setActiveCondoId(null);
          setWorkingCondoId(null);
          setLoading(false);
          return;
        }

        setUser(firebaseUser);

        // Caso Super Admin: Prioridad absoluta y retorno rápido
        if (firebaseUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
          const sAdminRole = 'super-admin';
          setUserRole(sAdminRole);
          localStorage.setItem('userRole', sAdminRole);
          
          const targetCondo = validCondo || 'condo_01';
          setActiveCondoId(targetCondo);
          setWorkingCondoId(targetCondo);
          
          setOwnerData({ 
            name: 'Super Administrador', 
            role: sAdminRole, 
            email: firebaseUser.email,
            uid: firebaseUser.uid 
          });
          
          setLoading(false);
          return;
        }

        // Caso Usuario Regular
        if (validCondo) {
          // Búsqueda en Doble Estructura (Owners vs Propietarios)
          const oldRef = doc(db, 'condominios', validCondo, 'owners', firebaseUser.uid);
          const newRef = doc(db, 'condominios', validCondo, 'propietarios', firebaseUser.uid);
          
          const [oldSnap, newSnap] = await Promise.all([getDoc(oldRef), getDoc(newRef)]);

          let userData = null;
          if (newSnap.exists()) userData = newSnap.data();
          else if (oldSnap.exists()) userData = oldSnap.data();

          if (userData) {
            setOwnerData(userData);
            
            const rawRole = (userData.role || validRole || '').toLowerCase();
            let finalRole = 'owner';
            if (['admin', 'administrador', 'junta'].includes(rawRole)) {
              finalRole = 'admin';
            }

            setUserRole(finalRole);
            localStorage.setItem('userRole', finalRole);

            // Suscripción a Configuración
            const settingsRef = doc(db, 'condominios', validCondo, 'config', 'mainSettings');
            onSnapshot(settingsRef, (s) => {
              if (s.exists()) setCompanyInfo(s.data().companyInfo);
            }, (err) => console.warn("Error leyendo mainSettings:", err));
          }
        }
      } catch (error) {
        console.error("EFAS Sync Error:", error);
      } finally {
        // Asegurar que loading siempre sea false después de un breve delay para estabilidad
        setTimeout(() => setLoading(false), 200);
      }
    });

    return () => unsubAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      ownerData, 
      userProfile: ownerData, 
      companyInfo, 
      loading, 
      role, 
      isSuperAdmin, 
      activeCondoId, 
      workingCondoId 
    }}>
      {!loading ? children : (
        <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23] font-montserrat">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="h-14 w-14 border-4 border-[#F28705]/10 border-t-[#F28705] rounded-full animate-spin mx-auto"></div>
              <div className="absolute inset-0 bg-[#F28705]/5 blur-xl rounded-full animate-pulse"></div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 animate-pulse">
              EFAS CONDOSYS: SINCRONIZANDO
            </p>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

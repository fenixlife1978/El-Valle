'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';

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
  
  // Inicializamos desde localStorage para evitar el "hueco" de tiempo que causa el rebote
  const [role, setUserRole] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('userRole') : null
  );
  const [activeCondoId, setActiveCondoId] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('activeCondoId') : null
  );
  const [workingCondoId, setWorkingCondoId] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('workingCondoId') : null
  );

  const isSuperAdmin = user?.email === 'vallecondo@gmail.com';

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
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

      // Recuperar IDs del login
      const savedCondoId = localStorage.getItem('activeCondoId');
      const savedRole = localStorage.getItem('userRole');

      // Caso Super Admin
      if (firebaseUser.email === 'vallecondo@gmail.com') {
        setUserRole('super-admin');
        setActiveCondoId(savedCondoId);
        setWorkingCondoId(savedCondoId || 'condo_01');
        setLoading(false);
        return;
      }

      try {
        const condoIdToUse = savedCondoId || activeCondoId;
        
        if (condoIdToUse) {
          setActiveCondoId(condoIdToUse);
          setWorkingCondoId(condoIdToUse);

          let userData = null;

          // Búsqueda en Doble Estructura (Detección de Propietario/Admin)
          const oldOwnerRef = doc(db, 'condominios', condoIdToUse, 'owners', firebaseUser.uid);
          const newOwnerRef = doc(db, 'condominios', condoIdToUse, 'propietarios', firebaseUser.uid);
          
          const [oldSnap, newSnap] = await Promise.all([
            getDoc(oldOwnerRef),
            getDoc(newOwnerRef)
          ]);

          if (newSnap.exists()) {
            userData = newSnap.data();
          } else if (oldSnap.exists()) {
            userData = oldSnap.data();
          }

          if (userData) {
            setOwnerData(userData);
            
            // NORMALIZACIÓN ESTRICTA: Evita rebotes por idioma del rol
            const rawRole = (userData.role || savedRole || '').toLowerCase();
            let finalRole = rawRole;

            if (['propietario', 'owner', 'residente'].includes(rawRole)) {
              finalRole = 'owner';
            } else if (['administrador', 'admin', 'junta'].includes(rawRole)) {
              finalRole = 'admin';
            }

            setUserRole(finalRole);
            localStorage.setItem('userRole', finalRole); // Actualizamos persistencia

            // Suscripción a Configuración
            const settingsRef = doc(db, 'condominios', condoIdToUse, 'config', 'mainSettings');
            onSnapshot(settingsRef, (s) => {
              if (s.exists()) setCompanyInfo(s.data().companyInfo);
            }, () => {
              setCompanyInfo({ name: "EFAS CondoSys" });
            });
          } else {
            // Fallback si no está en la base de datos pero hay rol guardado
            if (savedRole) setUserRole(savedRole);
          }
        }
      } catch (error) {
        console.error("Error en Sincronización EFAS:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, [activeCondoId]);

  return (
    <AuthContext.Provider value={{ user, ownerData, companyInfo, loading, role, isSuperAdmin, activeCondoId, workingCondoId }}>
      {!loading ? children : (
        <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="h-14 w-14 border-4 border-[#F28705]/10 border-t-[#F28705] rounded-full animate-spin mx-auto"></div>
              <div className="absolute inset-0 bg-[#F28705]/5 blur-xl rounded-full animate-pulse"></div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 animate-pulse">
              EFAS CONDOSYS: Sincronizando
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
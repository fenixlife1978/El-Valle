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
  const [role, setUserRole] = useState<string | null>(null);
  const [activeCondoId, setActiveCondoId] = useState<string | null>(null);
  const [workingCondoId, setWorkingCondoId] = useState<string | null>(null);

  const isSuperAdmin = user?.email === 'vallecondo@gmail.com';

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (!firebaseUser) {
        setOwnerData(null);
        setUserRole(null);
        setActiveCondoId(null);
        setWorkingCondoId(null);
        setLoading(false);
        return;
      }

      // Recuperar IDs guardados en el Login
      const savedCondoId = localStorage.getItem('activeCondoId');
      const savedRole = localStorage.getItem('userRole');

      if (firebaseUser.email === 'vallecondo@gmail.com') {
        setUserRole('super-admin');
        setActiveCondoId(savedCondoId);
        setWorkingCondoId(savedCondoId || 'condo_01');
        setLoading(false);
        return;
      }

      try {
        const condoIdToUse = savedCondoId;
        
        if (condoIdToUse) {
          setActiveCondoId(condoIdToUse);
          setWorkingCondoId(condoIdToUse);

          let userData = null;

          // 1. BÚSQUEDA SECUENCIAL (VIEJA -> NUEVA ESTRUCTURA)
          
          // Intento A: Vieja estructura (owners)
          const oldOwnerRef = doc(db, 'condominios', condoIdToUse, 'owners', firebaseUser.uid);
          const oldSnap = await getDoc(oldOwnerRef);

          if (oldSnap.exists()) {
            userData = oldSnap.data();
          } else {
            // Intento B: Nueva estructura (propietarios)
            const newOwnerRef = doc(db, 'condominios', condoIdToUse, 'propietarios', firebaseUser.uid);
            const newSnap = await getDoc(newOwnerRef);
            if (newSnap.exists()) {
              userData = newSnap.data();
            }
          }

          if (userData) {
            setOwnerData(userData);
            
            // Mapeo y Normalización de Roles EFAS
            const rawRole = (userData.role || savedRole || '').toLowerCase();
            if (rawRole === 'propietario' || rawRole === 'owner') {
              setUserRole('owner');
            } else if (rawRole === 'administrador' || rawRole === 'admin') {
              setUserRole('admin');
            } else {
              setUserRole(rawRole);
            }

            // 2. Suscripción a Configuración (Logo, Nombre, etc.)
            const settingsRef = doc(db, 'condominios', condoIdToUse, 'config', 'mainSettings');
            onSnapshot(settingsRef, 
              (s) => {
                if (s.exists()) setCompanyInfo(s.data().companyInfo);
              },
              () => {
                // Fallback si no hay permisos o no existe
                setCompanyInfo({ name: "EFAS CondoSys" });
              }
            );
          }
        }
      } catch (error) {
        console.error("Error en Sincronización EFAS:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, ownerData, companyInfo, loading, role, isSuperAdmin, activeCondoId, workingCondoId }}>
      {!loading ? children : (
        <div className="h-screen flex items-center justify-center bg-[#1A1D23]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#F28705] mx-auto mb-4"></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sincronizando EFAS...</p>
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
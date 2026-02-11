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
  
  // Persistencia inmediata
  const [role, setUserRole] = useState<string | null>(null);
  const [activeCondoId, setActiveCondoId] = useState<string | null>(null);
  const [workingCondoId, setWorkingCondoId] = useState<string | null>(null);

  const isSuperAdmin = user?.email === 'vallecondo@gmail.com';

  useEffect(() => {
    // 1. Cargar estados desde localStorage al montar por primera vez
    const savedCondo = localStorage.getItem('activeCondoId');
    const savedRole = localStorage.getItem('userRole');
    if (savedCondo) {
        setActiveCondoId(savedCondo);
        setWorkingCondoId(savedCondo);
    }
    if (savedRole) setUserRole(savedRole);

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

      // Re-validar contra localStorage por si el estado se perdió
      const currentCondoId = savedCondo || localStorage.getItem('activeCondoId');

      // Caso Super Admin
      if (firebaseUser.email === 'vallecondo@gmail.com') {
        setUserRole('super-admin');
        setActiveCondoId(currentCondoId);
        setWorkingCondoId(currentCondoId || 'condo_01');
        setLoading(false);
        return;
      }

      try {
        if (currentCondoId) {
          // Búsqueda en Doble Estructura
          const oldOwnerRef = doc(db, 'condominios', currentCondoId, 'owners', firebaseUser.uid);
          const newOwnerRef = doc(db, 'condominios', currentCondoId, 'propietarios', firebaseUser.uid);
          
          const [oldSnap, newSnap] = await Promise.all([
            getDoc(oldOwnerRef),
            getDoc(newOwnerRef)
          ]);

          let userData = null;
          if (newSnap.exists()) userData = newSnap.data();
          else if (oldSnap.exists()) userData = oldSnap.data();

          if (userData) {
            setOwnerData(userData);
            
            // Normalización Robusta
            const rawRole = (userData.role || savedRole || '').toLowerCase();
            let finalRole = rawRole;

            if (['propietario', 'owner', 'residente'].includes(rawRole)) {
              finalRole = 'owner';
            } else if (['administrador', 'admin', 'junta'].includes(rawRole)) {
              finalRole = 'admin';
            }

            setUserRole(finalRole);
            localStorage.setItem('userRole', finalRole);

            // Suscripción a Configuración
            const settingsRef = doc(db, 'condominios', currentCondoId, 'config', 'mainSettings');
            onSnapshot(settingsRef, (s) => {
              if (s.exists()) setCompanyInfo(s.data().companyInfo);
            });
          }
        }
      } catch (error) {
        console.error("EFAS Sync Error:", error);
      } finally {
        // Pequeño delay para que los estados de role y condoId se asienten
        // antes de apagar el Loader y disparar los Layouts.
        setTimeout(() => setLoading(false), 100);
      }
    });

    return () => unsubAuth();
  }, []); // Sin dependencias para evitar reinicios del observador

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
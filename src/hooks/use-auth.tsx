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

        // Caso Super Admin
        if (firebaseUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
          const sAdminRole = 'super-admin';
          const savedCondo = localStorage.getItem('activeCondoId');
          const targetCondo = (savedCondo && savedCondo !== 'null') ? savedCondo : 'condo_01';
          
          setUserRole(sAdminRole);
          setActiveCondoId(targetCondo);
          setWorkingCondoId(targetCondo);
          localStorage.setItem('userRole', sAdminRole);
          setOwnerData({ name: 'Super Admin', role: sAdminRole, email: firebaseUser.email, uid: firebaseUser.uid });
          setLoading(false);
          return;
        }

        // Recuperar persistencia sanitizada
        const savedCondo = localStorage.getItem('activeCondoId');
        const validCondo = (savedCondo && savedCondo !== 'null' && savedCondo !== 'undefined') ? savedCondo : null;

        if (validCondo) {
          // 1. INTENTO EN SUBCOLECCIONES DEL CONDOMINIO (NUEVA Y VIEJA)
          const newRef = doc(db, 'condominios', validCondo, 'propietarios', firebaseUser.uid);
          const oldRef = doc(db, 'condominios', validCondo, 'owners', firebaseUser.uid);
          
          const [newSnap, oldSnap] = await Promise.all([getDoc(newRef), getDoc(oldRef)]);
          let userData = newSnap.exists() ? newSnap.data() : (oldSnap.exists() ? oldSnap.data() : null);

          // 2. RESPALDO: SI NO EXISTE EN CONDOMINIO, BUSCAR EN COLECCIONES RAÍZ
          if (!userData) {
            const rootUsuariosRef = doc(db, 'usuarios', firebaseUser.uid);
            const rootUsersRef = doc(db, 'users', firebaseUser.uid);
            
            const [rootSnap1, rootSnap2] = await Promise.all([getDoc(rootUsuariosRef), getDoc(rootUsersRef)]);
            userData = rootSnap1.exists() ? rootSnap1.data() : (rootSnap2.exists() ? rootSnap2.data() : null);
          }

          if (userData) {
            setOwnerData(userData);
            const rawRole = (userData.role || '').toLowerCase();
            const finalRole = ['admin', 'administrador', 'junta'].includes(rawRole) ? 'admin' : 'owner';
            
            setUserRole(finalRole);
            setActiveCondoId(validCondo);
            setWorkingCondoId(validCondo);
            localStorage.setItem('userRole', finalRole);

            const settingsRef = doc(db, 'condominios', validCondo, 'config', 'mainSettings');
            onSnapshot(settingsRef, (s) => {
              if (s.exists()) setCompanyInfo(s.data().companyInfo);
            });
          }
        }
      } catch (error) {
        console.error("EFAS Sync Error:", error);
      } finally {
        setTimeout(() => setLoading(false), 400);
      }
    });

    return () => unsubAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, ownerData, userProfile: ownerData, companyInfo, 
      loading, role, isSuperAdmin, activeCondoId, workingCondoId 
    }}>
      {!loading ? children : (
        <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23] font-montserrat">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="h-14 w-14 border-4 border-[#F28705]/10 border-t-[#F28705] rounded-full animate-spin mx-auto"></div>
              <div className="absolute inset-0 bg-[#F28705]/5 blur-xl rounded-full animate-pulse"></div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 animate-pulse">
              EFASCondoSys: VERIFICANDO CREDENCIALES
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
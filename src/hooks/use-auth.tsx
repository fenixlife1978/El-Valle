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
        setLoading(false);
        setUserRole(null);
        setActiveCondoId(null);
        setWorkingCondoId(null);
        return;
      }

      // Recuperar datos validados en el Login para evitar rebotes
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

          let userDataFound = null;

          // --- ESTRATEGIA DE BÚSQUEDA JERÁRQUICA EFAS ---
          
          // 1. Intentar Estructura Vieja (owners) - Ej: condo_01
          const ownerRef = doc(db, 'condominios', condoIdToUse, 'owners', firebaseUser.uid);
          const ownerSnap = await getDoc(ownerRef);

          if (ownerSnap.exists()) {
            userDataFound = ownerSnap.data();
          } else {
            // 2. Intentar Estructura Nueva (propietarios) - Ej: condo_02
            const propRef = doc(db, 'condominios', condoIdToUse, 'propietarios', firebaseUser.uid);
            const propSnap = await getDoc(propRef);
            if (propSnap.exists()) {
              userDataFound = propSnap.data();
            }
          }

          if (userDataFound) {
            setOwnerData(userDataFound);
            
            // Mapeo de roles unificado (Español/Inglés)
            const rawRole = (userDataFound.role || savedRole || '').toLowerCase();
            if (rawRole === 'propietario' || rawRole === 'owner') {
              setUserRole('owner');
            } else if (rawRole === 'administrador' || rawRole === 'admin') {
              setUserRole('admin');
            } else {
              setUserRole(rawRole);
            }

            // 3. Suscripción a Configuración del Condominio
            const settingsRef = doc(db, 'condominios', condoIdToUse, 'config', 'mainSettings');
            
            onSnapshot(settingsRef, 
              (s) => {
                if (s.exists()) setCompanyInfo(s.data().companyInfo);
              },
              (error) => {
                console.warn("Permisos: No se pudo leer companyInfo, usando genérico.");
                setCompanyInfo({ name: "EFAS CondoSys" });
              }
            );
          }
        }
      } catch (error) {
        console.error("Error crítico en EFAS Auth:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, ownerData, companyInfo, loading, role, isSuperAdmin, activeCondoId, workingCondoId }}>
      {!loading ? children : (
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">
              EFAS CondoSys Sincronizando...
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

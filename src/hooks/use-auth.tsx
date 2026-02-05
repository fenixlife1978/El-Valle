'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, collectionGroup, query, where, getDocs, limit, getDoc } from 'firebase/firestore';

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
        return;
      }

      
      if (firebaseUser.email === 'vallecondo@gmail.com') {
        setUserRole('super-admin');
        setLoading(false);
        return;
      }

      try {
        // --- MÉTODO 1: Intento Directo (Evita errores de índice/permisos si es condo_01) ---
        // Muchos de tus propietarios están en condo_01/owners. Intentamos ruta directa primero.
        const directRef = doc(db, 'condominios', 'condo_01', 'owners', firebaseUser.uid);
        const directSnap = await getDoc(directRef);

        let finalData = null;
        let finalCondoId = null;

        if (directSnap.exists()) {
          finalData = directSnap.data();
          finalCondoId = 'condo_01';
        } else {
          // --- MÉTODO 2: Collection Group (Para otros condominios) ---
          // IMPORTANTE: Añadimos limit(1) para que la regla de seguridad no sospeche
          const q = query(
            collectionGroup(db, 'owners'), 
            where('uid', '==', firebaseUser.uid),
            limit(1) 
          );
          let qSnap = await getDocs(q);

          if (qSnap.empty) {
            const q2 = query(
              collectionGroup(db, 'propietarios'), 
              where('uid', '==', firebaseUser.uid),
              limit(1)
            );
            qSnap = await getDocs(q2);
          }

          if (!qSnap.empty) {
            finalData = qSnap.docs[0].data();
            finalCondoId = finalData.condominioId;
          }
        }

        if (finalData && finalCondoId) {
          setActiveCondoId(finalCondoId);
          setWorkingCondoId(finalCondoId);
          setOwnerData(finalData);

          const rawRole = (finalData.role || '').toLowerCase();
          if (rawRole === 'propietario' || rawRole === 'owner') setUserRole('owner');
          else if (rawRole === 'administrador' || rawRole === 'admin') setUserRole('admin');
          else setUserRole(rawRole);

          // Suscripción a settings
          const settingsRef = doc(db, 'condominios', finalCondoId, 'config', 'mainSettings');
          onSnapshot(settingsRef, (s) => {
            if (s.exists()) setCompanyInfo(s.data().companyInfo);
          });
        }
      } catch (error) {
        console.error("Error en EFAS Auth:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, ownerData, companyInfo, loading, role, isSuperAdmin, activeCondoId, workingCondoId }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

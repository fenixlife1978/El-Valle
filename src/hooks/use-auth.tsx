'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, collectionGroup, query, where, getDocs } from 'firebase/firestore';

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

      // Si es Super Admin, no necesita buscar condominioId en owners
      if (firebaseUser.email === 'vallecondo@gmail.com') {
        setUserRole('super-admin');
        setLoading(false);
        return;
      }

      try {
        // --- BUSQUEDA DIRECTA EN FIRESTORE POR UID ---
        // Buscamos en 'owners' (condo_01) o 'propietarios' (otros) usando collectionGroup
        const q = query(collectionGroup(db, 'owners'), where('uid', '==', firebaseUser.uid));
        let querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          const q2 = query(collectionGroup(db, 'propietarios'), where('uid', '==', firebaseUser.uid));
          querySnapshot = await getDocs(q2);
        }

        if (!querySnapshot.empty) {
          const docSnap = querySnapshot.docs[0];
          const data = docSnap.data();
          const condoId = data.condominioId; // El campo que me confirmaste

          setActiveCondoId(condoId);
          setWorkingCondoId(condoId); // Inicialmente el de trabajo es el propio

          // Establecer el Rol y Datos en tiempo real
          const rawRole = (data.role || '').toLowerCase();
          if (rawRole === 'propietario' || rawRole === 'owner') setUserRole('owner');
          else if (rawRole === 'administrador' || rawRole === 'admin') setUserRole('admin');
          else setUserRole(rawRole);

          setOwnerData(data);

          // Suscribirse a cambios de configuración del condominio
          const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
          onSnapshot(settingsRef, (s) => {
            if (s.exists()) setCompanyInfo(s.data().companyInfo);
          });
        }
      } catch (error) {
        console.error("Error inicializando EFAS Auth:", error);
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

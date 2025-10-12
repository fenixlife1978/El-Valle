
'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, Timestamp, collection, query, where, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  role: string | null;
  ownerData: any | null; 
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  ownerData: null,
});

const ADMIN_USER_ID = 'valle-admin-main-account';
const ADMIN_EMAIL = 'edwinfaguiars@gmail.com';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false); // Set to false to bypass login checks
  const [role, setRole] = useState<string | null>('administrador');
  const [ownerData, setOwnerData] = useState<any | null>({
      id: ADMIN_USER_ID,
      name: 'Administrador',
      email: ADMIN_EMAIL,
      role: 'administrador'
  });

  // Since we are bypassing login, we don't need the onAuthStateChanged listener logic.
  // The initial state is already set to a mock admin user.

  return (
    <AuthContext.Provider value={{ user, loading, role, ownerData }}>
      {children}
    </AuthContext.Provider>
  );
};

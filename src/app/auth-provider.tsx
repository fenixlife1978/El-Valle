'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, Timestamp } from 'firebase/firestore';
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [ownerData, setOwnerData] = useState<any | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // User is signed in, get their role from Firestore
        const userDocRef = doc(db, 'owners', firebaseUser.uid);

        const unsubSnapshot = onSnapshot(userDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role);
            setOwnerData(data);
          } else {
            // Profile doesn't exist, so we create it automatically.
            console.log(`Profile for ${firebaseUser.email} not found, creating one.`);
            try {
                await setDoc(userDocRef, {
                    name: firebaseUser.displayName || firebaseUser.email,
                    email: firebaseUser.email,
                    role: 'propietario', // Default role for auto-created profiles
                    balance: 0,
                    properties: [],
                    passwordChanged: false, 
                    createdAt: Timestamp.now(),
                    createdBy: 'auto-sync'
                });
                // The onSnapshot listener will be triggered again by the setDoc,
                // so we don't need to set state here.
            } catch (error) {
                console.error("Error creating user profile automatically: ", error);
                setRole(null);
                setOwnerData(null);
            }
          }
          setLoading(false);
        }, () => {
            // Error handling for snapshot listener
            setRole(null);
            setOwnerData(null);
            setLoading(false);
        });

        return () => unsubSnapshot();

      } else {
        // User is signed out
        setRole(null);
        setOwnerData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, role, ownerData }}>
      {children}
    </AuthContext.Provider>
  );
};

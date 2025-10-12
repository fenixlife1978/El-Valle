
'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, Timestamp, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
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
      if (firebaseUser) {
        // User is signed in, begin sync logic.
        const { uid, email } = firebaseUser;
        const userDocRef = doc(db, 'owners', uid);

        try {
            const docSnap = await getDoc(userDocRef);

            if (!docSnap.exists()) {
                // If the user's document doesn't exist by UID, create it.
                // This handles new user registration and first-time logins for pre-existing auth accounts.
                const newProfile = {
                    uid: uid,
                    name: firebaseUser.displayName || email,
                    email: email,
                    role: 'propietario', // Default role
                    balance: 0,
                    properties: [],
                    passwordChanged: false,
                    createdAt: Timestamp.now(),
                    createdBy: 'auto-sync'
                };
                await setDoc(userDocRef, newProfile);
            }
            
            // Now that we're sure the document exists, subscribe to it.
            const unsubSnapshot = onSnapshot(userDocRef, (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                setRole(data.role);
                setOwnerData(data);
                setUser(firebaseUser); // Set user only after we have role and data
              } else {
                setRole(null);
                setOwnerData(null);
                setUser(null);
              }
              setLoading(false);
            });
            
            return () => unsubSnapshot();

        } catch (error) {
            console.error("Error during user profile sync:", error);
            // In case of error (e.g., permissions), sign out to avoid an inconsistent state.
            setUser(null);
            setRole(null);
            setOwnerData(null);
            setLoading(false);
        }

      } else {
        // User is signed out
        setUser(null);
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

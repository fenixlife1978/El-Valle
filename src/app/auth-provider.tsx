
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

const ADMIN_USER_ID = 'valle-admin-main-account';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [ownerData, setOwnerData] = useState<any | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser); // Set user immediately

        // Now, determine the role and fetch data
        const { uid, email } = firebaseUser;
        
        let userDocRef;
        let isPotentiallyAdmin = email === 'edwinfaguiars@gmail.com'; // Admin email check

        // If the UID matches the known admin UID, treat as admin
        if (uid === ADMIN_USER_ID) {
            userDocRef = doc(db, 'owners', ADMIN_USER_ID);
        } 
        // If not, treat as a regular owner
        else {
            userDocRef = doc(db, 'owners', uid);
        }

        const unsubSnapshot = onSnapshot(userDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role);
            setOwnerData(data);
            setLoading(false);
          } else {
             // If document doesn't exist, create it for the owner
             if (uid !== ADMIN_USER_ID) {
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
                // The onSnapshot will re-trigger with the new data
             } else {
                 // This case is for the admin, which should already exist.
                 // If it doesn't, it indicates a setup problem.
                setRole(null);
                setOwnerData(null);
                setLoading(false);
             }
          }
        }, (error) => {
            console.error("Error subscribing to user document:", error);
            setRole(null);
            setOwnerData(null);
            setLoading(false);
        });

        return () => unsubSnapshot();

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

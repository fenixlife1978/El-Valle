'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, Timestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
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
        const ownersRef = collection(db, "owners");
        const q = query(ownersRef, where("email", "==", email));

        const querySnapshot = await getDocs(q);
        let userDocRef;
        let userDataFromDb = null;

        if (!querySnapshot.empty) {
          // Profile with this email already exists.
          const existingDoc = querySnapshot.docs[0];
          userDocRef = existingDoc.ref;
          userDataFromDb = existingDoc.data();
          
          if (!userDataFromDb.uid) {
            // If the profile exists but has no UID, link it.
            await updateDoc(userDocRef, { uid: uid });
            userDataFromDb.uid = uid; // Update local copy
          }
        } else {
          // No profile found, create a new one.
          userDocRef = doc(db, 'owners', uid);
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
          userDataFromDb = newProfile;
        }

        // Set user and subscribe to profile changes
        setUser(firebaseUser);
        
        const unsubSnapshot = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role);
            setOwnerData(data);
          } else {
            // This case should be rare after the sync logic above, but it's good practice.
            setRole(null);
            setOwnerData(null);
          }
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

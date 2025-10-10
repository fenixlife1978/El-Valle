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
        let userDocRef;
        let userDataFromDb: any | null = null;
        
        // 1. Try to find user by UID first (most common case for returning users)
        const docByUidRef = doc(db, 'owners', uid);
        const docByUidSnap = await getDoc(docByUidRef);

        if (docByUidSnap.exists()) {
            userDocRef = docByUidRef;
            userDataFromDb = docByUidSnap.data();
        } else {
            // 2. If no doc by UID, try to find by email to link an existing profile
            const ownersRef = collection(db, "owners");
            const q = query(ownersRef, where("email", "==", email));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
              // Profile with this email already exists, link it by updating UID
              const existingDoc = querySnapshot.docs[0];
              userDocRef = existingDoc.ref;
              await updateDoc(userDocRef, { uid: uid }); // Link the profile
              
              // Get the fresh data after linking
              const updatedDoc = await getDoc(userDocRef);
              userDataFromDb = updatedDoc.data();

            } else {
              // 3. No profile found, create a new one.
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
        }
        
        // Set user and subscribe to profile changes
        setUser(firebaseUser);
        
        const unsubSnapshot = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role);
            setOwnerData(data);
          } else {
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

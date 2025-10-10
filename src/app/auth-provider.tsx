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
        } else if (email) {
            // 2. If no doc by UID, try to find by email to link a legacy profile
            const ownersRef = collection(db, "owners");
            const q = query(ownersRef, where("email", "==", email));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
              // Profile with this email already exists, link it by updating UID
              const existingDoc = querySnapshot.docs[0];
              userDocRef = existingDoc.ref;
              await updateDoc(userDocRef, { uid: uid }); // Link the profile
            } else {
              // 3. No profile found by UID or email, create a new one.
              userDocRef = doc(db, 'owners', uid);
              const newProfile = {
                uid: uid,
                name: firebaseUser.displayName || email,
                email: email,
                role: 'propietario', // Default role for auto-created profiles
                balance: 0,
                properties: [],
                passwordChanged: false, // Force password change for new profiles
                createdAt: Timestamp.now(),
                createdBy: 'auto-sync'
              };
              await setDoc(userDocRef, newProfile);
            }
        } else {
            // This case is unlikely (user with no email), but we should handle it.
            // Create a doc with UID to avoid leaving user in a broken state.
            userDocRef = doc(db, 'owners', uid);
            if (!(await getDoc(userDocRef)).exists()){
                 await setDoc(userDocRef, {
                    uid: uid,
                    name: 'Usuario sin email',
                    email: null,
                    role: 'propietario',
                    balance: 0,
                    properties: [],
                    passwordChanged: false,
                    createdAt: Timestamp.now(),
                 });
            }
        }
        
        // At this point, userDocRef is guaranteed to be set.
        // Set user and subscribe to profile changes
        setUser(firebaseUser);
        
        const unsubSnapshot = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role);
            setOwnerData(data);
          } else {
            // This should ideally not happen after the sync logic above
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

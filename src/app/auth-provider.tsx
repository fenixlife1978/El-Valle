
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [ownerData, setOwnerData] = useState<any | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser); // Set user immediately

        let userDocRef;
        let roleFromDoc = null;

        // Is it the admin?
        if (firebaseUser.uid === ADMIN_USER_ID || firebaseUser.email === 'edwinfaguiars@gmail.com') {
            userDocRef = doc(db, 'owners', ADMIN_USER_ID);
            roleFromDoc = 'administrador';
        } else {
            // It's a regular owner
            userDocRef = doc(db, 'owners', firebaseUser.uid);
            roleFromDoc = 'propietario';
        }

        const unsubSnapshot = onSnapshot(userDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role || roleFromDoc); // Use role from doc, fallback to determined role
            setOwnerData(data);
            setLoading(false);
          } else {
             // Profile doesn't exist under UID, let's try to find it by email
             const q = query(collection(db, "owners"), where("email", "==", firebaseUser.email));
             const querySnapshot = await getDocs(q);

             if (!querySnapshot.empty) {
                 // Found a profile with this email. Let's link it.
                 const legacyDoc = querySnapshot.docs[0];
                 const batch = writeBatch(db);

                 // Move data to new doc with UID as ID
                 const newDocRef = doc(db, 'owners', firebaseUser.uid);
                 batch.set(newDocRef, { ...legacyDoc.data(), uid: firebaseUser.uid });
                 
                 // Delete old doc
                 batch.delete(legacyDoc.ref);
                 
                 await batch.commit();
                 // The onSnapshot listener will be re-triggered for the new document.
                 // We don't setLoading(false) here to wait for the new data.

             } else {
                 // Really doesn't exist, let's create it. Only for owners.
                 if (roleFromDoc === 'propietario') {
                     const newProfile = {
                         uid: firebaseUser.uid,
                         name: firebaseUser.displayName || firebaseUser.email,
                         email: firebaseUser.email,
                         role: 'propietario',
                         balance: 0,
                         properties: [],
                         passwordChanged: false,
                         createdAt: Timestamp.now(),
                     };
                     await setDoc(userDocRef, newProfile);
                     // onSnapshot will re-trigger
                 } else {
                     // This is an admin that doesn't have a profile, which is an error state.
                     setRole(null);
                     setOwnerData(null);
                     setLoading(false);
                 }
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

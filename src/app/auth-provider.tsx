
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
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [ownerData, setOwnerData] = useState<any | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);

        let userDocRef;
        let roleFromAuth: 'administrador' | 'propietario' | null = null;
        let effectiveUid = firebaseUser.uid;

        // 1. Determine if the authenticated user is the administrator.
        const isAdminAuth = firebaseUser.email === ADMIN_EMAIL;
        
        if (isAdminAuth) {
            roleFromAuth = 'administrador';
            effectiveUid = ADMIN_USER_ID; 
        } else {
            roleFromAuth = 'propietario';
        }
        
        userDocRef = doc(db, 'owners', effectiveUid);

        // 2. Set up a listener for the definitive user document
        const unsubSnapshot = onSnapshot(userDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role || roleFromAuth);
            setOwnerData({ id: docSnap.id, ...data });
            setLoading(false);
          } else {
             // If the main doc doesn't exist, this might be a first-time login for a legacy user
             // or a brand new user.
             if (roleFromAuth === 'propietario') {
                const q = query(collection(db, "owners"), where("email", "==", firebaseUser.email));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const legacyDoc = querySnapshot.docs[0];
                    const batch = writeBatch(db);
                    
                    // Create a new document with the UID as the ID
                    const newDocRefWithUid = doc(db, 'owners', firebaseUser.uid);
                    batch.set(newDocRefWithUid, { ...legacyDoc.data(), uid: firebaseUser.uid });
                    
                    // Delete the old document
                    batch.delete(legacyDoc.ref);
                    
                    try {
                        await batch.commit();
                        // The listener will be re-triggered for the new document with the correct UID.
                    } catch (commitError) {
                        console.error("Error migrating legacy user:", commitError);
                        setLoading(false);
                    }
                } else {
                    // Brand new user, profile needs to be created.
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
                    await setDoc(doc(db, 'owners', firebaseUser.uid), newProfile);
                }
             } else { // Admin profile does not exist, which is an error state
                 console.error("Admin user is authenticated but admin profile does not exist in Firestore!");
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

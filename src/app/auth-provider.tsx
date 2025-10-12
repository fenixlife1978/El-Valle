'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, query, where, writeBatch, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureAdminProfile } from '@/lib/user-sync';

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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        
        let userRole: string | null = null;
        let finalOwnerData: any | null = null;

        // Special case: check if the logged-in user is the administrator
        if (user.email === ADMIN_EMAIL) {
            await ensureAdminProfile(); // Ensure the admin profile exists
            const adminDocRef = doc(db, "owners", ADMIN_USER_ID);
            const adminSnap = await getDoc(adminDocRef);
            if (adminSnap.exists()) {
                finalOwnerData = { id: adminSnap.id, ...adminSnap.data() };
                userRole = 'administrador';
            }
        } else {
            // Standard owner login
            const userDocRef = doc(db, "owners", user.uid);
            const userSnap = await getDoc(userDocRef);

            if (userSnap.exists()) {
                finalOwnerData = { id: userSnap.id, ...userSnap.data() };
                userRole = finalOwnerData.role;
            } else {
                // If doc doesn't exist with UID, try to find by email and link it.
                // This handles legacy users who were created without an auth account.
                const q = query(collection(db, 'owners'), where('email', '==', user.email), where('uid', '==', null));
                const legacyUserSnap = await getDocs(q);

                if (!legacyUserSnap.empty) {
                    const legacyDoc = legacyUserSnap.docs[0];
                    const legacyDocRef = legacyDoc.ref;
                    await updateDoc(legacyDocRef, { uid: user.uid });
                    finalOwnerData = { id: legacyDocRef.id, uid: user.uid, ...legacyDoc.data() };
                    userRole = finalOwnerData.role;
                } else {
                     // If still no user, create one.
                    await setDoc(userDocRef, {
                        uid: user.uid,
                        name: user.displayName || 'Nuevo Propietario',
                        email: user.email,
                        role: 'propietario',
                        balance: 0,
                        properties: [],
                        passwordChanged: false,
                        createdAt: Timestamp.now(),
                    });
                    const newUserSnap = await getDoc(userDocRef);
                    finalOwnerData = { id: newUserSnap.id, ...newUserSnap.data() };
                    userRole = 'propietario';
                }
            }
        }
        
        setOwnerData(finalOwnerData);
        setRole(userRole);
        
      } else {
        setUser(null);
        setRole(null);
        setOwnerData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, role, ownerData }}>
      {children}
    </AuthContext.Provider>
  );
};

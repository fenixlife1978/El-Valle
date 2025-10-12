
'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureAdminProfile } from '@/lib/user-sync';

// Mock user type
type MockUser = {
  uid: string;
  email: string;
};

type AuthContextType = {
  user: MockUser | null;
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
  const [user, setUser] = useState<MockUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [ownerData, setOwnerData] = useState<any | null>(null);

  useEffect(() => {
    const bootstrapAdminSession = async () => {
      // Ensure the admin profile document exists in Firestore.
      await ensureAdminProfile();
      
      const adminUser: MockUser = {
        uid: ADMIN_USER_ID,
        email: 'edwinfaguiars@gmail.com', // Using a placeholder email
      };
      setUser(adminUser);

      const adminDocRef = doc(db, "owners", ADMIN_USER_ID);
      const adminSnap = await getDoc(adminDocRef);

      if (adminSnap.exists()) {
        const adminData = { id: adminSnap.id, ...adminSnap.data() };
        setOwnerData(adminData);
        setRole('administrador');
      }
      
      setLoading(false);
    };

    bootstrapAdminSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, role, ownerData }}>
      {children}
    </AuthContext.Provider>
  );
};

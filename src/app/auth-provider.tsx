
'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Mock user type, since we are not using Firebase Auth user object anymore
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
      // Directly create a mock admin session
      const adminUser: MockUser = {
        uid: ADMIN_USER_ID,
        email: 'edwinfaguiars@gmail.com',
      };
      setUser(adminUser);

      // Fetch the admin profile from Firestore
      const adminDocRef = doc(db, "owners", ADMIN_USER_ID);
      const adminSnap = await getDoc(adminDocRef);

      if (adminSnap.exists()) {
        setOwnerData({ id: adminSnap.id, ...adminSnap.data() });
        setRole('administrador');
      } else {
        // Fallback in case the admin document doesn't exist, create a mock one.
        const mockAdminData = {
          id: ADMIN_USER_ID,
          name: 'Administrador Principal',
          role: 'administrador',
          email: adminUser.email,
        };
        setOwnerData(mockAdminData);
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

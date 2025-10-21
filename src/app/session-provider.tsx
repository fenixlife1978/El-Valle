
'use client';

import { useEffect, useState, ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureAdminProfile } from '@/lib/user-sync';
import { AuthContext } from './auth-provider';

type MockUser = {
  uid: string;
  email: string;
};

const ADMIN_USER_ID = 'valle-admin-main-account';

export const SessionProvider = ({ children }: { children: ReactNode }) => {
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

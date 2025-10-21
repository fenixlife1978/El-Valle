
'use client';

import { createContext, ReactNode } from 'react';

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

"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { doc, getDoc, addDoc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AuthorizationModal } from '@/components/authorization-modal';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';

interface AuthorizationContextType {
  requestAuthorization: (actionToExecute: () => Promise<void>) => void;
}

const AuthorizationContext = createContext<AuthorizationContextType | undefined>(undefined);

export function useAuthorization() {
  const context = useContext(AuthorizationContext);
  if (!context) {
    throw new Error('useAuthorization must be used within an AuthorizationProvider');
  }
  return context;
}

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [action, setAction] = useState<(() => Promise<void>) | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const requestAuthorization = useCallback((actionToExecute: () => Promise<void>) => {
    setAction(() => actionToExecute);
    setIsModalOpen(true);
  }, []);

  const handleClose = () => {
    setIsModalOpen(false);
    setAction(null);
  };

  const createLog = async (result: 'success' | 'failure') => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'logs'), {
        userId: user.uid,
        userName: user.displayName || user.email,
        action: 'authorization_attempt',
        result,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error creating log:", error);
    }
  };

  const handleVerify = async (enteredKey: string) => {
    setIsVerifying(true);
    try {
      const keyDocRef = doc(db, 'config', 'authorization');
      const keyDoc = await getDoc(keyDocRef);

      if (!keyDoc.exists()) {
        // If key doesn't exist, set the default one and deny this attempt
        await setDoc(keyDocRef, { key: '180578' });
        toast({
          variant: 'destructive',
          title: 'Clave no configurada',
          description: 'Se ha establecido una clave por defecto. Intente de nuevo.',
        });
        await createLog('failure');
        return;
      }

      const correctKey = keyDoc.data().key;

      if (enteredKey === correctKey) {
        toast({ title: 'Autorización concedida', className: 'bg-green-100' });
        await createLog('success');
        if (action) {
          await action();
        }
        handleClose();
      } else {
        toast({ variant: 'destructive', title: 'Clave incorrecta', description: 'La acción ha sido cancelada.' });
        await createLog('failure');
      }
    } catch (error) {
      console.error('Error verifying key:', error);
      toast({ variant: 'destructive', title: 'Error de Verificación' });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <AuthorizationContext.Provider value={{ requestAuthorization }}>
      {children}
      <AuthorizationModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onVerify={handleVerify}
        isVerifying={isVerifying}
      />
    </AuthorizationContext.Provider>
  );
}

'use client';

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
  
  const { user, activeCondoId } = useAuth();

  const requestAuthorization = useCallback((actionToExecute: () => Promise<void>) => {
    setAction(() => actionToExecute);
    setIsModalOpen(true);
  }, []);

  const handleClose = () => {
    setIsModalOpen(false);
    setAction(null);
  };

  const createLog = async (result: 'success' | 'failure', detail: string) => {
    if (!user || !activeCondoId) return;
    
    try {
      await addDoc(collection(db, 'condominios', activeCondoId, 'logs'), {
        userId: user.uid,
        userName: user.displayName || user.email,
        action: 'authorization_attempt',
        detail: detail,
        result,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error creating EFAS log:", error);
    }
  };

  const handleVerify = async (enteredKey: string) => {
    if (!activeCondoId) {
        toast({ variant: 'destructive', title: 'Error', description: 'No hay un condominio seleccionado.' });
        return;
    }

    setIsVerifying(true);
    try {
      const keyDocRef = doc(db, 'condominios', activeCondoId, 'config', 'authorization');
      const keyDoc = await getDoc(keyDocRef);

      if (!keyDoc.exists()) {
        await setDoc(keyDocRef, { key: '180578' });
        toast({
          variant: 'destructive',
          title: 'Clave inicial establecida',
          description: 'Se ha configurado la clave por defecto para este condominio. Intente de nuevo.',
        });
        await createLog('failure', 'Se generó clave por defecto para el condominio');
        return;
      }

      const correctKey = keyDoc.data().key;

      if (enteredKey === correctKey) {
        toast({ title: 'Autorización concedida', className: 'bg-green-100' });
        await createLog('success', 'Autorización aprobada con clave del condominio');
        
        if (action) {
          await action();
        }
        handleClose();
      } else {
        toast({ 
          variant: 'destructive', 
          title: 'Clave incorrecta', 
          description: 'La clave ingresada no coincide con los registros del condominio.' 
        });
        await createLog('failure', 'Clave de condominio incorrecta');
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

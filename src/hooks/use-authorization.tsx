"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
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
    throw new Error('useAuthorization debe usarse dentro de AuthorizationProvider');
  }
  return context;
}

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [action, setAction] = useState<(() => Promise<void>) | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();
  
  const { user, activeCondoId, workingCondoId } = useAuth();

  const requestAuthorization = useCallback((actionToExecute: () => Promise<void>) => {
    setAction(() => actionToExecute);
    setIsModalOpen(true);
  }, []);

  const handleClose = () => {
    setIsModalOpen(false);
    setAction(null);
  };

  const createLog = async (result: 'success' | 'failure', detail: string) => {
    if (!user || !workingCondoId) return;
    
    try {
      await addDoc(collection(db, 'condominios', workingCondoId, 'logs'), {
        userId: user.uid,
        userName: user.displayName || user.email,
        action: 'authorization_attempt',
        detail: detail,
        result,
        timestamp: serverTimestamp(),
        condoId: workingCondoId
      });
    } catch (error) {
      console.error("Error creando log en EFAS CondoSys:", error);
    }
  };

  const handleVerify = async (enteredKey: string) => {
    if (!workingCondoId) {
        toast({ variant: 'destructive', title: 'Error', description: 'No hay un condominio activo seleccionado.' });
        return;
    }

    setIsVerifying(true);
    try {
      const keyDocRef = doc(db, 'condominios', workingCondoId, 'config', 'authorization');
      const keyDoc = await getDoc(keyDocRef);

      if (!keyDoc.exists()) {
        toast({
          variant: 'destructive',
          title: 'Configuración pendiente',
          description: 'La clave de autorización no ha sido configurada por el administrador.',
        });
        await createLog('failure', 'Intento de autorización en condominio sin clave configurada');
        setIsVerifying(false);
        return;
      }

      const correctKey = keyDoc.data().key;

      if (enteredKey === correctKey) {
        toast({ title: 'Autorización concedida', variant: 'default' });
        await createLog('success', 'Clave verificada correctamente');
        
        if (action) {
          await action();
        }
        handleClose();
      } else {
        toast({ 
          variant: 'destructive', 
          title: 'Clave incorrecta', 
          description: 'La clave ingresada no es válida para este condominio.' 
        });
        await createLog('failure', 'Clave de condominio incorrecta');
      }
    } catch (error: any) {
      console.error('Error de autorización:', error);
      toast({ 
        variant: 'destructive', 
        title: 'Error de Seguridad', 
        description: error.message?.includes('permissions') 
          ? 'No tienes permisos para verificar esta clave.' 
          : 'Hubo un problema al conectar con el servidor.' 
      });
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

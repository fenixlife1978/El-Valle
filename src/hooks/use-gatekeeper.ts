'use client';

import { db, auth } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

/**
 * Gatekeeper es el guardián de acceso. 
 * Verifica si el condominio está activo antes de permitir el login.
 */
export const useGatekeeper = () => {
    const router = useRouter();

    const verifyAccess = async (condoId: string) => {
        // Si no hay ID de condominio (ej. super admin o error de registro), permitimos continuar
        // y que use-auth maneje el resto.
        if (!condoId) return true;

        try {
            const systemRef = await getDoc(doc(db, 'system_management', condoId));
            
            if (systemRef.exists()) {
                const { status } = systemRef.data();
                
                // Si el servicio está suspendido por el Super Admin
                if (status === 'suspended') {
                    await signOut(auth);
                    router.push('/service-suspended');
                    return false;
                }
            }
            
            // Si está activo o no existe en la tabla de gestión (por migración), permitir.
            return true;
        } catch (error) {
            console.error("Error en Gatekeeper de EFAS CondoSys:", error);
            // En caso de error de red, permitimos acceso para no bloquear usuarios legítimos
            return true; 
        }
    };

    return { verifyAccess };
};
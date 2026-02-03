'use client';

import { db, auth } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

/**
 * Gatekeeper es el guardián de acceso de EFAS CondoSys. 
 * Verifica si el condominio está activo antes de permitir el acceso a las rutas protegidas.
 */
export const useGatekeeper = () => {
    const router = useRouter();

    const verifyAccess = async (condoId: string) => {
        // 1. Validaciones Previas
        if (!condoId) {
            console.warn("Gatekeeper: No se proporcionó un condoId.");
            return true;
        }

        // 2. Bypass para Super Admin
        // Si el usuario logueado es el administrador global, saltamos la verificación de suspensión
        if (auth.currentUser?.email === 'vallecondo@gmail.com') {
            return true;
        }

        try {
            // Buscamos en la colección de gestión centralizada
            const systemRef = await getDoc(doc(db, 'system_management', condoId));
            
            if (systemRef.exists()) {
                const data = systemRef.data();
                
                // Si el servicio está suspendido por el Super Admin (Falta de pago, mantenimiento, etc.)
                if (data.status === 'suspended') {
                    console.error(`Acceso denegado: El condominio ${condoId} está suspendido.`);
                    
                    // Limpiamos la sesión local para evitar persistencia de una cuenta bloqueada
                    localStorage.removeItem('activeCondoId');
                    localStorage.removeItem('workingCondoId');
                    localStorage.removeItem('userRole');
                    
                    await signOut(auth);
                    
                    // Redirección forzada para romper cualquier bucle
                    window.location.href = '/service-suspended';
                    return false;
                }
            }
            
            // Si el documento no existe (condominios nuevos o en migración), 
            // asumimos que está activo por defecto.
            return true;
            
        } catch (error: any) {
            // Si el error es de permisos (Firestore rules), es probable que el usuario
            // no tenga permiso para leer 'system_management'. 
            // En EFAS CondoSys, preferimos dejar pasar al usuario si hay un error de red
            // para no afectar la experiencia, a menos que sea un error de permiso denegado explícito.
            if (error.code === 'permission-denied') {
                console.warn("Gatekeeper: Permiso denegado en system_management. Continuando por seguridad.");
                return true;
            }
            
            console.error("Error en Gatekeeper de EFAS CondoSys:", error);
            return true; 
        }
    };

    return { verifyAccess };
};
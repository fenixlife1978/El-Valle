import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Verifica si un condominio específico está activo en la gestión global del sistema.
 * Este hook es vital para el "Kill Switch" que permite al Super Admin suspender servicios.
 */
export const checkServiceStatus = async (condoId: string): Promise<boolean> => {
    if (!condoId) return false;
    
    try {
        const docRef = doc(db, 'system_management', condoId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Retorna true solo si el estado es explícitamente 'active'
            return data.status === 'active';
        }
        
        // Si el ID del condominio no existe en la gestión global, denegar acceso
        return false;
    } catch (error) {
        console.error("Error verificando estado del servicio EFAS CondoSys:", error);
        // Por seguridad, si hay error de red/lectura, asumimos falso para proteger el sistema
        return false;
    }
};
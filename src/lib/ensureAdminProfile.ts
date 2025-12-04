import { doc, getDoc, setDoc, Timestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { type User } from 'firebase/auth';

const ADMIN_USER_ID = 'valle-admin-main-account';

// This function now returns a boolean indicating if the profile existed before the check.
export const ensureAdminProfile = async (showToast?: (options: any) => void): Promise<boolean> => {
    const adminRef = doc(db, "owners", ADMIN_USER_ID);
    
    try {
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
            await setDoc(adminRef, {
                name: 'Valle Admin',
                email: 'edwinfaguiars@gmail.com',
                role: 'administrador',
                balance: 0,
                properties: [{ street: 'N/A', house: 'N/A' }],
                passwordChanged: true, 
                creadoPor: "sistema-inicializacion",
                fechaCreacion: Timestamp.now()
            });
            if (showToast) {
                showToast({ title: "Perfil de Administrador Creado", description: "El perfil principal de administrador fue creado exitosamente." });
            }
            return false; // Did not exist
        }
        return true; // Existed
    } catch (error) {
        console.error("Error creating or verifying admin profile:", error);
        if (showToast) {
            showToast({ variant: 'destructive', title: 'Error Crítico', description: 'No se pudo crear o verificar el perfil del administrador.' });
        }
        // In case of error, we can assume it didn't exist or we can't confirm.
        // Returning true might prevent repeated attempts if there's a DB connection issue.
        return true; 
    }
};


export const ensureOwnerProfile = async (user: User, showToast?: (options: any) => void): Promise<'checked' | 'created'> => {
    const ownerRef = doc(db, "owners", user.uid);

    try {
        const ownerSnap = await getDoc(ownerRef);

        if (!ownerSnap.exists()) {
             await setDoc(ownerRef, {
                name: user.displayName || 'Propietario sin nombre',
                email: user.email,
                role: 'propietario', // Default role for this function
                balance: 0,
                properties: [],
                passwordChanged: false, 
                createdAt: Timestamp.now(),
                createdBy: 'sync-tool'
            });
            if (showToast) {
                showToast({ title: "Perfil de Propietario Creado", description: `Se ha creado un perfil para ${user.email}.` });
            }
            return 'created';
        }
        if (showToast) {
             showToast({ title: "Perfil de Propietario Verificado", description: "Tu perfil ya existe en la base de datos." });
        }
        return 'checked';
    } catch (error) {
        console.error("Error ensuring owner profile:", error);
         if (showToast) {
            showToast({ variant: 'destructive', title: 'Error de Sincronización', description: 'No se pudo verificar o crear tu perfil.' });
        }
        throw error;
    }
}



import { doc, getDoc, setDoc, Timestamp, collection, query, where, getDocs, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { type User } from 'firebase/auth';

const ADMIN_USER_ID = 'valle-admin-main-account';
const ADMIN_EMAIL = 'vallecondo@gmail.com';

// This function now returns a boolean indicating if the profile existed before the check.
export const ensureAdminProfile = async (showToast?: (options: any) => void): Promise<boolean> => {
    const firestore = db();
    const adminRef = doc(firestore, "owners", ADMIN_USER_ID);
    
    try {
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
            await setDoc(adminRef, {
                uid: ADMIN_USER_ID,
                name: 'Valle Admin',
                email: ADMIN_EMAIL,
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
        } else {
             // If admin exists, ensure critical fields are correct.
            const data = adminSnap.data();
            if (!data.uid || data.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase() || data.role !== 'administrador') {
                 await updateDoc(adminRef, { uid: ADMIN_USER_ID, email: ADMIN_EMAIL.toLowerCase(), role: 'administrador' });
                 if (showToast) {
                    showToast({ title: "Perfil de Administrador Corregido", description: "Se detectó una inconsistencia y se ha corregido el perfil del administrador." });
                }
            }
        }
        return true; // Existed
    } catch (error) {
        console.error("Error creating or verifying admin profile:", error);
        if (showToast) {
            showToast({ variant: 'destructive', title: 'Error Crítico', description: 'No se pudo crear o verificar el perfil del administrador.' });
        }
        return true; 
    }
};


export const ensureOwnerProfile = async (user: User, showToast?: (options: any) => void): Promise<'checked' | 'created' | 'linked'> => {
    if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        return 'checked';
    }

    const firestore = db();
    const ownerRefByUID = doc(firestore, "owners", user.uid);

    try {
        const ownerSnapByUID = await getDoc(ownerRefByUID);

        if (ownerSnapByUID.exists()) {
            return 'checked';
        }

        const q = query(collection(firestore, "owners"), where("email", "==", user.email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const oldDoc = querySnapshot.docs[0];
            const oldData = oldDoc.data();
            const batch = writeBatch(firestore);

            batch.set(ownerRefByUID, {
                ...oldData,
                uid: user.uid,
            });

            batch.delete(oldDoc.ref);

            await batch.commit();

            if (showToast) {
                showToast({ title: "Perfil Vinculado", description: "Tu cuenta de inicio de sesión ha sido vinculada a tu perfil de propietario existente." });
            }
            return 'linked';

        } else {
            await setDoc(ownerRefByUID, {
                uid: user.uid,
                name: user.displayName || user.email || 'Propietario sin nombre',
                email: user.email,
                role: 'propietario',
                balance: 0,
                properties: [],
                passwordChanged: false,
                createdAt: Timestamp.now(),
            });
            if (showToast) {
                showToast({ title: "Perfil de Propietario Creado", description: `Se ha creado un nuevo perfil para ${user.email}.` });
            }
            return 'created';
        }
    } catch (error) {
        console.error("Error ensuring owner profile:", error);
         if (showToast) {
            showToast({ variant: 'destructive', title: 'Error de Sincronización', description: 'No se pudo verificar o crear tu perfil.' });
        }
        throw error;
    }
}

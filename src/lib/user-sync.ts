
import { doc, getDoc, setDoc, Timestamp, collection, query, where, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { type User } from 'firebase/auth';

const ADMIN_USER_ID = 'valle-admin-main-account';

// This function now returns a boolean indicating if the profile existed before the check.
export const ensureAdminProfile = async (showToast?: (options: any) => void): Promise<boolean> => {
    const adminRef = doc(db(), "owners", ADMIN_USER_ID);
    
    try {
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
            await setDoc(adminRef, {
                uid: ADMIN_USER_ID, // Ensure admin has a UID
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
        } else if (!adminSnap.data()?.uid) {
            // If admin exists but UID is missing, add it.
            await updateDoc(adminRef, { uid: ADMIN_USER_ID });
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
    const ownerRef = doc(db(), "owners", user.uid);

    try {
        const ownerSnap = await getDoc(ownerRef);

        if (ownerSnap.exists()) {
            // Profile exists and is correctly linked by UID.
            // Let's ensure the `uid` field is also present inside the document for consistency in queries.
            if (!ownerSnap.data().uid) {
                await updateDoc(ownerRef, { uid: user.uid });
            }
            return 'checked'; 
        }

        // If it doesn't exist with the UID, search by email to link an existing profile.
        const q = query(collection(db(), "owners"), where("email", "==", user.email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            // Profile exists but has no UID or a different one. We'll update it.
            const existingDoc = querySnapshot.docs[0];
            await updateDoc(existingDoc.ref, { uid: user.uid });

            if (showToast) {
                showToast({ title: "Perfil Vinculado", description: "Hemos vinculado tu cuenta de inicio de sesión a tu perfil de propietario existente." });
            }
            return 'linked';

        } else {
            // Profile doesn't exist at all, create a new one.
            await setDoc(ownerRef, {
                uid: user.uid,
                name: user.displayName || 'Propietario sin nombre',
                email: user.email,
                role: 'propietario', // Default role
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

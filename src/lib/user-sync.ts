
import { doc, getDoc, setDoc, Timestamp, collection, query, where, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { type User } from 'firebase/auth';

const ADMIN_EMAIL = 'vallecondo@gmail.com';

export const ensureAdminProfile = async (user?: User): Promise<boolean> => {
    if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return false;
    // Super admin profile is not tied to a specific condo, it lives in a root collection.
    const userRef = doc(db, "owners", user.uid);
    try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                name: 'Super Administrador',
                email: ADMIN_EMAIL,
                role: 'super-admin',
                condoId: 'master', // Special ID for the master admin
                creadoPor: "sistema-saas",
                fechaCreacion: Timestamp.now(),
            });
            return false;
        } else {
            const data = snap.data();
            if (data.role !== 'super-admin') {
                await updateDoc(userRef, { role: 'super-admin' });
            }
        }
        return true;
    } catch (error) {
        console.error("Error sincronizando Super Admin:", error);
        return true; 
    }
};

export const ensureOwnerProfile = async (user: User, condoId: string): Promise<'checked' | 'created' | 'linked'> => {
    if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return 'checked';
    if (!condoId) throw new Error("Condo ID is required to ensure owner profile.");

    const ownerRef = doc(db, "condominios", condoId, "owners", user.uid);
    try {
        const ownerSnap = await getDoc(ownerRef);
        if (ownerSnap.exists()) return 'checked';

        // This part is complex. If a user was created without a UID link, we try to find them by email.
        // This logic might be better suited for a backend function for security and robustness.
        // For client-side, we'll assume a new profile needs to be created if not found by UID.
        await setDoc(ownerRef, {
            uid: user.uid,
            name: user.displayName || user.email || 'Usuario Nuevo',
            email: user.email,
            role: 'propietario',
            balance: 0,
            properties: [],
            passwordChanged: false,
            createdAt: Timestamp.now(),
            condoId: condoId, // Ensure the condoId is stamped on creation
        });
        return 'created';
        
    } catch (error) {
        console.error("Error en ensureOwnerProfile:", error);
        throw error;
    }
}

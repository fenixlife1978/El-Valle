import { doc, getDoc, setDoc, Timestamp, collection, query, where, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { type User } from 'firebase/auth';

const ADMIN_EMAIL = 'vallecondo@gmail.com';

export const ensureAdminProfile = async (user?: User): Promise<boolean> => {
    if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return false;
    const userRef = doc(db, "owners", user.uid);
    try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                name: 'Super Administrador',
                email: ADMIN_EMAIL,
                role: 'super-admin',
                condominioId: 'master',
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

export const ensureOwnerProfile = async (user: User, showToast?: (options: any) => void): Promise<'checked' | 'created' | 'linked'> => {
    if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return 'checked';
    const ownerRefByUID = doc(db, "owners", user.uid);
    try {
        const ownerSnapByUID = await getDoc(ownerRefByUID);
        if (ownerSnapByUID.exists()) return 'checked';
        const q = query(collection(db, "owners"), where("email", "==", user.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const oldDoc = querySnapshot.docs[0];
            const oldData = oldDoc.data();
            const batch = writeBatch(db);
            batch.set(ownerRefByUID, { ...oldData, uid: user.uid });
            batch.delete(oldDoc.ref);
            await batch.commit();
            return 'linked';
        } else {
            await setDoc(ownerRefByUID, {
                uid: user.uid,
                name: user.displayName || user.email || 'Usuario Nuevo',
                email: user.email,
                role: 'propietario',
                balance: 0,
                properties: [],
                passwordChanged: false,
                createdAt: Timestamp.now(),
            });
            return 'created';
        }
    } catch (error) {
        console.error("Error en ensureOwnerProfile:", error);
        throw error;
    }
}

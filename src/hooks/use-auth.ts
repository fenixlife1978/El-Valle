
import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Cookies from 'js-cookie';

const ADMIN_USER_ID = 'valle-admin-main-account';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [role, setRole] = useState<string | null>(Cookies.get('user-role') || null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                // Set auth token cookie
                const token = await firebaseUser.getIdToken();
                Cookies.set('firebase-auth-token', token, { expires: 1, secure: true, sameSite: 'strict' });

                try {
                    // Check if the logged-in user is the special admin
                    const adminDocRef = doc(db, "owners", ADMIN_USER_ID);
                    const adminSnap = await getDoc(adminDocRef);

                    if (adminSnap.exists() && adminSnap.data()?.email && adminSnap.data().email.toLowerCase() === firebaseUser.email?.toLowerCase()) {
                        const data = { id: adminSnap.id, ...adminSnap.data() };
                        setOwnerData(data);
                        setRole('administrador');
                        Cookies.set('user-role', 'administrador', { expires: 1, secure: true, sameSite: 'strict' });
                    } else {
                        // This is a regular owner
                        const ownerDocRef = doc(db, "owners", firebaseUser.uid);
                        const ownerSnap = await getDoc(ownerDocRef);
                        if (ownerSnap.exists()) {
                            const data = { id: ownerSnap.id, ...ownerSnap.data() } as { id: string; role?: string };
                            setOwnerData(data);
                            const userRole = data.role || 'propietario';
                            setRole(userRole);
                            Cookies.set('user-role', userRole, { expires: 1, secure: true, sameSite: 'strict' });
                        } else {
                            setRole(null);
                            setOwnerData(null);
                            Cookies.remove('user-role');
                        }
                    }
                } catch (error) {
                    console.error("Error fetching user data from Firestore:", error);
                    setOwnerData(null);
                    setRole(null);
                    Cookies.remove('user-role');
                }
            } else {
                setUser(null);
                setOwnerData(null);
                setRole(null);
                Cookies.remove('firebase-auth-token');
                Cookies.remove('user-role');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { user, ownerData, role, loading };
}

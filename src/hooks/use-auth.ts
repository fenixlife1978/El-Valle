import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                const ownerDocRef = doc(db, "owners", firebaseUser.uid);
                try {
                    const ownerSnap = await getDoc(ownerDocRef);
                    if (ownerSnap.exists()) {
                        const data = { id: ownerSnap.id, ...ownerSnap.data() };
                        setOwnerData(data);
                        setRole(data.role || 'propietario');
                    } else {
                        // If profile doesn't exist, maybe it's still being created.
                        // For now, we set role to null and let layouts handle redirection.
                        setRole(null);
                        setOwnerData(null);
                    }
                } catch (error) {
                    console.error("Error fetching user data from Firestore:", error);
                    setOwnerData(null);
                    setRole(null);
                }
            } else {
                setUser(null);
                setOwnerData(null);
                setRole(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { user, ownerData, role, loading };
}

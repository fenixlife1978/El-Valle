
'use client';

import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Cookies from 'js-cookie';
import { usePathname, useRouter } from 'next/navigation';

const ADMIN_USER_ID = 'valle-admin-main-account';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [ownerData, setOwnerData] = useState<any | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                const token = await firebaseUser.getIdToken();
                Cookies.set('firebase-auth-token', token, { expires: 1, secure: true, sameSite: 'strict' });

                try {
                    const adminDocRef = doc(db, "owners", ADMIN_USER_ID);
                    const adminSnap = await getDoc(adminDocRef);

                    let userRole: string | null = null;
                    let userData: any | null = null;
                    
                    if (adminSnap.exists() && adminSnap.data()?.email && adminSnap.data().email.toLowerCase() === firebaseUser.email?.toLowerCase()) {
                        userData = { id: adminSnap.id, ...adminSnap.data() };
                        userRole = 'admin';
                    } else {
                        const ownerDocRef = doc(db, "owners", firebaseUser.uid);
                        const ownerSnap = await getDoc(ownerDocRef);
                        if (ownerSnap.exists()) {
                            userData = { id: ownerSnap.id, ...ownerSnap.data() } as { id: string; role?: string };
                            userRole = userData.role || 'owner';
                        }
                    }

                    setOwnerData(userData);
                    setRole(userRole);
                    if (userRole) {
                        Cookies.set('user-role', userRole, { expires: 1, secure: true, sameSite: 'strict' });
                    } else {
                        Cookies.remove('user-role');
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

    useEffect(() => {
        if (loading) {
            return; // Don't do anything while loading
        }

        const publicPages = ['/login', '/welcome', '/forgot-password'];
        const isPublicPage = publicPages.includes(pathname);
        const isAdminPage = pathname.startsWith('/admin');
        const isOwnerPage = pathname.startsWith('/owner');

        if (user && role) {
            // User is logged in
            if (isPublicPage) {
                // If on a public page, redirect to the correct dashboard
                router.push(role === 'admin' ? '/admin/dashboard' : '/owner/dashboard');
            } else if (isAdminPage && role !== 'admin') {
                // Owner trying to access admin page
                router.push('/owner/dashboard');
            } else if (isOwnerPage && role !== 'owner') {
                // Admin trying to access owner page
                router.push('/admin/dashboard');
            }
        } else {
            // User is not logged in
            if (isAdminPage || isOwnerPage) {
                // Trying to access a protected page
                router.push('/login?role=' + (isAdminPage ? 'admin' : 'owner'));
            }
        }
    }, [user, role, loading, pathname, router]);


    return { user, ownerData, role, loading };
}

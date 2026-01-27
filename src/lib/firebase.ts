// -------------------------------------------------------------------------
// ARCHIVO: src/lib/firebase.ts (CON INSTANCIA SECUNDARIA)
// -------------------------------------------------------------------------

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAuth, type Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
    projectId: "condominio-prueba",
    appId: "1:630518792088:web:05ce5e5b80cf64a12935ed",
    apiKey: "AIzaSyBxKTp_QYuxHWB18jirph5vhY6tWCWR_HI",
    authDomain: "condominio-prueba.firebaseapp.com",
    storageBucket: "condominio-prueba.appspot.com",
};

// --- INSTANCIA PRINCIPAL ---
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);

// --- INSTANCIA SECUNDARIA (Para crear usuarios sin cerrar sesión) ---
// La llamamos "AdminFactory" para que no choque con la principal
const secondaryApp = getApps().find(a => a.name === 'AdminFactory') 
    || initializeApp(firebaseConfig, 'AdminFactory');
const secondaryAuth: Auth = getAuth(secondaryApp);

// Forzamos persistencia local en la instancia principal
if (typeof window !== 'undefined') {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.error("Error configurando persistencia de auth:", err);
    });
}

// Exportamos secondaryAuth para usarlo en /admin/people/page.tsx
export { db, auth, storage, app, secondaryAuth };
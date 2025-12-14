// -------------------------------------------------------------------------
// ARCHIVO: src/lib/firebase.ts (CÓDIGO CORREGIDO)
// -------------------------------------------------------------------------

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAuth, type Auth } from 'firebase/auth';
import { getMessaging, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
    "projectId": "condominio-prueba",
    "appId": "1:630518792088:web:05ce5e5b80cf64a12935ed",
    "apiKey": "AIzaSyBxKTp_QYuxHWB18jirph5vhY6tWCWR_HI",
    "authDomain": "condominio-prueba.firebaseapp.com",
    "storageBucket": "condominio-prueba.appspot.com",
    "messagingSenderId": "630518792088"
};

// Initialize Firebase App instance
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize core services (safe for both server/client)
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);

/**
 * Función segura para obtener el servicio de Messaging. 
 * Solo se inicializa si el código se ejecuta en el navegador.
 */
const getMessagingService = (): Messaging | null => {
    if (typeof window !== "undefined") {
        return getMessaging(app);
    }
    return null;
}

// Exportamos todos los servicios, usando la función para Messaging.
export { db, auth, storage, app, getMessagingService };

// -------------------------------------------------------------------------
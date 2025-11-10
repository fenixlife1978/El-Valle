import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  "projectId": "condominio-prueba",
  "appId": "1:630518792088:web:05ce5e5b80cf64a12935ed",
  "apiKey": "AIzaSyBxKTp_QYuxHWB18jirph5vhY6tWCWR_HI",
  "authDomain": "condominio-prueba.firebaseapp.com",
  "storageBucket": "condominio-prueba.appspot.com",
  "messagingSenderId": "630518792088"
};

// Singleton pattern to ensure only one instance is created
let app: FirebaseApp;
let authInstance: Auth;
let dbInstance: Firestore;
let storageInstance: FirebaseStorage;

function initializeFirebase() {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
    storageInstance = getStorage(app);
}

// Ensure Firebase is initialized
if (typeof window !== 'undefined') {
    initializeFirebase();
}

// Export functions that return the instances
export const db = (): Firestore => {
    if (!dbInstance) initializeFirebase();
    return dbInstance;
};

export const auth = (): Auth => {
    if (!authInstance) initializeFirebase();
    return authInstance;
};

export const storage = (): FirebaseStorage => {
    if (!storageInstance) initializeFirebase();
    return storageInstance;
};

    
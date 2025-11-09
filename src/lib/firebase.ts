
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


// Singleton pattern to initialize and get Firebase services
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

function getAppInstance(): FirebaseApp {
    if (!app) {
        app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    }
    return app;
}

function getAuthInstance(): Auth {
    if (!auth) {
        auth = getAuth(getAppInstance());
    }
    return auth;
}

function getDBInstance(): Firestore {
    if (!db) {
        db = getFirestore(getAppInstance());
    }
    return db;
}

function getStorageInstance(): FirebaseStorage {
    if (!storage) {
        storage = getStorage(getAppInstance());
    }
    return storage;
}

// Export the getter functions
export { 
    getAppInstance as app, 
    getDBInstance as db, 
    getAuthInstance as auth, 
    getStorageInstance as storage 
};

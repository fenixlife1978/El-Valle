
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

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (typeof window !== 'undefined' && !getApps().length) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
} else if (getApps().length > 0) {
    app = getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
}

// Functions to get instances, ensuring they are initialized
const getAppInstance = (): FirebaseApp => {
    if (!app) {
        app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    }
    return app;
};

const getAuthInstance = (): Auth => {
    if (!auth) {
        auth = getAuth(getAppInstance());
    }
    return auth;
};

const getDb = (): Firestore => {
    if (!db) {
        db = getFirestore(getAppInstance());
    }
    return db;
};

const getStorageInstance = (): FirebaseStorage => {
    if (!storage) {
        storage = getStorage(getAppInstance());
    }
    return storage;
};


export { getAppInstance as app, getAuthInstance as auth, getDb as db, getStorageInstance as storage };

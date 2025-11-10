
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


// Correct Singleton pattern for Firebase initialization in Next.js
const getFirebaseApp = (): FirebaseApp => {
    return !getApps().length ? initializeApp(firebaseConfig) : getApp();
};

const app = getFirebaseApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Export the initialized instances
export { app, db, auth, storage };

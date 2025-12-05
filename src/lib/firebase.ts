
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

// Initialize Firebase for SSR
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);

export { db, auth, storage, app };

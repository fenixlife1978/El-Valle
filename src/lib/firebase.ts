
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  "projectId": "condominio-prueba",
  "appId": "1:630518792088:web:05ce5e5b80cf64a12935ed",
  "apiKey": "AIzaSyBxKTp_QYuxHWB18jirph5vhY6tWCWR_HI",
  "authDomain": "condominio-prueba.firebaseapp.com",
  "storageBucket": "condominio-prueba.appspot.com",
  "messagingSenderId": "630518792088"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, auth, storage };

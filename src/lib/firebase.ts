import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBxKTp_QYuxHWB18jirph5vhY6tWCWR_HI",
  authDomain: "condominio-prueba.firebaseapp.com",
  projectId: "condominio-prueba",
  storageBucket: "condominio-prueba.firebasestorage.app",
  messagingSenderId: "787293423330",
  appId: "1:787293423330:web:7e982a8ecc839f666840bb",
  measurementId: "G-D2YHG41VJJ"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };

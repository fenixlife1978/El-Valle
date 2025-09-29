
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {"apiKey":"AIzaSyD_2vA_v43r5v-1234567890","authDomain":"condo-connect-dev.firebaseapp.com","projectId":"condo-connect-dev","storageBucket":"condo-connect-dev.appspot.com","messagingSenderId":"123456789012","appId":"1:123456789012:web:1234567890abcdef","measurementId":"G-1234567890"};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };


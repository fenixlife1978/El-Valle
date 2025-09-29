
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {"apiKey":"AIzaSyA1234567890abcdefghijklmno","authDomain":"studio-dev-project.firebaseapp.com","projectId":"studio-dev-project","storageBucket":"studio-dev-project.appspot.com","messagingSenderId":"123456789012","appId":"1:123456789012:web:1234567890abcdef","measurementId":"G-ABCDEFGHIJ"};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };

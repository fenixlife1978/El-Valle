
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  "projectId": "condoconnect-yyjbd",
  "appId": "1:630518792088:web:05ce5e5b80cf64a12935ed",
  "apiKey": "AIzaSyD7DQi7JNv8M7V7LzZfZ6sN3z2pXjs-TJI",
  "authDomain": "condoconnect-yyjbd.firebaseapp.com",
  "storageBucket": "condoconnect-yyjbd.appspot.com",
  "messagingSenderId": "630518792088"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };

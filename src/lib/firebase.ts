// EFAS CondoSys now uses authenticated Turso APIs; no Firebase client is initialized here.
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAuth, type Auth } from 'firebase/auth';

const app = Object.freeze({ name: 'efas-turso' });
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);
// Kept for compatibility with legacy screens; account creation is server-authorized.
const secondaryAuth: Auth = getAuth(app);

export { db, auth, storage, app, secondaryAuth };

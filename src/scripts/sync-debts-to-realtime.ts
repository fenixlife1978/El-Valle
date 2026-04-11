import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getDatabase, ref, set } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
    projectId: "condominio-prueba",
    appId: "1:630518792088:web:05ce5e5b80cf64a12935ed",
    apiKey: "AIzaSyBxKTp_QYuxHWB18jirph5vhY6tWCWR_HI",
    authDomain: "condominio-prueba.firebaseapp.com",
    storageBucket: "condominio-prueba.appspot.com",
    databaseURL: "https://condominio-prueba-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtDb = getDatabase(app);

const syncDebtsToRealtime = async (condoId: string) => {
    console.log("🔐 Autenticando...");
    await signInWithEmailAndPassword(auth, "vallecondo@gmail.com", "VALLE2026");
    console.log("✅ Autenticado");
    
    console.log("🔄 Sincronizando deudas...");
    const debtsSnapshot = await getDocs(collection(db, 'condominios', condoId, 'debts'));
    
    const debtsByOwner: { [key: string]: any[] } = {};
    debtsSnapshot.forEach(doc => {
        const debt = { id: doc.id, ...doc.data() };
        const ownerId = (debt as any).ownerId;
        if (ownerId) {
            if (!debtsByOwner[ownerId]) debtsByOwner[ownerId] = [];
            debtsByOwner[ownerId].push(debt);
        }
    });
    
    for (const [ownerId, debts] of Object.entries(debtsByOwner)) {
        const debtsRef = ref(rtDb, `condominios/${condoId}/debts/${ownerId}`);
        await set(debtsRef, debts);
        console.log(`   ✅ Sincronizadas ${debts.length} deudas para ${ownerId}`);
    }
    
    console.log("✅ Sincronización completada");
    process.exit(0);
};

syncDebtsToRealtime('condo_01').catch(console.error);

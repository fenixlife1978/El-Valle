import { db as firestoreDB } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getDatabase, ref, set, get, push, query as rtQuery, orderByChild, equalTo } from 'firebase/database';
import { memoryCache } from './memory-cache';

const getRTDB = () => getDatabase();

// Sincronizar deudas de un propietario a Realtime DB
export const syncDebtsToRealtime = async (condoId: string, ownerId: string) => {
    const rtDb = getRTDB();
    const firestoreQ = query(
        collection(firestoreDB, 'condominios', condoId, 'debts'),
        where('ownerId', '==', ownerId)
    );
    const snapshot = await getDocs(firestoreQ);
    const debts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const debtsRef = ref(rtDb, `condominios/${condoId}/debts/${ownerId}`);
    await set(debtsRef, debts);
    
    // Actualizar caché en memoria
    memoryCache.set(`debts_${condoId}_${ownerId}`, debts, 300);
    
    return debts;
};

// Obtener deudas (prioridad: caché -> Realtime -> Firestore)
export const getDebts = async (condoId: string, ownerId: string) => {
    // 1. Intentar desde caché en memoria
    const cached = memoryCache.get(`debts_${condoId}_${ownerId}`);
    if (cached) return cached;
    
    // 2. Intentar desde Realtime DB
    const rtDb = getRTDB();
    const debtsRef = ref(rtDb, `condominios/${condoId}/debts/${ownerId}`);
    const snapshot = await get(debtsRef);
    
    if (snapshot.exists()) {
        const debts = snapshot.val();
        memoryCache.set(`debts_${condoId}_${ownerId}`, debts, 300);
        return debts;
    }
    
    // 3. Fallback a Firestore y sincronizar
    return await syncDebtsToRealtime(condoId, ownerId);
};

// Actualizar una deuda (Firestore + Realtime)
export const updateDebt = async (condoId: string, debtId: string, ownerId: string, data: any) => {
    // Actualizar Firestore
    const debtRef = doc(firestoreDB, 'condominios', condoId, 'debts', debtId);
    await updateDoc(debtRef, data);
    
    // Invalidar caché
    memoryCache.delete(`debts_${condoId}_${ownerId}`);
    
    // Sincronizar a Realtime
    await syncDebtsToRealtime(condoId, ownerId);
};

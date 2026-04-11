import { db as firestoreDB } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getDatabase, ref, set, get, push } from 'firebase/database';
import { memoryCache } from './memory-cache';

const getRTDB = () => getDatabase();

// Obtener cuotas extraordinarias pendientes de un propietario
export const getExtraordinaryDebts = async (condoId: string, ownerId: string) => {
    const cacheKey = `extra_debts_${condoId}_${ownerId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;
    
    const rtDb = getRTDB();
    const debtsRef = ref(rtDb, `condominios/${condoId}/extra_debts/${ownerId}`);
    const snapshot = await get(debtsRef);
    
    if (snapshot.exists()) {
        const debts = snapshot.val();
        memoryCache.set(cacheKey, debts, 300);
        return debts;
    }
    
    // Cargar desde Firestore
    const q = query(
        collection(firestoreDB, 'condominios', condoId, 'owner_extraordinary_debts'),
        where('ownerId', '==', ownerId),
        where('status', '==', 'pending')
    );
    const snapshotFS = await getDocs(q);
    const debts = snapshotFS.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Guardar en Realtime
    await set(ref(rtDb, `condominios/${condoId}/extra_debts/${ownerId}`), debts);
    memoryCache.set(cacheKey, debts, 300);
    
    return debts;
};

// Marcar cuota como pagada
export const markExtraordinaryDebtAsPaid = async (condoId: string, debtId: string, ownerId: string, paymentData: any) => {
    // Actualizar Firestore
    const debtRef = doc(firestoreDB, 'condominios', condoId, 'owner_extraordinary_debts', debtId);
    await updateDoc(debtRef, {
        status: 'paid',
        paidAt: paymentData.paidAt,
        paymentId: paymentData.paymentId
    });
    
    // Invalidar caché
    memoryCache.delete(`extra_debts_${condoId}_${ownerId}`);
    
    // Actualizar Realtime
    const rtDb = getRTDB();
    const debts = await getExtraordinaryDebts(condoId, ownerId);
    const updatedDebts = debts.filter((d: any) => d.id !== debtId);
    await set(ref(rtDb, `condominios/${condoId}/extra_debts/${ownerId}`), updatedDebts);
};

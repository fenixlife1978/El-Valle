import { db as firestoreDB } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { getDatabase, ref, set, push } from 'firebase/database';
import { subMonths } from 'date-fns';

const getRTDB = () => getDatabase();

export const archiveOldPayments = async (condoId: string, monthsOld: number = 3) => {
    const cutoffDate = subMonths(new Date(), monthsOld);
    const cutoffTimestamp = Timestamp.fromDate(cutoffDate);
    
    const paymentsQuery = query(
        collection(firestoreDB, 'condominios', condoId, 'payments'),
        where('paymentDate', '<', cutoffTimestamp),
        where('status', '==', 'aprobado')
    );
    
    const snapshot = await getDocs(paymentsQuery);
    const rtDb = getRTDB();
    const archiveRef = ref(rtDb, `condominios/${condoId}/archived_payments`);
    
    for (const doc of snapshot.docs) {
        const payment = { id: doc.id, ...doc.data() };
        const newRef = push(archiveRef);
        await set(newRef, {
            ...payment,
            archivedAt: Date.now()
        });
    }
    
    console.log(`Archivados ${snapshot.size} pagos antiguos`);
    return snapshot.size;
};

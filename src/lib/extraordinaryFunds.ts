import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp, serverTimestamp } from 'firebase/firestore';

export interface ExtraordinaryTransaction {
    id?: string;
    tipo: 'ingreso' | 'egreso';
    monto: number;
    exchangeRate: number;
    descripcion: string;
    referencia?: string;
    fecha: Timestamp;
    categoria: 'extraordinaria';
    sourcePaymentId?: string; // Si viene de un pago
    sourceTransactionId?: string; // Si viene de un movimiento de tesorería
    ownerId?: string; // Propietario que pagó
    createdAt: Timestamp;
}

/**
 * Registrar un ingreso por Cuota Extraordinaria
 */
export const registerExtraordinaryIncome = async (
    condoId: string,
    data: {
        monto: number;
        exchangeRate: number;
        descripcion: string;
        referencia?: string;
        fecha: Date;
        sourcePaymentId?: string;
        ownerId?: string;
    }
) => {
    try {
        await addDoc(collection(db, 'condominios', condoId, 'extraordinary_funds'), {
            tipo: 'ingreso',
            monto: data.monto,
            exchangeRate: data.exchangeRate,
            descripcion: data.descripcion.toUpperCase(),
            referencia: data.referencia || '',
            fecha: Timestamp.fromDate(data.fecha),
            categoria: 'extraordinaria',
            sourcePaymentId: data.sourcePaymentId || null,
            ownerId: data.ownerId || null,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error registrando ingreso extraordinario:", error);
        throw error;
    }
};

/**
 * Registrar un egreso por Cuota Extraordinaria (desde tesorería)
 */
export const registerExtraordinaryExpense = async (
    condoId: string,
    data: {
        monto: number;
        exchangeRate: number;
        descripcion: string;
        referencia?: string;
        fecha: Date;
        sourceTransactionId?: string;
    }
) => {
    try {
        await addDoc(collection(db, 'condominios', condoId, 'extraordinary_funds'), {
            tipo: 'egreso',
            monto: data.monto,
            exchangeRate: data.exchangeRate,
            descripcion: data.descripcion.toUpperCase(),
            referencia: data.referencia || '',
            fecha: Timestamp.fromDate(data.fecha),
            categoria: 'extraordinaria',
            sourceTransactionId: data.sourceTransactionId || null,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error registrando egreso extraordinario:", error);
        throw error;
    }
};

/**
 * Obtener todas las transacciones extraordinarias
 */
export const getExtraordinaryTransactions = async (condoId: string) => {
    const q = query(
        collection(db, 'condominios', condoId, 'extraordinary_funds'),
        orderBy('fecha', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtraordinaryTransaction));
};

/**
 * Calcular saldo actual del fondo extraordinario
 */
export const getExtraordinaryBalance = async (condoId: string): Promise<number> => {
    const transactions = await getExtraordinaryTransactions(condoId);
    return transactions.reduce((balance, tx) => {
        return balance + (tx.tipo === 'ingreso' ? tx.monto : -tx.monto);
    }, 0);
};

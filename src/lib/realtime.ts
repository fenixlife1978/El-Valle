import { getDatabase, ref, set, push, onValue, off, query, orderByChild, limitToLast, get } from 'firebase/database';

let db: ReturnType<typeof getDatabase> | null = null;

export const initRealtimeDB = () => {
    if (!db) {
        db = getDatabase();
    }
    return db;
};

// ============================================
// LOGS DE AUDITORÍA (mover de Firestore)
// ============================================
export const saveAuditLog = async (condoId: string, logData: any) => {
    const database = initRealtimeDB();
    const logsRef = ref(database, `condominios/${condoId}/audit_logs`);
    const newLogRef = push(logsRef);
    await set(newLogRef, {
        ...logData,
        timestamp: Date.now()
    });
};

// ============================================
// NOTIFICACIONES
// ============================================
export const saveNotification = async (condoId: string, userId: string, notification: any) => {
    const database = initRealtimeDB();
    const notifRef = ref(database, `condominios/${condoId}/notifications/${userId}`);
    const newNotifRef = push(notifRef);
    await set(newNotifRef, {
        ...notification,
        read: false,
        createdAt: Date.now()
    });
};

export const getUserNotifications = (condoId: string, userId: string, callback: (notifications: any[]) => void) => {
    const database = initRealtimeDB();
    const notifRef = ref(database, `condominios/${condoId}/notifications/${userId}`);
    const notificationsQuery = query(notifRef, orderByChild('createdAt'), limitToLast(50));
    
    const unsubscribe = onValue(notificationsQuery, (snapshot) => {
        const data = snapshot.val();
        const notifications = data ? Object.entries(data).map(([id, value]) => ({ id, ...value as any })) : [];
        callback(notifications.reverse());
    });
    
    return unsubscribe;
};

// ============================================
// PAGOS ARCHIVADOS (pagos antiguos)
// ============================================
export const archivePayment = async (condoId: string, payment: any) => {
    const database = initRealtimeDB();
    const archiveRef = ref(database, `condominios/${condoId}/archived_payments`);
    const newRef = push(archiveRef);
    await set(newRef, {
        ...payment,
        archivedAt: Date.now()
    });
};

export const getArchivedPayments = async (condoId: string, limit: number = 100) => {
    const database = initRealtimeDB();
    const archiveRef = ref(database, `condominios/${condoId}/archived_payments`);
    const paymentsQuery = query(archiveRef, orderByChild('archivedAt'), limitToLast(limit));
    const snapshot = await get(paymentsQuery);
    const data = snapshot.val();
    return data ? Object.entries(data).map(([id, value]) => ({ id, ...value as any })) : [];
};

// ============================================
// SESIONES DE USUARIO
// ============================================
export const saveUserSession = async (userId: string, sessionData: any) => {
    const database = initRealtimeDB();
    const sessionRef = ref(database, `sessions/${userId}`);
    await set(sessionRef, {
        ...sessionData,
        lastActive: Date.now()
    });
};

// ============================================
// CACHE DE CONSULTAS FRECUENTES
// ============================================
export const cacheQueryResult = async (cacheKey: string, data: any, ttlSeconds: number = 300) => {
    const database = initRealtimeDB();
    const cacheRef = ref(database, `cache/${cacheKey}`);
    await set(cacheRef, {
        data,
        expiresAt: Date.now() + (ttlSeconds * 1000)
    });
};

export const getCachedQueryResult = async (cacheKey: string) => {
    const database = initRealtimeDB();
    const cacheRef = ref(database, `cache/${cacheKey}`);
    const snapshot = await get(cacheRef);
    if (snapshot.exists()) {
        const cached = snapshot.val();
        if (cached.expiresAt > Date.now()) {
            return cached.data;
        }
    }
    return null;
};

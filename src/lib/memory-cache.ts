// Caché simple en memoria para reducir lecturas a Firestore
const cache = new Map<string, { data: any; expiresAt: number }>();

export const memoryCache = {
    get: <T>(key: string): T | null => {
        const item = cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            cache.delete(key);
            return null;
        }
        return item.data as T;
    },
    
    set: (key: string, data: any, ttlSeconds: number = 300) => {
        cache.set(key, {
            data,
            expiresAt: Date.now() + (ttlSeconds * 1000)
        });
    },
    
    clear: () => cache.clear(),
    
    delete: (key: string) => cache.delete(key)
};

// Caché agresivo para reducir lecturas
const cache = new Map();

export const quickCache = {
    get: (key: string) => {
        const item = cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            cache.delete(key);
            return null;
        }
        return item.data;
    },
    set: (key: string, data: any, seconds: number = 60) => {
        cache.set(key, { data, expiresAt: Date.now() + seconds * 1000 });
    }
};

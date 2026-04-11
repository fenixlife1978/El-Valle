import { memoryCache } from './memory-cache';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

// Cache para settings (tasa, cuota)
export const getCachedSettings = async (condoId: string) => {
    const cacheKey = `settings_${condoId}`;
    let settings = memoryCache.get(cacheKey);
    
    if (!settings) {
        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
            settings = snap.data();
            memoryCache.set(cacheKey, settings, 600); // 10 minutos
        }
    }
    return settings;
};

// Cache para propietario
export const getCachedOwner = async (condoId: string, ownerId: string) => {
    const cacheKey = `owner_${condoId}_${ownerId}`;
    let owner = memoryCache.get(cacheKey);
    
    if (!owner) {
        const ownersCol = condoId === 'condo_01' ? 'owners' : 'propietarios';
        const ownerRef = doc(db, 'condominios', condoId, ownersCol, ownerId);
        const snap = await getDoc(ownerRef);
        if (snap.exists()) {
            owner = snap.data();
            memoryCache.set(cacheKey, owner, 300); // 5 minutos
        }
    }
    return owner;
};

import { getCachedQueryResult, cacheQueryResult } from './realtime';

// Cache para deudas de propietarios (5 minutos)
const DEBTS_CACHE_TTL = 300;

export const getCachedDebts = async (condoId: string, ownerId: string) => {
    const cacheKey = `debts_${condoId}_${ownerId}`;
    return await getCachedQueryResult(cacheKey);
};

export const cacheDebts = async (condoId: string, ownerId: string, debts: any[]) => {
    const cacheKey = `debts_${condoId}_${ownerId}`;
    await cacheQueryResult(cacheKey, debts, DEBTS_CACHE_TTL);
};

// Cache para tasa de cambio (10 minutos)
const RATE_CACHE_TTL = 600;

export const getCachedRate = async (condoId: string) => {
    const cacheKey = `rate_${condoId}`;
    return await getCachedQueryResult(cacheKey);
};

export const cacheRate = async (condoId: string, rate: number) => {
    const cacheKey = `rate_${condoId}`;
    await cacheQueryResult(cacheKey, rate, RATE_CACHE_TTL);
};

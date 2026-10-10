'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  countPendingOfflineOperations,
  syncOfflineOperations,
  type OfflineOperation,
} from '@/lib/offline-outbox';
import { useNetworkStatus } from '@/hooks/use-network-status';

export type OfflineSender = (operation: OfflineOperation) => Promise<'success' | 'conflict'>;

export interface OfflineSyncState {
  pendingCount: number;
  isSyncing: boolean;
  lastResult: { synced: number; failed: number; conflicts: number } | null;
  error: string | null;
  syncNow: () => Promise<void>;
  refreshCount: () => Promise<void>;
}

/**
 * Coordinates an offline outbox with an authenticated API sender supplied by
 * the caller. The hook does not decide what is authorized or write to Turso;
 * the server remains responsible for tenant checks and idempotency.
 */
export function useOfflineSync(condoId: string | null, userId: string | null, send: OfflineSender): OfflineSyncState {
  const { isOnline, reconnected } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<OfflineSyncState['lastResult']>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const sendRef = useRef(send);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const refreshCount = useCallback(async () => {
    if (!condoId || !userId) {
      setPendingCount(0);
      return;
    }
    try {
      setPendingCount(await countPendingOfflineOperations(condoId, userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer la cola offline.');
    }
  }, [condoId, userId]);

  const syncNow = useCallback(async () => {
    if (!condoId || !userId || !isOnline || running.current) return;
    running.current = true;
    setIsSyncing(true);
    setError(null);
    try {
      const result = await syncOfflineOperations(condoId, userId, operation => sendRef.current(operation));
      setLastResult(result);
      await refreshCount();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falló la sincronización.');
    } finally {
      running.current = false;
      setIsSyncing(false);
    }
  }, [condoId, userId, isOnline, refreshCount]);

  useEffect(() => {
    void refreshCount();
    const changed = () => { void refreshCount(); };
    window.addEventListener('efas-offline-queue-changed', changed);
    return () => window.removeEventListener('efas-offline-queue-changed', changed);
  }, [refreshCount]);

  useEffect(() => {
    if (isOnline && (reconnected || pendingCount > 0)) void syncNow();
  }, [isOnline, reconnected, pendingCount, syncNow]);

  useEffect(() => {
    const onFocus = () => {
      void refreshCount();
      if (typeof navigator !== 'undefined' && navigator.onLine) void syncNow();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshCount, syncNow]);

  return { pendingCount, isSyncing, lastResult, error, syncNow, refreshCount };
}

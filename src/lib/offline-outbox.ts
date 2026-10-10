/**
 * Cola local duradera para operaciones que no pudieron llegar al servidor.
 *
 * Importante: esta cola NO es la base de datos oficial. Una operación solo se
 * considera confirmada cuando el endpoint de Turso responde con éxito.
 * Nunca guardar aquí contraseñas, tokens ni credenciales de Turso.
 */
export type OfflineOperationStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface OfflineOperation<T = unknown> {
  id: string;
  idempotencyKey: string;
  condoId: string;
  userId: string;
  entity: string;
  action: string;
  payload: T;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  status: OfflineOperationStatus;
  lastError?: string;
}

const DB_NAME = 'efas-condosys-offline';
const DB_VERSION = 1;
const STORE_NAME = 'outbox';

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('El almacenamiento offline no está disponible en este navegador.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_status_created', ['status', 'createdAt'], { unique: false });
        store.createIndex('by_condo_created', ['condoId', 'createdAt'], { unique: false });
        store.createIndex('by_idempotency', 'idempotencyKey', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la cola offline.'));
    request.onblocked = () => reject(new Error('Cierra otras pestañas de EFAS para actualizar el almacenamiento offline.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falló una operación de almacenamiento local.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const result = await requestResult(run(tx.objectStore(STORE_NAME)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falló la transacción local.'));
      tx.onabort = () => reject(tx.error ?? new Error('Se canceló la transacción local.'));
    });
    return result;
  } finally {
    db.close();
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Persiste una operación pendiente antes de informar al usuario que quedó guardada localmente. */
export async function enqueueOfflineOperation<T>(input: {
  condoId: string;
  userId?: string;
  entity: string;
  action: string;
  payload: T;
  idempotencyKey?: string;
}): Promise<OfflineOperation<T>> {
  if (!input.condoId.trim() || !input.entity.trim() || !input.action.trim()) {
    throw new Error('La operación offline necesita condominio, entidad y acción.');
  }

  const now = Date.now();
  const operation: OfflineOperation<T> = {
    id: newId(),
    idempotencyKey: input.idempotencyKey?.trim() || newId(),
    condoId: input.condoId,
    userId: input.userId?.trim() || 'anonymous',
    entity: input.entity,
    action: input.action,
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    status: 'pending',
  };
  await withStore('readwrite', store => store.add(operation));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('efas-offline-queue-changed'));
    // Background Sync existe en algunos navegadores Chromium; el hook foreground
    // sigue siendo el fallback en plataformas que no lo implementan.
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then(registration => {
        const syncManager = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
        return syncManager?.register('efas-offline-sync');
      }).catch(() => undefined);
    }
  }
  return operation;
}

export async function listOfflineOperations(condoId: string, userId?: string): Promise<OfflineOperation[]> {
  const all = await withStore<OfflineOperation[]>('readonly', store => store.getAll());
  return all
    .filter(item => item.condoId === condoId && (!userId || item.userId === userId))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPendingOfflineOperations(condoId: string, userId?: string): Promise<number> {
  const items = await listOfflineOperations(condoId, userId);
  return items.filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing').length;
}

export async function countConflictedOfflineOperations(condoId: string, userId?: string): Promise<number> {
  const items = await listOfflineOperations(condoId, userId);
  return items.filter(item => item.status === 'conflict').length;
}

export async function removeOfflineOperation(id: string): Promise<void> {
  await withStore('readwrite', store => store.delete(id));
}

export async function updateOfflineOperation(
  id: string,
  update: Partial<Pick<OfflineOperation, 'status' | 'attempts' | 'lastError' | 'updatedAt'>>
): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const existing = await requestResult(store.get(id)) as OfflineOperation | undefined;
    if (!existing) return;
    store.put({ ...existing, ...update, updatedAt: Date.now() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo actualizar la operación.'));
      tx.onabort = () => reject(tx.error ?? new Error('Se canceló la actualización local.'));
    });
  } finally {
    db.close();
  }
}

/**
 * Ejecuta la cola de un condominio en orden. El callback debe llamar a un API
 * autenticado que aplique idempotencia en el servidor y escriba en Turso.
 * Respuesta conflict conserva la operación para revisión; success la elimina.
 */
export async function syncOfflineOperations(
  condoId: string,
  userId: string,
  send: (operation: OfflineOperation) => Promise<'success' | 'conflict'>
): Promise<{ synced: number; failed: number; conflicts: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0, conflicts: 0 };
  }

  const queued = await listOfflineOperations(condoId, userId);
  const firstConflict = queued.findIndex(item => item.status === 'conflict');
  const operations = queued.slice(0, firstConflict < 0 ? queued.length : firstConflict)
    .filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing');
  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  for (const operation of operations) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) break;
    await updateOfflineOperation(operation.id, {
      status: 'syncing',
      attempts: operation.attempts + 1,
      lastError: undefined,
    });

    try {
      const result = await send({ ...operation, status: 'syncing', attempts: operation.attempts + 1 });
      if (result === 'success') {
        await removeOfflineOperation(operation.id);
        synced += 1;
      } else {
        await updateOfflineOperation(operation.id, { status: 'conflict', lastError: 'El servidor requiere revisión de esta operación.' });
        conflicts += 1;
        break;
      }
    } catch (error) {
      await updateOfflineOperation(operation.id, {
        status: 'failed',
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'Error de sincronización desconocido.',
      });
      failed += 1;
      break;
    }
  }

  return { synced, failed, conflicts };
}

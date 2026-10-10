const CACHE_NAME = 'efas-condosys-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// 1. INSTALACIÓN: Cachear archivos base
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos cache.addAll pero capturamos errores por si falta algún archivo
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn("Error precacheando:", err));
    })
  );
});

// 2. ACTIVACIÓN: Limpiar versiones antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('EFAS: Limpiando caché antigua...', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. FETCH: no almacenar datos autenticados ni respuestas de API en Cache Storage.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nunca cachear APIs, sesiones, datos privados, POST ni recursos de terceros.
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/api'
  ) {
    return;
  }

  // Las páginas dinámicas se consultan a la red; sin conexión se muestra el shell público.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const shell = await caches.match('/');
      return shell || new Response('Sin conexión. Vuelve a conectarte para cargar esta pantalla.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }));
    return;
  }

  // Solo guardar recursos estáticos del mismo origen.
  const isStaticAsset = /\.(?:js|css|png|jpe?g|webp|gif|svg|ico|woff2?|ttf)$/i.test(url.pathname) ||
    url.pathname === '/manifest.json';
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }
        return networkResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. PUSH: Notificaciones
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'EFAS CondoSys', body: event.data ? event.data.text() : 'Nueva actualización' };
  }

  const title = data.title || 'Notificación EFAS';
  const options = {
    body: data.body || 'Tienes una nueva actualización en tu condominio.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. CLICK EN NOTIFICACIÓN
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// 6. BACKGROUND SYNC: procesa la misma cola IndexedDB si el navegador lo soporta.
// La API valida la sesión y el tenant; las claves idempotentes protegen reintentos.
const OUTBOX_DB = 'efas-condosys-offline';
const OUTBOX_STORE = 'outbox';
const BACKGROUND_SYNC_TAG = 'efas-offline-sync';

function openOutbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        store.createIndex('by_status_created', ['status', 'createdAt'], { unique: false });
        store.createIndex('by_condo_created', ['condoId', 'createdAt'], { unique: false });
        store.createIndex('by_idempotency', 'idempotencyKey', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la cola offline.'));
  });
}

async function readOutbox() {
  const db = await openOutbox();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(OUTBOX_STORE, 'readonly').objectStore(OUTBOX_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('No se pudo leer la cola offline.'));
    });
  } finally {
    db.close();
  }
}

async function mutateOutbox(id, mutation) {
  const db = await openOutbox();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite');
      const store = tx.objectStore(OUTBOX_STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) return;
        const next = mutation(request.result);
        if (next === null) store.delete(id);
        else store.put({ ...request.result, ...next, updatedAt: Date.now() });
      };
      request.onerror = () => reject(request.error || new Error('No se pudo actualizar la cola offline.'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Falló la actualización de la cola offline.'));
      tx.onabort = () => reject(tx.error || new Error('Se canceló la actualización de la cola offline.'));
    });
  } finally {
    db.close();
  }
}

async function syncOutboxInBackground() {
  const sessionResponse = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
  if (!sessionResponse.ok) throw new Error('Se necesita una sesión válida para sincronizar.');
  const sessionData = await sessionResponse.json();
  const currentUserId = sessionData?.user?.userId;
  if (sessionData?.authenticated !== true || !currentUserId) throw new Error('Sesión no disponible.');

  const queued = (await readOutbox())
    .filter(op => op.userId === currentUserId)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const op of queued) {
    if (op.status === 'conflict') break;
    if (!['pending', 'failed', 'syncing'].includes(op.status)) continue;
    await mutateOutbox(op.id, record => ({ status: 'syncing', attempts: (record.attempts || 0) + 1, lastError: undefined }));
    const response = await fetch('/api/offline/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        condoId: op.condoId,
        originUserId: op.userId,
        operations: [{
          id: op.id,
          idempotencyKey: op.idempotencyKey,
          entity: op.entity,
          action: op.action,
          payload: op.payload
        }]
      })
    });
    if (!response.ok) {
      await mutateOutbox(op.id, () => ({ status: 'failed', lastError: 'La sincronización en segundo plano falló (HTTP ' + response.status + ').' }));
      throw new Error('La sincronización en segundo plano falló.');
    }
    const result = await response.json();
    if (result?.results?.[0]?.status === 'success') {
      await mutateOutbox(op.id, () => null);
      continue;
    }
    await mutateOutbox(op.id, () => ({ status: 'conflict', lastError: 'El servidor requiere revisar esta operación.' }));
    break;
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === BACKGROUND_SYNC_TAG) event.waitUntil(syncOutboxInBackground());
});

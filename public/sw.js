const CACHE_NAME = 'efas-condosys-v1';
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

// 3. FETCH: Estrategia Stale-While-Revalidate con filtros
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // NO CACHEAR: Peticiones que no sean GET, extensiones, o APIs de Firebase/Google
  if (
    request.method !== 'GET' || 
    !url.protocol.startsWith('http') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase')
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        // Solo cachear respuestas válidas
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Retorno silencioso si falla la red y no hay caché
        return cachedResponse; 
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
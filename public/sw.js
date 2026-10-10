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
  const isStaticAsset = /\\.(?:js|css|png|jpe?g|webp|gif|svg|ico|woff2?|ttf)$/i.test(url.pathname) ||
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
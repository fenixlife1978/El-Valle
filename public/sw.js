// public/sw.js

const CACHE_NAME = 'efas-condosys-v1'; // Nombre actualizado al sistema
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/og-banner.png',
  '/icon-192x192.png', // Añadido: vital para el modo offline
  '/icon-512x512.png'
];

// 1. INSTALACIÓN: Cachear archivos y forzar activación
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Obliga al SW nuevo a tomar el control de inmediato
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. ACTIVACIÓN: Limpiar cachés viejas (EVITA QUE EL USUARIO VEA DATA ANTIGUA)
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
  return self.clients.claim(); // Toma el control de las pestañas abiertas inmediatamente
});

// 3. FETCH: Estrategia "Stale-While-Revalidate" (Rápido pero actualizado)
self.addEventListener('fetch', (event) => {
  // Solo cacheamos peticiones GET (evita errores con llamadas a Firebase/API)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Actualizamos la caché con la respuesta fresca de la red
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Si no hay red y no hay caché (ej. una página nueva offline), podrías devolver un offline.html
      });

      // Devolvemos la caché si existe, si no, esperamos a la red
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. PUSH: Notificaciones
self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'EFAS CondoSys', body: event.data.text() };
  }

  const title = data.title || 'Notificación de Condominio';
  const options = {
    body: data.body || 'Tienes una nueva actualización.',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/badge-72x72.png',
    vibrate: [100, 50, 100], // Vibración para mayor impacto
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. CLICK EN NOTIFICACIÓN
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una pestaña abierta con esa URL, le damos foco
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrimos una nueva
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
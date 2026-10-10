'use client';

import { useEffect } from 'react';

/** Registers the same-origin offline shell; API responses are deliberately never cached. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let disposed = false;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(registration => {
        if (!disposed) void registration.update().catch(() => undefined);
      })
      .catch(error => {
        // PWA support is optional; the application must remain usable without it.
        console.warn('No se pudo activar el modo offline del shell:', error);
      });
    return () => { disposed = true; };
  }, []);

  return null;
}

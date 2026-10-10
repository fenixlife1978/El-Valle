'use client';

import { useEffect, useState } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  /** True after this tab has observed an offline -> online transition. */
  reconnected: boolean;
}

/** Browser connectivity signal; it does not by itself guarantee server reachability. */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    reconnected: false,
  });

  useEffect(() => {
    const handleOffline = () => setStatus({ isOnline: false, reconnected: false });
    const handleOnline = () => setStatus(previous => ({
      isOnline: true,
      reconnected: !previous.isOnline,
    }));

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return status;
}

async function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const initializeFCM = async () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported');
    return;
  }

  try {
    const swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered successfully:', swRegistration);

    let subscription = await swRegistration.pushManager.getSubscription();
    if (subscription === null) {
      console.log('No subscription found, requesting permission...');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission not granted.');
        return;
      }
      
      const applicationServerKey = await urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!);
      subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      console.log('New subscription created:', subscription);

      // Send the new subscription to the backend
      await fetch('/api/save-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
      });
      console.log('Subscription sent to server.');
    } else {
      console.log('Existing subscription found:', subscription);
    }
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
};

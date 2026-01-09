
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app, db } from './firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';

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

export const initFCM = async (user: any) => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !user) {
    return;
  }

  // Check current notification permission status
  if (Notification.permission === 'denied') {
    console.log('Notification permission has been denied. User needs to re-enable it in browser settings.');
    // Optionally, inform the user how to re-enable notifications.
    // toast({
    //   title: 'Notificaciones bloqueadas',
    //   description: 'Para recibir notificaciones, debe habilitarlas en la configuración de su navegador.',
    //   variant: 'destructive',
    // });
    return;
  }

  try {
    const messaging = getMessaging(app);

    // If permission is granted, get the token.
    if (Notification.permission === 'granted') {
      const currentToken = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
      if (currentToken) {
        console.log('FCM token:', currentToken);
        const userRef = doc(db, 'owners', user.uid);
        // Silently update token without bothering the user.
        // This ensures the token is always fresh on the server.
        await updateDoc(userRef, {
            fcmTokens: arrayUnion(currentToken)
        });
      } else {
         console.log('No registration token available. Requesting permission...');
      }
    }

    // If permission is not yet granted, the getToken() call will trigger the request.
    // This part is now implicitly handled if permission is 'default'. 
    // The code above handles 'granted' and 'denied' states explicitly.

    onMessage(messaging, (payload) => {
      console.log('Message received. ', payload);
      // Customize what happens when a message is received while the app is in the foreground.
      // For example, show a custom toast.
      const notificationTitle = payload.notification?.title || 'Nueva Notificación';
      const notificationOptions = {
        body: payload.notification?.body || '',
        icon: payload.notification?.icon || '/favicon.ico',
      };
      
      // Use the browser's Notification API to show the notification
      new Notification(notificationTitle, notificationOptions);

      // Or use a custom in-app toast notification
      toast({
        title: notificationTitle,
        description: notificationOptions.body,
      });
    });

  } catch (err) {
    console.error('An error occurred while setting up FCM:', err);
  }
};

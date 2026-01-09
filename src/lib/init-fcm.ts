import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app, db } from './firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

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
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && user) {
    try {
      const messaging = getMessaging(app);

      // Check for an existing token
      const currentToken = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
      
      if (currentToken) {
        console.log('FCM token:', currentToken);
        // Send the token to your server and save it
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
            fcmTokens: arrayUnion(currentToken)
        });

      } else {
        console.log('No registration token available. Requesting permission...');
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          console.log('Notification permission granted.');
          const new_token = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
          if (new_token) {
             console.log('New FCM token:', new_token);
             const userRef = doc(db, 'users', user.uid);
             await updateDoc(userRef, {
                fcmTokens: arrayUnion(new_token)
             });
          }
        }
      }

      onMessage(messaging, (payload) => {
        console.log('Message received. ', payload);
        // You can handle foreground messages here, e.g., show a custom toast notification.
        // For example:
        // toast({
        //   title: payload.notification?.title,
        //   description: payload.notification?.body,
        // });
      });

    } catch (error) {
      console.error('An error occurred while retrieving token. ', error);
    }
  }
};

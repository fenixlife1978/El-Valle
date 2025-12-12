
// Import the Firebase app and messaging services
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
// Be sure to replace the config values with your own
const firebaseConfig = {
    apiKey: "AIzaSyBxKTp_QYuxHWB18jirph5vhY6tWCWR_HI",
    authDomain: "condominio-prueba.firebaseapp.com",
    projectId: "condominio-prueba",
    storageBucket: "condominio-prueba.appspot.com",
    messagingSenderId: "630518792088",
    appId: "1:630518792088:web:05ce5e5b80cf64a12935ed"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png' // Puedes cambiar esto a tu propio ícono
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

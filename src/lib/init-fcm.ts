

import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase'; 
import type { User } from 'firebase/auth';

const ADMIN_USER_ID = 'valle-admin-main-account';
const ADMIN_EMAIL = 'vallecondo@gmail.com';


// Función para inicializar FCM
export const initFCM = async (user: User | null) => {
    // Verifica si el código se está ejecutando en el navegador y si hay un usuario
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !user) {
        return;
    }
    
    // Espera a que el service worker esté listo
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.ready;
        } catch (error) {
            console.error('Service Worker no está listo:', error);
            return;
        }
    }

    const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
    const { app } = await import("./firebase");
    const messaging = getMessaging(app);

    try {
        // Solicitar permiso para notificaciones
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Permiso de notificación concedido.');

            // Obtener el token de registro del dispositivo
            const currentToken = await getToken(messaging, {
                vapidKey: 'BMD597wz0wYm3qYxW4wZ_mG8f-j8N4X0c8X6Z_l8H6z6R4wT_pZ2c5dJ6s9K3c1yZ3gK2jW7L8hR4dJ2l3f4e1M', // Reemplaza con tu VAPID key
            });

            if (currentToken) {
                console.log('FCM Token:', currentToken);

                const isAdministrator = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                const userDocId = isAdministrator ? ADMIN_USER_ID : user.uid;
                
                // Guardar el token en Firestore, asociado al usuario
                const userDocRef = doc(db, 'owners', userDocId);
                // Usamos arrayUnion para añadir el token sin duplicarlo si ya existe
                await updateDoc(userDocRef, {
                    fcmTokens: arrayUnion(currentToken)
                });

            } else {
                console.log('No se pudo obtener el token de registro. Pide permiso de notificación.');
            }
        } else {
            console.log('El usuario denegó el permiso para notificaciones.');
        }
    } catch (error) {
        console.error('Error al obtener el token de FCM:', error);
    }
};

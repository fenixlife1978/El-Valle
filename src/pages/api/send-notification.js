// pages/api/send-notification.js
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';

const subscriptionsFilePath = path.join(process.cwd(), 'subscriptions.json');

const readSubscriptions = () => {
    try {
        const data = fs.readFileSync(subscriptionsFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

webpush.setVapidDetails(
    'mailto:your-email@example.com', // Replace with your email
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { title, body, icon, url } = req.body;

        if (!title || !body) {
            return res.status(400).json({ error: 'Title and body are required.' });
        }

        const subscriptions = readSubscriptions();
        if (subscriptions.length === 0) {
            return res.status(200).json({ message: 'No subscriptions to send notifications to.' });
        }

        const notificationPayload = JSON.stringify({
            title: title,
            body: body,
            icon: icon || '/icon-192x192.png',
            url: url || '/'
        });

        const promises = subscriptions.map(subscription =>
            webpush.sendNotification(subscription, notificationPayload)
            .catch(error => {
                // If a subscription is expired or invalid, you might want to remove it
                console.error(`Error sending notification to ${subscription.endpoint}:`, error.statusCode);
                if (error.statusCode === 404 || error.statusCode === 410) {
                    // Mark for removal
                    return { ...subscription, remove: true };
                }
                return subscription;
            })
        );

        try {
            const results = await Promise.all(promises);
            // Filter out subscriptions that should be removed
            const updatedSubscriptions = results.filter(sub => !sub.remove);
            
            if (updatedSubscriptions.length < subscriptions.length) {
                // Save the updated list if any subscriptions were removed
                fs.writeFileSync(subscriptionsFilePath, JSON.stringify(updatedSubscriptions, null, 2), 'utf-8');
            }

            res.status(200).json({ message: 'Notifications sent successfully.' });
        } catch (error) {
            console.error('Failed to send notifications:', error);
            res.status(500).json({ error: 'Failed to send notifications' });
        }
        
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}

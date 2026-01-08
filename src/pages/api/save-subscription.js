// pages/api/save-subscription.js
import fs from 'fs';
import path from 'path';

const subscriptionsFilePath = path.join(process.cwd(), 'subscriptions.json');

const readSubscriptions = () => {
    try {
        const data = fs.readFileSync(subscriptionsFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // If the file doesn't exist, return an empty array
        return [];
    }
};

const writeSubscriptions = (subscriptions) => {
    fs.writeFileSync(subscriptionsFilePath, JSON.stringify(subscriptions, null, 2), 'utf-8');
};

export default function handler(req, res) {
    if (req.method === 'POST') {
        const newSubscription = req.body;

        if (!newSubscription || !newSubscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }

        const subscriptions = readSubscriptions();

        // Check if the subscription already exists
        const existingSubscription = subscriptions.find(
            (sub) => sub.endpoint === newSubscription.endpoint
        );

        if (existingSubscription) {
            console.log('Subscription already exists.');
            return res.status(200).json({ message: 'Subscription already exists' });
        }

        // Add new subscription
        subscriptions.push(newSubscription);
        writeSubscriptions(subscriptions);
        
        console.log('Subscription saved:', newSubscription);
        res.status(201).json({ message: 'Subscription saved' });
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}

import { Timestamp } from 'firebase/firestore';

export interface ExtraordinaryDebt {
    id: string;
    ownerId: string;
    ownerName: string;
    property: string;
    debtId: string;
    description: string;
    amountUSD: number;
    pendingUSD: number;
    status: 'pending' | 'partial' | 'paid';
    paidAt?: Timestamp;
    paymentId?: string;
    partialPayments?: {
        amountUSD: number;
        amountBs: number;
        date: Timestamp;
        paymentId: string;
    }[];
    createdAt: Timestamp;
}

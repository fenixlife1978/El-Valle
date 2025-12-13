

'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, CheckCircle, Receipt, ThumbsUp, ThumbsDown, X, ArrowLeft, ShieldCheck, CalendarCheck2, Clock, CalendarX } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, Timestamp, orderBy, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfMonth } from "date-fns";
import { es } from 'date-fns/locale';
import Link from "next/link";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Share2, Download } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from 'next/image';


type Debt = {
    id: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid' | 'vencida';
    paidAmountUSD?: number;
};

type Payment = {
    id: string;
    status: 'pendiente' | 'aprobado' | 'rechazado';
    totalAmount: number;
    paymentDate: Timestamp;
    reference: string;
    beneficiaries: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; }[];
    exchangeRate: number;
    receiptNumbers?: { [ownerId: string]: string };
    observations?: string;
    type: string;
    bank: string;
};


type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type ReceiptData = {
    payment: Payment;
    beneficiary: { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; };
    ownerName: string;
    ownerUnit: string;
    paidDebts: Debt[];
    previousBalance: number;
    currentBalance: number;
    qrCodeUrl?: string;
    receiptNumber: string;
} | null;


const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const solventeImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAoAAAAHgCAYAAAA10dzkAAAACXBIWXMAACE4AAAhOAFFljLvAAAAEXRFWHRTb2Z0d2FyZQBTbmlwYXN0ZV0Xzt0AACAASURBVHic7d13lFxVff8H7/2epGeSCb0JkICKgoiyK/auGNeOuNYl0TFddWfrjZ2dHWdn11ldXvXWGVdX185up9OuOF1xHHV3RUARbBUUEUBCEiChJ5nk+T3/WF0mBwIBcw5JEvJ+P/xw4JzzPf/zfZ7zfZ7n/TyBEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGE-XBwbGlj";


export default function OwnerDashboardPage() {
    const { ownerData, user, loading: authLoading } = useAuth();
    const [loadingData, setLoadingData] = useState(true);
    const [pendingDebts, setPendingDebts] = useState<Debt[]>([]);
    const [approvedPayments, setApprovedPayments] = useState<Payment[]>([]);
    const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
    const [totalDebtUSD, setTotalDebtUSD] = useState(0);
    const [balanceInFavor, setBalanceInFavor] = useState(0);
    const [activeRate, setActiveRate] = useState(0);
    const [showFeedbackWidget, setShowFeedbackWidget] = useState(false);
    const [hasGivenFeedback, setHasGivenFeedback] = useState(false);
    const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        if (!user || !ownerData) return;

        const checkFeedbackStatus = async () => {
            const feedbackQuery = query(collection(db, "app_feedback"), where("ownerId", "==", user.uid));
            const feedbackSnapshot = await getDocs(feedbackQuery);
            const feedbackGiven = !feedbackSnapshot.empty;
            setHasGivenFeedback(feedbackGiven);

            const lastLogin = localStorage.getItem(`lastLogin_${user.uid}`);
            const now = new Date().getTime();
            const oneDay = 24 * 60 * 60 * 1000;
            if (!lastLogin || (now - Number(lastLogin)) > oneDay) {
                setShowFeedbackWidget(true);
                localStorage.setItem(`lastLogin_${user.uid}`, String(now));
            }
        };

        checkFeedbackStatus();
        
        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data();
                setCompanyInfo(settings.companyInfo as CompanyInfo);
                const rates = settings.exchangeRates || [];
                const active = rates.find((r: any) => r.active);
                setActiveRate(active ? active.rate : (rates[0]?.rate || 0));
            }
        });

        const debtsQuery = query(collection(db, "debts"), where("ownerId", "==", user.uid));
        const debtsUnsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            let total = 0;
            const pending: Debt[] = [];
            snapshot.forEach(doc => {
                const debt = { id: doc.id, ...doc.data() } as Debt;
                if (debt.status === 'pending' || debt.status === 'vencida') {
                    total += debt.amountUSD;
                    pending.push(debt);
                }
            });
            setTotalDebtUSD(total);
            setPendingDebts(pending.sort((a,b)=> b.year - a.year || b.month - a.month).slice(0, 5));
        });

        const ownerUnsubscribe = onSnapshot(doc(db, "owners", user.uid), (snapshot) => {
            setBalanceInFavor(snapshot.data()?.balance || 0);
        });

        const paymentsQuery = query(collection(db, "payments"), where("beneficiaryIds", "array-contains", user.uid));
        const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
            const approved: Payment[] = [];
            const recent: Payment[] = [];
            snapshot.forEach(doc => {
                const payment = { id: doc.id, ...doc.data() } as Payment;
                if (payment.status === 'aprobado') {
                    approved.push(payment);
                }
                if (payment.status === 'pendiente' || payment.status === 'rechazado') {
                    recent.push(payment);
                }
            });
            setApprovedPayments(approved.sort((a,b) => b.paymentDate.toMillis() - a.paymentDate.toMillis()).slice(0, 5));
            setRecentPayments(recent.sort((a,b) => b.paymentDate.toMillis() - a.paymentDate.toMillis()).slice(0, 5));
            setLoadingData(false);
        });

        return () => {
            debtsUnsubscribe();
            ownerUnsubscribe();
            paymentsUnsubscribe();
            settingsUnsubscribe();
        };
    }, [user, ownerData]);

    const handleFeedback = async (response: 'liked' | 'disliked') => {
        if (!user) return;
        try {
            await addDoc(collection(db, 'app_feedback'), {
                ownerId: user.uid,
                response: response,
                timestamp: Timestamp.now(),
            });
            toast({
                title: '¡Gracias por tu opinión!',
                description: 'Tu feedback nos ayuda a mejorar.',
            });
            setShowFeedbackWidget(false);
            setHasGivenFeedback(true);
        } catch (error) {
            console.error('Error submitting feedback:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo enviar tu opinión.',
            });
        }
    };
    
    const solvencyStatus = useMemo(() => {
        const isSolvente = totalDebtUSD === 0;
        return {
            isSolvente,
            text: isSolvente ? "SOLVENTE" : "NO SOLVENTE",
            colorClass: isSolvente ? "bg-green-500 text-white" : "bg-red-500 text-white",
        };
    }, [totalDebtUSD]);

    const currentMonthStatus = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const paidThisMonth = approvedPayments.some(p => {
            const paymentDate = p.paymentDate.toDate();
            return paymentDate.getFullYear() === year && paymentDate.getMonth() + 1 === month;
        });

        if (paidThisMonth) {
            return { text: "Pagado", Icon: ShieldCheck, colorClass: "bg-green-500 text-white", isAnimating: false };
        }
        
        const debtThisMonth = pendingDebts.some(d => d.year === year && d.month === month);
        if (debtThisMonth) {
            if (now.getDate() > 5) {
                return { text: "Vencido", Icon: CalendarX, colorClass: "bg-red-500 text-white", isAnimating: false };
            }
            return { text: "Pendiente", Icon: Clock, colorClass: "bg-mustard text-black", isAnimating: false };
        }

        const hasPendingReport = recentPayments.some(p => p.status === 'pendiente');
        if(hasPendingReport) {
            return { text: "Procesando", Icon: Loader2, colorClass: "bg-yellow-400 text-black", isAnimating: true };
        }

        // Default to "pagado" if no pending debt for the month is found
        return { text: "Pagado", Icon: CalendarCheck2, colorClass: "bg-green-500 text-white", isAnimating: false };

    }, [pendingDebts, approvedPayments, recentPayments]);

    const openReceiptPreview = async (payment: Payment) => {
        if (!companyInfo || !ownerData) {
          toast({ variant: 'destructive', title: 'Error', description: 'No se ha cargado la información de la empresa o del propietario.' });
          return;
        }
    
        try {
          const beneficiary = payment.beneficiaries.find(b => b.ownerId === ownerData.id);
          if (!beneficiary) {
            toast({ variant: 'destructive', title: 'Error', description: 'No eres beneficiario de este pago.' });
            return;
          }
    
          const ownerUnitSummary = (ownerData.properties && ownerData.properties.length > 0) 
            ? `${ownerData.properties[0].street} - ${ownerData.properties[0].house}` 
            : "Propiedad no especificada";
    
          const paidDebtsQuery = query(collection(db, "debts"), where("paymentId", "==", payment.id), where("ownerId", "==", ownerData.id));
          const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
          const paidDebts = paidDebtsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Debt).sort((a, b) => a.year - b.year || a.month - b.month);
    
          const totalDebtPaidWithPayment = paidDebts.reduce((sum, debt) => sum + ((debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate), 0);
          const previousBalance = ownerData.balance - (beneficiary.amount - totalDebtPaidWithPayment);
    
          const receiptNumber = payment.receiptNumbers?.[ownerData.id] || payment.id.substring(0, 10);
          
          const receiptUrl = `${window.location.origin}/receipt/${payment.id}/${beneficiary.ownerId}`;
          const qrDataContent = JSON.stringify({ receiptNumber, date: format(new Date(), 'yyyy-MM-dd'), amount: beneficiary.amount, ownerId: beneficiary.ownerId, url: receiptUrl });
          const qrCodeUrl = await QRCode.toDataURL(qrDataContent, { errorCorrectionLevel: 'M', margin: 2, scale: 4, color: { dark: '#000000', light: '#FFFFFF' } });
    
          setReceiptData({
            payment,
            beneficiary,
            ownerName: ownerData.name,
            ownerUnit: ownerUnitSummary,
            paidDebts,
            previousBalance,
            currentBalance: ownerData.balance,
            qrCodeUrl,
            receiptNumber
          });
          setIsReceiptPreviewOpen(true);
    
        } catch (error) {
          console.error("Error preparing receipt data: ", error);
          toast({ variant: 'destructive', title: 'Error', description: 'No se pudo preparar la vista previa del recibo.' });
        }
      };
    
      const generateAndAct = async (action: 'download' | 'share', data: ReceiptData) => {
        if (!data || !companyInfo) return;
    
        const { payment, beneficiary, paidDebts, previousBalance, currentBalance, qrCodeUrl, receiptNumber } = data;
        
        const pdfDoc = new jsPDF();
        const pageWidth = pdfDoc.internal.pageSize.getWidth();
        const margin = 14;
    
        if (companyInfo.logo) {
            try { pdfDoc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
            catch(e) { console.error("Error adding logo to PDF", e); }
        }
        pdfDoc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
        pdfDoc.setFontSize(9).setFont('helvetica', 'normal');
        pdfDoc.text(companyInfo.rif, margin + 30, margin + 14);
        pdfDoc.text(companyInfo.address, margin + 30, margin + 19);
        pdfDoc.text(`Teléfono: ${companyInfo.phone}`, margin + 30, margin + 24);
        pdfDoc.setFontSize(10).text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
        pdfDoc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);
        pdfDoc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
        pdfDoc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${receiptNumber}`, pageWidth - margin, margin + 45, { align: 'right' });
        if(qrCodeUrl) {
          const qrSize = 30;
          pdfDoc.addImage(qrCodeUrl, 'PNG', pageWidth - margin - qrSize, margin + 48, qrSize, qrSize);
        }
        
        let startY = margin + 60;
        pdfDoc.setFontSize(10).text(`Beneficiario: ${beneficiary.ownerName} (${data.ownerUnit})`, margin, startY);
        startY += 6;
        pdfDoc.text(`Método de pago: ${payment.type}`, margin, startY);
        startY += 6;
        pdfDoc.text(`Banco Emisor: ${payment.bank}`, margin, startY);
        startY += 6;
        pdfDoc.text(`N° de Referencia Bancaria: ${payment.reference}`, margin, startY);
        startY += 6;
        pdfDoc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, startY);
        startY += 6;
        pdfDoc.text(`Tasa de Cambio Aplicada: Bs. ${formatToTwoDecimals(payment.exchangeRate)} por USD`, margin, startY);
        startY += 10;
        
        let totalPaidInConcepts = 0;
        const tableBody = paidDebts.map(debt => {
            const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
            totalPaidInConcepts += debtAmountBs;
            const propertyLabel = "Propiedad Principal";
            const periodLabel = `${monthsLocale[debt.month]} ${debt.year}`;
            const concept = `${debt.description} (${propertyLabel})`;
            return [ periodLabel, concept, `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`, `Bs. ${formatToTwoDecimals(debtAmountBs)}` ];
        });
    
        if (paidDebts.length > 0) {
            autoTable(pdfDoc, { startY: startY, head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']], body: tableBody, theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
            startY = (pdfDoc as any).lastAutoTable.finalY;
        } else {
            totalPaidInConcepts = beneficiary.amount;
            autoTable(pdfDoc, { startY: startY, head: [['Concepto', 'Monto Pagado (Bs)']], body: [['Abono a Saldo a Favor', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`]], theme: 'striped', headStyles: { fillColor: [44, 62, 80], textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 } });
            startY = (pdfDoc as any).lastAutoTable.finalY;
        }
        startY += 8;
        
        const summaryData = [
            ['Saldo a Favor Anterior:', `Bs. ${formatToTwoDecimals(previousBalance)}`],
            ['Monto del Pago Recibido:', `Bs. ${formatToTwoDecimals(beneficiary.amount)}`],
            ['Total Abonado en Deudas:', `Bs. ${formatToTwoDecimals(totalPaidInConcepts)}`],
            ['Saldo a Favor Actual:', `Bs. ${formatToTwoDecimals(currentBalance)}`],
        ];
        autoTable(pdfDoc, { startY: startY, body: summaryData, theme: 'plain', styles: { fontSize: 9, fontStyle: 'bold' }, columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right'} } });
        startY = (pdfDoc as any).lastAutoTable.finalY + 10;
        
        const totalLabel = "TOTAL PAGADO:";
        const totalValue = `Bs. ${formatToTwoDecimals(beneficiary.amount)}`;
        pdfDoc.setFontSize(11).setFont('helvetica', 'bold');
        const totalValueWidth = pdfDoc.getStringUnitWidth(totalValue) * 11 / pdfDoc.internal.scaleFactor;
        pdfDoc.text(totalValue, pageWidth - margin, startY, { align: 'right' });
        pdfDoc.text(totalLabel, pageWidth - margin - totalValueWidth - 2, startY, { align: 'right' });
    
        const footerStartY = pdfDoc.internal.pageSize.getHeight() - 55;
        startY = startY > footerStartY ? footerStartY : startY + 10;
        if (payment.observations) {
            pdfDoc.setFontSize(8).setFont('helvetica', 'italic');
            const splitObservations = pdfDoc.splitTextToSize(`Observaciones: ${payment.observations}`, pageWidth - margin * 2);
            pdfDoc.text(splitObservations, margin, startY);
            startY += (splitObservations.length * 3.5) + 4;
        }
        const legalNote = 'Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.';
        const splitLegalNote = pdfDoc.splitTextToSize(legalNote, pageWidth - (margin * 2));
        pdfDoc.setFontSize(8).setFont('helvetica', 'bold').text(splitLegalNote, margin, startY);
        let noteY = startY + (splitLegalNote.length * 3) + 2;
        pdfDoc.setFontSize(8).setFont('helvetica', 'normal').text('Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.', margin, noteY);
        noteY += 4;
        pdfDoc.setFont('helvetica', 'bold').text(`Firma electrónica: '${companyInfo.name} - Condominio'`, margin, noteY);
        noteY += 6;
        pdfDoc.setLineWidth(0.2).line(margin, noteY, pageWidth - margin, noteY);
        noteY += 4;
        pdfDoc.setFontSize(7).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, noteY, { align: 'center'});
    
        const pdfOutput = pdfDoc.output('blob');
        const pdfFile = new File([pdfOutput], `recibo_${receiptNumber}.pdf`, { type: 'application/pdf' });
    
        if (action === 'download') {
          pdfDoc.save(`recibo_${receiptNumber}.pdf`);
        } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            try {
              await navigator.share({
                title: `Recibo de Pago ${receiptNumber}`,
                text: `Adjunto el recibo de pago para ${data.ownerName}.`,
                files: [pdfFile],
              });
            } catch (error) {
              console.error('Error al compartir:', error);
              const url = URL.createObjectURL(pdfFile);
              window.open(url, '_blank');
            }
          } else {
            const url = URL.createObjectURL(pdfFile);
            window.open(url, '_blank');
          }
      }

    if (loading || authLoading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }
    
    if (!ownerData) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Error</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>No se pudieron cargar los datos del propietario. Por favor, intente recargar la página.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Bienvenido, {ownerData?.name || 'Propietario'}</h1>
                <p className="text-muted-foreground">Aquí tienes un resumen de tu estado de cuenta y accesos rápidos.</p>
            </div>
            
            {showFeedbackWidget && !hasGivenFeedback && (
                <Alert variant="default" className="bg-blue-900/20 border-blue-500/50">
                     <AlertDescription className="flex flex-col sm:flex-row items-center justify-between gap-4 relative">
                        <div className="flex-grow">
                            <h3 className="font-bold text-lg text-foreground">¡Hola de nuevo!</h3>
                            <p className="text-muted-foreground">¿Te está gustando tu nueva experiencia en la aplicación?</p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            <Button size="sm" onClick={() => handleFeedback('liked')} className="bg-green-600 hover:bg-green-700">
                                <ThumbsUp className="mr-2 h-4 w-4" /> Sí, me gusta
                            </Button>

                             <Button size="sm" variant="destructive" onClick={() => handleFeedback('disliked')}>
                                <ThumbsDown className="mr-2 h-4 w-4" /> No, puede mejorar
                            </Button>
                        </div>
                        
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => setShowFeedbackWidget(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                 <Card className={cn("relative flex flex-col items-center justify-center text-center overflow-hidden", solvencyStatus.colorClass)}>
                    {solvencyStatus.isSolvente ? (
                        <>
                            <Image src={solventeImage} alt="Solvente" layout="fill" objectFit="cover" quality={100} />
                        </>
                    ) : (
                        <>
                             <CardHeader>
                                <CardTitle className="text-sm font-medium">Estatus de Solvencia</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-grow flex items-center justify-center">
                                <p className="text-5xl font-bold animate-in zoom-in-95">{solvencyStatus.text}</p>
                            </CardContent>
                        </>
                    )}
                </Card>
                <Card className={cn("flex flex-col items-center justify-center text-center", currentMonthStatus.colorClass)}>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Estado del Mes Actual</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow flex items-center justify-center flex-col gap-2">
                        <currentMonthStatus.Icon className={cn("h-12 w-12", currentMonthStatus.isAnimating && "animate-spin")} />
                        <p className="text-2xl font-bold">{currentMonthStatus.text}</p>
                    </CardContent>
                    <CardFooter className="w-full text-center text-xs p-2 border-t mt-2">
                        <p>El pago de cada cuota VENCE el día 5 del mes en curso</p>
                    </CardFooter>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Deuda Total</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loadingData ? (
                            <Loader2 className="h-8 w-8 animate-spin" />
                        ) : (
                            <>
                                <p className="text-3xl font-bold text-destructive">${totalDebtUSD.toFixed(2)}</p>
                                <p className="text-sm text-muted-foreground">Aprox. Bs. {formatToTwoDecimals(totalDebtUSD * activeRate)}</p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card className="bg-primary text-primary-foreground">
                    <CardHeader>
                        <CardTitle>Saldo a Favor</CardTitle>
                        <CardDescription className="text-primary-foreground/80">Monto disponible para ser usado en futuros pagos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingData ? (
                            <Loader2 className="h-8 w-8 animate-spin" />
                        ) : (
                            <p className="text-3xl font-bold">Bs. {formatToTwoDecimals(balanceInFavor)}</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            <div className="grid gap-6 lg:grid-cols-2">
                 <Card>
                    <CardHeader>
                        <CardTitle>Deudas Pendientes Recientes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Período</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Monto (USD)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingData ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin"/>
                                        </TableCell>
                                    </TableRow>
                                ) : pendingDebts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">¡Felicidades! No tienes deudas pendientes.</TableCell>
                                    </TableRow>
                                ) : (
                                    pendingDebts.map(debt => {
                                        const debtDate = startOfMonth(new Date(debt.year, debt.month - 1));
                                        const isOverdue = isBefore(debtDate, startOfMonth(new Date()));
                                        
                                        return (
                                            <TableRow key={debt.id}>
                                                <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                <TableCell>{debt.description}</TableCell>
                                                <TableCell>
                                                    <Badge variant={isOverdue ? "destructive" : "warning"}>
                                                        {isOverdue ? 'Vencida' : 'Pendiente'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">${debt.amountUSD.toFixed(2)}</TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Últimos Pagos Aprobados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Monto (Bs.)</TableHead>
                                    <TableHead>Recibo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingData ? (
                                     <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin"/>
                                        </TableCell>
                                    </TableRow>
                                ) : approvedPayments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No tienes pagos aprobados recientemente.</TableCell>
                                    </TableRow>
                                ) : (
                                    approvedPayments.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell>{format(p.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>{formatToTwoDecimals(p.totalAmount)}</TableCell>
                                            <TableCell>
                                                <Button variant="outline" size="sm" onClick={() => openReceiptPreview(p)}>
                                                    <Receipt className="mr-2 h-4 w-4"/>
                                                    Ver Recibo
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                 </Card>
                {recentPayments.length > 0 && (
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertCircle className="text-destructive"/>
                                Pagos con Observaciones
                            </CardTitle>
                            <CardDescription>
                                Tus reportes de pago más recientes que requieren atención o están pendientes por aprobar.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha del Reporte</TableHead>
                                        <TableHead>Referencia</TableHead>
                                        <TableHead>Monto (Bs.)</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentPayments.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell>{format(p.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>{p.reference}</TableCell>
                                            <TableCell>{formatToTwoDecimals(p.totalAmount)}</TableCell>
                                            <TableCell>
                                                <Badge variant={p.status === 'rechazado' ? 'destructive' : 'warning'} className="capitalize">{p.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>
             <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
         <DialogContent className="sm:max-w-3xl">
             <DialogHeader>
                 <DialogTitle>Vista Previa del Recibo: {receiptData?.receiptNumber}</DialogTitle>
                 <DialogDescription>
                     Recibo de pago para {receiptData?.ownerName} ({receiptData?.ownerUnit}).
                 </DialogDescription>
             </DialogHeader>
             {receiptData && (
                 <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
                     <div className="grid grid-cols-2 gap-4 text-sm">
                         <div><span className="font-semibold">Fecha de Pago:</span> {format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</div>
                         <div><span className="font-semibold">Monto Pagado:</span> Bs. {formatToTwoDecimals(receiptData.beneficiary.amount)}</div>
                         <div><span className="font-semibold">Tasa Aplicada:</span> Bs. {formatToTwoDecimals(receiptData.payment.exchangeRate)}</div>
                         <div><span className="font-semibold">Referencia:</span> {receiptData.payment.reference}</div>
                     </div>
                     <h4 className="font-semibold">Conceptos Pagados</h4>
                     <Table>
                         <TableHeader>
                             <TableRow>
                                 <TableHead>Período</TableHead>
                                 <TableHead>Concepto</TableHead>
                                 <TableHead className="text-right">Monto (Bs)</TableHead>
                             </TableRow>
                         </TableHeader>
                         <TableBody>
                             {receiptData.paidDebts.length > 0 ? (
                                     receiptData.paidDebts.map(debt => (
                                         <TableRow key={debt.id}>
                                             <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                             <TableCell>{debt.description}</TableCell>
                                             <TableCell className="text-right">Bs. {formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                         </TableRow>
                                     ))
                             ) : (
                                     <TableRow>
                                         <TableCell colSpan={3}>Abono a Saldo a Favor</TableCell>
                                     </TableRow>
                             )}
                         </TableBody>
                     </Table>
                       <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
                         <div className="text-right text-muted-foreground">Saldo Anterior:</div>
                         <div className="text-right">Bs. {formatToTwoDecimals(receiptData.previousBalance)}</div>
                         <div className="text-right text-muted-foreground">Saldo Actual:</div>
                         <div className="text-right font-bold">Bs. {formatToTwoDecimals(receiptData.currentBalance)}</div>
                       </div>
                 </div>
             )}
             <DialogFooter className="sm:justify-end gap-2">
                 <Button variant="outline" onClick={() => generateAndAct('download', receiptData!)}>
                     <Download className="mr-2 h-4 w-4" /> Exportar PDF
                 </Button>
                 <Button onClick={() => generateAndAct('share', receiptData!)}>
                       <Share2 className="mr-2 h-4 w-4" /> Compartir PDF
                 </Button>
             </DialogFooter>
         </DialogContent>
     </Dialog>

        </div>
    );
}

    
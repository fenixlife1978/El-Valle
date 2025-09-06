
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Megaphone, Loader2, Wallet, FileText, CalendarClock, Scale, Calculator, Minus, Equal, ShieldCheck, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCommunityUpdates } from '@/ai/flows/community-updates';
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


type Payment = {
    id: string;
    date: string;
    amount: number;
    bank: string;
    type: string;
    ref: string;
    status: 'aprobado' | 'pendiente' | 'rechazado';
    reportedAt: any;
    exchangeRate: number;
    paymentDate: Timestamp;
    reference: string;
    beneficiaries: { ownerId: string, ownerName: string, house?: string, street?: string, amount: number }[];
};

type UserData = {
    id: string;
    unit: string;
    name: string;
    balance: number;
    properties: { street: string, house: string }[];
};

type Debt = {
    id: string;
    ownerId: string;
    property: { street: string; house: string; };
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number;
    paymentDate?: Timestamp;
    paymentId?: string;
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
    ownerName: string;
    ownerUnit: string;
    paidDebts: Debt[];
} | null;


type SolvencyStatus = 'solvente' | 'moroso' | 'cargando...';

const statusVariantMap: { [key in SolvencyStatus]: 'success' | 'destructive' | 'outline' } = {
  'solvente': 'success',
  'moroso': 'destructive',
  'cargando...': 'outline',
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

export default function OwnerDashboardPage() {
    const [user, authLoading] = useAuthState(auth);
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [dashboardStats, setDashboardStats] = useState({
        balanceInFavor: 0,
        totalDebtUSD: 0,
        exchangeRate: 0,
    });
    const [solvencyStatus, setSolvencyStatus] = useState<SolvencyStatus>('cargando...');
    const [solvencyPeriod, setSolvencyPeriod] = useState('');
    const [communityUpdates, setCommunityUpdates] = useState<string[]>([]);
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
    const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
    
    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push('/login?role=owner');
            return;
        }

        const userId = user.uid;
        let userUnsubscribe: () => void;
        let paymentsUnsubscribe: () => void;
        
        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            let activeRate = 0;
            let fetchedCompanyInfo: CompanyInfo | null = null;

            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                fetchedCompanyInfo = settings.companyInfo || null;
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) {
                    activeRate = activeRateObj.rate;
                } else if (rates.length > 0) {
                    const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    activeRate = sortedRates[0].rate;
                }
            } else {
                console.error("Settings document not found!");
            }
            setCompanyInfo(fetchedCompanyInfo);
            
            if (userUnsubscribe) userUnsubscribe();

            const userDocRef = doc(db, "owners", userId);
            userUnsubscribe = onSnapshot(userDocRef, async (userSnap) => {
                setLoading(true);
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    const ownerData = { 
                        id: userSnap.id, 
                        name: data.name,
                        properties: data.properties || [],
                        unit: (data.properties && data.properties.length > 0) ? `${data.properties[0].street} - ${data.properties[0].house}` : 'N/A',
                        balance: data.balance || 0,
                    } as UserData;
                    setUserData(ownerData);

                    // Re-subscribe to payments whenever user data changes
                    if (paymentsUnsubscribe) paymentsUnsubscribe();
                    
                    const paymentsQuery = query(
                        collection(db, "payments"), 
                        where("beneficiaries", "array-contains-any", ownerData.properties.map(p => ({
                            ownerId: ownerData.id,
                            ownerName: ownerData.name,
                            street: p.street,
                            house: p.house
                        }))),
                        where('status', '==', 'aprobado'),
                        orderBy('paymentDate', 'desc'),
                        limit(3)
                    );
                    
                    paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
                         const paymentsData: Payment[] = [];
                        snapshot.forEach((doc) => {
                            const data = doc.data();
                            paymentsData.push({
                                id: doc.id,
                                date: new Date(data.paymentDate.seconds * 1000).toISOString(),
                                amount: data.totalAmount,
                                bank: data.bank,
                                type: data.paymentMethod,
                                ref: data.reference,
                                status: data.status,
                                reportedAt: data.reportedAt,
                                exchangeRate: data.exchangeRate,
                                paymentDate: data.paymentDate,
                                reference: data.reference,
                                beneficiaries: data.beneficiaries,
                            });
                        });
                        setPayments(paymentsData);
                    });


                    const pendingDebtsQuery = query(collection(db, "debts"), where("ownerId", "==", userId), where("status", "==", "pending"));
                    const pendingDebtsSnapshot = await getDocs(pendingDebtsQuery);
                    
                    const pendingDebtsData: Debt[] = [];
                    let totalDebtUSD = 0;
                    pendingDebtsSnapshot.forEach((doc) => {
                        const debt = { id: doc.id, ...doc.data() } as Debt
                        pendingDebtsData.push(debt);
                        totalDebtUSD += debt.amountUSD;
                    });
                    
                    const sortedPendingDebts = pendingDebtsData.sort((a,b) => b.year - a.year || b.month - a.month);
                    setDebts(sortedPendingDebts);
                    
                    if (totalDebtUSD > 0) {
                        setSolvencyStatus('moroso');
                        const oldestDebt = sortedPendingDebts[sortedPendingDebts.length - 1];
                        if (oldestDebt) {
                            const monthLabel = monthsLocale[oldestDebt.month] || '';
                            setSolvencyPeriod(`Desde ${monthLabel} ${oldestDebt.year}`);
                        }
                    } else {
                        setSolvencyStatus('solvente');
                        const allDebtsQuery = query(collection(db, "debts"), where("ownerId", "==", userId), where("status", "==", "paid"), orderBy("year", "desc"), orderBy("month", "desc"), limit(1));
                        const lastPaidDebtSnapshot = await getDocs(allDebtsQuery);

                        if (!lastPaidDebtSnapshot.empty) {
                            const lastPaidDebt = lastPaidDebtSnapshot.docs[0].data();
                            const monthLabel = monthsLocale[lastPaidDebt.month] || '';
                            setSolvencyPeriod(`Hasta ${monthLabel} ${lastPaidDebt.year}`);
                        } else {
                            const now = new Date();
                            const monthLabel = monthsLocale[now.getMonth() + 1] || '';
                            setSolvencyPeriod(`Hasta ${monthLabel} ${now.getFullYear()}`);
                        }
                    }
                    
                    setDashboardStats({
                        balanceInFavor: ownerData.balance || 0,
                        totalDebtUSD: totalDebtUSD,
                        exchangeRate: activeRate,
                    });
                } else {
                    console.log("No such user document!");
                }
                setLoading(false);
            });
        });
        
        return () => {
            settingsUnsubscribe();
            if (userUnsubscribe) userUnsubscribe();
            if (paymentsUnsubscribe) paymentsUnsubscribe();
        };

    }, [user, authLoading, router]);
    
    const handleDebtSelection = (debtId: string) => {
        setSelectedDebts(prev => 
            prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]
        );
    };

    const paymentCalculator = useMemo(() => {
        const totalSelectedDebtUSD = debts
            .filter(debt => selectedDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
            
        const totalSelectedDebtBs = totalSelectedDebtUSD * dashboardStats.exchangeRate;
        const totalToPay = Math.max(0, totalSelectedDebtBs - dashboardStats.balanceInFavor);

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: dashboardStats.balanceInFavor,
            totalToPay: totalToPay,
            hasSelection: selectedDebts.length > 0,
        };
    }, [selectedDebts, debts, dashboardStats]);

  const showReceiptPreview = async (payment: Payment) => {
    if (!userData) return;

    try {
        const ownerName = (payment.beneficiaries && payment.beneficiaries.length > 0 && payment.beneficiaries[0].ownerName) 
            ? payment.beneficiaries[0].ownerName 
            : userData.name;

        const paidDebtsQuery = query(
            collection(db, "debts"),
            where("paymentId", "==", payment.id)
        );
        const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
        const paidDebts = paidDebtsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Debt);
        
        setReceiptData({ 
            payment, 
            ownerName: ownerName,
            ownerUnit: userData.unit,
            paidDebts 
        });
        setIsReceiptPreviewOpen(true);
    } catch (error) {
        console.error("Error generating receipt preview: ", error);
    }
  }

   const handleDownloadPdf = () => {
    if (!receiptData || !companyInfo) return;
    const { payment, ownerName, ownerUnit, paidDebts } = receiptData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // --- Header ---
    if (companyInfo.logo) {
        doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
    }
    doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
    doc.setFontSize(9).setFont('helvetica', 'normal');
    doc.text(companyInfo.rif, margin + 30, margin + 14);
    doc.text(companyInfo.address, margin + 30, margin + 19);
    doc.text(`Teléfono: ${companyInfo.phone}`, margin + 30, margin + 24);
    
    doc.setFontSize(10).text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin + 8, { align: 'right' });
    
    doc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);

    // --- Title ---
    doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
    doc.setFontSize(10).setFont('helvetica', 'normal').text(`N° de recibo: ${payment.id.substring(0, 10)}`, pageWidth - margin, margin + 50, { align: 'right' });

    // --- Payment Details ---
    let startY = margin + 60;
    doc.setFontSize(10).text(`Nombre del Beneficiario: ${ownerName}`, margin, startY);
    startY += 6;
    doc.text(`Unidad: ${ownerUnit}`, margin, startY);
    startY += 6;
    doc.text(`Método de pago: ${payment.type}`, margin, startY);
    startY += 6;
    doc.text(`Banco Emisor: ${payment.bank}`, margin, startY);
    startY += 6;
    doc.text(`N° de Referencia Bancaria: ${payment.reference}`, margin, startY);
    startY += 6;
    doc.text(`Fecha del pago: ${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}`, margin, startY);
    startY += 6;
    doc.text(`Tasa de Cambio Aplicada: Bs. ${payment.exchangeRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })} por USD`, margin, startY);
    startY += 10;
    
    const tableBody = paidDebts.map(debt => {
        const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
        const propertyLabel = debt.property ? `${debt.property.street} - ${debt.property.house}` : 'N/A';
        const periodLabel = `${monthsLocale[debt.month]} ${debt.year}`;
        const concept = `${debt.description} (${propertyLabel})`;
        
        return [
            periodLabel,
            concept,
            `$${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}`,
            `Bs. ${debtAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
        ];
    });

    if (paidDebts.length > 0) {
        (doc as any).autoTable({
            startY: startY,
            head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            didDrawPage: (data: any) => { startY = data.cursor.y; }
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
    } else {
        (doc as any).autoTable({
            startY: startY,
            head: [['Concepto', 'Monto Pagado (Bs)']],
            body: [['Abono a Saldo a Favor', `Bs. ${payment.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`]],
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            didDrawPage: (data: any) => { startY = data.cursor.y; }
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
    }
    
    // Totals Section
    const totalLabel = "TOTAL PAGADO:";
    const totalValue = `Bs. ${payment.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
    doc.setFontSize(11).setFont('helvetica', 'bold');
    const totalValueWidth = doc.getStringUnitWidth(totalValue) * 11 / doc.internal.scaleFactor;
    doc.text(totalValue, pageWidth - margin, startY, { align: 'right' });
    doc.text(totalLabel, pageWidth - margin - totalValueWidth - 2, startY, { align: 'right' });

    startY += 10;

    // --- Footer ---
    doc.setFontSize(9).text('Este recibo confirma que su pago ha sido validado conforme a los términos establecidos por la comunidad.', margin, startY);
    startY += 8;
    doc.setFont('helvetica', 'bold').text(`Firma electrónica: '${companyInfo.name} - Condominio'`, margin, startY);
    startY += 10;
    doc.setLineWidth(0.2).line(margin, startY, pageWidth - margin, startY);
    startY += 5;
    doc.setFontSize(8).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});

    doc.save(`Recibo_de_Pago_${payment.id.substring(0,7)}.pdf`);
    setIsReceiptPreviewOpen(false);
  };

  if (loading || authLoading) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  if (!userData) {
    return (
        <div className="flex flex-col justify-center items-center h-full gap-4">
            <p className="text-lg">No se encontró información del propietario.</p>
        </div>
    )
  }

  return (
    <div className="space-y-8">
        <div>
            <h1 className="text-3xl font-bold font-headline">Panel de Propietario</h1>
            <p className="text-muted-foreground">Bienvenido, {userData?.name || 'Propietario'}. Aquí está el resumen de tu cuenta.</p>
        </div>
      
      <Card className="w-full rounded-2xl shadow-lg border-2 border-border/20">
            <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between p-6 gap-4">
                <div className="flex-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Estado de Cuenta</CardTitle>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                             <p className="text-xs text-destructive">Deuda Total Pendiente</p>
                             <p className="text-2xl font-bold text-destructive">${dashboardStats.totalDebtUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                             <p className="text-sm text-muted-foreground">~ Bs. {(dashboardStats.totalDebtUSD * dashboardStats.exchangeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</p>
                        </div>
                        <div>
                            <p className="text-xs text-success">Saldo a Favor</p>
                            <p className="text-2xl font-bold text-success">Bs. {dashboardStats.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</p>
                            <p className="text-sm text-muted-foreground">~ ${dashboardStats.exchangeRate > 0 ? (dashboardStats.balanceInFavor / dashboardStats.exchangeRate).toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}</p>
                        </div>
                    </div>
                </div>
                 <div className="flex flex-col items-start md:items-end flex-shrink-0">
                    <Badge variant={statusVariantMap[solvencyStatus]} className="text-base capitalize mb-2">
                        {solvencyStatus === 'moroso' ? <AlertCircle className="mr-2 h-4 w-4"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                        {solvencyStatus}
                    </Badge>
                     {solvencyPeriod && <p className="text-sm font-semibold text-muted-foreground">{solvencyPeriod}</p>}
                 </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
                 <div className="text-xs text-muted-foreground">
                    Tasa de cambio del día: Bs. {dashboardStats.exchangeRate.toLocaleString('es-VE', {minimumFractionDigits: 2})} por USD
                 </div>
            </CardContent>
        </Card>

       <div className="grid gap-8 lg:grid-cols-1">
          <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Desglose de Deudas Pendientes</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[50px] text-center">Pagar</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : debts.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">¡Felicidades! No tienes deudas pendientes.</TableCell></TableRow>
                    ) : (
                    debts.map((debt) => (
                    <TableRow key={debt.id} data-state={selectedDebts.includes(debt.id) ? 'selected' : ''}>
                        <TableCell className="text-center">
                            <Checkbox 
                                onCheckedChange={() => handleDebtSelection(debt.id)}
                                checked={selectedDebts.includes(debt.id)}
                                aria-label={`Seleccionar deuda de ${monthsLocale[debt.month]} ${debt.year}`}
                            />
                        </TableCell>
                        <TableCell className="font-medium">{monthsLocale[debt.month]} {debt.year}</TableCell>
                        <TableCell>{debt.description}</TableCell>
                        <TableCell className="text-right">Bs. {(debt.amountUSD * dashboardStats.exchangeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                    </TableRow>
                    )))}
                </TableBody>
                </Table>
                 {paymentCalculator.hasSelection && (
                    <CardFooter className="p-4 bg-muted/50 border-t">
                        <div className="w-full max-w-md ml-auto space-y-2">
                             <h3 className="text-lg font-semibold flex items-center"><Calculator className="mr-2 h-5 w-5"/> Calculadora de Pago</h3>
                             <div className="flex justify-between items-center">
                                 <span className="text-muted-foreground">Total Seleccionado:</span>
                                 <span className="font-medium">Bs. {paymentCalculator.totalSelectedBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                             </div>
                             <div className="flex justify-between items-center text-sm">
                                 <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                 <span className="font-medium">Bs. {paymentCalculator.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                             </div>
                             <hr className="my-1"/>
                             <div className="flex justify-between items-center text-lg">
                                 <span className="font-bold flex items-center"><Equal className="mr-2 h-4 w-4"/> TOTAL A PAGAR:</span>
                                 <span className="font-bold text-primary">Bs. {paymentCalculator.totalToPay.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                             </div>
                        </div>
                    </CardFooter>
                )}
            </Card>
           
        </div>

        <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Mis Últimos Pagos Aprobados</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : payments.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No tienes pagos aprobados recientemente.</TableCell></TableRow>
                    ) : (
                    payments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                        <TableCell>
                            {payment.type === 'adelanto' 
                                ? `$ ${payment.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}`
                                : `Bs. ${payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}`
                            }
                        </TableCell>
                        <TableCell>{payment.bank}</TableCell>
                        <TableCell>{payment.ref}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === 'aprobado' ? 'success' : payment.status === 'rechazado' ? 'destructive' : 'warning'}>
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Badge>
                        </TableCell>
                         <TableCell className="text-right">
                            {payment.status === 'aprobado' ? (
                                <Button variant="ghost" size="icon" onClick={() => showReceiptPreview(payment)}>
                                    <FileText className="h-4 w-4"/>
                                    <span className="sr-only">Ver Recibo</span>
                                </Button>
                            ) : (
                                <Button variant="ghost" size="icon" disabled>
                                    <FileText className="h-4 w-4 text-muted-foreground/50"/>
                                    <span className="sr-only">Ver Recibo (No disponible)</span>
                                </Button>
                            )}
                        </TableCell>
                    </TableRow>
                    )))}
                </TableBody>
                </Table>
            </Card>
        </div>
      </div>
      
       {/* Receipt Preview Dialog */}
        <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo</DialogTitle>
                    <DialogDescription>
                        Revise el recibo antes de descargarlo. El diseño se ajustará en el PDF final.
                    </DialogDescription>
                </DialogHeader>
                {receiptData && companyInfo && (
                     <div className="flex-grow overflow-y-auto pr-4 -mr-4 border rounded-md p-4 bg-white text-black font-sans text-xs space-y-4">
                        {/* Header */}
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                {companyInfo.logo && <img src={companyInfo.logo} alt="Logo" className="w-20 h-20 object-contain"/>}
                                <div>
                                    <p className="font-bold">{companyInfo.name}</p>
                                    <p>{companyInfo.rif}</p>
                                    <p>{companyInfo.address}</p>
                                    <p>Teléfono: {companyInfo.phone}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-lg">RECIBO DE PAGO</p>
                                <p><strong>Fecha Emisión:</strong> {format(new Date(), 'dd/MM/yyyy')}</p>
                                <p><strong>N° Recibo:</strong> {receiptData.payment.id.substring(0, 10)}</p>
                            </div>
                        </div>
                        <hr className="my-2 border-gray-400"/>
                        {/* Details */}
                         <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                             <p><strong>Beneficiario:</strong></p><p>{receiptData.ownerName}</p>
                             <p><strong>Unidad:</strong></p><p>{receiptData.ownerUnit}</p>
                             <p><strong>Método de pago:</strong></p><p>{receiptData.payment.type}</p>
                             <p><strong>Banco Emisor:</strong></p><p>{receiptData.payment.bank}</p>
                             <p><strong>N° de Referencia:</strong></p><p>{receiptData.payment.reference}</p>
                             <p><strong>Fecha del pago:</strong></p><p>{format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                             <p><strong>Tasa de Cambio Aplicada:</strong></p><p>Bs. {receiptData.payment.exchangeRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })} por USD</p>
                        </div>
                        {/* Concept Table */}
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="bg-gray-700 text-white hover:bg-gray-800">
                                    <TableHead className="text-white">Período</TableHead>
                                    <TableHead className="text-white">Concepto (Propiedad)</TableHead>
                                    <TableHead className="text-white text-right">Monto ($)</TableHead>
                                    <TableHead className="text-white text-right">Monto Pagado (Bs)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receiptData.paidDebts.length > 0 ? receiptData.paidDebts.map((debt, index) => (
                                    <TableRow key={index} className="even:bg-gray-100">
                                        <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                        <TableCell>{debt.description} ({debt.property.street} - {debt.property.house})</TableCell>
                                        <TableCell className="text-right">${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">Bs. {((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                )) : (
                                     <TableRow>
                                        <TableCell colSpan={2}>Abono a Saldo a Favor</TableCell>
                                        <TableCell colSpan={2} className="text-right">Bs. {receiptData.payment.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                         <div className="text-right font-bold mt-2 pr-4">
                            Total Pagado: Bs. {receiptData.payment.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                         </div>
                        {/* Footer */}
                        <div className="mt-6 text-center text-gray-600 text-[10px]">
                             <p className="text-left">Este recibo confirma que su pago ha sido validado conforme a los términos establecidos por la comunidad.</p>
                             <p className="text-left font-bold mt-2">Firma electrónica: '{companyInfo.name} - Condominio'</p>
                             <hr className="my-4 border-gray-400"/>
                             <p className="italic text-xs">Este recibo se generó de manera automática y es válido sin firma manuscrita.</p>
                        </div>
                    </div>
                )}
                <DialogFooter className="mt-auto pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsReceiptPreviewOpen(false)}>Cerrar</Button>
                    <Button onClick={handleDownloadPdf}>
                        <Printer className="mr-2 h-4 w-4"/> Descargar PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}

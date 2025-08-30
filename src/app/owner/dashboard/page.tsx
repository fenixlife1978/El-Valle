
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Megaphone, Loader2, Wallet, FileText, CalendarClock, Scale, Calculator, Minus, Equal, ShieldCheck, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCommunityUpdates } from '@/ai/flows/community-updates';
import { db } from '@/lib/firebase';
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
};

type UserData = {
    id: string;
    unit: string;
    name: string;
    balance: number;
};

type Debt = {
    id: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
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
} | null;


type SolvencyStatus = 'solvente' | 'moroso' | 'cargando...';

const statusVariantMap: { [key in SolvencyStatus]: 'success' | 'destructive' | 'outline' } = {
  'solvente': 'success',
  'moroso': 'destructive',
  'cargando...': 'outline',
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, 'label': 'Octubre' }, { value: 11, 'label': 'Noviembre' }, { value: 12, 'label': 'Diciembre' }
];

export default function OwnerDashboardPage() {
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
    const [receiptData, setReceiptData] = useState<ReceiptData>(null);
    const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
    
    useEffect(() => {
        // This is a placeholder for a user ID since auth is removed.
        // In a real app with auth, you would get this from the logged-in user.
        // We'll arbitrarily pick the first owner from the DB for demonstration.
        const listenToFirstOwnerData = async () => {
            const ownersQuery = query(collection(db, "owners"), limit(1));
            const ownersSnapshot = await getDocs(ownersQuery);
            if (ownersSnapshot.empty) {
                console.log("No owners found in the database.");
                setLoading(false);
                return () => {}; // No-op cleanup
            }
            const firstOwnerDoc = ownersSnapshot.docs[0];
            const userId = firstOwnerDoc.id;

            let userUnsubscribe: () => void;
            
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
                            unit: (data.properties && data.properties.length > 0) ? `${data.properties[0].street} - ${data.properties[0].house}` : 'N/A',
                            balance: data.balance || 0,
                        } as UserData;
                        setUserData(ownerData);

                        const pendingDebtsQuery = query(collection(db, "debts"), where("ownerId", "==", userId), where("status", "==", "pending"));
                        const pendingDebtsSnapshot = await getDocs(pendingDebtsQuery);
                        
                        const pendingDebtsData: Debt[] = [];
                        let totalDebtUSD = 0;
                        pendingDebtsSnapshot.forEach((doc) => {
                            const debt = { id: doc.id, ...doc.data() } as Debt
                            pendingDebtsData.push(debt);
                            totalDebtUSD += debt.amountUSD;
                        });
                        
                        const sortedPendingDebts = pendingDebtsData.sort((a,b) => a.year - b.year || a.month - a.month);
                        setDebts(sortedPendingDebts);
                        
                        if (totalDebtUSD > 0) {
                            setSolvencyStatus('moroso');
                            const oldestDebt = sortedPendingDebts[0];
                            if (oldestDebt) {
                                const monthLabel = months.find(m => m.value === oldestDebt.month)?.label || '';
                                setSolvencyPeriod(`Desde ${monthLabel} ${oldestDebt.year}`);
                            }
                        } else {
                            setSolvencyStatus('solvente');
                            const allDebtsQuery = query(collection(db, "debts"), where("ownerId", "==", userId), where("status", "==", "paid"), orderBy("year", "desc"), orderBy("month", "desc"), limit(1));
                            const lastPaidDebtSnapshot = await getDocs(allDebtsQuery);

                            if (!lastPaidDebtSnapshot.empty) {
                                const lastPaidDebt = lastPaidDebtSnapshot.docs[0].data();
                                const monthLabel = months.find(m => m.value === lastPaidDebt.month)?.label || '';
                                setSolvencyPeriod(`Hasta ${monthLabel} ${lastPaidDebt.year}`);
                            } else {
                                const now = new Date();
                                const monthLabel = months.find(m => m.value === now.getMonth())?.label || '';
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

            const paymentsQuery = query(
                collection(db, "payments"),
                where("reportedBy", "==", userId)
            );
            const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
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
                    });
                });
                const sortedPayments = paymentsData.sort((a,b) => {
                    const dateA = a.reportedAt?.toMillis() || 0;
                    const dateB = b.reportedAt?.toMillis() || 0;
                    return dateB - dateA;
                });
                setPayments(sortedPayments.slice(0, 5));
            });
            
            return () => {
                settingsUnsubscribe();
                if (userUnsubscribe) userUnsubscribe();
                paymentsUnsubscribe();
            };
        }

        const cleanupPromise = listenToFirstOwnerData();
        return () => {
            cleanupPromise.then(cleanup => cleanup());
        };

    }, []);
    
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

  const showReceiptPreview = (payment: Payment) => {
    if (!userData) return;
    setReceiptData({ 
        payment, 
        ownerName: userData.name, 
        ownerUnit: userData.unit 
    });
    setIsReceiptPreviewOpen(true);
  }

   const handleDownloadPdf = () => {
    if (!receiptData) return;
    const { payment, ownerName, ownerUnit } = receiptData;
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    if (companyInfo?.logo) {
        try {
            doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        } catch(e) {
            console.error("Error adding logo to PDF", e);
        }
    }
    
    if (companyInfo) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(companyInfo.name, margin + 30, margin + 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
        doc.text(companyInfo.address, margin + 30, margin + 19);
        doc.text(companyInfo.email, margin + 30, margin + 24);
    }
    
    doc.setFontSize(10);
    doc.text(`Fecha de Emisión:`, pageWidth - margin, margin + 8, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(new Date().toLocaleDateString('es-VE'), pageWidth - margin, margin + 13, { align: 'right' });
    
    doc.setLineWidth(0.5);
    doc.line(margin, margin + 32, pageWidth - margin, margin + 32);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Recibo de Pago de Condominio', pageWidth / 2, margin + 45, { align: 'center' });

    (doc as any).autoTable({
        startY: margin + 55,
        head: [['Concepto', 'Detalle']],
        body: [
            ['ID de Transacción', payment.id],
            ['Propietario', ownerName],
            ['Unidad', ownerUnit],
            ['Fecha de Pago', new Date(payment.date).toLocaleDateString('es-VE')],
            ['Monto Pagado', `Bs. ${payment.amount.toFixed(2)}`],
            ['Banco Emisor', payment.bank],
            ['Tipo de Pago', payment.type],
            ['Referencia', payment.ref],
            ['Estado del Pago', payment.status.charAt(0).toUpperCase() + payment.status.slice(1)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [30, 80, 180] },
    });

    doc.save(`recibo-${ownerUnit.replace(/\s/g, '_')}-${payment.id.substring(0,5)}.pdf`);
    setIsReceiptPreviewOpen(false);
  };

  if (loading) {
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
                                aria-label={`Seleccionar deuda de ${months.find(m => m.value === debt.month)?.label} ${debt.year}`}
                            />
                        </TableCell>
                        <TableCell className="font-medium">{months.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
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
            <h2 className="text-2xl font-bold mb-4 font-headline">Mis Últimos Pagos</h2>
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
                        <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No tienes pagos registrados.</TableCell></TableRow>
                    ) : (
                    payments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                        <TableCell>Bs. {payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
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
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo</DialogTitle>
                    <DialogDescription>
                        Revise el recibo antes de descargarlo.
                    </DialogDescription>
                </DialogHeader>
                {receiptData && (
                     <div className="border rounded-lg p-6 my-4 bg-white text-black font-sans">
                        <header className="flex justify-between items-start pb-4 border-b">
                            <div className="flex items-center gap-4">
                                {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="w-20 h-20 object-contain"/>}
                                <div>
                                    <h3 className="font-bold text-lg">{companyInfo?.name}</h3>
                                    <p className="text-xs">{companyInfo?.rif}</p>
                                    <p className="text-xs">{companyInfo?.address}</p>
                                    <p className="text-xs">{companyInfo?.phone} | {companyInfo?.email}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <h4 className="font-bold text-xl">RECIBO DE PAGO</h4>
                                <p className="text-sm">ID: {receiptData.payment.id}</p>
                                <p className="text-sm">Fecha: {new Date().toLocaleDateString('es-VE')}</p>
                            </div>
                        </header>
                        <section className="mt-6">
                            <h5 className="font-bold mb-2">Detalles del Propietario</h5>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                <p><span className="font-semibold">Nombre:</span> {receiptData.ownerName}</p>
                                <p><span className="font-semibold">Unidad:</span> {receiptData.ownerUnit}</p>
                            </div>
                        </section>
                         <section className="mt-6">
                            <h5 className="font-bold mb-2">Detalles del Pago</h5>
                            <Table className="text-sm">
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="text-black">Concepto</TableHead>
                                        <TableHead className="text-right text-black">Monto</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>
                                            <p>Pago de Condominio</p>
                                            <p className="text-xs text-muted-foreground">
                                                Ref: {receiptData.payment.ref} | {receiptData.payment.bank} | {new Date(receiptData.payment.date).toLocaleDateString('es-VE')}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">Bs. {receiptData.payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                            <div className="flex justify-end mt-4">
                                <div className="w-64">
                                    <div className="flex justify-between text-lg font-bold border-t-2 pt-2">
                                        <span>TOTAL PAGADO:</span>
                                        <span>Bs. {receiptData.payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                    </div>
                                </div>
                            </div>
                        </section>
                        <footer className="mt-8 text-center text-xs text-muted-foreground">
                            <p>Este es un recibo generado por el sistema. Válido sin firma ni sello.</p>
                            <p>Gracias por su pago.</p>
                        </footer>
                    </div>
                )}
                <DialogFooter>
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

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    Timestamp, 
    deleteDoc, 
    doc, 
    updateDoc, 
    getDocs, 
    where, 
    getDoc 
} from 'firebase/firestore';
import { 
    Card, 
    CardHeader, 
    CardTitle, 
    CardContent 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
    Loader2, 
    TrendingUp, 
    TrendingDown, 
    DollarSign, 
    Calendar, 
    FileText, 
    Info, 
    Trash2, 
    Filter, 
    X,
    Eye,
    Share2,
    Download
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { downloadPDF, sharePDF } from '@/lib/print-pdf';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from '@/components/ui/dialog';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';

interface ExtraordinaryTransaction {
    id: string;
    tipo: 'ingreso' | 'egreso';
    monto: number;
    exchangeRate: number;
    descripcion: string;
    referencia?: string;
    fecha: Timestamp;
    categoria: 'extraordinaria';
    sourcePaymentId?: string;
    ownerId?: string;
    campaignId?: string;
    campaignName?: string;
    isLiquidation?: boolean;
    previousPendingUSD?: number;
    createdAt: Timestamp;
}

interface ExtraordinaryCampaign {
    id: string;
    description: string;
    amountUSD: number;
    status: 'active' | 'closed';
    createdAt: Timestamp;
}

interface CampaignBalance {
    ingresos: number;
    egresos: number;
    saldo: number;
    transacciones: ExtraordinaryTransaction[];
}

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function ExtraordinaryFundPage() {
    const params = useParams();
    const condoId = params?.condoId as string;
    const { toast } = useToast();
    const { user, companyInfo } = useAuth();
    
    const [transactions, setTransactions] = useState<ExtraordinaryTransaction[]>([]);
    const [campaigns, setCampaigns] = useState<ExtraordinaryCampaign[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [balance, setBalance] = useState(0);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<ExtraordinaryTransaction | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [exchangeRate, setExchangeRate] = useState(0);
    const [condominioData, setCondominioData] = useState<any>(null);
    
    // Diálogo para ver libro diario individual de campaña
    const [campaignDetailDialogOpen, setCampaignDetailDialogOpen] = useState(false);
    const [selectedCampaignForDetail, setSelectedCampaignForDetail] = useState<ExtraordinaryCampaign | null>(null);

    // Cargar datos del condominio
    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;
        const loadCondominioData = async () => {
            try {
                const docRef = doc(db, 'condominios', condoId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setCondominioData(docSnap.data());
                }
            } catch (error) {
                console.error("Error cargando datos del condominio:", error);
            }
        };
        loadCondominioData();
    }, [condoId]);

    // Cargar tasa de cambio
    useEffect(() => {
        const loadExchangeRate = async () => {
            if (!condoId || condoId === "[condoId]") return;
            try {
                const configRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    const rate = data.exchangeRate || data.rate || 0;
                    setExchangeRate(rate);
                }
            } catch (e) {
                console.warn("No se pudo obtener tasa de cambio:", e);
            }
        };
        loadExchangeRate();
    }, [condoId]);

    // Cargar campañas
    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;
        
        const campaignsQuery = query(
            collection(db, 'condominios', condoId, 'extraordinary_campaigns'),
            orderBy('createdAt', 'desc')
        );
        const unsubCampaigns = onSnapshot(campaignsQuery, (snap) => {
            const campaignsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtraordinaryCampaign));
            setCampaigns(campaignsData);
        });
        
        return () => unsubCampaigns();
    }, [condoId]);

    // Cargar TODAS las transacciones una sola vez
    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;

        const q = query(
            collection(db, 'condominios', condoId, 'extraordinary_funds'),
            orderBy('fecha', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtraordinaryTransaction));
            setTransactions(data);
            setLoading(false);
        }, (error) => {
            console.error("Error cargando fondo extraordinario:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [condoId]);

    // Calcular balances por campaña
    const getCampaignBalances = (): Record<string, CampaignBalance> => {
        const balances: Record<string, CampaignBalance> = {};
        
        campaigns.forEach(campaign => {
            balances[campaign.id] = {
                ingresos: 0,
                egresos: 0,
                saldo: 0,
                transacciones: []
            };
        });
        
        transactions.forEach(tx => {
            if (tx.campaignId && balances[tx.campaignId]) {
                balances[tx.campaignId].transacciones.push(tx);
                
                if (tx.tipo === 'ingreso') {
                    balances[tx.campaignId].ingresos += tx.monto;
                    balances[tx.campaignId].saldo += tx.monto;
                } else {
                    balances[tx.campaignId].egresos += tx.monto;
                    balances[tx.campaignId].saldo -= tx.monto;
                }
            }
        });
        
        return balances;
    };

    const campaignBalances = getCampaignBalances();

    // Calcular balance consolidado
    useEffect(() => {
        const totalBalance = transactions.reduce((acc, tx) => {
            return acc + (tx.tipo === 'ingreso' ? tx.monto : -tx.monto);
        }, 0);
        setBalance(totalBalance);
    }, [transactions]);

    // Filtrar transacciones
    const filteredTransactions = selectedCampaignId === 'all' 
        ? transactions 
        : transactions.filter(tx => tx.campaignId === selectedCampaignId);

    const getTransactionsWithRunningBalance = () => {
        let runningBalance = 0;
        return filteredTransactions.map(tx => {
            if (tx.tipo === 'ingreso') {
                runningBalance += tx.monto;
            } else {
                runningBalance -= tx.monto;
            }
            return { ...tx, runningBalance };
        });
    };

    const handleDeleteTransaction = async () => {
        if (!selectedTransaction || !condoId) return;
        
        setIsDeleting(true);
        try {
            let debtUpdated = false;
            
            if (selectedTransaction.sourcePaymentId) {
                const debtsQuery = query(
                    collection(db, "condominios", condoId, "owner_extraordinary_debts"),
                    where("paymentId", "==", selectedTransaction.sourcePaymentId)
                );
                const debtsSnap = await getDocs(debtsQuery);
                
                for (const debtDoc of debtsSnap.docs) {
                    const debtRef = doc(db, "condominios", condoId, "owner_extraordinary_debts", debtDoc.id);
                    const debtData = debtDoc.data();
                    
                    if (selectedTransaction.isLiquidation && selectedTransaction.previousPendingUSD) {
                        await updateDoc(debtRef, {
                            status: "partial",
                            pendingUSD: selectedTransaction.previousPendingUSD,
                            paidAt: null,
                            paymentId: null,
                            amountPaidBs: debtData.amountPaidBs - selectedTransaction.monto,
                            amountPaidUSD: (debtData.amountPaidBs - selectedTransaction.monto) / (selectedTransaction.exchangeRate || 1)
                        });
                    } else if (debtData.status === "partial" && debtData.pendingUSD) {
                        await updateDoc(debtRef, {
                            status: "pending",
                            pendingUSD: debtData.amountUSD,
                            paidAt: null,
                            paymentId: null,
                            amountPaidBs: null,
                            amountPaidUSD: 0
                        });
                    } else {
                        await updateDoc(debtRef, {
                            status: "pending",
                            paidAt: null,
                            paymentId: null,
                            amountPaidBs: null,
                            amountPaidUSD: 0
                        });
                    }
                    debtUpdated = true;
                }
            }
            
            if (!debtUpdated && selectedTransaction.ownerId && selectedTransaction.campaignId) {
                const debtsQuery = query(
                    collection(db, "condominios", condoId, "owner_extraordinary_debts"),
                    where("ownerId", "==", selectedTransaction.ownerId),
                    where("debtId", "==", selectedTransaction.campaignId)
                );
                const debtsSnap = await getDocs(debtsQuery);
                
                for (const debtDoc of debtsSnap.docs) {
                    const debtRef = doc(db, "condominios", condoId, "owner_extraordinary_debts", debtDoc.id);
                    const debtData = debtDoc.data();
                    const amountUSD = selectedTransaction.monto / (selectedTransaction.exchangeRate || 1);
                    const newPendingUSD = (debtData.pendingUSD || debtData.amountUSD) + amountUSD;
                    
                    if (newPendingUSD >= debtData.amountUSD - 0.01) {
                        await updateDoc(debtRef, {
                            status: "pending",
                            pendingUSD: debtData.amountUSD,
                            paidAt: null,
                            paymentId: null
                        });
                    } else {
                        await updateDoc(debtRef, {
                            status: "partial",
                            pendingUSD: newPendingUSD,
                            paidAt: null,
                            paymentId: null
                        });
                    }
                    debtUpdated = true;
                }
            }
            
            await deleteDoc(doc(db, "condominios", condoId, "extraordinary_funds", selectedTransaction.id));
            
            toast({
                title: "Movimiento eliminado",
                description: debtUpdated ? "La cuota ha sido revertida a su estado anterior." : "Movimiento eliminado correctamente."
            });
            setDeleteDialogOpen(false);
            setSelectedTransaction(null);
        } catch (error) {
            console.error("Error eliminando movimiento:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el movimiento" });
        } finally {
            setIsDeleting(false);
        }
    };

    const generateCampaignDetailHTML = (campaign: ExtraordinaryCampaign, txs: (ExtraordinaryTransaction & { runningBalance: number })[]) => {
        const totalIngresos = txs.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0);
        const totalEgresos = txs.filter(t => t.tipo === 'egreso').reduce((s, t) => s + t.monto, 0);
        const saldo = totalIngresos - totalEgresos;
        const logo = condominioData?.logo || companyInfo?.logo || "/logos/efascondosys-logo.png";
        const nombre = condominioData?.nombre || condominioData?.name || companyInfo?.nombre || companyInfo?.name || "CONDOMINIO";
        const rif = condominioData?.rif || companyInfo?.rif || "J-00000000-0";
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Libro Diario - ${campaign.description}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 20px; padding: 20px; background: white; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #F28705; }
                    .logo { width: 60px; height: 60px; border-radius: 50%; overflow: hidden; border: 2px solid #F5A623; }
                    .logo img { width: 100%; height: 100%; object-fit: cover; }
                    .company-info { text-align: right; }
                    .company-info h2 { font-size: 16px; font-weight: 900; color: #1A1D23; text-transform: uppercase; }
                    .company-info p { font-size: 10px; color: #64748b; }
                    h1 { text-align: center; font-size: 20px; font-weight: 900; text-transform: uppercase; margin: 20px 0; color: #1e293b; }
                    .campaign-info { text-align: center; margin-bottom: 20px; }
                    .campaign-info h3 { font-size: 16px; color: #F28705; }
                    .summary { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 30px; }
                    .summary-card { flex: 1; background: #f8fafc; padding: 15px; border-radius: 12px; text-align: center; border-left: 4px solid #F28705; }
                    .summary-card label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; }
                    .summary-card value { font-size: 20px; font-weight: 900; }
                    .ingreso { color: #10b981; }
                    .egreso { color: #ef4444; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10px; }
                    th { background: #1A1D23; color: white; padding: 12px 8px; font-weight: 700; text-transform: uppercase; font-size: 9px; }
                    td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; }
                    .text-right { text-align: right; }
                    .text-left { text-align: left; }
                    .liquidation { color: #F28705; font-weight: 700; }
                    .footer { margin-top: 30px; padding-top: 15px; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">
                            <img src="${logo}" alt="${nombre}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;font-size:28px;&quot;>🏢</div>'">
                        </div>
                        <div class="company-info">
                            <h2>${nombre}</h2>
                            <p>RIF: ${rif}</p>
                        </div>
                    </div>
                    <h1>LIBRO DIARIO - FONDO EXTRAORDINARIO</h1>
                    <div class="campaign-info">
                        <h3>${campaign.description}</h3>
                        <p>Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
                    </div>
                    <div class="summary">
                        <div class="summary-card"><label>Total Ingresos</label><value class="ingreso">Bs. ${formatCurrency(totalIngresos)}</value></div>
                        <div class="summary-card"><label>Total Egresos</label><value class="egreso">Bs. ${formatCurrency(totalEgresos)}</value></div>
                        <div class="summary-card"><label>Saldo Actual</label><value>Bs. ${formatCurrency(saldo)}</value></div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th class="text-left">FECHA</th>
                                <th class="text-left">DESCRIPCIÓN</th>
                                <th class="text-left">REFERENCIA</th>
                                <th class="text-right">DEBE (Bs.)</th>
                                <th class="text-right">HABER (Bs.)</th>
                                <th class="text-right">SALDO (Bs.)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${txs.map(t => {
                                const descClass = t.isLiquidation ? 'liquidation' : (t.tipo === 'ingreso' ? 'ingreso' : 'egreso');
                                return `
                                <tr>
                                    <td class="text-left">${t.fecha?.toDate ? format(t.fecha.toDate(), 'dd/MM/yyyy') : 'N/A'}</td>
                                    <td class="text-left ${descClass}">${t.descripcion}${t.isLiquidation ? ' [LIQUIDACIÓN]' : ''}</td>
                                    <td class="text-left">${t.referencia || '-'}</td>
                                    <td class="text-right ingreso">${t.tipo === 'ingreso' ? `Bs. ${formatCurrency(t.monto)}` : '-'}</td>
                                    <td class="text-right egreso">${t.tipo === 'egreso' ? `Bs. ${formatCurrency(t.monto)}` : '-'}</td>
                                    <td class="text-right">Bs. ${formatCurrency(t.runningBalance)}</td>
                                </tr>
                            `}).join('')}
                            ${txs.length === 0 ? '<tr><td colspan="6" class="text-center">No hay movimientos registrados</td>' : ''}
                        </tbody>
                    </table>
                    <div class="footer"><p>Documento generado por <strong>EFASCondoSys</strong> - Sistema de Autogestión de Condominios</p></div>
                </div>
            </body>
            </html>
        `;
    };

    const handleExportCampaignPDF = (campaign: ExtraordinaryCampaign) => {
        const txs = campaignBalances[campaign.id]?.transacciones || [];
        const txsWithBalance = (() => {
            let runningBalance = 0;
            return txs.map(tx => {
                if (tx.tipo === 'ingreso') runningBalance += tx.monto;
                else runningBalance -= tx.monto;
                return { ...tx, runningBalance };
            });
        })();
        
        const html = generateCampaignDetailHTML(campaign, txsWithBalance);
        const fileName = `Libro_Diario_${campaign.description.replace(/ /g, '_')}_${format(new Date(), 'yyyy_MM_dd')}.pdf`;
        downloadPDF(html, fileName);
        toast({ title: "PDF generado", description: "Libro diario descargado correctamente." });
    };

    const handleShareCampaignPDF = async (campaign: ExtraordinaryCampaign) => {
        const txs = campaignBalances[campaign.id]?.transacciones || [];
        const txsWithBalance = (() => {
            let runningBalance = 0;
            return txs.map(tx => {
                if (tx.tipo === 'ingreso') runningBalance += tx.monto;
                else runningBalance -= tx.monto;
                return { ...tx, runningBalance };
            });
        })();
        
        const html = generateCampaignDetailHTML(campaign, txsWithBalance);
        const fileName = `Libro_Diario_${campaign.description.replace(/ /g, '_')}_${format(new Date(), 'yyyy_MM_dd')}.pdf`;
        
        try {
            await sharePDF(html, fileName, `Libro Diario - ${campaign.description}`);
            toast({ title: "Compartir", description: "Selecciona cómo compartir el PDF." });
        } catch (error) {
            console.error("Error compartiendo PDF:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo compartir el PDF." });
        }
    };

    const handleGenerateConsolidatedPDF = () => {
        const transactionsWithBalance = getTransactionsWithRunningBalance();
        const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
        const campaignDisplayName = selectedCampaign ? selectedCampaign.description : "Consolidado";
        
        const totalIngresos = filteredTransactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0);
        const totalEgresos = filteredTransactions.filter(t => t.tipo === 'egreso').reduce((s, t) => s + t.monto, 0);
        const saldoActual = totalIngresos - totalEgresos;
        
        const logo = condominioData?.logo || companyInfo?.logo || "/logos/efascondosys-logo.png";
        const nombre = condominioData?.nombre || condominioData?.name || companyInfo?.nombre || companyInfo?.name || "CONDOMINIO";
        const rif = condominioData?.rif || companyInfo?.rif || "J-00000000-0";
        const period = format(new Date(), 'MMMM yyyy', { locale: es }).toUpperCase();
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reporte de Fondo Extraordinario - ${campaignDisplayName}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 20px; padding: 20px; background: white; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #F28705; }
                    .logo { width: 60px; height: 60px; border-radius: 50%; overflow: hidden; border: 2px solid #F5A623; }
                    .logo img { width: 100%; height: 100%; object-fit: cover; }
                    .company-info { text-align: right; }
                    .company-info h2 { font-size: 16px; font-weight: 900; color: #1A1D23; text-transform: uppercase; }
                    .company-info p { font-size: 10px; color: #64748b; }
                    h1 { text-align: center; font-size: 20px; font-weight: 900; text-transform: uppercase; margin: 20px 0; color: #1e293b; }
                    .campaign-info { text-align: center; margin-bottom: 20px; }
                    .campaign-info h3 { font-size: 16px; color: #F28705; }
                    .summary { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 30px; }
                    .summary-card { flex: 1; background: #f8fafc; padding: 15px; border-radius: 12px; text-align: center; border-left: 4px solid #F28705; }
                    .summary-card label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; }
                    .summary-card value { font-size: 20px; font-weight: 900; }
                    .ingreso { color: #10b981; }
                    .egreso { color: #ef4444; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10px; }
                    th { background: #1A1D23; color: white; padding: 12px 8px; font-weight: 700; text-transform: uppercase; font-size: 9px; }
                    td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; }
                    .text-right { text-align: right; }
                    .text-left { text-align: left; }
                    .liquidation { color: #F28705; font-weight: 700; }
                    .footer { margin-top: 30px; padding-top: 15px; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">
                            <img src="${logo}" alt="${nombre}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;font-size:28px;&quot;>🏢</div>'">
                        </div>
                        <div class="company-info">
                            <h2>${nombre}</h2>
                            <p>RIF: ${rif}</p>
                        </div>
                    </div>
                    <h1>FONDO EXTRAORDINARIO</h1>
                    <div class="campaign-info">
                        <h3>${campaignDisplayName}</h3>
                        <p>Período: ${period}</p>
                    </div>
                    <div class="summary">
                        <div class="summary-card"><label>Total Ingresos (Debe)</label><value class="ingreso">Bs. ${formatCurrency(totalIngresos)}</value></div>
                        <div class="summary-card"><label>Total Egresos (Haber)</label><value class="egreso">Bs. ${formatCurrency(totalEgresos)}</value></div>
                        <div class="summary-card"><label>Saldo Actual</label><value>Bs. ${formatCurrency(saldoActual)}</value></div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th class="text-left">FECHA</th>
                                <th class="text-left">DESCRIPCIÓN</th>
                                <th class="text-left">REFERENCIA</th>
                                <th class="text-right">DEBE (Bs.)</th>
                                <th class="text-right">HABER (Bs.)</th>
                                <th class="text-right">SALDO (Bs.)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${transactionsWithBalance.map(t => {
                                const descClass = t.isLiquidation ? 'liquidation' : (t.tipo === 'ingreso' ? 'ingreso' : 'egreso');
                                return `
                                <tr>
                                    <td class="text-left">${t.fecha?.toDate ? format(t.fecha.toDate(), 'dd/MM/yyyy') : 'N/A'}</td>
                                    <td class="text-left ${descClass}">${t.descripcion}${t.isLiquidation ? ' [LIQUIDACIÓN]' : ''}</td>
                                    <td class="text-left">${t.referencia || '-'}</td>
                                    <td class="text-right ingreso">${t.tipo === 'ingreso' ? `Bs. ${formatCurrency(t.monto)}` : '-'}</td>
                                    <td class="text-right egreso">${t.tipo === 'egreso' ? `Bs. ${formatCurrency(t.monto)}` : '-'}</td>
                                    <td class="text-right">Bs. ${formatCurrency(t.runningBalance)}</td>
                                </tr>
                            `}).join('')}
                            ${transactionsWithBalance.length === 0 ? '<tr><td colspan="6" class="text-center">No hay movimientos registrados</td>' : ''}
                        </tbody>
                    </table>
                    <div class="footer"><p>Documento generado por <strong>EFASCondoSys</strong> - Sistema de Autogestión de Condominios</p></div>
                </div>
            </body>
            </html>
        `;
        
        const fileName = selectedCampaignId !== 'all' && selectedCampaign
            ? `Fondo_Extraordinario_${selectedCampaign.description.replace(/ /g, '_')}_${format(new Date(), 'yyyy_MM_dd')}.pdf`
            : `Fondo_Extraordinario_Consolidado_${format(new Date(), 'yyyy_MM_dd')}.pdf`;
        downloadPDF(html, fileName);
    };

    const openCampaignDetail = (campaign: ExtraordinaryCampaign) => {
        setSelectedCampaignForDetail(campaign);
        setCampaignDetailDialogOpen(true);
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Cargando fondo extraordinario...</p>
            </div>
        );
    }

    const transactionsWithBalance = getTransactionsWithRunningBalance();
    const totalIngresos = filteredTransactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0);
    const totalEgresos = filteredTransactions.filter(t => t.tipo === 'egreso').reduce((s, t) => s + t.monto, 0);
    const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
    const campaignDisplayName = selectedCampaign ? selectedCampaign.description : "Consolidado";

    const detailTransactions = selectedCampaignForDetail 
        ? campaignBalances[selectedCampaignForDetail.id]?.transacciones || []
        : [];
    
    const detailTransactionsWithBalance = () => {
        let runningBalance = 0;
        return detailTransactions.map(tx => {
            if (tx.tipo === 'ingreso') {
                runningBalance += tx.monto;
            } else {
                runningBalance -= tx.monto;
            }
            return { ...tx, runningBalance };
        });
    };

    const detailTotalIngresos = detailTransactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0);
    const detailTotalEgresos = detailTransactions.filter(t => t.tipo === 'egreso').reduce((s, t) => s + t.monto, 0);
    const detailSaldo = detailTotalIngresos - detailTotalEgresos;

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            <div className="mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            Fondo <span className="text-primary">Extraordinario</span>
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                        <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                            Gestión independiente de cuotas extraordinarias
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                            <SelectTrigger className="w-56 rounded-xl bg-slate-800 border-none text-white font-black uppercase text-[10px]">
                                <Filter className="mr-2 h-4 w-4" />
                                <SelectValue placeholder="Todas las campañas" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="all" className="font-black uppercase text-[10px]">📊 CONSOLIDADO</SelectItem>
                                {campaigns.map(c => (
                                    <SelectItem key={c.id} value={c.id} className="font-black uppercase text-[10px]">
                                        📁 {c.description}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={handleGenerateConsolidatedPDF} variant="outline" className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic">
                            <FileText className="mr-2 h-4 w-4" /> Exportar {selectedCampaignId === 'all' ? 'Consolidado' : 'Campaña'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tarjetas de campaña */}
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {campaigns.map(campaign => {
                        const balance = campaignBalances[campaign.id] || { ingresos: 0, egresos: 0, saldo: 0 };
                        const isSelected = selectedCampaignId === campaign.id;
                        
                        const ingresosUSD = exchangeRate > 0 ? balance.ingresos / exchangeRate : 0;
                        const egresosUSD = exchangeRate > 0 ? balance.egresos / exchangeRate : 0;
                        const saldoUSD = exchangeRate > 0 ? balance.saldo / exchangeRate : 0;
                        
                        return (
                            <Card 
                                key={campaign.id} 
                                className={`rounded-[2rem] border-none shadow-2xl overflow-hidden border transition-all hover:scale-[1.02] ${isSelected ? 'ring-2 ring-primary bg-slate-800' : 'bg-slate-900'}`}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <Badge className={`text-[8px] ${campaign.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                            {campaign.status === 'active' ? '🟢 ACTIVA' : '⚫ CERRADA'}
                                        </Badge>
                                        <div className="flex gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-6 px-2 text-[8px] text-white/60 hover:text-white"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openCampaignDetail(campaign);
                                                }}
                                            >
                                                <Eye className="h-3 w-3 mr-1" /> Ver Libro
                                            </Button>
                                            <Badge 
                                                variant={isSelected ? 'default' : 'outline'} 
                                                className="text-[8px] cursor-pointer"
                                                onClick={() => setSelectedCampaignId(isSelected ? 'all' : campaign.id)}
                                            >
                                                {isSelected ? '✓ Seleccionada' : 'Seleccionar'}
                                            </Badge>
                                        </div>
                                    </div>
                                    <p className="font-black text-white text-sm uppercase truncate mb-3">{campaign.description}</p>
                                    
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="text-center">
                                            <p className="text-[7px] text-white/40">Ingresos</p>
                                            <p className="font-black text-emerald-400 text-xs">Bs. {formatCurrency(balance.ingresos)}</p>
                                            <p className="text-[7px] text-white/30">${formatUSD(ingresosUSD)}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[7px] text-white/40">Egresos</p>
                                            <p className="font-black text-red-400 text-xs">Bs. {formatCurrency(balance.egresos)}</p>
                                            <p className="text-[7px] text-white/30">${formatUSD(egresosUSD)}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[7px] text-white/40">Saldo</p>
                                            <p className={cn(
                                                "font-black text-xs",
                                                balance.saldo >= 0 ? "text-primary" : "text-red-500"
                                            )}>
                                                Bs. {formatCurrency(balance.saldo)}
                                            </p>
                                            <p className="text-[7px] text-white/30">${formatUSD(saldoUSD)}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Tarjeta de resumen consolidado */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-emerald-500/20 p-3 rounded-2xl">
                                <TrendingUp className="h-6 w-6 text-emerald-500" />
                            </div>
                            <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total Ingresos (Debe)</p>
                        </div>
                        <p className="text-3xl font-black text-emerald-400 italic">Bs. {formatCurrency(totalIngresos)}</p>
                        <p className="text-xs text-white/30 mt-1">${formatUSD(totalIngresos / (exchangeRate || 1))} USD</p>
                    </CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-red-500/20 p-3 rounded-2xl">
                                <TrendingDown className="h-6 w-6 text-red-500" />
                            </div>
                            <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total Egresos (Haber)</p>
                        </div>
                        <p className="text-3xl font-black text-red-400 italic">Bs. {formatCurrency(totalEgresos)}</p>
                        <p className="text-xs text-white/30 mt-1">${formatUSD(totalEgresos / (exchangeRate || 1))} USD</p>
                    </CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-primary/20 p-3 rounded-2xl">
                                <DollarSign className="h-6 w-6 text-primary" />
                            </div>
                            <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Saldo Disponible</p>
                        </div>
                        <p className="text-3xl font-black text-white italic">Bs. {formatCurrency(balance)}</p>
                        <p className="text-xs text-white/30 mt-1">${formatUSD(balance / (exchangeRate || 1))} USD</p>
                    </CardContent>
                </Card>
            </div>

            {/* Libro Diario - Consolidado o por Campaña */}
            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                <CardHeader className="bg-gradient-to-r from-white/5 to-transparent p-6 border-b border-white/5">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary" /> 
                            Libro Diario: {campaignDisplayName}
                        </CardTitle>
                        {selectedCampaignId !== 'all' && (
                            <Button variant="ghost" size="sm" onClick={() => setSelectedCampaignId('all')} className="text-white/40 hover:text-white text-[9px]">
                                <X className="h-3 w-3 mr-1" /> Ver Consolidado
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-800/30">
                                <TableRow className="border-white/5">
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">FECHA</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">DESCRIPCIÓN</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">REFERENCIA</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">DEBE (Bs.)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">HABER (Bs.)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">SALDO (Bs.)</TableHead>
                                    <TableHead className="text-center text-[10px] font-black uppercase text-slate-400">ACCIÓN</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactionsWithBalance.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-40 text-center text-slate-500 font-bold italic uppercase text-[10px]">
                                            No hay movimientos en esta campaña
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transactionsWithBalance.map((tx) => (
                                        <TableRow key={tx.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                            <TableCell className="font-black text-white text-xs italic">
                                                {tx.fecha?.toDate ? format(tx.fecha.toDate(), 'dd/MM/yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "font-black uppercase text-[10px]",
                                                        tx.isLiquidation ? "text-primary" : "text-white"
                                                    )}>
                                                        {tx.descripcion}
                                                    </div>
                                                    {tx.isLiquidation && (
                                                        <Badge className="bg-primary/20 text-primary text-[8px]">LIQUIDACIÓN</Badge>
                                                    )}
                                                </div>
                                                {tx.campaignName && selectedCampaignId === 'all' && (
                                                    <div className="text-[8px] text-primary/60">{tx.campaignName}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-[10px] text-white/60">{tx.referencia || '-'}</TableCell>
                                            <TableCell className="text-right font-black text-emerald-400 italic">
                                                {tx.tipo === 'ingreso' ? `Bs. ${formatCurrency(tx.monto)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-red-400 italic">
                                                {tx.tipo === 'egreso' ? `Bs. ${formatCurrency(tx.monto)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-primary italic">
                                                Bs. {formatCurrency(tx.runningBalance)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => { 
                                                        setSelectedTransaction(tx); 
                                                        setDeleteDialogOpen(true); 
                                                    }} 
                                                    className="text-red-500 hover:bg-red-500/10 h-8 w-8"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Diálogo para ver libro diario individual de campaña */}
            <Dialog open={campaignDetailDialogOpen} onOpenChange={setCampaignDetailDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-6xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex justify-between items-center">
                            <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" /> 
                                Libro Diario: {selectedCampaignForDetail?.description}
                            </DialogTitle>
                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => selectedCampaignForDetail && handleExportCampaignPDF(selectedCampaignForDetail)}
                                    className="rounded-xl border-emerald-500/30 text-emerald-400 font-black uppercase text-[9px]"
                                >
                                    <Download className="mr-1 h-3 w-3" /> Exportar PDF
                                </Button>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => selectedCampaignForDetail && handleShareCampaignPDF(selectedCampaignForDetail)}
                                    className="rounded-xl border-sky-500/30 text-sky-400 font-black uppercase text-[9px]"
                                >
                                    <Share2 className="mr-1 h-3 w-3" /> Compartir
                                </Button>
                            </div>
                        </div>
                        <DialogDescription className="text-slate-400 text-sm">
                            Movimientos exclusivos de esta campaña extraordinaria
                        </DialogDescription>
                    </DialogHeader>
                    
                    {/* Resumen en el diálogo */}
                    <div className="grid grid-cols-3 gap-4 py-2">
                        <div className="bg-slate-800 p-3 rounded-xl text-center">
                            <p className="text-[8px] text-slate-400">Ingresos</p>
                            <p className="font-black text-emerald-400">Bs. {formatCurrency(detailTotalIngresos)}</p>
                        </div>
                        <div className="bg-slate-800 p-3 rounded-xl text-center">
                            <p className="text-[8px] text-slate-400">Egresos</p>
                            <p className="font-black text-red-400">Bs. {formatCurrency(detailTotalEgresos)}</p>
                        </div>
                        <div className="bg-slate-800 p-3 rounded-xl text-center">
                            <p className="text-[8px] text-slate-400">Saldo</p>
                            <p className={cn("font-black", detailSaldo >= 0 ? "text-primary" : "text-red-500")}>
                                Bs. {formatCurrency(detailSaldo)}
                            </p>
                        </div>
                    </div>
                    
                    <div className="py-2">
                        {detailTransactions.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 font-bold uppercase text-[10px]">
                                No hay movimientos registrados para esta campaña
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-slate-800/30">
                                    <TableRow className="border-white/5">
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">FECHA</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">DESCRIPCIÓN</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">REFERENCIA</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">DEBE (Bs.)</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">HABER (Bs.)</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">SALDO (Bs.)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {detailTransactionsWithBalance().map((tx) => (
                                        <TableRow key={tx.id} className="border-white/5 hover:bg-white/5">
                                            <TableCell className="font-black text-white text-xs">
                                                {tx.fecha?.toDate ? format(tx.fecha.toDate(), 'dd/MM/yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "font-black uppercase text-[10px]",
                                                        tx.isLiquidation ? "text-primary" : "text-white"
                                                    )}>
                                                        {tx.descripcion}
                                                    </span>
                                                    {tx.isLiquidation && (
                                                        <Badge className="bg-primary/20 text-primary text-[8px]">LIQUIDACIÓN</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-[10px] text-white/60">{tx.referencia || '-'}</TableCell>
                                            <TableCell className="text-right font-black text-emerald-400">
                                                {tx.tipo === 'ingreso' ? `Bs. ${formatCurrency(tx.monto)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-red-400">
                                                {tx.tipo === 'egreso' ? `Bs. ${formatCurrency(tx.monto)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-primary">
                                                Bs. {formatCurrency(tx.runningBalance)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <DialogFooter>
                        <Button 
                            onClick={() => setCampaignDetailDialogOpen(false)} 
                            className="rounded-xl bg-primary text-slate-900 font-black uppercase text-[10px]"
                        >
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900/50 overflow-hidden border border-white/5">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="bg-primary/10 p-2 rounded-xl"><Info className="h-5 w-5 text-primary" /></div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-primary tracking-widest">Información</p>
                            <p className="text-[9px] text-white/60 mt-1">
                                Este módulo muestra los movimientos reales del Fondo Extraordinario. 
                                Los montos en las tarjetas coinciden exactamente con el libro diario consolidado.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-red-500" /> Eliminar Movimiento
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-sm">
                            ¿Estás seguro de eliminar este movimiento? La cuota extraordinaria volverá a estado pendiente.
                            {selectedTransaction?.isLiquidation && (
                                <span className="block mt-2 text-yellow-400">⚠️ Esta es una liquidación total. Se restaurará el estado parcial anterior.</span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {selectedTransaction && (
                            <div className="space-y-2 bg-red-500/10 p-4 rounded-xl">
                                <p className="text-white font-black text-sm">{selectedTransaction.descripcion}</p>
                                <p className="text-emerald-400 font-black">Monto: Bs. {formatCurrency(selectedTransaction.monto)}</p>
                                {selectedTransaction.isLiquidation && (
                                    <Badge className="bg-primary/20 text-primary">LIQUIDACIÓN TOTAL</Badge>
                                )}
                                {selectedTransaction.campaignName && (
                                    <p className="text-[10px] text-primary">Campaña: {selectedTransaction.campaignName}</p>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-3">
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="rounded-xl font-black uppercase text-[10px]">Cancelar</Button>
                        <Button onClick={handleDeleteTransaction} disabled={isDeleting} variant="destructive" className="rounded-xl font-black uppercase text-[10px] italic">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Eliminar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
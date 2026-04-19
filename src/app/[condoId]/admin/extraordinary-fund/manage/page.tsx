'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, 
    doc, getDoc, serverTimestamp, onSnapshot, Timestamp, writeBatch 
} from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Users, FileText, AlertCircle, DollarSign, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { downloadPDF } from '@/lib/print-pdf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Owner {
    id: string;
    name: string;
    email?: string;
    properties: { street: string, house: string }[];
    balance?: number;
}

interface ExtraordinaryCampaign {
    id: string;
    description: string;
    amountUSD: number;
    createdAt: Timestamp;
    status: 'active' | 'closed';
    totalCollected?: number;
    totalPending?: number;
}

interface OwnerExtraordinaryDebt {
    id: string;
    ownerId: string;
    ownerName: string;
    property: string;
    street: string;
    houseNumber: number;
    debtId: string;
    description: string;
    amountUSD: number;
    status: 'pending' | 'paid' | 'partial';
    pendingUSD?: number;
    paidAt?: Timestamp;
    paymentId?: string;
}

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Función para extraer número de casa
const getHouseNumber = (house: string): number => {
    const match = house.match(/\d+/);
    return match ? parseInt(match[0]) : 999;
};

// Función para ordenar propiedades por calle y casa
const sortProperties = (properties: { street: string, house: string }[]) => {
    const streetOrder: { [key: string]: number } = {
        'Calle 1': 1, 'Calle 2': 2, 'Calle 3': 3, 'Calle 4': 4,
        'Calle 5': 5, 'Calle 6': 6, 'Calle 7': 7, 'Calle 8': 8
    };
    
    return [...properties].sort((a, b) => {
        const streetCompare = (streetOrder[a.street] || 99) - (streetOrder[b.street] || 99);
        if (streetCompare !== 0) return streetCompare;
        return getHouseNumber(a.house) - getHouseNumber(b.house);
    });
};

export default function ManageExtraordinaryFundPage() {
    const params = useParams();
    const router = useRouter();
    const condoId = params?.condoId as string;
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(false);
    const [owners, setOwners] = useState<Owner[]>([]);
    const [extraordinaryDebts, setExtraordinaryDebts] = useState<OwnerExtraordinaryDebt[]>([]);
    const [activeCampaigns, setActiveCampaigns] = useState<ExtraordinaryCampaign[]>([]);
    const [closedCampaigns, setClosedCampaigns] = useState<ExtraordinaryCampaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<ExtraordinaryCampaign | null>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        description: '',
        amountUSD: ''
    });
    
    const ownersCollectionName = condoId === 'condo_01' ? 'owners' : 'propietarios';

    // Cargar propietarios
    useEffect(() => {
        if (!condoId) return;
        const q = query(collection(db, 'condominios', condoId, ownersCollectionName), where('role', '==', 'propietario'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const ownersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner));
            setOwners(ownersData.filter(o => o.name && o.name !== 'vallecondo@gmail.com'));
        });
        return () => unsubscribe();
    }, [condoId, ownersCollectionName]);

    // Cargar campañas y deudas
    useEffect(() => {
        if (!condoId) return;
        
        const campaignsQuery = query(
            collection(db, 'condominios', condoId, 'extraordinary_campaigns')
        );
        const unsubCampaigns = onSnapshot(campaignsQuery, (snap) => {
            const campaignsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtraordinaryCampaign));
            setActiveCampaigns(campaignsData.filter(c => c.status === 'active'));
            setClosedCampaigns(campaignsData.filter(c => c.status === 'closed'));
        });
        
        const debtsQuery = query(
            collection(db, 'condominios', condoId, 'owner_extraordinary_debts')
        );
        const unsubDebts = onSnapshot(debtsQuery, (snap) => {
            const debtsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OwnerExtraordinaryDebt));
            setExtraordinaryDebts(debtsData);
        });
        
        return () => {
            unsubCampaigns();
            unsubDebts();
        };
    }, [condoId]);

    // Obtener estadísticas por campaña
    const getCampaignStats = (campaignId: string) => {
        const campaignDebts = extraordinaryDebts.filter(d => d.debtId === campaignId);
        const totalAmount = campaignDebts.reduce((sum, d) => sum + d.amountUSD, 0);
        const paidAmount = campaignDebts.filter(d => d.status === 'paid').reduce((sum, d) => sum + d.amountUSD, 0);
        const partialPaid = campaignDebts.filter(d => d.status === 'partial').reduce((sum, d) => sum + (d.amountUSD - (d.pendingUSD || 0)), 0);
        const collected = paidAmount + partialPaid;
        const pending = totalAmount - collected;
        return { totalAmount, collected, pending };
    };

    // Obtener propietarios con sus propiedades ordenadas
    const getSortedOwnersWithProperties = () => {
        const ownersWithProps = owners.map(owner => ({
            ...owner,
            sortedProperties: sortProperties(owner.properties || [])
        }));
        
        return ownersWithProps.sort((a, b) => {
            const aProp = a.sortedProperties[0];
            const bProp = b.sortedProperties[0];
            if (!aProp) return 1;
            if (!bProp) return -1;
            
            const streetOrder: { [key: string]: number } = {
                'Calle 1': 1, 'Calle 2': 2, 'Calle 3': 3, 'Calle 4': 4,
                'Calle 5': 5, 'Calle 6': 6, 'Calle 7': 7, 'Calle 8': 8
            };
            const streetCompare = (streetOrder[aProp.street] || 99) - (streetOrder[bProp.street] || 99);
            if (streetCompare !== 0) return streetCompare;
            return getHouseNumber(aProp.house) - getHouseNumber(bProp.house);
        });
    };

    const handleCreateCampaign = async () => {
        if (!formData.description || !formData.amountUSD) {
            toast({ variant: 'destructive', title: 'Error', description: 'Complete la descripción y el monto.' });
            return;
        }
        
        setLoading(true);
        try {
            const amountUSD = parseFloat(formData.amountUSD);
            
            const campaignRef = await addDoc(collection(db, 'condominios', condoId, 'extraordinary_campaigns'), {
                description: formData.description.toUpperCase(),
                amountUSD,
                status: 'active',
                createdAt: serverTimestamp()
            });
            
            const batch = writeBatch(db);
            for (const owner of owners) {
                const sortedProps = sortProperties(owner.properties || []);
                for (const prop of sortedProps) {
                    const propertyStr = `${prop.street} - ${prop.house}`;
                    const debtRef = doc(collection(db, 'condominios', condoId, 'owner_extraordinary_debts'));
                    batch.set(debtRef, {
                        ownerId: owner.id,
                        ownerName: owner.name,
                        property: propertyStr,
                        street: prop.street,
                        houseNumber: getHouseNumber(prop.house),
                        debtId: campaignRef.id,
                        description: formData.description.toUpperCase(),
                        amountUSD,
                        status: 'pending',
                        createdAt: serverTimestamp()
                    });
                }
            }
            await batch.commit();
            
            toast({ title: 'Éxito', description: `Cuota extraordinaria cargada a ${owners.length} propietarios.` });
            setIsCreateDialogOpen(false);
            setFormData({ description: '', amountUSD: '' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la cuota extraordinaria.' });
        } finally {
            setLoading(false);
        }
    };

    const handleCloseCampaign = async (campaignId: string) => {
        setLoading(true);
        try {
            await updateDoc(doc(db, 'condominios', condoId, 'extraordinary_campaigns', campaignId), {
                status: 'closed'
            });
            toast({ title: 'Campaña cerrada', description: 'Esta cuota ya no recibirá más pagos.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error' });
        } finally {
            setLoading(false);
        }
    };

    const generateCampaignReport = async (campaign: ExtraordinaryCampaign, type: 'pending' | 'paid' | 'all') => {
        const sortedOwners = getSortedOwnersWithProperties();
        const campaignDebts = extraordinaryDebts.filter(d => d.debtId === campaign.id);
        
        let filteredDebts: { owner: Owner, debt: OwnerExtraordinaryDebt | null, index: number }[] = [];
        let counter = 1;
        
        for (const owner of sortedOwners) {
            let debt = null;
            if (type === 'pending') {
                debt = campaignDebts.find(d => d.ownerId === owner.id && (d.status === 'pending' || d.status === 'partial'));
            } else if (type === 'paid') {
                debt = campaignDebts.find(d => d.ownerId === owner.id && (d.status === 'paid' || d.status === 'partial'));
            } else {
                debt = campaignDebts.find(d => d.ownerId === owner.id);
            }
            
            if (debt) {
                filteredDebts.push({ owner, debt, index: counter });
                counter++;
            }
        }
        
        const stats = getCampaignStats(campaign.id);
        const html = generateReportHTML(filteredDebts, type === 'pending' ? 'POR PAGAR' : 'PAGADOS', campaign, stats);
        const fileName = `Cuota_Extraordinaria_${campaign.description.replace(/ /g, '_')}_${type === 'pending' ? 'Por_Pagar' : 'Pagados'}_${format(new Date(), 'yyyy_MM_dd')}.pdf`;
        downloadPDF(html, fileName);
    };

    const generateReportHTML = (items: { owner: Owner, debt: OwnerExtraordinaryDebt | null, index: number }[], type: string, campaign: ExtraordinaryCampaign, stats: any) => {
        const totalUSD = items.reduce((sum, item) => {
            if (type === 'POR PAGAR') {
                return sum + (item.debt?.pendingUSD || item.debt?.amountUSD || 0);
            }
            return sum + (item.debt?.amountUSD || 0);
        }, 0);
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reporte Cuota Extraordinaria - ${campaign.description}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Helvetica', Arial, sans-serif; margin: 20px; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #F28705; padding-bottom: 15px; }
                    .header h1 { color: #1e293b; font-size: 24px; }
                    .header h2 { color: #64748b; font-size: 14px; margin-top: 5px; }
                    .summary { margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; display: flex; justify-content: space-between; }
                    .summary-item { text-align: center; }
                    .summary-item label { font-size: 10px; color: #64748b; }
                    .summary-item .value { font-size: 16px; font-weight: bold; color: #1e293b; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #1A1D23; color: white; padding: 10px; text-align: center; }
                    td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; }
                    .text-left { text-align: left; }
                    .text-right { text-align: right; }
                    .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>CUOTA EXTRAORDINARIA</h1>
                    <h2>${campaign.description}</h2>
                    <p>Reporte: ${type}</p>
                    <p>Generado: ${new Date().toLocaleString('es-VE')}</p>
                </div>
                <div class="summary">
                    <div class="summary-item"><label>Monto por Propietario</label><div class="value">$${formatUSD(campaign.amountUSD)}</div></div>
                    <div class="summary-item"><label>Total Recaudado</label><div class="value">$${formatUSD(stats.collected)}</div></div>
                    <div class="summary-item"><label>Total Pendiente</label><div class="value">$${formatUSD(stats.pending)}</div></div>
                    <div class="summary-item"><label>Propietarios</label><div class="value">${items.length}</div></div>
                </div>
                <table>
                    <thead>
                        <tr><th>#</th><th class="text-left">Propietario</th><th class="text-left">Propiedad</th><th class="text-right">Monto (USD)</th><th class="text-right">Estado</th></tr>
                    </thead>
                    <tbody>
                        ${items.map(item => {
                            const sortedProps = sortProperties(item.owner.properties || []);
                            const propertyDisplay = sortedProps[0] ? `${sortedProps[0].street} - ${sortedProps[0].house}` : (item.debt?.property || 'N/A');
                            const displayAmount = type === 'POR PAGAR' 
                                ? (item.debt?.pendingUSD || item.debt?.amountUSD || 0)
                                : (item.debt?.amountUSD || 0);
                            const statusText = item.debt?.status === 'paid' ? 'PAGADO' : 
                                              item.debt?.status === 'partial' ? `PARCIAL (PENDIENTE: $${formatUSD(item.debt?.pendingUSD || 0)})` : 
                                              'PENDIENTE';
                            return `<tr><td>${item.index}</td><td class="text-left">${item.owner.name}</td><td class="text-left">${propertyDisplay}</td><td class="text-right">$${formatUSD(displayAmount)}</td><td class="text-right">${statusText}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
                <div class="footer"><p>EFASCondoSys - Sistema de Gestión de Condominios</p></div>
            </body>
            </html>
        `;
    };

    const sortedOwners = getSortedOwnersWithProperties();

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            {/* HEADER */}
            <div className="mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            Gestión de <span className="text-primary">Cuotas Extraordinarias</span>
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                        <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                            Crear, asignar y monitorear cuotas extraordinarias
                        </p>
                    </div>
                    <Button 
                        onClick={() => setIsCreateDialogOpen(true)}
                        className="rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 px-6 italic"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Nueva Cuota Extraordinaria
                    </Button>
                </div>
            </div>

            {/* CAMPAÑAS ACTIVAS */}
            {activeCampaigns.length > 0 && (
                <div className="space-y-6">
                    <h3 className="text-lg font-black uppercase text-primary tracking-wider">Campañas Activas</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {activeCampaigns.map(campaign => {
                            const stats = getCampaignStats(campaign.id);
                            const isOpen = selectedCampaign?.id === campaign.id;
                            return (
                                <Card key={campaign.id} className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-[10px] font-black uppercase text-primary tracking-widest">Campaña Activa</p>
                                                <p className="font-black text-white text-lg uppercase">{campaign.description}</p>
                                                <p className="text-[10px] text-white/60">Monto: ${formatUSD(campaign.amountUSD)} USD</p>
                                            </div>
                                            <Button 
                                                onClick={() => handleCloseCampaign(campaign.id)}
                                                disabled={loading}
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl border-red-500/30 text-red-400 font-black uppercase text-[10px] hover:bg-red-500/10"
                                            >
                                                <XCircle className="mr-1 h-3 w-3" /> Cerrar
                                            </Button>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-3 mb-4 pt-4 border-t border-white/10">
                                            <div className="text-center">
                                                <p className="text-[8px] text-white/40">Recaudado</p>
                                                <p className="font-black text-emerald-400 text-sm">${formatUSD(stats.collected)}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[8px] text-white/40">Pendiente</p>
                                                <p className="font-black text-yellow-400 text-sm">${formatUSD(stats.pending)}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[8px] text-white/40">Propietarios</p>
                                                <p className="font-black text-white text-sm">{extraordinaryDebts.filter(d => d.debtId === campaign.id).length}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-2">
                                            <Button 
                                                onClick={() => generateCampaignReport(campaign, 'pending')}
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 rounded-xl border-yellow-500/30 text-yellow-400 font-black uppercase text-[9px]"
                                            >
                                                <FileText className="mr-1 h-3 w-3" /> Por Pagar
                                            </Button>
                                            <Button 
                                                onClick={() => generateCampaignReport(campaign, 'paid')}
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 rounded-xl border-emerald-500/30 text-emerald-400 font-black uppercase text-[9px]"
                                            >
                                                <FileText className="mr-1 h-3 w-3" /> Pagados
                                            </Button>
                                            <Button 
                                                onClick={() => setSelectedCampaign(isOpen ? null : campaign)}
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl border-white/10 text-white font-black uppercase text-[9px]"
                                            >
                                                {isOpen ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                        
                                        {isOpen && (
                                            <div className="mt-4 pt-4 border-t border-white/10">
                                                <div className="max-h-64 overflow-y-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="border-white/10">
                                                                <TableHead className="text-[8px] font-black uppercase text-slate-400">#</TableHead>
                                                                <TableHead className="text-[8px] font-black uppercase text-slate-400">Propietario</TableHead>
                                                                <TableHead className="text-right text-[8px] font-black uppercase text-slate-400">Estado</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {sortedOwners.map((owner, idx) => {
                                                                const debt = extraordinaryDebts.find(d => d.ownerId === owner.id && d.debtId === campaign.id);
                                                                if (!debt) return null;
                                                                const statusText = debt.status === 'paid' ? 'PAGADO' : debt.status === 'partial' ? `PARCIAL ($${formatUSD(debt.pendingUSD || 0)})` : 'PENDIENTE';
                                                                return (
                                                                    <TableRow key={owner.id} className="border-white/10">
                                                                        <TableCell className="text-[9px] text-white/60">{idx + 1}</TableCell>
                                                                        <TableCell className="text-[9px] font-black text-white uppercase">{owner.name}</TableCell>
                                                                        <TableCell className="text-right text-[9px] font-black" style={{ color: debt.status === 'paid' ? '#10b981' : debt.status === 'partial' ? '#3b82f6' : '#eab308' }}>
                                                                            {statusText}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* CAMPAÑAS CERRADAS (opcional, colapsable) */}
            {closedCampaigns.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-black uppercase text-white/40 tracking-wider">Historial de Campañas</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {closedCampaigns.map(campaign => {
                            const stats = getCampaignStats(campaign.id);
                            return (
                                <Card key={campaign.id} className="rounded-[2rem] border-none shadow-xl bg-slate-900/50 overflow-hidden border border-white/5">
                                    <CardContent className="p-4">
                                        <p className="text-[9px] font-black uppercase text-white/40">{campaign.description}</p>
                                        <p className="text-[8px] text-white/40">Monto: ${formatUSD(campaign.amountUSD)}</p>
                                        <div className="flex justify-between mt-2">
                                            <span className="text-[8px] text-emerald-400">Recaudado: ${formatUSD(stats.collected)}</span>
                                            <Button 
                                                onClick={() => generateCampaignReport(campaign, 'all')}
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 rounded-lg text-[8px] font-black text-primary"
                                            >
                                                <FileText className="h-2 w-2 mr-1" /> Reporte
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* BOTÓN PARA VER LIBRO DIARIO */}
            <div className="flex justify-end">
                <Button 
                    onClick={() => router.push(`/${condoId}/admin/extraordinary-fund`)}
                    variant="outline"
                    className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10"
                >
                    <DollarSign className="mr-2 h-4 w-4" /> Ver Libro Diario
                </Button>
            </div>

            {/* DIÁLOGO PARA CREAR CAMPAÑA */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                            <Plus className="h-5 w-5 text-primary" /> Nueva Cuota Extraordinaria
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-sm">
                            Esta cuota se asignará a todos los propietarios
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Descripción</Label>
                            <Input 
                                placeholder="Ej: MEJORAS DE ILUMINACIÓN"
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                                className="rounded-xl bg-slate-800 border-none text-white font-black uppercase"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Monto (USD)</Label>
                            <Input 
                                type="number"
                                placeholder="0.00"
                                value={formData.amountUSD}
                                onChange={e => setFormData({...formData, amountUSD: e.target.value})}
                                className="rounded-xl bg-slate-800 border-none text-white font-black"
                            />
                        </div>
                        <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20">
                            <p className="text-[9px] text-yellow-400 font-black uppercase flex items-center gap-2">
                                <AlertCircle className="h-3 w-3" />
                                Se asignará a {owners.length} propietarios
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)} className="rounded-xl font-black uppercase text-[10px]">
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handleCreateCampaign}
                            disabled={loading || !formData.description || !formData.amountUSD}
                            className="rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] italic"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                            Cargar a Todos los Propietarios
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
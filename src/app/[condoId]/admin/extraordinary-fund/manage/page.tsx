'use client';

import { useState, useEffect, use } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, 
    doc, serverTimestamp, onSnapshot, Timestamp, writeBatch 
} from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Users, FileText, CheckCircle, XCircle, DollarSign, Calendar, AlertCircle, Download, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { downloadPDF } from '@/lib/print-pdf';

interface Owner {
    id: string;
    name: string;
    email?: string;
    properties: { street: string, house: string }[];
    balance?: number;
}

interface ExtraordinaryDebt {
    id: string;
    description: string;
    amountUSD: number;
    createdAt: Timestamp;
    dueDate?: Timestamp;
    status: 'active' | 'closed';
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
    status: 'pending' | 'paid';
    paidAt?: Timestamp;
    paymentId?: string;
}

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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
        'Calle 1': 1,
        'Calle 2': 2,
        'Calle 3': 3,
        'Calle 4': 4,
        'Calle 5': 5,
        'Calle 6': 6,
        'Calle 7': 7,
        'Calle 8': 8
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
    const [activeCampaign, setActiveCampaign] = useState<ExtraordinaryDebt | null>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        description: '',
        amountUSD: '',
        dueDate: ''
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

    // Cargar campaña activa y deudas
    useEffect(() => {
        if (!condoId) return;
        
        const campaignQuery = query(
            collection(db, 'condominios', condoId, 'extraordinary_campaigns'),
            where('status', '==', 'active')
        );
        const unsubCampaign = onSnapshot(campaignQuery, (snap) => {
            if (!snap.empty) {
                setActiveCampaign({ id: snap.docs[0].id, ...snap.docs[0].data() } as ExtraordinaryDebt);
            } else {
                setActiveCampaign(null);
            }
        });
        
        const debtsQuery = query(
            collection(db, 'condominios', condoId, 'owner_extraordinary_debts')
        );
        const unsubDebts = onSnapshot(debtsQuery, (snap) => {
            const debtsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OwnerExtraordinaryDebt));
            setExtraordinaryDebts(debtsData);
        });
        
        return () => {
            unsubCampaign();
            unsubDebts();
        };
    }, [condoId]);

    // Obtener propietarios con sus propiedades ordenadas
    const getSortedOwnersWithProperties = () => {
        const ownersWithProps = owners.map(owner => ({
            ...owner,
            sortedProperties: sortProperties(owner.properties || [])
        }));
        
        // Ordenar todos los propietarios por su primera propiedad
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
            const dueDate = formData.dueDate ? new Date(formData.dueDate) : null;
            
            const campaignRef = await addDoc(collection(db, 'condominios', condoId, 'extraordinary_campaigns'), {
                description: formData.description.toUpperCase(),
                amountUSD,
                dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
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
            setFormData({ description: '', amountUSD: '', dueDate: '' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la cuota extraordinaria.' });
        } finally {
            setLoading(false);
        }
    };

    const handleCloseCampaign = async () => {
        if (!activeCampaign) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, 'condominios', condoId, 'extraordinary_campaigns', activeCampaign.id), {
                status: 'closed'
            });
            toast({ title: 'Campaña cerrada', description: 'No se pueden registrar más pagos para esta cuota.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error' });
        } finally {
            setLoading(false);
        }
    };

    const generateMorososReport = async () => {
        const sortedOwners = getSortedOwnersWithProperties();
        const pendingDebts: { owner: Owner, debt: OwnerExtraordinaryDebt | null, index: number }[] = [];
        let counter = 1;
        
        for (const owner of sortedOwners) {
            const debt = extraordinaryDebts.find(d => d.ownerId === owner.id && d.status === 'pending');
            if (debt || (owner.properties?.length > 0)) {
                pendingDebts.push({ owner, debt: debt || null, index: counter });
                counter++;
            }
        }
        
        const html = generateReportHTML(pendingDebts, 'MOROSOS');
        downloadPDF(html, `Reporte_Morosos_Extraordinario_${format(new Date(), 'yyyy_MM_dd')}.pdf`);
    };

    const generatePagadosReport = async () => {
        const sortedOwners = getSortedOwnersWithProperties();
        const paidDebts: { owner: Owner, debt: OwnerExtraordinaryDebt | null, index: number }[] = [];
        let counter = 1;
        
        for (const owner of sortedOwners) {
            const debt = extraordinaryDebts.find(d => d.ownerId === owner.id && d.status === 'paid');
            if (debt) {
                paidDebts.push({ owner, debt, index: counter });
                counter++;
            }
        }
        
        const html = generateReportHTML(paidDebts, 'PAGADOS');
        downloadPDF(html, `Reporte_Pagados_Extraordinario_${format(new Date(), 'yyyy_MM_dd')}.pdf`);
    };

    const generateReportHTML = (items: { owner: Owner, debt: OwnerExtraordinaryDebt | null, index: number }[], type: string) => {
        const totalUSD = items.reduce((sum, item) => sum + (item.debt?.amountUSD || 0), 0);
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reporte Cuota Extraordinaria - ${type}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Helvetica', Arial, sans-serif; margin: 20px; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #F28705; padding-bottom: 15px; }
                    .header h1 { color: #1e293b; font-size: 24px; }
                    .summary { margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; }
                    table { width: 100%; border-collapse: collapse; }
                    th { background: #1A1D23; color: white; padding: 10px; text-align: center; }
                    td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; }
                    .text-left { text-align: left; }
                    .text-right { text-align: right; }
                    .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>CUOTA EXTRAORDINARIA - ${type}</h1>
                    <p>Generado: ${new Date().toLocaleString('es-VE')}</p>
                </div>
                <div class="summary">
                    <p><strong>Total ${type === 'MOROSOS' ? 'Adeudado' : 'Recaudado'}:</strong> $${formatUSD(totalUSD)}</p>
                    <p><strong>Cantidad de propietarios:</strong> ${items.length}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th class="text-left">Propietario</th>
                            <th class="text-left">Propiedad</th>
                            <th class="text-right">Monto (USD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${item.index}</td>
                                <td class="text-left">${item.owner.name}</td>
                                <td class="text-left">${item.debt?.property || (item.owner.properties?.[0] ? `${item.owner.properties[0].street} - ${item.owner.properties[0].house}` : 'N/A')}</td>
                                <td class="text-right">$${formatUSD(item.debt?.amountUSD || 0)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="footer"><p>EFASCondoSys - Sistema de Gestión de Condominios</p></div>
            </body>
            </html>
        `;
    };

    const pendingCount = extraordinaryDebts.filter(d => d.status === 'pending').length;
    const paidCount = extraordinaryDebts.filter(d => d.status === 'paid').length;
    const totalPendingUSD = extraordinaryDebts.filter(d => d.status === 'pending').reduce((s, d) => s + d.amountUSD, 0);
    const totalPaidUSD = extraordinaryDebts.filter(d => d.status === 'paid').reduce((s, d) => s + d.amountUSD, 0);
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
                        disabled={!!activeCampaign}
                        className="rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 px-6 italic"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Nueva Cuota Extraordinaria
                    </Button>
                </div>
            </div>

            {/* CAMPAÑA ACTIVA */}
            {activeCampaign && (
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-r from-primary/20 to-primary/5 overflow-hidden border border-primary/20">
                    <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="bg-primary/30 p-3 rounded-2xl">
                                    <AlertCircle className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-primary tracking-widest">Campaña Activa</p>
                                    <p className="font-black text-white text-lg uppercase">{activeCampaign.description}</p>
                                    <p className="text-[10px] text-white/60">Monto: ${formatUSD(activeCampaign.amountUSD)} USD</p>
                                </div>
                            </div>
                            <Button 
                                onClick={handleCloseCampaign}
                                disabled={loading}
                                variant="outline"
                                className="rounded-xl border-red-500/30 text-red-400 font-black uppercase text-[10px] hover:bg-red-500/10"
                            >
                                <XCircle className="mr-2 h-4 w-4" /> Cerrar Campaña
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* TARJETAS DE RESUMEN */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                    <CardContent className="p-6">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total Propietarios</p>
                        <p className="text-3xl font-black text-white italic mt-1">{owners.length}</p>
                    </CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                    <CardContent className="p-6">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Pendientes</p>
                        <p className="text-3xl font-black text-yellow-400 italic mt-1">{pendingCount}</p>
                        <p className="text-[8px] text-white/40">${formatUSD(totalPendingUSD)} USD</p>
                    </CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                    <CardContent className="p-6">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Pagados</p>
                        <p className="text-3xl font-black text-emerald-400 italic mt-1">{paidCount}</p>
                        <p className="text-[8px] text-white/40">${formatUSD(totalPaidUSD)} USD</p>
                    </CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                    <CardContent className="p-6">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Recaudación</p>
                        <p className="text-3xl font-black text-emerald-400 italic mt-1">${formatUSD(totalPaidUSD)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* BOTONES DE REPORTES */}
            <div className="flex flex-wrap gap-4">
                <Button 
                    onClick={generateMorososReport}
                    variant="outline"
                    className="rounded-xl border-yellow-500/30 text-yellow-400 font-black uppercase text-[10px] bg-yellow-500/5 hover:bg-yellow-500/10"
                >
                    <FileText className="mr-2 h-4 w-4" /> Reporte de Morosos
                </Button>
                <Button 
                    onClick={generatePagadosReport}
                    variant="outline"
                    className="rounded-xl border-emerald-500/30 text-emerald-400 font-black uppercase text-[10px] bg-emerald-500/5 hover:bg-emerald-500/10"
                >
                    <FileText className="mr-2 h-4 w-4" /> Reporte de Pagados
                </Button>
                <Button 
                    onClick={() => router.push(`/${condoId}/admin/extraordinary-fund`)}
                    variant="outline"
                    className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10"
                >
                    <DollarSign className="mr-2 h-4 w-4" /> Ver Libro Diario
                </Button>
            </div>

            {/* TABLA DE DEUDAS ORDENADA POR CALLE Y CASA */}
            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                <CardHeader className="bg-gradient-to-r from-white/5 to-transparent p-6 border-b border-white/5">
                    <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" /> Estado de Pagos por Propietario
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-800/30">
                                <TableRow className="border-white/5">
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">#</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Propietario</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Propiedad</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Monto (USD)</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">Estado</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-400 pr-8">Fecha Pago</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedOwners.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-40 text-center text-slate-500 font-bold italic uppercase text-[10px]">
                                            No hay propietarios registrados
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sortedOwners.map((owner, idx) => {
                                        const debt = extraordinaryDebts.find(d => d.ownerId === owner.id);
                                        const propertyStr = owner.sortedProperties[0] 
                                            ? `${owner.sortedProperties[0].street} - ${owner.sortedProperties[0].house}`
                                            : 'Sin propiedad';
                                        return (
                                            <TableRow key={owner.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                                <TableCell className="font-black text-white text-xs italic text-center">{idx + 1}</TableCell>
                                                <TableCell className="font-black text-white text-xs uppercase italic">{owner.name}</TableCell>
                                                <TableCell className="text-[10px] text-white/60">{propertyStr}</TableCell>
                                                <TableCell className="font-black text-white italic">${formatUSD(debt?.amountUSD || 0)}</TableCell>
                                                <TableCell>
                                                    <Badge className={debt?.status === 'paid' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-yellow-500/20 text-yellow-500'}>
                                                        {debt?.status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right text-[10px] text-white/40 pr-8">
                                                    {debt?.paidAt ? format(debt.paidAt.toDate(), 'dd/MM/yyyy') : '-'}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

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
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Fecha Límite (Opcional)</Label>
                            <Input 
                                type="date"
                                value={formData.dueDate}
                                onChange={e => setFormData({...formData, dueDate: e.target.value})}
                                className="rounded-xl bg-slate-800 border-none text-white"
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

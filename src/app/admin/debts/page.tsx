
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Info, ArrowLeft, Search, WalletCards, Calculator, Minus, Equal, FileDown, FileCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, writeBatch, updateDoc, deleteDoc, runTransaction, Timestamp, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { differenceInCalendarMonths, format, addMonths } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


type Owner = {
    id: string;
    name: string;
    house: string;
    street: string;
    balance: number;
    pendingDebtUSD: number;
};

type Debt = {
    id:string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number;
    paymentDate?: Timestamp;
};

type View = 'list' | 'detail';

type MassDebt = {
    description: string;
    amountUSD: number;
    fromMonth: number;
    fromYear: number;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const emptyMassDebt: MassDebt = { 
    description: 'Cuota de Condominio', 
    amountUSD: 25, 
    fromMonth: new Date().getMonth() + 1,
    fromYear: new Date().getFullYear(),
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
];

const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);


export default function DebtManagementPage() {
    const [view, setView] = useState<View>('list');
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isReconciling, setIsReconciling] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRate, setActiveRate] = useState(0);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedOwnerDebts, setSelectedOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    
    const [isMassDebtDialogOpen, setIsMassDebtDialogOpen] = useState(false);
    const [currentMassDebt, setCurrentMassDebt] = useState<MassDebt>(emptyMassDebt);
    
    const [isEditDebtDialogOpen, setIsEditDebtDialogOpen] = useState(false);
    const [debtToEdit, setDebtToEdit] = useState<Debt | null>(null);
    const [currentDebtData, setCurrentDebtData] = useState<{description: string, amountUSD: number | string}>({ description: '', amountUSD: '' });

    const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    
    const { toast } = useToast();

    // Fetch All Owners and their debts
    useEffect(() => {
        setLoading(true);

        const fetchSettingsAndDebts = async () => {
             try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                let currentActiveRate = 0;
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    setCompanyInfo(settings.companyInfo as CompanyInfo);
                    const rates = (settings.exchangeRates || []);
                    const activeRateObj = rates.find((r: any) => r.active);
                    if (activeRateObj) {
                        currentActiveRate = activeRateObj.rate;
                    } else if (rates.length > 0) {
                        const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        currentActiveRate = sortedRates[0].rate;
                    }
                }
                setActiveRate(currentActiveRate);

                const pendingDebtsQuery = query(collection(db, "debts"), where("status", "==", "pending"));
                const pendingDebtsSnapshot = await getDocs(pendingDebtsQuery);
                const debtsByOwner: { [key: string]: number } = {};
                pendingDebtsSnapshot.forEach(doc => {
                    const debt = doc.data();
                    debtsByOwner[debt.ownerId] = (debtsByOwner[debt.ownerId] || 0) + debt.amountUSD;
                });
                return debtsByOwner;

            } catch (error) {
                console.error("Error fetching settings or debts:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar datos críticos.' });
                return {};
            }
        };

        fetchSettingsAndDebts().then(debtsByOwner => {
            const ownersQuery = query(collection(db, "owners"));
            const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
                const ownersData: Owner[] = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        name: data.name, 
                        house: (data.properties && data.properties.length > 0) ? data.properties[0].house : data.house,
                        street: (data.properties && data.properties.length > 0) ? data.properties[0].street : data.street,
                        balance: data.balance || 0,
                        pendingDebtUSD: debtsByOwner[doc.id] || 0,
                    };
                });
                setOwners(ownersData);
                setLoading(false);
            }, (error) => {
                console.error("Error fetching owners:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los propietarios.' });
                setLoading(false);
            });
            
            return () => ownersUnsubscribe();
        });

    }, [toast]);
    
    // Filter owners based on search term
    const filteredOwners = useMemo(() => {
        if (!searchTerm) return owners;
        return owners.filter(owner => 
            owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(owner.house).toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, owners]);

    // Fetch Debts for selected owner when view changes to 'detail'
    useEffect(() => {
        if (view !== 'detail' || !selectedOwner) {
            setSelectedOwnerDebts([]);
            return;
        }

        setLoadingDebts(true);
        const q = query(collection(db, "debts"), where("ownerId", "==", selectedOwner.id));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const debtsData: Debt[] = [];
            querySnapshot.forEach((doc) => {
                debtsData.push({ id: doc.id, ...doc.data() } as Debt);
            });
            setSelectedOwnerDebts(debtsData.sort((a,b) => b.year - a.year || b.month - a.month));
            setLoadingDebts(false);
        }, (error) => {
            console.error("Error fetching owner debts:", error);
            setLoadingDebts(false);
        });

        return () => unsubscribe();
    }, [view, selectedOwner]);
    
    // Moved from detail view to top level
    const paymentCalculator = useMemo(() => {
        if (!selectedOwner) return { totalSelectedBs: 0, balanceInFavor: 0, totalToPay: 0, hasSelection: false };

        const pendingDebts = selectedOwnerDebts.filter(d => d.status === 'pending');
        const totalSelectedDebtUSD = pendingDebts
            .filter(debt => selectedOwnerDebts.some(d => d.id === debt.id)) // This logic seems redundant, all pendingDebts are in selectedOwnerDebts
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
            
        const totalSelectedDebtBs = totalSelectedDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalSelectedDebtBs - selectedOwner.balance);

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: selectedOwner.balance,
            totalToPay: totalToPay,
            hasSelection: pendingDebts.length > 0,
        };
    }, [selectedOwnerDebts, activeRate, selectedOwner]);


    const handleManageOwnerDebts = (owner: Owner) => {
        setSelectedOwner(owner);
        setView('detail');
    };

    const handleAddMassiveDebt = () => {
        if (!selectedOwner) return;
        const today = new Date();
        setCurrentMassDebt({
             ...emptyMassDebt,
             fromMonth: today.getMonth() + 1,
             fromYear: today.getFullYear(),
        });
        setIsMassDebtDialogOpen(true);
    };

    const handleEditDebt = (debt: Debt) => {
        setDebtToEdit(debt);
        setCurrentDebtData({ description: debt.description, amountUSD: debt.amountUSD });
        setIsEditDebtDialogOpen(true);
    };
    
    const handleDeleteDebt = (debt: Debt) => {
        setDebtToDelete(debt);
        setIsDeleteConfirmationOpen(true);
    }
    
    const confirmDelete = async () => {
        if (!debtToDelete || !selectedOwner) return;

        try {
            const ownerRef = doc(db, "owners", selectedOwner.id);
            const debtRef = doc(db, "debts", debtToDelete.id);
            
            await runTransaction(db, async (transaction) => {
                const ownerDoc = await transaction.get(ownerRef);
                
                if (!ownerDoc.exists()) throw "El documento del propietario no existe.";

                if (debtToDelete.status === 'paid') {
                     const currentBalanceBs = ownerDoc.data().balance || 0;
                     if(activeRate > 0) {
                        const debtAmountBs = debtToDelete.amountUSD * activeRate;
                        const newBalanceBs = currentBalanceBs + debtAmountBs;
                        transaction.update(ownerRef, { balance: newBalanceBs });
                     } else {
                        throw "No hay una tasa de cambio activa para recalcular el saldo.";
                     }
                }
                
                transaction.delete(debtRef);
            });

            toast({ title: 'Deuda Eliminada', description: 'La deuda ha sido eliminada y el saldo del propietario ha sido actualizado si correspondía.' });

        } catch (error) {
            console.error("Error deleting debt: ", error);
            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : 'No se pudo eliminar la deuda.');
            toast({ variant: 'destructive', title: 'Error', description: errorMessage });
        } finally {
            setIsDeleteConfirmationOpen(false);
            setDebtToDelete(null);
        }
    }

    const handleSaveMassDebt = async () => {
        if (!selectedOwner) return;
        if (!currentMassDebt.description || currentMassDebt.amountUSD <= 0) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: 'La descripción y un monto mayor a cero son obligatorios.' });
            return;
        }
    
        const { fromMonth, fromYear, amountUSD, description } = currentMassDebt;
        const startDate = new Date(fromYear, fromMonth - 1, 1);
        const endDate = new Date();
    
        if (startDate > endDate) {
            toast({ variant: 'destructive', title: 'Error de Fecha', description: 'La fecha "Desde" no puede ser futura.' });
            return;
        }
    
        const monthsToGenerate = differenceInCalendarMonths(endDate, startDate) + 1;
    
        try {
            const ownerRef = doc(db, "owners", selectedOwner.id);
            if(activeRate === 0) throw "No hay una tasa de cambio activa o registrada configurada.";

            await runTransaction(db, async (transaction) => {
                const ownerDoc = await transaction.get(ownerRef);
                if (!ownerDoc.exists()) throw "El documento del propietario no existe.";
                
                let currentBalanceBs = ownerDoc.data().balance || 0;
    
                for (let i = 0; i < monthsToGenerate; i++) {
                    const debtDate = addMonths(startDate, i);
                    const debtYear = debtDate.getFullYear();
                    const debtMonth = debtDate.getMonth() + 1;
                    
                    const debtData: any = {
                        ownerId: selectedOwner.id,
                        year: debtYear,
                        month: debtMonth,
                        amountUSD: amountUSD,
                        description: description,
                        status: 'pending'
                    };

                    const existingDebtQuery = query(collection(db, 'debts'), 
                        where('ownerId', '==', selectedOwner.id),
                        where('year', '==', debtYear),
                        where('month', '==', debtMonth)
                    );
                    const existingDebtSnapshot = await getDocs(existingDebtQuery);
                    
                    if (existingDebtSnapshot.empty) {
                        const debtAmountBs = amountUSD * activeRate;
                        if (currentBalanceBs >= debtAmountBs) {
                            currentBalanceBs -= debtAmountBs;
                            debtData.status = 'paid';
                            debtData.paidAmountUSD = amountUSD;
                            debtData.paymentDate = Timestamp.now();
                        }
                        
                        const debtRef = doc(collection(db, "debts"));
                        transaction.set(debtRef, debtData);
                    }
                }
    
                transaction.update(ownerRef, { balance: currentBalanceBs });
            });
    
            toast({ title: 'Deudas Generadas', description: `Se procesaron ${monthsToGenerate} meses de deuda. El saldo del propietario fue actualizado.` });
    
        } catch (error) {
            console.error("Error generating mass debts: ", error);
            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : 'No se pudieron guardar las deudas.');
            toast({ variant: 'destructive', title: 'Error en la Transacción', description: errorMessage });
        } finally {
            setIsMassDebtDialogOpen(false);
            setCurrentMassDebt(emptyMassDebt);
        }
    };
    
    const handleSaveSingleDebt = async () => {
        if (!debtToEdit || !currentDebtData.description || Number(currentDebtData.amountUSD) <= 0) {
             toast({ variant: 'destructive', title: 'Error de Validación', description: 'La descripción y un monto mayor a cero son obligatorios.' });
            return;
        }

        try {
            const debtRef = doc(db, "debts", debtToEdit.id);
            await updateDoc(debtRef, {
                description: currentDebtData.description,
                amountUSD: Number(currentDebtData.amountUSD)
            });
            toast({ title: 'Deuda Actualizada', description: `La deuda ha sido actualizada exitosamente.` });
        } catch (error) {
            console.error("Error updating debt: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la deuda.' });
        } finally {
            setIsEditDebtDialogOpen(false);
            setDebtToEdit(null);
        }
    };

    const handleMassDebtInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setCurrentMassDebt({ 
            ...currentMassDebt, 
            [id]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
        });
    };
    
    const handleMassDebtSelectChange = (field: 'fromYear' | 'fromMonth') => (value: string) => {
        setCurrentMassDebt({ ...currentMassDebt, [field]: parseInt(value) });
    };

    const periodDescription = useMemo(() => {
        const { fromMonth, fromYear } = currentMassDebt;
        const startDate = new Date(fromYear, fromMonth - 1, 1);
        const endDate = new Date();
        if (startDate > endDate) return "La fecha de inicio no puede ser futura.";
        const monthsCount = differenceInCalendarMonths(endDate, startDate) + 1;
        const fromDateStr = months.find(m => m.value === fromMonth)?.label + ` ${fromYear}`;
        const toDateStr = months.find(m => m.value === endDate.getMonth() + 1)?.label + ` ${endDate.getFullYear()}`;
        return `Se generarán ${monthsCount} deudas desde ${fromDateStr} hasta ${toDateStr}.`;
    }, [currentMassDebt.fromMonth, currentMassDebt.fromYear]);

    const handleExportPDF = () => {
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) {
            doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        }
        if (companyInfo) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(companyInfo.name, margin + 30, margin + 8);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`${companyInfo.rif} | ${companyInfo.phone}`, margin + 30, margin + 14);
            doc.text(companyInfo.address, margin + 30, margin + 19);
        }
        doc.setFontSize(10);
        doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setLineWidth(0.5);
        doc.line(margin, margin + 32, pageWidth - margin, margin + 32);
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text("Lista de Deudas de Propietarios", pageWidth / 2, margin + 45, { align: 'center' });

        (doc as any).autoTable({
            head: [['Propietario', 'Ubicación', 'Deuda Pendiente (Bs.)', 'Saldo a Favor (Bs.)']],
            body: filteredOwners.map(o => {
                const debtDisplay = o.pendingDebtUSD > 0 ? `Bs. ${(o.pendingDebtUSD * activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : 'Bs. 0,00';
                const balanceDisplay = o.balance > 0 ? `Bs. ${o.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : 'Bs. 0,00';
                return [o.name, `${o.street} - ${o.house}`, debtDisplay, balanceDisplay];
            }),
            startY: margin + 55,
            headStyles: { fillColor: [30, 80, 180] },
            styles: { cellPadding: 2, fontSize: 8 },
        });

        doc.save('lista_deudas_propietarios.pdf');
    };

    const handleReconcileAll = async () => {
        setIsReconciling(true);
        toast({ title: 'Iniciando conciliación...', description: 'Este proceso puede tardar unos minutos.' });

        try {
            const ownersWithBalanceQuery = query(collection(db, 'owners'), where('balance', '>', 0));
            const ownersSnapshot = await getDocs(ownersWithBalanceQuery);
            let reconciledCount = 0;
            const reconciliationDate = Timestamp.now();

            for (const ownerDoc of ownersSnapshot.docs) {
                const owner = { id: ownerDoc.id, ...ownerDoc.data() } as Owner;
                let availableBalance = owner.balance;
                if (activeRate === 0) throw new Error("Tasa de cambio no disponible.");

                await runTransaction(db, async (transaction) => {
                    const debtsQuery = query(
                        collection(db, 'debts'),
                        where('ownerId', '==', owner.id),
                        where('status', '==', 'pending'),
                        orderBy('year', 'asc'),
                        orderBy('month', 'asc')
                    );
                    const debtsSnapshot = await transaction.get(debtsQuery);
                    if (debtsSnapshot.empty) return;

                    let debtsPaidInTx = 0;
                    const debtsToUpdate: { ref: any, data: any }[] = [];

                    for (const debtDoc of debtsSnapshot.docs) {
                        const debt = { id: debtDoc.id, ...debtDoc.data() } as Debt;
                        const debtAmountBs = debt.amountUSD * activeRate;
                        if (availableBalance >= debtAmountBs) {
                            availableBalance -= debtAmountBs;
                            debtsPaidInTx += debtAmountBs;
                            debtsToUpdate.push({
                                ref: doc(db, 'debts', debt.id),
                                data: { status: 'paid', paidAmountUSD: debt.amountUSD, paymentDate: reconciliationDate }
                            });
                        } else {
                            break;
                        }
                    }

                    if (debtsToUpdate.length > 0) {
                        debtsToUpdate.forEach(d => transaction.update(d.ref, d.data));
                        const ownerRef = doc(db, 'owners', owner.id);
                        transaction.update(ownerRef, { balance: availableBalance });
                        reconciledCount++;

                        const paymentRef = doc(collection(db, "payments"));
                        transaction.set(paymentRef, {
                            reportedBy: 'admin',
                            beneficiaries: [{ ownerId: owner.id, house: owner.house, amount: debtsPaidInTx }],
                            totalAmount: debtsPaidInTx,
                            exchangeRate: activeRate,
                            paymentDate: reconciliationDate,
                            reportedAt: reconciliationDate,
                            paymentMethod: 'conciliacion',
                            bank: 'Sistema',
                            reference: `CONC-${reconciliationDate.toMillis()}`,
                            status: 'aprobado',
                            observations: 'Conciliación Automática por Saldo a Favor',
                        });
                    }
                });
            }
             toast({
                title: 'Conciliación Completada',
                description: `Se conciliaron las cuentas de ${reconciledCount} propietarios.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

        } catch (error) {
             console.error("Error during reconciliation: ", error);
             const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
             toast({ variant: 'destructive', title: 'Error de Conciliación', description: errorMessage });
        } finally {
             setIsReconciling(false);
        }
    };


    if (loading) {
         return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    // Main List View
    if (view === 'list') {
        return (
            <div className="space-y-8">
                 <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Deudas</h1>
                    <p className="text-muted-foreground">Busque un propietario para ver o registrar sus deudas.</p>
                </div>
                 <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center gap-2 flex-wrap">
                            <CardTitle>Lista de Propietarios</CardTitle>
                            <div className="flex gap-2">
                                <Button onClick={handleReconcileAll} variant="outline" disabled={isReconciling}>
                                    {isReconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileCog className="mr-2 h-4 w-4" />}
                                    Conciliar Saldos y Deudas
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline">
                                            <FileDown className="mr-2 h-4 w-4" />
                                            Exportar
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onClick={handleExportPDF}>Exportar a PDF</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                        <div className="relative mt-2">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                             <Input 
                                placeholder="Buscar por nombre o casa..." 
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                             />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Propietario</TableHead>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead>Deuda Pendiente (Bs.)</TableHead>
                                    <TableHead>Saldo a Favor (Bs.)</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                     <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                             <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOwners.length === 0 ? (
                                     <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                <Info className="h-8 w-8" />
                                                <span>No se encontraron propietarios.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOwners.map((owner) => (
                                        <TableRow key={owner.id}>
                                            <TableCell className="font-medium">{owner.name}</TableCell>
                                            <TableCell>{owner.street} - {owner.house}</TableCell>
                                            <TableCell>
                                               {owner.pendingDebtUSD > 0 ? (
                                                    <Badge variant="destructive">
                                                        Bs. {(owner.pendingDebtUSD * activeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">Bs. 0,00</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                               {owner.balance > 0 ? (
                                                    <Badge variant="success">
                                                        Bs. {owner.balance.toLocaleString('es-VE', {minimumFractionDigits: 2})}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">Bs. 0,00</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleManageOwnerDebts(owner)}>
                                                    Gestionar Deudas <WalletCards className="ml-2 h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    // Detail View
    if (view === 'detail' && selectedOwner) {
        const pendingDebts = selectedOwnerDebts.filter(d => d.status === 'pending').sort((a,b) => a.year - b.year || a.month - b.month);
        const paidDebts = selectedOwnerDebts.filter(d => d.status === 'paid').sort((a,b) => b.year - a.year || b.month - a.month);
        
        return (
            <div className="space-y-8">
                 <Button variant="outline" onClick={() => setView('list')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a la Lista
                </Button>

                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Deudas de: <span className="text-primary">{selectedOwner.name}</span></CardTitle>
                            <CardDescription>Ubicación: {selectedOwner.street} - {selectedOwner.house}</CardDescription>
                        </div>
                        <Button onClick={handleAddMassiveDebt}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Agregar Deuda Masiva
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Período</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead>Monto (Bs.)</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingDebts ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : selectedOwnerDebts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                <Info className="h-8 w-8" />
                                                <span>Este propietario no tiene deudas registradas.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    <>
                                        {pendingDebts.map((debt) => (
                                            <TableRow key={debt.id}>
                                                <TableCell className="font-medium">{months.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
                                                <TableCell>{debt.description}</TableCell>
                                                <TableCell>Bs. {(debt.amountUSD * activeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                                <TableCell className="capitalize">
                                                    <Badge variant={'warning'}>Pendiente</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Abrir menú</span><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => handleEditDebt(debt)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleDeleteDebt(debt)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {paidDebts.map((debt) => (
                                            <TableRow key={debt.id} className="text-muted-foreground">
                                                <TableCell className="font-medium">{months.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
                                                <TableCell>{debt.description}</TableCell>
                                                <TableCell>Bs. {(debt.amountUSD * activeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                                <TableCell className="capitalize">
                                                    <Badge variant={'success'}>Pagada</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Abrir menú</span><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => handleEditDebt(debt)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleDeleteDebt(debt)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                    <CardFooter className="p-4 bg-muted/50 border-t">
                        {paymentCalculator.hasSelection && (
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
                        )}
                    </CardFooter>
                </Card>

                 {/* Mass Debt Dialog */}
                <Dialog open={isMassDebtDialogOpen} onOpenChange={setIsMassDebtDialogOpen}>
                    <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Agregar Deudas Masivas</DialogTitle>
                            <DialogDescription>
                                Seleccione la fecha de inicio. El sistema generará todas las deudas desde esa fecha hasta hoy.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-grow overflow-y-auto pr-6 -mr-6">
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="description">Descripción</Label>
                                    <Input id="description" value={currentMassDebt.description} onChange={handleMassDebtInputChange} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="fromYear">Desde el Año</Label>
                                        <Select onValueChange={handleMassDebtSelectChange('fromYear')} value={String(currentMassDebt.fromYear)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="fromMonth">Desde el Mes</Label>
                                        <Select onValueChange={handleMassDebtSelectChange('fromMonth')} value={String(currentMassDebt.fromMonth)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="amountUSD">Monto Mensual (USD)</Label>
                                    <Input id="amountUSD" type="number" value={currentMassDebt.amountUSD} onChange={handleMassDebtInputChange} placeholder="25.00" />
                                </div>
                                <Card className="bg-muted/50">
                                    <CardContent className="p-4 text-sm text-muted-foreground">
                                        <Info className="inline h-4 w-4 mr-2"/>
                                        {periodDescription}
                                        <p className="text-xs mt-2">Si el propietario tiene saldo a favor, se usará para pagar estas nuevas deudas automáticamente.</p>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                        <DialogFooter className="mt-auto pt-4 border-t">
                            <Button variant="outline" onClick={() => setIsMassDebtDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveMassDebt}>Generar Deudas</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Edit Debt Dialog */}
                <Dialog open={isEditDebtDialogOpen} onOpenChange={setIsEditDebtDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Editar Deuda</DialogTitle>
                             <DialogDescription>
                                Modifique la descripción o el monto de la deuda para {debtToEdit ? `${months.find(m => m.value === debtToEdit.month)?.label} ${debtToEdit.year}` : ''}.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-description">Descripción</Label>
                                <Input 
                                    id="edit-description" 
                                    value={currentDebtData.description} 
                                    onChange={(e) => setCurrentDebtData({...currentDebtData, description: e.target.value })} 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-amountUSD">Monto (USD)</Label>
                                <Input 
                                    id="edit-amountUSD" 
                                    type="number" 
                                    value={currentDebtData.amountUSD} 
                                    onChange={(e) => setCurrentDebtData({...currentDebtData, amountUSD: e.target.value })} 
                                    placeholder="25.00" 
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsEditDebtDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveSingleDebt}>Guardar Cambios</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>¿Está seguro?</DialogTitle>
                            <DialogDescription>
                                Esta acción no se puede deshacer. Esto eliminará permanentemente la deuda y ajustará el saldo del propietario si la deuda ya estaba pagada.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                            <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }
    
    // Fallback while loading or if view is invalid
    return null;
}

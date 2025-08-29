
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Info, Calculator, Minus, Equal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';

type Owner = {
    id: string;
    name: string;
    house: string;
    street: string;
    balance: number;
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, 'label': 'Agosto' }, { value: 9, 'label': 'Septiembre' },
    { value: 10, 'label': 'Octubre' }, { value: 11, 'label': 'Noviembre' }, { value: 12, 'label': 'Diciembre' }
];

export default function PaymentCalculatorPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRate, setActiveRate] = useState(0);

    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedOwnerDebts, setSelectedOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);

    const { toast } = useToast();

    useEffect(() => {
        const fetchPrerequisites = async () => {
            setLoading(true);
            try {
                // Fetch settings for active rate
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    const rates = settings.exchangeRates || [];
                    const activeRateObj = rates.find((r: any) => r.active);
                    if (activeRateObj) {
                        setActiveRate(activeRateObj.rate);
                    } else if (rates.length > 0) {
                        const sortedRates = [...rates].sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        setActiveRate(sortedRates[0].rate);
                    }
                }

                // Fetch all owners for search
                const ownersQuery = query(collection(db, "owners"));
                const ownersSnapshot = await getDocs(ownersQuery);
                const ownersData: Owner[] = ownersSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        name: data.name, 
                        house: (data.properties && data.properties.length > 0) ? data.properties[0].house : data.house,
                        street: (data.properties && data.properties.length > 0) ? data.properties[0].street : data.street,
                        balance: data.balance || 0,
                    };
                });
                setOwners(ownersData);

            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los datos necesarios.' });
            } finally {
                setLoading(false);
            }
        };
        fetchPrerequisites();
    }, [toast]);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(owner => 
            owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(owner.house).toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, owners]);

    const handleSelectOwner = async (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
        setLoadingDebts(true);
        setSelectedDebts([]);

        try {
            const q = query(
                collection(db, "debts"), 
                where("ownerId", "==", owner.id),
                where("status", "==", "pending")
            );
            const querySnapshot = await getDocs(q);
            const debtsData: Debt[] = [];
            querySnapshot.forEach((doc) => {
                debtsData.push({ id: doc.id, ...doc.data() } as Debt);
            });
            setSelectedOwnerDebts(debtsData.sort((a, b) => a.year - b.year || a.month - b.month));
        } catch (error) {
            console.error("Error fetching owner debts:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las deudas del propietario.' });
        } finally {
            setLoadingDebts(false);
        }
    };
    
    const handleDebtSelection = (debtId: string) => {
        setSelectedDebts(prev => 
            prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]
        );
    };

    const paymentCalculator = useMemo(() => {
        if (!selectedOwner) return { totalSelectedBs: 0, balanceInFavor: 0, totalToPay: 0, hasSelection: false };
        
        const totalSelectedDebtUSD = selectedOwnerDebts
            .filter(debt => selectedDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
            
        const totalSelectedDebtBs = totalSelectedDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalSelectedDebtBs - selectedOwner.balance);

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: selectedOwner.balance,
            totalToPay: totalToPay,
            hasSelection: selectedDebts.length > 0,
        };
    }, [selectedDebts, selectedOwnerDebts, activeRate, selectedOwner]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Calculadora de Pagos</h1>
                <p className="text-muted-foreground">Busque un propietario para calcular el monto a pagar de sus deudas pendientes.</p>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Buscar Propietario</CardTitle>
                    <div className="relative mt-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar por nombre o casa (mínimo 3 caracteres)..." 
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                        <div className="border rounded-md max-h-60 overflow-y-auto">
                            {filteredOwners.map(owner => (
                                <div key={owner.id} onClick={() => handleSelectOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                    <p className="font-medium">{owner.name}</p>
                                    <p className="text-sm text-muted-foreground">{owner.street} - {owner.house}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {selectedOwner && (
                <Card>
                    <CardHeader>
                        <CardTitle>Deudas Pendientes de: <span className="text-primary">{selectedOwner.name}</span></CardTitle>
                        <CardDescription>Seleccione las deudas que desea incluir en el cálculo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px] text-center">Pagar</TableHead>
                                    <TableHead>Período</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingDebts ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : selectedOwnerDebts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                <Info className="h-8 w-8" />
                                                <span>Este propietario no tiene deudas pendientes.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    selectedOwnerDebts.map((debt) => (
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
                                            <TableCell className="text-right">Bs. {(debt.amountUSD * activeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                    {paymentCalculator.hasSelection && (
                        <CardFooter className="p-4 bg-muted/50 border-t flex-col items-end">
                            <div className="w-full max-w-md space-y-2">
                                <h3 className="text-lg font-semibold flex items-center"><Calculator className="mr-2 h-5 w-5"/> Resumen de Pago</h3>
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Total Seleccionado:</span>
                                    <span className="font-medium">Bs. {paymentCalculator.totalSelectedBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                    <span className="font-medium text-success">Bs. {paymentCalculator.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                                <hr className="my-1"/>
                                <div className="flex justify-between items-center text-lg">
                                    <span className="font-bold flex items-center"><Equal className="mr-2 h-4 w-4"/> TOTAL A PAGAR:</span>
                                    <span className="font-bold text-primary">Bs. {paymentCalculator.totalToPay.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                            </div>
                             <div className="flex gap-2 mt-4">
                                <Button variant="outline">Generar Recibo Proforma</Button>
                                <Button>Registrar Pago</Button>
                            </div>
                        </CardFooter>
                    )}
                </Card>
            )}
        </div>
    );
}

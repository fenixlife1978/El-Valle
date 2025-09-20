
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Loader2, CalendarPlus, Info, Check, Search, XCircle } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, writeBatch, Timestamp, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

type Owner = {
    id: string;
    name: string;
    properties: { street: string; house: string }[];
};

const months = Array.from({ length: 12 }, (_, i) => {
    const date = addMonths(new Date(), i);
    return {
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy', { locale: es }),
    };
});

export default function AdvancePaymentPage() {
    const { toast } = useToast();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Form State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [monthlyAmount, setMonthlyAmount] = useState('');
    const [observations, setObservations] = useState('');

    const totalAmount = useMemo(() => {
        const amount = parseFloat(monthlyAmount);
        if (isNaN(amount) || amount <= 0 || selectedMonths.length === 0) {
            return 0;
        }
        return amount * selectedMonths.length;
    }, [monthlyAmount, selectedMonths]);

    useEffect(() => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name,
                    properties: data.properties || []
                };
            });
            setOwners(ownersData.sort((a, b) => a.name.localeCompare(b.name)));
        });

        return () => {
            ownersUnsubscribe();
        };
    }, []);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(owner =>
            owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            owner.properties.some(p => `${p.street} - ${p.house}`.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [searchTerm, owners]);

    const handleOwnerSelect = (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
    };
    
    const resetOwnerSelection = () => {
        setSelectedOwner(null);
        setSearchTerm('');
    };

    const handleMonthToggle = (monthValue: string) => {
        setSelectedMonths(prev =>
            prev.includes(monthValue)
                ? prev.filter(m => m !== monthValue)
                : [...prev, monthValue]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const monthlyAmountNum = parseFloat(monthlyAmount);
        if (!selectedOwner || selectedMonths.length === 0 || isNaN(monthlyAmountNum) || monthlyAmountNum <= 0) {
            toast({
                variant: 'destructive',
                title: 'Datos Incompletos',
                description: 'Debe seleccionar un propietario, al menos un mes y un monto de cuota válido.',
            });
            return;
        }

        setLoading(true);

        try {
            // Check for existing debts for the selected months to prevent duplicates
            const existingDebtsQuery = query(
                collection(db, "debts"),
                where("ownerId", "==", selectedOwner.id),
                where("status", "==", "paid"),
                where("description", "==", "Cuota de Condominio (Pagada por adelantado)")
            );
            const existingDebtsSnapshot = await getDocs(existingDebtsQuery);
            const existingPaidMonths = existingDebtsSnapshot.docs.map(d => {
                const data = d.data();
                return `${data.year}-${String(data.month).padStart(2, '0')}`;
            });

            const duplicates = selectedMonths.filter(m => existingPaidMonths.includes(m));
            if (duplicates.length > 0) {
                 const monthLabels = duplicates.map(dup => {
                    const [year, month] = dup.split('-').map(Number);
                    const date = new Date(year, month - 1);
                    return format(date, 'MMMM yyyy', { locale: es });
                }).join(', ');
                toast({
                    variant: 'destructive',
                    title: 'Meses Duplicados',
                    description: `Los meses ${monthLabels} ya han sido pagados por adelantado.`,
                });
                setLoading(false);
                return;
            }

            const batch = writeBatch(db);
            const paymentDate = Timestamp.now();
            
            // 1. Create future 'paid' debt documents for each month
            selectedMonths.forEach(monthStr => {
                const [year, month] = monthStr.split('-').map(Number);
                const debtRef = doc(collection(db, "debts"));
                batch.set(debtRef, {
                    ownerId: selectedOwner.id,
                    property: selectedOwner.properties[0], // Assuming first property for simplicity
                    year,
                    month,
                    amountUSD: monthlyAmountNum,
                    description: "Cuota de Condominio (Pagada por adelantado)",
                    status: 'paid',
                    paymentDate: paymentDate,
                    paidAmountUSD: monthlyAmountNum,
                });
            });
            
            // 2. Create the main payment document with the total amount
            const paymentRef = doc(collection(db, "payments"));
            batch.set(paymentRef, {
                reportedBy: selectedOwner.id, // Admin is reporting on behalf of owner
                beneficiaries: [{ 
                    ownerId: selectedOwner.id, 
                    ownerName: selectedOwner.name,
                    ...selectedOwner.properties[0],
                    amount: totalAmount 
                }],
                beneficiaryIds: [selectedOwner.id],
                totalAmount: totalAmount,
                exchangeRate: 1, // Rate is not relevant as we are paying in USD equivalent
                paymentDate: paymentDate,
                reportedAt: serverTimestamp(),
                paymentMethod: 'adelanto',
                bank: 'N/A',
                reference: `Adelanto ${selectedMonths.join(', ')}`,
                status: 'aprobado', // Advance payments are approved by definition
                observations: observations,
            });

            await batch.commit();

            toast({
                title: 'Adelanto Registrado Exitosamente',
                description: `Se registró el pago de ${selectedMonths.length} meses para ${selectedOwner.name}.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            // Reset form
            setSelectedOwner(null);
            setSelectedMonths([]);
            setMonthlyAmount('');
            setObservations('');
            setSearchTerm('');

        } catch (error) {
            console.error("Error registering advance payment: ", error);
            const errorMessage = error instanceof Error ? error.message : "No se pudo completar la operación.";
            toast({
                variant: 'destructive',
                title: 'Error en la Operación',
                description: errorMessage,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Registrar Pago por Adelantado</h1>
                <p className="text-muted-foreground">Seleccione un propietario y los meses futuros que desea cancelar.</p>
            </div>
            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Detalles del Adelanto</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                             <Label htmlFor="owner-search">1. Propietario</Label>
                            {!selectedOwner ? (
                                <>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="owner-search"
                                            placeholder="Buscar por nombre o casa (mín. 3 caracteres)..."
                                            className="pl-9"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                        <Card className="border rounded-md">
                                            <ScrollArea className="h-48">
                                                {filteredOwners.map(owner => (
                                                    <div key={owner.id} onClick={() => handleOwnerSelect(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                                        <p className="font-medium">{owner.name}</p>
                                                        <p className="text-sm text-muted-foreground">{owner.properties.map(p => `${p.street} - ${p.house}`).join(', ')}</p>
                                                    </div>
                                                ))}
                                            </ScrollArea>
                                        </Card>
                                    )}
                                </>
                            ) : (
                                <Card className="bg-muted/50 p-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-primary">{selectedOwner.name}</p>
                                        <p className="text-sm text-muted-foreground">{selectedOwner.properties.map(p => `${p.street} - ${p.house}`).join(', ')}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={resetOwnerSelection}>
                                        <XCircle className="h-5 w-5 text-destructive"/>
                                    </Button>
                                </Card>
                            )}
                        </div>

                       {selectedOwner && (
                        <>
                            <div className="space-y-2">
                                <Label>2. Meses a Pagar por Adelantado</Label>
                                 <Card className="bg-muted/50 p-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {months.map(month => (
                                            <Button
                                                key={month.value}
                                                type="button"
                                                variant={selectedMonths.includes(month.value) ? 'default' : 'outline'}
                                                className="flex items-center justify-center gap-2 capitalize"
                                                onClick={() => handleMonthToggle(month.value)}
                                            >
                                                {selectedMonths.includes(month.value) && <Check className="h-4 w-4" />}
                                                {month.label}
                                            </Button>
                                        ))}
                                    </div>
                                </Card>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="monthlyAmount">3. Monto de Cuota Pagada por Mes (USD)</Label>
                                    <Input
                                        id="monthlyAmount"
                                        type="number"
                                        value={monthlyAmount}
                                        onChange={(e) => setMonthlyAmount(e.target.value)}
                                        placeholder="25.00"
                                        required
                                    />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="totalAmount">Monto Total a Pagar (USD)</Label>
                                    <Input
                                        id="totalAmount"
                                        type="number"
                                        value={totalAmount.toFixed(2)}
                                        className="font-bold text-lg bg-muted"
                                        readOnly
                                    />
                                    {selectedMonths.length > 0 &&
                                        <p className="text-sm text-muted-foreground">
                                            {selectedMonths.length} {selectedMonths.length > 1 ? 'meses' : 'mes'} seleccionados
                                        </p>
                                    }
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label htmlFor="observations">Observaciones (Opcional)</Label>
                                <Input
                                    id="observations"
                                    value={observations}
                                    onChange={(e) => setObservations(e.target.value)}
                                    placeholder="Ej: Pago realizado por Zelle"
                                />
                            </div>
                        </>
                       )}
                    </CardContent>
                    {selectedOwner && (
                    <CardFooter>
                        <Button type="submit" className="w-full md:w-auto ml-auto" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Guardar Adelanto
                        </Button>
                    </CardFooter>
                    )}
                </Card>
            </form>
        </div>
    );
}

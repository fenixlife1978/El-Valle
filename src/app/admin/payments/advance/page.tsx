
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Loader2, CalendarPlus, Info, Check } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, writeBatch, Timestamp, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addMonths, format, startOfMonth } from 'date-fns';

type Owner = {
    id: string;
    name: string;
    house: string;
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
    const [condoFee, setCondoFee] = useState(0);

    // Form State
    const [selectedOwner, setSelectedOwner] = useState('');
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [totalAmount, setTotalAmount] = useState('');
    const [observations, setObservations] = useState('');

    useEffect(() => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name,
                    house: (data.properties && data.properties.length > 0) ? `${data.properties[0].street} - ${data.properties[0].house}` : 'N/A'
                };
            });
            setOwners(ownersData.sort((a, b) => a.name.localeCompare(b.name)));
        });

        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                setCondoFee(docSnap.data().condoFee || 0);
            }
        });

        return () => {
            ownersUnsubscribe();
            settingsUnsubscribe();
        };
    }, []);

    const handleMonthToggle = (monthValue: string) => {
        setSelectedMonths(prev =>
            prev.includes(monthValue)
                ? prev.filter(m => m !== monthValue)
                : [...prev, monthValue]
        );
    };

    useEffect(() => {
        if (selectedMonths.length > 0 && condoFee > 0) {
            setTotalAmount(String(selectedMonths.length * condoFee));
        } else {
            setTotalAmount('');
        }
    }, [selectedMonths, condoFee]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOwner || selectedMonths.length === 0 || Number(totalAmount) <= 0) {
            toast({
                variant: 'destructive',
                title: 'Datos Incompletos',
                description: 'Debe seleccionar un propietario, al menos un mes y un monto válido.',
            });
            return;
        }

        setLoading(true);

        try {
            const ownerData = owners.find(o => o.id === selectedOwner);
            if (!ownerData) throw new Error("Propietario no encontrado");

            // Check for existing debts for the selected months to prevent duplicates
            const monthsAsDates = selectedMonths.map(m => {
                const [year, month] = m.split('-').map(Number);
                return { year, month };
            });

            const existingDebtsQuery = query(
                collection(db, "debts"),
                where("ownerId", "==", selectedOwner),
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
            const amountPerMonth = parseFloat(totalAmount) / selectedMonths.length;

            // 1. Create future 'paid' debt documents
            selectedMonths.forEach(monthStr => {
                const [year, month] = monthStr.split('-').map(Number);
                const debtRef = doc(collection(db, "debts"));
                batch.set(debtRef, {
                    ownerId: selectedOwner,
                    year,
                    month,
                    amountUSD: amountPerMonth,
                    description: "Cuota de Condominio (Pagada por adelantado)",
                    status: 'paid',
                    paymentDate: paymentDate,
                    paidAmountUSD: amountPerMonth,
                });
            });
            
            // 2. Create the main payment document
            const paymentRef = doc(collection(db, "payments"));
            batch.set(paymentRef, {
                reportedBy: selectedOwner, // Admin is reporting on behalf of owner
                beneficiaries: [{ ownerId: selectedOwner, house: ownerData.house, amount: parseFloat(totalAmount) }],
                totalAmount: parseFloat(totalAmount),
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
                description: `Se registró el pago de ${selectedMonths.length} meses para ${ownerData.name}.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            // Reset form
            setSelectedOwner('');
            setSelectedMonths([]);
            setTotalAmount('');
            setObservations('');

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
                            <Label htmlFor="owner-select">1. Propietario</Label>
                            <Select value={selectedOwner} onValueChange={setSelectedOwner} required>
                                <SelectTrigger id="owner-select">
                                    <SelectValue placeholder="Seleccione un propietario..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name} ({o.house})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

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

                        <div className="space-y-2">
                            <Label htmlFor="totalAmount">3. Monto Total a Pagar (USD)</Label>
                            <Input
                                id="totalAmount"
                                type="number"
                                value={totalAmount}
                                onChange={(e) => setTotalAmount(e.target.value)}
                                className="font-bold text-lg"
                                placeholder="0.00"
                                required
                            />
                            {condoFee > 0 && selectedMonths.length > 0 && !totalAmount &&
                                <p className="text-sm text-muted-foreground">
                                    Monto sugerido: {selectedMonths.length} {selectedMonths.length > 1 ? 'meses' : 'mes'} x ${condoFee.toFixed(2)}/mes = ${(selectedMonths.length * condoFee).toFixed(2)}
                                </p>
                            }
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
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full md:w-auto ml-auto" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Guardar Adelanto
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}

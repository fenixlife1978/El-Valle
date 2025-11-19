
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Loader2, CalendarPlus, Info, Check, Search, XCircle, Trash2, PlusCircle, ArrowLeft } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, writeBatch, Timestamp, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type Owner = {
    id: string;
    name: string;
    properties: { street: string; house: string }[];
};

type PropertySplit = {
    property: { street: string; house: string };
    amount: string; // Amount in USD per month for this property
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
    const router = useRouter();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Form State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [propertySplits, setPropertySplits] = useState<PropertySplit[]>([]);
    const [observations, setObservations] = useState('');

    const totalAmount = useMemo(() => {
        if (selectedMonths.length === 0 || propertySplits.length === 0) {
            return 0;
        }
        const totalPerMonth = propertySplits.reduce((sum, split) => sum + (parseFloat(split.amount) || 0), 0);
        return totalPerMonth * selectedMonths.length;
    }, [propertySplits, selectedMonths]);

    useEffect(() => {
        const ownersQuery = query(collection(db(), "owners"));
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
        if (owner.properties && owner.properties.length > 0) {
            // Start with the first property selected
            setPropertySplits([{ property: owner.properties[0], amount: '' }]);
        }
    };
    
    const resetOwnerSelection = () => {
        setSelectedOwner(null);
        setPropertySplits([]);
        setSearchTerm('');
        setSelectedMonths([]);
    };
    
    const handlePropertySplitToggle = (property: { street: string; house: string }) => {
        const exists = propertySplits.some(p => p.property.street === property.street && p.property.house === property.house);
        if (exists) {
            if (propertySplits.length > 1) { // Prevent removing the last one
                setPropertySplits(prev => prev.filter(p => !(p.property.street === property.street && p.property.house === property.house)));
            }
        } else {
            setPropertySplits(prev => [...prev, { property, amount: '' }]);
        }
    };

    const handleSplitAmountChange = (index: number, value: string) => {
        const newSplits = [...propertySplits];
        newSplits[index].amount = value;
        setPropertySplits(newSplits);
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
        
        if (!selectedOwner || selectedMonths.length === 0 || propertySplits.length === 0 || propertySplits.some(p => !p.amount || parseFloat(p.amount) <= 0)) {
            toast({
                variant: 'destructive',
                title: 'Datos Incompletos',
                description: 'Debe seleccionar propietario, meses, al menos una propiedad y un monto de cuota válido para cada una.',
            });
            return;
        }

        setLoading(true);

        try {
            const firestore = db();
            const batch = writeBatch(firestore);
            const paymentDate = Timestamp.now();
            
            // Check for duplicates
             for (const split of propertySplits) {
                const existingDebtsQuery = query(
                    collection(firestore, "debts"),
                    where("ownerId", "==", selectedOwner.id),
                    where("property.street", "==", split.property.street),
                    where("property.house", "==", split.property.house),
                    where("status", "==", "paid"),
                    where("description", "==", "Cuota de Condominio (Pagada por adelantado)")
                );
                const existingDebtsSnapshot = await getDocs(existingDebtsQuery);
                const existingPaidMonths = new Set(existingDebtsSnapshot.docs.map(d => `${d.data().year}-${String(d.data().month).padStart(2, '0')}`));

                const duplicates = selectedMonths.filter(m => existingPaidMonths.has(m));
                if (duplicates.length > 0) {
                    const monthLabels = duplicates.map(dup => format(new Date(dup.replace('-', '/')), 'MMMM yyyy', { locale: es })).join(', ');
                    toast({
                        variant: 'destructive',
                        title: 'Meses Duplicados',
                        description: `La propiedad ${split.property.street}-${split.property.house} ya tiene pagos adelantados para: ${monthLabels}.`,
                    });
                    setLoading(false);
                    return;
                }
            }


            // Create future 'paid' debt documents for each month and each property
            for (const monthStr of selectedMonths) {
                const [year, month] = monthStr.split('-').map(Number);
                for (const split of propertySplits) {
                    const monthlyAmountNum = parseFloat(split.amount);
                    const debtRef = doc(collection(firestore, "debts"));
                    batch.set(debtRef, {
                        ownerId: selectedOwner.id,
                        property: split.property,
                        year,
                        month,
                        amountUSD: monthlyAmountNum,
                        description: "Cuota de Condominio (Pagada por adelantado)",
                        status: 'paid',
                        paymentDate: paymentDate,
                        paidAmountUSD: monthlyAmountNum,
                    });
                }
            }
            
            // Create the main payment document with the total amount and beneficiaries
            const paymentRef = doc(collection(firestore, "payments"));
            batch.set(paymentRef, {
                reportedBy: selectedOwner.id, 
                beneficiaries: propertySplits.map(split => ({
                    ownerId: selectedOwner.id,
                    ownerName: selectedOwner.name,
                    ...split.property,
                    amount: parseFloat(split.amount) * selectedMonths.length
                })),
                beneficiaryIds: [selectedOwner.id],
                totalAmount: totalAmount,
                exchangeRate: 1, // Rate is not relevant for USD advance payments
                paymentDate: paymentDate,
                reportedAt: serverTimestamp(),
                paymentMethod: 'adelanto',
                bank: 'N/A',
                reference: `Adelanto ${selectedMonths.join(', ')}`,
                status: 'aprobado',
                observations: observations,
            });

            await batch.commit();

            toast({
                title: 'Adelanto Registrado Exitosamente',
                description: `Se registró el pago de ${selectedMonths.length} meses para ${selectedOwner.name}.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            // Reset form
            resetOwnerSelection();

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
                <p className="text-muted-foreground">Seleccione un propietario y los meses futuros que desea cancelar para una o más propiedades.</p>
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
                            
                            <div className="space-y-4">
                                <Label className="font-semibold">3. Monto por Propiedad (USD Mensual)</Label>
                                <Card className="bg-muted/50 p-4 space-y-4">
                                     {selectedOwner.properties.map(prop => {
                                        const isSelected = propertySplits.some(p => p.property.street === prop.street && p.property.house === prop.house);
                                        const splitIndex = propertySplits.findIndex(p => p.property.street === prop.street && p.property.house === prop.house);
                                        
                                        return (
                                            <div key={`${prop.street}-${prop.house}`} className="flex items-center gap-4">
                                                <Checkbox
                                                    id={`prop-${prop.house}`}
                                                    checked={isSelected}
                                                    onCheckedChange={() => handlePropertySplitToggle(prop)}
                                                />
                                                <Label htmlFor={`prop-${prop.house}`} className="flex-1">{prop.street} - {prop.house}</Label>
                                                <Input
                                                    type="number"
                                                    placeholder="Monto USD"
                                                    className={cn("w-32", !isSelected && "bg-muted/50")}
                                                    disabled={!isSelected}
                                                    value={isSelected ? propertySplits[splitIndex].amount : ''}
                                                    onChange={(e) => handleSplitAmountChange(splitIndex, e.target.value)}
                                                />
                                            </div>
                                        )
                                     })}
                                </Card>
                            </div>
                           
                            <div className="grid md:grid-cols-2 gap-6 items-end">
                                 <div className="space-y-2">
                                    <Label htmlFor="observations">Observaciones (Opcional)</Label>
                                    <Input
                                        id="observations"
                                        value={observations}
                                        onChange={(e) => setObservations(e.target.value)}
                                        placeholder="Ej: Pago realizado por Zelle"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="totalAmount">Monto Total a Pagar (USD)</Label>
                                    <Input
                                        id="totalAmount"
                                        type="number"
                                        value={totalAmount.toFixed(2)}
                                        className="font-bold text-lg bg-background"
                                        readOnly
                                    />
                                    {selectedMonths.length > 0 &&
                                        <p className="text-sm text-muted-foreground">
                                            {selectedMonths.length} {selectedMonths.length > 1 ? 'meses' : 'mes'} x {propertySplits.length} {propertySplits.length > 1 ? 'propiedades' : 'propiedad'}
                                        </p>
                                    }
                                </div>
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
    
    

    
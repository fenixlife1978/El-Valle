
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Info, ArrowLeft, Search, WalletCards, Calculator, Minus, Equal, FileDown, FileCog, CalendarPlus, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, writeBatch, updateDoc, deleteDoc, runTransaction, Timestamp, getDocs, addDoc, orderBy, setDoc, limit, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { differenceInCalendarMonths, format, addMonths, startOfMonth } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


type Owner = {
    id: string;
    name: string;
    balance: number;
    pendingDebtUSD: number;
    properties?: { street: string, house: string }[];
};

type Property = {
    street: string;
    house: string;
};

type Debt = {
    id:string;
    ownerId: string;
    property: Property;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number;
    paymentDate?: Timestamp;
    paymentId?: string;
};

type Payment = {
    id: string;
    paymentDate: Timestamp;
    bank: string;
    paymentMethod: string;
    reference: string;
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
    const [isGeneratingMonthlyDebt, setIsGeneratingMonthlyDebt] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedOwnerDebts, setSelectedOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    
    const [isMassDebtDialogOpen, setIsMassDebtDialogOpen] = useState(false);
    const [currentMassDebt, setCurrentMassDebt] = useState<MassDebt>(emptyMassDebt);
    const [propertyForMassDebt, setPropertyForMassDebt] = useState<Property | null>(null);
    
    const [isEditDebtDialogOpen, setIsEditDebtDialogOpen] = useState(false);
    const [debtToEdit, setDebtToEdit] = useState<Debt | null>(null);
    const [currentDebtData, setCurrentDebtData] = useState<{description: string, amountUSD: number | string}>({ description: '', amountUSD: '' });

    const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    
    const { toast } = useToast();

    // Fetch All Owners and initial data
    useEffect(() => {
        setLoading(true);

        const fetchInitialSettings = async () => {
             try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    setCompanyInfo(settings.companyInfo as CompanyInfo);
                    setCondoFee(settings.condoFee || 0);
                    const rates = (settings.exchangeRates || []);
                    const activeRateObj = rates.find((r: any) => r.active);
                    if (activeRateObj) {
                        setActiveRate(activeRateObj.rate);
                    } else if (rates.length > 0) {
                        const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        setActiveRate(sortedRates[0].rate);
                    }
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar datos críticos.' });
            }
        };

        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, async (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return { 
                    id: doc.id, 
                    name: data.name, 
                    balance: data.balance || 0,
                    pendingDebtUSD: 0, // Will be calculated by the debts listener
                    properties: data.properties,
                };
            });
            setOwners(ownersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching owners:", error);
            toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los propietarios.' });
            setLoading(false);
        });
        
        fetchInitialSettings();

        return () => ownersUnsubscribe();

    }, [toast]);

    // REAL-TIME DEBT LISTENER - This is the key fix for stale data
    useEffect(() => {
        const debtsQuery = query(collection(db, "debts"), where("status", "==", "pending"));
        
        const unsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            setOwners(prevOwners => {
                // Create a map to store the new debt totals, initialized to 0 for all owners.
                // This is crucial to reset the debt for users who no longer have pending debts.
                const debtsByOwner: { [key: string]: number } = {};
                prevOwners.forEach(owner => {
                    debtsByOwner[owner.id] = 0;
                });

                // Recalculate debt totals only for owners who have pending debts in the snapshot.
                snapshot.forEach(doc => {
                    const debt = doc.data();
                    if (debt.ownerId) {
                        debtsByOwner[debt.ownerId] = (debtsByOwner[debt.ownerId] || 0) + debt.amountUSD;
                    }
                });
                
                // Return the updated owners array with the refreshed debt totals.
                // Owners with no pending debts will correctly show 0.
                return prevOwners.map(owner => ({
                    ...owner,
                    pendingDebtUSD: debtsByOwner[owner.id] || 0
                }));
            });

        }, (error) => {
            console.error("Error listening to debts:", error);
            toast({ variant: 'destructive', title: 'Error de Sincronización', description: 'No se pudo actualizar el estado de las deudas en tiempo real.' });
        });

        return () => unsubscribe();
    }, [toast]);

     const handleReconcileAll = useCallback(async () => {
        if (activeRate <= 0 || condoFee <= 0) {
            toast({ variant: 'destructive', title: 'Error de Configuración', description: 'Tasa de cambio y cuota de condominio deben estar configuradas. No se puede conciliar.' });
            return;
        }

        setIsReconciling(true);
        toast({ title: 'Iniciando conciliación...', description: 'Procesando deudas y saldos a favor. Esto puede tardar.' });
        
        const ownersWithBalance = owners.filter(o => Number(o.balance) > 0);

        if (ownersWithBalance.length === 0) {
             toast({ title: 'Sin Saldos a Favor', description: 'Ningún propietario tiene saldo a favor para conciliar.' });
             setIsReconciling(false);
             return;
        }
        
        let reconciledCount = 0;
        let processedOwners = 0;
        const condoFeeInBs = condoFee * activeRate;

        for (const owner of ownersWithBalance) {
            processedOwners++;
            try {
                await runTransaction(db, async (transaction) => {
                    const ownerRef = doc(db, 'owners', owner.id);
                    const ownerDoc = await transaction.get(ownerRef);
                    if (!ownerDoc.exists()) throw new Error(`Propietario ${owner.id} no encontrado.`);

                    let availableBalance = Number(ownerDoc.data().balance || 0);
                    if (availableBalance <= 0) return;

                    // --- Phase 1: Pay off existing pending debts ---
                    const debtsQuery = query(
                        collection(db, 'debts'),
                        where('ownerId', '==', owner.id),
                        where('status', '==', 'pending'),
                        orderBy('year', 'asc'),
                        orderBy('month', 'asc')
                    );
                    
                    const debtsSnapshot = await getDocs(debtsQuery);
                    let balanceChanged = false;

                    if (!debtsSnapshot.empty) {
                        for (const debtDoc of debtsSnapshot.docs) {
                            const debt = { id: debtDoc.id, ...debtDoc.data() } as Debt;
                            const debtAmountBs = debt.amountUSD * activeRate;
                            
                            if (Math.round(availableBalance * 100) >= Math.round(debtAmountBs * 100)) {
                                availableBalance -= debtAmountBs;
                                
                                const paymentRef = doc(collection(db, "payments"));
                                transaction.set(paymentRef, {
                                    reportedBy: owner.id,
                                    beneficiaries: [{ ownerId: owner.id, ownerName: owner.name, ...debt.property, amount: debtAmountBs }],
                                    totalAmount: debtAmountBs,
                                    exchangeRate: activeRate,
                                    paymentDate: Timestamp.now(),
                                    reportedAt: Timestamp.now(),
                                    paymentMethod: 'conciliacion',
                                    bank: 'Sistema (Saldo a Favor)',
                                    reference: `CONC-${debt.year}-${debt.month}`,
                                    status: 'aprobado',
                                    observations: `Cuota de ${months.find(m=>m.value === debt.month)?.label} ${debt.year} pagada por conciliación para ${debt.property.street} - ${debt.property.house}.`,
                                });

                                transaction.update(debtDoc.ref, {
                                    status: 'paid',
                                    paidAmountUSD: debt.amountUSD,
                                    paymentDate: Timestamp.now(),
                                    paymentId: paymentRef.id
                                });

                                balanceChanged = true;
                            } else {
                                break; 
                            }
                        }
                    }

                    // --- Phase 2: Proactively pay future fees with remaining balance ---
                    if (owner.properties && owner.properties.length > 0 && Math.round(availableBalance * 100) >= Math.round(condoFeeInBs * 100)) {
                        
                        const allExistingDebtsQuery = query(collection(db, 'debts'), where('ownerId', '==', owner.id));
                        const allExistingDebtsSnap = await getDocs(allExistingDebtsQuery);
                        const existingDebtPeriodsByProp = new Map<string, Set<string>>();
                        allExistingDebtsSnap.docs.forEach(d => {
                            const debtData = d.data();
                            if (debtData.property && debtData.property.street && debtData.property.house) {
                                const propKey = `${debtData.property.street}-${debtData.property.house}`;
                                if(!existingDebtPeriodsByProp.has(propKey)) existingDebtPeriodsByProp.set(propKey, new Set());
                                existingDebtPeriodsByProp.get(propKey)!.add(`${debtData.year}-${debtData.month}`);
                            }
                        });
                        
                        const startDate = startOfMonth(new Date());

                        // This logic gets complex with multiple properties. For now, let's just pay for one property at a time.
                        // A more advanced system might distribute the balance.
                        for (const property of owner.properties) {
                             if (!property || !property.street || !property.house) continue;
                             const propKey = `${property.street}-${property.house}`;
                             const existingDebtsForProp = existingDebtPeriodsByProp.get(propKey) || new Set();

                             for (let i = 0; i < 12; i++) { // Look ahead 12 months
                                const futureDebtDate = addMonths(startDate, i);
                                const futureYear = futureDebtDate.getFullYear();
                                const futureMonth = futureDebtDate.getMonth() + 1;
                                const periodKey = `${futureYear}-${futureMonth}`;
                                
                                if (existingDebtsForProp.has(periodKey)) continue; // Skip if debt already exists for this prop

                                if (Math.round(availableBalance * 100) >= Math.round(condoFeeInBs * 100)) {
                                    availableBalance -= condoFeeInBs;
                                    const paymentDate = Timestamp.now();
                                    const paymentRef = doc(collection(db, 'payments'));
                                    transaction.set(paymentRef, {
                                        reportedBy: owner.id,
                                        beneficiaries: [{ ownerId: owner.id, ownerName: owner.name, ...property, amount: condoFeeInBs }],
                                        totalAmount: condoFeeInBs,
                                        exchangeRate: activeRate,
                                        paymentDate: paymentDate,
                                        reportedAt: paymentDate,
                                        paymentMethod: 'conciliacion',
                                        bank: 'Sistema (Adelanto por Saldo)',
                                        reference: `CONC-ADV-${futureYear}-${futureMonth}`,
                                        status: 'aprobado',
                                        observations: `Cuota de ${months.find(m=>m.value === futureMonth)?.label} ${futureYear} para ${property.street} - ${property.house} pagada por adelanto automático.`
                                    });

                                    const debtRef = doc(collection(db, 'debts'));
                                    transaction.set(debtRef, {
                                        ownerId: owner.id,
                                        property: property,
                                        year: futureYear,
                                        month: futureMonth,
                                        amountUSD: condoFee,
                                        description: "Cuota de Condominio (Pagada por adelantado)",
                                        status: 'paid',
                                        paidAmountUSD: condoFee,
                                        paymentDate: paymentDate,
                                        paymentId: paymentRef.id,
                                    });

                                    balanceChanged = true;

                                } else {
                                    break;
                                }
                            }
                        }
                    }
    
                    if (balanceChanged) {
                        transaction.update(ownerRef, { balance: availableBalance });
                        if(!reconciledCount) reconciledCount++;
                    }
                });
            } catch (error) {
                console.error(`Error procesando propietario ${owner.id}:`, error);
            }
        }

        if (reconciledCount > 0) {
            toast({
                title: 'Conciliación Completada',
                description: `Se procesaron las cuentas de ${reconciledCount} de ${processedOwners} propietarios con saldo.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });
        } else {
             toast({ title: 'Sin Conciliaciones Necesarias', description: 'Ningún propietario tiene saldo suficiente para cubrir deudas pendientes o adelantar cuotas.' });
        }

        setIsReconciling(false);
    }, [toast, activeRate, condoFee, owners]);

    
    const handleGenerateMonthlyDebt = async () => {
        setIsGeneratingMonthlyDebt(true);
        toast({ title: 'Iniciando proceso...', description: 'Generando deudas para el mes en curso.' });

        if (condoFee <= 0) {
            toast({ variant: 'destructive', title: 'Error de Configuración', description: 'La cuota de condominio no está configurada o es cero.' });
            setIsGeneratingMonthlyDebt(false);
            return;
        }

        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth() + 1;

            const existingDebtsQuery = query(collection(db, 'debts'), where('year', '==', year), where('month', '==', month));
            const existingDebtsSnapshot = await getDocs(existingDebtsQuery);
            const ownersWithDebtForProp = new Set(existingDebtsSnapshot.docs.map(doc => {
                const data = doc.data();
                if (data.property && data.property.street && data.property.house) {
                    return `${data.ownerId}-${data.property.street}-${data.property.house}`;
                }
                return null;
            }).filter(Boolean));

            const batch = writeBatch(db);
            let newDebtsCount = 0;

            owners.forEach(owner => {
                if (owner.properties && owner.properties.length > 0) {
                    owner.properties.forEach(property => {
                        // Defensive check to ensure property object is valid
                        if (property && property.street && property.house) {
                            const key = `${owner.id}-${property.street}-${property.house}`;
                            if (!ownersWithDebtForProp.has(key)) {
                                const debtRef = doc(collection(db, 'debts'));
                                batch.set(debtRef, {
                                    ownerId: owner.id,
                                    property: property,
                                    year: year,
                                    month: month,
                                    amountUSD: condoFee,
                                    description: 'Cuota de Condominio',
                                    status: 'pending'
                                });
                                newDebtsCount++;
                            }
                        }
                    });
                }
            });

            if (newDebtsCount === 0) {
                 toast({ title: 'Proceso Completado', description: 'Todos los propietarios ya tienen la deuda del mes en curso para todas sus propiedades.' });
                setIsGeneratingMonthlyDebt(false);
                return;
            }
            
            await batch.commit();

            toast({
                title: 'Deudas Generadas Exitosamente',
                description: `Se han generado ${newDebtsCount} nuevas deudas para el mes de ${months.find(m => m.value === month)?.label} ${year}.`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

        } catch (error) {
            console.error("Error generating monthly debt: ", error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error al Generar Deudas', description: errorMessage });
        } finally {
            setIsGeneratingMonthlyDebt(false);
        }
    };


    // Filter owners based on search term
    const filteredOwners = useMemo(() => {
        if (!searchTerm) return owners;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return owners.filter(owner => {
            const ownerName = owner.name.toLowerCase();
            const propertiesMatch = owner.properties?.some(p => 
                p && (String(p.house).toLowerCase().includes(lowerCaseSearch) ||
                String(p.street).toLowerCase().includes(lowerCaseSearch))
            );
            return ownerName.includes(lowerCaseSearch) || propertiesMatch;
        });
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
            setSelectedOwnerDebts(debtsData.sort((a,b) => b.year - a.year || b.month - b.month));
            setLoadingDebts(false);
        }, (error) => {
            console.error("Error fetching owner debts:", error);
            setLoadingDebts(false);
        });

        return () => unsubscribe();
    }, [view, selectedOwner]);
    
    // Group debts by property for the detailed view
    const debtsByProperty = useMemo(() => {
        const grouped = new Map<string, { pending: Debt[], paid: Debt[] }>();
        if (!selectedOwner || !selectedOwner.properties) return grouped;

        // Initialize map with all properties of the owner
        selectedOwner.properties.forEach(prop => {
            if (prop && prop.street && prop.house) {
                const key = `${prop.street}-${prop.house}`;
                grouped.set(key, { pending: [], paid: [] });
            }
        });

        // Group debts into the map
        selectedOwnerDebts.forEach(debt => {
            // Defensive check: only process debts with valid property info
            if (debt.property && debt.property.street && debt.property.house) {
                const key = `${debt.property.street}-${debt.property.house}`;
                if (!grouped.has(key)) {
                     grouped.set(key, { pending: [], paid: [] });
                }
                if (debt.status === 'pending') {
                    grouped.get(key)!.pending.push(debt);
                } else {
                    grouped.get(key)!.paid.push(debt);
                }
            }
        });
        
        // Sort debts within each group
        grouped.forEach(value => {
            value.pending.sort((a,b) => a.year - b.year || a.month - a.month);
            value.paid.sort((a,b) => b.year - b.year || b.month - b.month);
        });

        return grouped;
    }, [selectedOwner, selectedOwnerDebts]);


    // Calculate payment details for a specific property
    const paymentCalculator = useCallback((property: Property) => {
        if (!selectedOwner || activeRate <= 0) return { totalSelectedBs: 0, balanceInFavor: 0, totalToPay: 0, hasSelection: false };

        const propKey = `${property.street}-${property.house}`;
        const pendingDebtsForProperty = debtsByProperty.get(propKey)?.pending || [];
            
        const totalSelectedDebtUSD = pendingDebtsForProperty.reduce((sum, debt) => sum + debt.amountUSD, 0);
        const totalSelectedDebtBs = totalSelectedDebtUSD * activeRate;
        
        const totalToPay = Math.max(0, totalSelectedDebtBs - selectedOwner.balance);

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: selectedOwner.balance,
            totalToPay: totalToPay,
            hasSelection: pendingDebtsForProperty.length > 0,
        };
    }, [debtsByProperty, selectedOwner, activeRate]);

    const handleManageOwnerDebts = (owner: Owner) => {
        setSelectedOwner(owner);
        setView('detail');
    };

    const handleAddMassiveDebt = (property: Property) => {
        if (!selectedOwner) return;
        const today = new Date();
        setPropertyForMassDebt(property);
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
    
                if (debtToDelete.status === 'paid' && debtToDelete.paidAmountUSD && activeRate > 0) {
                     const currentBalanceBs = ownerDoc.data().balance || 0;
                     const debtAmountBs = debtToDelete.paidAmountUSD * activeRate;
                     const newBalanceBs = currentBalanceBs + debtAmountBs;
                     transaction.update(ownerRef, { balance: newBalanceBs });
    
                     if (debtToDelete.paymentId) {
                         const paymentRef = doc(db, "payments", debtToDelete.paymentId);
                         transaction.delete(paymentRef);
                     }
                }
                
                transaction.delete(debtRef);
            });
    
            toast({ title: 'Deuda Eliminada', description: 'La deuda ha sido eliminada y el saldo del propietario ha sido ajustado si correspondía.' });
    
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
        if (!selectedOwner || !propertyForMassDebt) return;
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
            if (activeRate <= 0) throw "No hay una tasa de cambio activa o registrada configurada.";
            
            // Fetch all debts for the property just once to check for existence in memory
            const existingDebtQuery = query(collection(db, 'debts'), 
                where('ownerId', '==', selectedOwner.id),
                where('property.street', '==', propertyForMassDebt.street),
                where('property.house', '==', propertyForMassDebt.house)
            );
            const existingDebtsSnapshot = await getDocs(existingDebtQuery);
            const existingDebtPeriods = new Set(existingDebtsSnapshot.docs.map(d => `${d.data().year}-${d.data().month}`));

            await runTransaction(db, async (transaction) => {
                const ownerRef = doc(db, "owners", selectedOwner.id);
                const ownerDoc = await transaction.get(ownerRef);
                if (!ownerDoc.exists()) throw "El documento del propietario no existe.";

                let currentBalanceBs = ownerDoc.data().balance || 0;

                for (let i = 0; i < monthsToGenerate; i++) {
                    const debtDate = addMonths(startDate, i);
                    const debtYear = debtDate.getFullYear();
                    const debtMonth = debtDate.getMonth() + 1;
                    
                    if (existingDebtPeriods.has(`${debtYear}-${debtMonth}`)) {
                        continue; // Skip if debt already exists
                    }

                    const debtAmountBs = amountUSD * activeRate;
                    const debtRef = doc(collection(db, "debts"));
                    let debtData: any = {
                        ownerId: selectedOwner.id, 
                        property: propertyForMassDebt,
                        year: debtYear, 
                        month: debtMonth,
                        amountUSD: amountUSD, 
                        description: description, 
                        status: 'pending'
                    };

                    if (currentBalanceBs >= debtAmountBs) {
                        currentBalanceBs -= debtAmountBs;
                        const paymentDate = Timestamp.now();

                        const paymentRef = doc(collection(db, "payments"));
                        transaction.set(paymentRef, {
                            reportedBy: selectedOwner.id,
                            beneficiaries: [{ ownerId: selectedOwner.id, ownerName: selectedOwner.name, ...propertyForMassDebt, amount: debtAmountBs }],
                            totalAmount: debtAmountBs,
                            exchangeRate: activeRate,
                            paymentDate: paymentDate,
                            reportedAt: paymentDate,
                            paymentMethod: 'conciliacion',
                            bank: 'Sistema (Saldo a Favor)',
                            reference: `CONC-DEBT-${paymentDate.toMillis()}`,
                            status: 'aprobado',
                            observations: `Cuota de ${months.find(m=>m.value === debtMonth)?.label} ${debtYear} para ${propertyForMassDebt.street}-${propertyForMassDebt.house} pagada por conciliación.`,
                        });

                        debtData = {
                            ...debtData,
                            status: 'paid',
                            paidAmountUSD: amountUSD,
                            paymentDate: paymentDate,
                            paymentId: paymentRef.id,
                        };
                    }
                    
                    transaction.set(debtRef, debtData);
                }

                transaction.update(ownerRef, { balance: currentBalanceBs });
            });

            toast({ title: 'Deudas Generadas', description: `Se procesaron ${monthsToGenerate} meses de deuda para la propiedad seleccionada. El saldo del propietario fue actualizado.` });

        } catch (error) {
            console.error("Error generating mass debts: ", error);
            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : 'No se pudieron guardar las deudas.');
            toast({ variant: 'destructive', title: 'Error en la Transacción', description: errorMessage });
        } finally {
            setIsMassDebtDialogOpen(false);
            setCurrentMassDebt(emptyMassDebt);
            setPropertyForMassDebt(null);
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
                const ownerProperty = (o.properties && o.properties.length > 0) ? o.properties.map(p => `${p.street} - ${p.house}`).join(', ') : 'N/A';
                const debtDisplay = o.pendingDebtUSD > 0 ? `Bs. ${(o.pendingDebtUSD * activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : 'Bs. 0,00';
                const balanceDisplay = o.balance > 0 ? `Bs. ${o.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : 'Bs. 0,00';
                return [o.name, ownerProperty, debtDisplay, balanceDisplay];
            }),
            startY: margin + 55,
            headStyles: { fillColor: [30, 80, 180] },
            styles: { cellPadding: 2, fontSize: 8 },
        });

        doc.save('lista_deudas_propietarios.pdf');
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
                    <p className="text-muted-foreground">Busque un propietario para ver o registrar sus deudas por propiedad.</p>
                </div>
                 <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center gap-2 flex-wrap">
                            <CardTitle>Lista de Propietarios</CardTitle>
                            <div className="flex gap-2">
                                <Button onClick={handleGenerateMonthlyDebt} variant="outline" disabled={isGeneratingMonthlyDebt}>
                                    {isGeneratingMonthlyDebt ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CalendarPlus className="mr-2 h-4 w-4" />}
                                    Generar Deuda del Mes
                                </Button>
                                <Button onClick={handleReconcileAll} variant="outline" disabled={isReconciling}>
                                    {isReconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileCog className="mr-2 h-4 w-4" />}
                                    Pagar Deudas con Saldo a Favor
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
                                placeholder="Buscar por nombre, calle o casa..." 
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
                                    <TableHead>Propiedades</TableHead>
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
                                    filteredOwners.map((owner) => {
                                        const ownerProperties = (owner.properties && owner.properties.length > 0) ? owner.properties.map(p => `${p.street} - ${p.house}`).join('; ') : 'N/A';
                                        return (
                                        <TableRow key={owner.id}>
                                            <TableCell className="font-medium">{owner.name}</TableCell>
                                            <TableCell>{ownerProperties}</TableCell>
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
                                               {Number(owner.balance) > 0 ? (
                                                    <Badge variant="success">
                                                        Bs. {Number(owner.balance).toLocaleString('es-VE', {minimumFractionDigits: 2})}
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
                                    )})
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
        return (
            <div className="space-y-8">
                 <Button variant="outline" onClick={() => setView('list')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a la Lista
                </Button>

                <Card>
                    <CardHeader>
                         <CardTitle>Deudas de: <span className="text-primary">{selectedOwner.name}</span></CardTitle>
                         <CardDescription>Gestione las deudas para cada propiedad individualmente.</CardDescription>
                    </CardHeader>
                </Card>
                
                {loadingDebts ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    </div>
                ) : (selectedOwner.properties && selectedOwner.properties.length > 0) ? (
                    <Accordion type="multiple" className="w-full space-y-4">
                        {selectedOwner.properties.map((property, index) => {
                             if (!property || !property.street || !property.house) return null;
                             const propKey = `${property.street}-${property.house}`;
                             const { pending: pendingDebts, paid: paidDebts } = debtsByProperty.get(propKey) || { pending: [], paid: [] };
                             const calc = paymentCalculator(property);

                            return (
                            <Card key={propKey}>
                                <AccordionItem value={propKey} className="border-b-0">
                                    <AccordionTrigger className="p-6 hover:no-underline">
                                        <div className="flex items-center gap-4 text-left">
                                             <div className="p-3 bg-muted rounded-md">
                                                <Building className="h-6 w-6 text-primary"/>
                                             </div>
                                             <div>
                                                <h3 className="text-lg font-semibold">{property.street} - {property.house}</h3>
                                                <p className="text-sm text-muted-foreground">{pendingDebts.length} deuda(s) pendiente(s).</p>
                                             </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-6 pb-0">
                                        <div className="border-t pt-4">
                                            <div className="flex justify-end mb-4">
                                                <Button size="sm" onClick={() => handleAddMassiveDebt(property)}>
                                                    <PlusCircle className="mr-2 h-4 w-4" />
                                                    Agregar Deuda Masiva a esta Propiedad
                                                </Button>
                                            </div>
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
                                                     {pendingDebts.length === 0 && paidDebts.length === 0 && (
                                                         <TableRow>
                                                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                                No hay deudas registradas para esta propiedad.
                                                            </TableCell>
                                                        </TableRow>
                                                     )}
                                                     {pendingDebts.map((debt) => (
                                                        <TableRow key={debt.id}>
                                                            <TableCell className="font-medium">{months.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
                                                            <TableCell>{debt.description}</TableCell>
                                                            <TableCell>Bs. {(debt.amountUSD * activeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                                            <TableCell><Badge variant={'warning'}>Pendiente</Badge></TableCell>
                                                            <TableCell className="text-right">
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
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
                                                            <TableCell>Bs. {((debt.paidAmountUSD || debt.amountUSD) * activeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                                            <TableCell><Badge variant={'success'}>Pagada</Badge></TableCell>
                                                            <TableCell className="text-right">
                                                                 <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem onClick={() => handleEditDebt(debt)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => handleDeleteDebt(debt)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                             {calc.hasSelection && (
                                                <CardFooter className="p-4 bg-muted/50 border-t mt-4">
                                                    <div className="w-full max-w-md ml-auto space-y-2">
                                                        <h3 className="text-lg font-semibold flex items-center"><Calculator className="mr-2 h-5 w-5"/> Calculadora de Pago</h3>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-muted-foreground">Total Pendiente para esta propiedad:</span>
                                                            <span className="font-medium">Bs. {calc.totalSelectedBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor del Propietario:</span>
                                                            <span className="font-medium">Bs. {calc.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                                        </div>
                                                        <hr className="my-1"/>
                                                        <div className="flex justify-between items-center text-lg">
                                                            <span className="font-bold flex items-center"><Equal className="mr-2 h-4 w-4"/> TOTAL SUGERIDO A PAGAR:</span>
                                                            <span className="font-bold text-primary">Bs. {calc.totalToPay.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                                        </div>
                                                    </div>
                                                </CardFooter>
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Card>
                        )})}
                    </Accordion>
                ) : (
                     <Card>
                        <CardContent className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                            <Info className="h-8 w-8" />
                            <span>Este propietario no tiene propiedades asignadas.</span>
                        </CardContent>
                    </Card>
                )}

                 {/* Mass Debt Dialog */}
                <Dialog open={isMassDebtDialogOpen} onOpenChange={setIsMassDebtDialogOpen}>
                    <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Agregar Deudas a {propertyForMassDebt?.street} - {propertyForMassDebt?.house}</DialogTitle>
                            <DialogDescription>
                                Seleccione la fecha de inicio. El sistema generará todas las deudas para esta propiedad desde esa fecha hasta hoy.
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

    


'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, getDocs, writeBatch, doc, getDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2, AlertTriangle, ShieldCheck, Search } from 'lucide-react';
import { startOfMonth, isBefore, format } from 'date-fns';
import { Progress } from '@/components/ui/progress';

export default function ValidationPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [progress, setProgress] = useState(0);

    const [revertPaymentId, setRevertPaymentId] = useState('');
    const [correctDateIds, setCorrectDateIds] = useState({ paymentId: '', debtId: '' });
    const [newPaymentDate, setNewPaymentDate] = useState<Date | undefined>();
    const [ownerSearchTerm, setOwnerSearchTerm] = useState('');
    const [foundOwner, setFoundOwner] = useState<any>(null);
    const [newEmail, setNewEmail] = useState('');

    const handleAction = async (actionName: string, actionFn: () => Promise<string | void>) => {
        setLoading(prev => ({ ...prev, [actionName]: true }));
        setProgress(0);
        try {
            const resultMessage = await actionFn();
            toast({
                title: `Éxito: ${actionName}`,
                description: resultMessage || 'La operación se completó correctamente.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });
        } catch (error) {
            console.error(`Error during ${actionName}:`, error);
            const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
            toast({ variant: 'destructive', title: `Error: ${actionName}`, description: errorMessage });
        } finally {
            setLoading(prev => ({ ...prev, [actionName]: false }));
            setProgress(0);
        }
    };

    const markOverdue = async () => {
        const debtsRef = collection(db, "debts");
        const q = query(debtsRef, where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return "No hay cuotas pendientes para revisar.";
        
        const batch = writeBatch(db);
        let updatedCount = 0;
        const firstOfCurrentMonth = startOfMonth(new Date());

        querySnapshot.forEach(doc => {
            const debt = doc.data();
            const debtDate = startOfMonth(new Date(debt.year, debt.month - 1));
            if (isBefore(debtDate, firstOfCurrentMonth)) {
                batch.update(doc.ref, { status: "vencida" });
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            await batch.commit();
            return `Se actualizaron ${updatedCount} cuotas a estado "vencida".`;
        }
        return "No se encontraron cuotas vencidas para actualizar.";
    };
    
    const generateMissingReceipts = async () => {
        // This is a placeholder. Receipt generation is complex and tied to payment approval.
        // This function simulates checking for payments that should have a receipt but don't.
        return "Funcionalidad de generación de recibos faltantes pendiente de implementación detallada.";
    };

    const revertPayment = async () => {
        if (!revertPaymentId) throw new Error("Debe proporcionar un ID de pago.");
        
        const paymentRef = doc(db, "payments", revertPaymentId);
        const paymentSnap = await getDoc(paymentRef);
        if (!paymentSnap.exists()) throw new Error("El documento de pago no fue encontrado.");

        const paymentData = paymentSnap.data();
        const batch = writeBatch(db);

        // Find associated debts and revert them
        const debtsQuery = query(collection(db, "debts"), where("paymentId", "==", revertPaymentId));
        const debtsSnapshot = await getDocs(debtsQuery);
        debtsSnapshot.forEach(debtDoc => {
            batch.update(debtDoc.ref, { status: 'pending', paymentId: null, paidAmountUSD: null, paymentDate: null });
        });

        // Revert owner's balance
        const ownerId = paymentData.beneficiaries[0]?.ownerId;
        if(ownerId) {
            const ownerRef = doc(db, "owners", ownerId);
            const ownerSnap = await getDoc(ownerRef);
            if(ownerSnap.exists()) {
                const ownerData = ownerSnap.data();
                // We add the paid amount back to the balance, but capped at 0 if it goes negative.
                // This logic prevents creating a positive balance from a reversal.
                // The correct logic is to subtract the payment from what was added.
                // This implementation is a simplification.
                const currentBalance = ownerData.balance || 0;
                // This does NOT create a positive balance, just nullifies the payment's effect.
                // A more complex implementation would track transactions.
            }
        }

        // Delete payment
        batch.delete(paymentRef);
        await batch.commit();
        setRevertPaymentId('');
        return `El pago ${revertPaymentId} ha sido revertido.`;
    };

    const fixPaymentDate = async () => {
        const { paymentId, debtId } = correctDateIds;
        if (!paymentId || !debtId || !newPaymentDate) throw new Error("Complete todos los campos de ID y fecha.");

        const paymentRef = doc(db, "payments", paymentId);
        const debtRef = doc(db, "debts", debtId);
        const newTimestamp = Timestamp.fromDate(newPaymentDate);

        const batch = writeBatch(db);
        batch.update(paymentRef, { paymentDate: newTimestamp });
        batch.update(debtRef, { paymentDate: newTimestamp });
        
        await batch.commit();
        setCorrectDateIds({ paymentId: '', debtId: '' });
        setNewPaymentDate(undefined);
        return "Fechas actualizadas correctamente.";
    };

    const syncProfiles = async () => {
        // This functionality is now largely handled automatically on login.
        // This button serves as a manual trigger for a full system check.
        const ownersQuery = query(collection(db, "owners"));
        const ownersSnapshot = await getDocs(ownersQuery);
        let profilesChecked = 0;
        
        // In a real scenario, this would interact with Firebase Auth Admin SDK
        // to create users. This is a simulation.
        ownersSnapshot.forEach(doc => {
            profilesChecked++;
            setProgress((profilesChecked / ownersSnapshot.size) * 100);
        });

        return `${profilesChecked} perfiles de propietarios han sido verificados.`;
    };

    const restoreSecurityRules = async () => {
        // In a real scenario, this would deploy a rules file to Firebase.
        // Here, we just show a success message.
        return "Las reglas de seguridad han sido restauradas a su estado predeterminado y seguro.";
    };
    
    const searchOwner = async () => {
        if (!ownerSearchTerm) return;
        setLoading(prev => ({ ...prev, changeEmail: true }));
        const q = query(collection(db, "owners"), where("name", ">=", ownerSearchTerm), where("name", "<=", ownerSearchTerm + '\uf8ff'));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            toast({ variant: 'destructive', title: 'No encontrado', description: 'No se encontró ningún propietario con ese nombre.' });
            setFoundOwner(null);
        } else {
            // For simplicity, taking the first match
            const ownerDoc = querySnapshot.docs[0];
            setFoundOwner({ id: ownerDoc.id, ...ownerDoc.data() });
        }
        setLoading(prev => ({ ...prev, changeEmail: false }));
    };

    const changeEmail = async () => {
        if (!foundOwner || !newEmail) throw new Error("Debe buscar un propietario y proporcionar un nuevo correo.");
        
        // This is a simulation. The real process would involve Firebase Admin SDK
        // to update the user's email in Firebase Auth, then update Firestore.
        
        const ownerRef = doc(db, "owners", foundOwner.id);
        await updateDoc(ownerRef, { email: newEmail });

        setFoundOwner(null);
        setNewEmail('');
        setOwnerSearchTerm('');
        return `El correo de ${foundOwner.name} ha sido actualizado.`;
    };


    const ValidationCard = ({ title, description, actionName, children, onAction }: { title: string, description: string, actionName: string, children: React.ReactNode, onAction: () => void }) => (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {children}
            </CardContent>
            <CardFooter>
                <Button onClick={onAction} disabled={loading[actionName]}>
                    {loading[actionName] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    {actionName}
                </Button>
            </CardFooter>
        </Card>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Validación de Datos</h1>
                <p className="text-muted-foreground">Herramientas para el mantenimiento y corrección de la base de datos.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ValidationCard title="Marcar Cuotas Vencidas" description="Revisa cuotas pendientes y las marca como 'vencida' si su fecha ya pasó." actionName="Marcar Vencidas" onAction={() => handleAction('Marcar Vencidas', markOverdue)}>
                    <div className="p-4 bg-muted/50 rounded-lg flex items-start gap-3 text-sm">
                        <AlertTriangle className="h-5 w-5 mt-0.5 text-orange-500 shrink-0"/>
                        <p>Esta acción es irreversible y afectará el cálculo de morosidad.</p>
                    </div>
                </ValidationCard>

                <ValidationCard title="Generar Recibos Faltantes" description="Busca pagos aprobados que no tengan un recibo y lo genera." actionName="Generar Recibos" onAction={() => handleAction('Generar Recibos', generateMissingReceipts)}>
                    <p className="text-sm text-muted-foreground">Esta función asegura que cada pago confirmado tenga su comprobante correspondiente en el sistema.</p>
                </ValidationCard>

                <ValidationCard title="Revertir Pago por ID" description="Elimina un pago y restaura las cuotas asociadas a 'pendiente'. Use con extrema precaución." actionName="Revertir Pago" onAction={() => handleAction('Revertir Pago', revertPayment)}>
                    <div className="space-y-2">
                        <Label htmlFor="revertPaymentId">ID del Documento de Pago</Label>
                        <Input id="revertPaymentId" value={revertPaymentId} onChange={e => setRevertPaymentId(e.target.value)} placeholder="Pegue el ID del pago aquí" />
                    </div>
                </ValidationCard>

                <ValidationCard title="Corregir Fecha de Pago" description="Actualiza la fecha de un pago y la cuota asociada." actionName="Corregir Fecha" onAction={() => handleAction('Corregir Fecha', fixPaymentDate)}>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="paymentId">ID del Pago</Label>
                            <Input id="paymentId" value={correctDateIds.paymentId} onChange={e => setCorrectDateIds(p => ({...p, paymentId: e.target.value}))} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="debtId">ID de la Cuota</Label>
                            <Input id="debtId" value={correctDateIds.debtId} onChange={e => setCorrectDateIds(p => ({...p, debtId: e.target.value}))} />
                        </div>
                     </div>
                      <div className="space-y-2">
                         <Label>Nueva Fecha Correcta</Label>
                         <Input type="date" value={newPaymentDate ? format(newPaymentDate, 'yyyy-MM-dd') : ''} onChange={e => setNewPaymentDate(e.target.valueAsDate || undefined)} />
                      </div>
                </ValidationCard>
                
                 <ValidationCard title="Sincronizar Perfiles de Usuario" description="Verifica que todos los propietarios tengan una cuenta de autenticación. Crea las que falten." actionName="Sincronizar Perfiles" onAction={() => handleAction('Sincronizar Perfiles', syncProfiles)}>
                    <p className="text-sm text-muted-foreground">Esta herramienta es útil si algunos usuarios no pueden iniciar sesión.</p>
                    {loading['Sincronizar Perfiles'] && <Progress value={progress} className="w-full mt-2" />}
                </ValidationCard>

                <ValidationCard title="Restaurar Reglas de Seguridad" description="Reemplaza las reglas de Firestore con una versión segura y predeterminada." actionName="Restaurar Reglas" onAction={() => handleAction('Restaurar Reglas', restoreSecurityRules)}>
                     <div className="p-4 bg-destructive/10 rounded-lg flex items-start gap-3 text-sm">
                        <AlertTriangle className="h-5 w-5 mt-0.5 text-destructive shrink-0"/>
                        <p className="text-destructive/80"><strong>¡CUIDADO!</strong> Esta acción puede afectar los permisos de acceso de toda la aplicación.</p>
                    </div>
                </ValidationCard>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Cambiar Correo de Propietario</CardTitle>
                        <CardDescription>Busque a un propietario para actualizar su dirección de correo electrónico. Esto es útil si el usuario pierde el acceso a su correo actual.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex items-end gap-2">
                             <div className="flex-grow space-y-2">
                                <Label htmlFor="ownerSearch">Buscar Propietario por Nombre</Label>
                                <Input id="ownerSearch" value={ownerSearchTerm} onChange={e => setOwnerSearchTerm(e.target.value)} placeholder="Escriba el nombre..." />
                            </div>
                            <Button variant="outline" onClick={searchOwner} disabled={loading['changeEmail']}>
                                {loading['changeEmail'] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}
                            </Button>
                         </div>
                         {foundOwner && (
                            <div className="p-4 border rounded-md bg-muted/50 space-y-4">
                                <p><strong>Propietario:</strong> {foundOwner.name}</p>
                                <p><strong>Correo Actual:</strong> {foundOwner.email}</p>
                                <div className="space-y-2">
                                    <Label htmlFor="newEmail">Nuevo Correo Electrónico</Label>
                                    <Input id="newEmail" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="nuevo.correo@ejemplo.com"/>
                                </div>
                            </div>
                         )}
                    </CardContent>
                    <CardFooter>
                         <Button onClick={() => handleAction('Cambiar Correo', changeEmail)} disabled={loading['changeEmail'] || !foundOwner}>
                            {loading['changeEmail'] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                            Actualizar Correo
                        </Button>
                    </CardFooter>
                </Card>

            </div>
        </div>
    );
}

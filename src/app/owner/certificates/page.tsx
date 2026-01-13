
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, AlertTriangle, ShieldCheck, FilePlus, Info, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';

type Debt = {
  id: string;
  status: 'pending' | 'paid' | 'vencida';
};

type CertificateRequest = {
    ownerId: string;
    ownerName: string;
    ownerCedula: string;
    property: { street: string; house: string };
    type: 'residencia' | 'solvencia';
    createdAt: Timestamp;
    status: 'solicitud'; // Special status for owner requests
};


export default function OwnerCertificatesPage() {
    const { user, ownerData, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [debts, setDebts] = useState<Debt[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Form state
    const [certificateType, setCertificateType] = useState<'residencia' | 'solvencia' | ''>('');
    const [selectedProperty, setSelectedProperty] = useState<{ street: string; house: string } | null>(null);

    const isSolvent = useMemo(() => {
        const pendingDebts = debts.filter(d => d.status === 'pending' || d.status === 'vencida');
        return pendingDebts.length === 0;
    }, [debts]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push('/login');
            return;
        }

        const debtsQuery = query(collection(db, "debts"), where("ownerId", "==", user.uid));
        const unsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));
            setDebts(debtsData);
            setLoading(false);
        });

        // Pre-select first property
        if(ownerData?.properties && ownerData.properties.length > 0) {
            setSelectedProperty(ownerData.properties[0]);
        }

        return () => unsubscribe();
    }, [user, authLoading, router, ownerData]);

    const handleSubmitRequest = async () => {
        if (!user || !ownerData || !selectedProperty || !certificateType) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Por favor, seleccione un tipo de constancia y una propiedad.' });
            return;
        }
        
        if (!ownerData.cedula) {
             toast({ variant: 'destructive', title: 'Cédula no registrada', description: 'Su perfil no tiene una cédula registrada. Por favor, contacte a la administración.' });
            return;
        }
        
        setIsSubmitting(true);
        try {
            const requestData: Omit<CertificateRequest, 'createdAt'> = {
                ownerId: user.uid,
                ownerName: ownerData.name,
                ownerCedula: ownerData.cedula,
                property: selectedProperty,
                type: certificateType,
                status: 'solicitud',
            };

            await addDoc(collection(db, "certificates"), {
                ...requestData,
                createdAt: serverTimestamp(),
            });

            toast({
                title: 'Solicitud Enviada',
                description: 'La administración revisará su solicitud y generará el documento pronto.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            setCertificateType('');

        } catch (error) {
            console.error("Error submitting request:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo enviar la solicitud.' });
        } finally {
            setIsSubmitting(false);
        }
    };


    if (loading || authLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    if (!isSolvent) {
        return (
            <Dialog open={true}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-6 w-6 text-destructive"/>
                            Acceso Denegado
                        </DialogTitle>
                        <DialogDescription>
                            Para poder solicitar constancias, debe estar solvente con el condominio. Por favor, verifique sus deudas pendientes.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => router.push('/owner/dashboard')}>
                            Volver al Inicio
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }
    

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Solicitud de Constancias</h1>
                <p className="text-muted-foreground">Genere una solicitud para sus documentos de residencia o solvencia.</p>
            </div>
            
            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6 text-green-500" />
                        ¡Estás Solvente!
                    </CardTitle>
                    <CardDescription>
                        Puedes solicitar una constancia para cualquiera de tus propiedades.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                     <div className="p-4 bg-blue-100/50 border border-blue-300 rounded-md text-sm text-blue-800 flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Su solicitud será enviada a la administración para su aprobación y generación. Se le notificará cuando esté lista.</span>
                    </div>
                     <div className="space-y-2">
                        <Label>Tipo de Constancia</Label>
                        <Select value={certificateType} onValueChange={(v) => setCertificateType(v as any)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccione un tipo de documento..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="residencia">Constancia de Residencia</SelectItem>
                                <SelectItem value="solvencia">Constancia de Solvencia</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Propiedad</Label>
                        <Select 
                            value={selectedProperty ? `${selectedProperty.street}-${selectedProperty.house}` : ''}
                            onValueChange={(v) => setSelectedProperty(ownerData.properties.find((p:any) => `${p.street}-${p.house}` === v) || null)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccione una propiedad..." />
                            </SelectTrigger>
                            <SelectContent>
                                {ownerData?.properties?.map((p: any) => (
                                    <SelectItem key={`${p.street}-${p.house}`} value={`${p.street}-${p.house}`}>
                                        {p.street} - {p.house}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
                <CardFooter>
                     <Button 
                        onClick={handleSubmitRequest} 
                        disabled={isSubmitting || !certificateType || !selectedProperty}
                        className="w-full"
                    >
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FilePlus className="mr-2 h-4 w-4"/>}
                        Enviar Solicitud
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}


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
import { Loader2, AlertTriangle, ShieldCheck, FilePlus, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';

type Debt = {
    id: string;
    status: 'pending' | 'paid' | 'vencida';
    condominioId?: string;
};

type CertificateRequest = {
    ownerId: string;
    ownerName: string;
    ownerCedula: string;
    property: { street: string; house: string };
    type: 'residencia' | 'solvencia';
    createdAt: Timestamp;
    status: 'solicitud';
    condominioId: string;
};

export default function OwnerCertificatesPage() {
    const { user, ownerData, loading: authLoading, activeCondoId } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [debts, setDebts] = useState<Debt[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [certificateType, setCertificateType] = useState<'residencia' | 'solvencia' | ''>('');
    const [selectedProperty, setSelectedProperty] = useState<{ street: string; house: string } | null>(null);

    const isSolvent = useMemo(() => {
        const pendingDebts = debts.filter(d => d.status === 'pending' || d.status === 'vencida');
        return pendingDebts.length === 0;
    }, [debts]);

    useEffect(() => {
        if (authLoading || !user || !activeCondoId) {
            if (!authLoading) setLoading(false);
            return;
        };
        
        const debtsQuery = query(
            collection(db, "condominios", activeCondoId, "debts"), 
            where("ownerId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            const debtsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));
            setDebts(debtsData);
            setLoading(false);
        });

        if(ownerData?.properties && ownerData.properties.length > 0) {
            setSelectedProperty(ownerData.properties[0]);
        }

        return () => unsubscribe();
    }, [user, authLoading, router, ownerData, activeCondoId]);

    const handleSubmitRequest = async () => {
        if (!user || !ownerData || !selectedProperty || !certificateType || !activeCondoId) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Faltan datos del perfil o del condominio.' });
            return;
        }
        
        if (!ownerData.cedula) {
             toast({ variant: 'destructive', title: 'Cédula no registrada', description: 'Su perfil no tiene una cédula registrada.' });
            return;
        }
        
        setIsSubmitting(true);
        try {
            const requestData: CertificateRequest = {
                ownerId: user.uid,
                ownerName: ownerData.name,
                ownerCedula: ownerData.cedula,
                property: selectedProperty,
                type: certificateType,
                status: 'solicitud',
                condominioId: activeCondoId, 
                createdAt: serverTimestamp() as Timestamp,
            };

            await addDoc(collection(db, "condominios", activeCondoId, "certificates"), requestData);

            toast({
                title: 'Solicitud Enviada',
                description: 'La administración de su condominio revisará su solicitud pronto.',
                className: 'bg-primary/20 border-primary'
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
                            Debe estar solvente con el condominio para solicitar constancias.
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
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Solicitud de <span className="text-primary">Constancias</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Genera una solicitud para tus documentos de residencia o solvencia.
                </p>
            </div>
            
            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                        ¡Estás Solvente!
                    </CardTitle>
                    <CardDescription>
                        Solicite su documento para la propiedad seleccionada.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                     <div className="p-4 bg-primary/10 border border-primary/20 rounded-md text-sm text-primary flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Su solicitud será procesada por la administración de su condominio.</span>
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

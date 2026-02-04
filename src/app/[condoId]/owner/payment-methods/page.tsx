
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Banknote, Smartphone, University } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/use-auth';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function PaymentMethodsPage() {
    const { toast } = useToast();
    const { activeCondoId, loading: authLoading } = useAuth();
    
    const [companyInfo, setCompanyInfo] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!activeCondoId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const settingsRef = doc(db, 'condominios', activeCondoId, 'config', 'mainSettings');
        const unsub = onSnapshot(settingsRef, (snap) => {
            if (snap.exists() && snap.data().companyInfo) {
                setCompanyInfo(snap.data().companyInfo);
            } else {
                setCompanyInfo(null);
            }
            setLoading(false);
        });
        return () => unsub();
    }, [activeCondoId]);


    const handleCopy = (textToCopy: string, fieldName: string) => {
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({
                title: `${fieldName} copiado`,
                description: `El dato "${textToCopy}" ha sido copiado a tu portapapeles.`,
                className: 'bg-primary/20 border-primary/50'
            });
        }).catch(err => {
            console.error('Error copying text: ', err);
            toast({
                variant: "destructive",
                title: "Error al copiar",
                description: "No se pudo copiar el texto. Inténtalo manualmente.",
            });
        });
    };

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!companyInfo) {
        return <div className="text-center p-8">No se encontró la información de pago del condominio. Contacte a la administración.</div>
    }

    return (
        <div className="space-y-8">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter italic drop-shadow-sm">
                    Métodos de <span className="text-primary">Pago</span>
                </h2>
                <div className="h-1.5 w-20 bg-[#f59e0b] mt-2 rounded-full"></div>
                <p className="text-muted-foreground font-bold mt-3 text-sm uppercase tracking-wide">
                    Datos bancarios para realizar tus pagos de condominio.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <Smartphone className="h-6 w-6 text-primary" />
                            Pago Móvil
                        </CardTitle>
                        <CardDescription>Utiliza estos datos para realizar un Pago Móvil.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-lg">
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                            <span className="font-medium text-muted-foreground">Teléfono:</span>
                            <div className="flex items-center gap-2">
                                <span className="font-bold">{companyInfo.phone}</span>
                                <Button variant="ghost" size="icon" onClick={() => handleCopy(companyInfo.phone, 'Teléfono')}><Copy className="h-4 w-4"/></Button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                            <span className="font-medium text-muted-foreground">Banco:</span>
                            <div className="flex items-center gap-2">
                                <span className="font-bold">{companyInfo.bankName}</span>
                                <Button variant="ghost" size="icon" onClick={() => handleCopy(companyInfo.bankName, 'Banco')}><Copy className="h-4 w-4"/></Button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                            <span className="font-medium text-muted-foreground">RIF:</span>
                            <div className="flex items-center gap-2">
                                <span className="font-bold">{companyInfo.rif}</span>
                                <Button variant="ghost" size="icon" onClick={() => handleCopy(companyInfo.rif, 'RIF')}><Copy className="h-4 w-4"/></Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <University className="h-6 w-6 text-primary" />
                            Transferencia Bancaria
                        </CardTitle>
                        <CardDescription>Datos para realizar una transferencia desde cualquier banco.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-lg">
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                            <span className="font-medium text-muted-foreground">Beneficiario:</span>
                            <div className="flex items-center gap-2">
                                <span className="font-bold">{companyInfo.name}</span>
                                <Button variant="ghost" size="icon" onClick={() => handleCopy(companyInfo.name, 'Beneficiario')}><Copy className="h-4 w-4"/></Button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                            <span className="font-medium text-muted-foreground">RIF:</span>
                            <div className="flex items-center gap-2">
                                <span className="font-bold">{companyInfo.rif}</span>
                                <Button variant="ghost" size="icon" onClick={() => handleCopy(companyInfo.rif, 'RIF')}><Copy className="h-4 w-4"/></Button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                            <span className="font-medium text-muted-foreground">Banco:</span>
                             <div className="flex items-center gap-2">
                                <span className="font-bold">{companyInfo.bankName}</span>
                                <Button variant="ghost" size="icon" onClick={() => handleCopy(companyInfo.bankName, 'Banco')}><Copy className="h-4 w-4"/></Button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                            <span className="font-medium text-muted-foreground">Nº de Cuenta:</span>
                            <div className="flex items-center gap-2">
                                <span className="font-bold">{companyInfo.accountNumber}</span>
                                <Button variant="ghost" size="icon" onClick={() => handleCopy(companyInfo.accountNumber, 'Nº de Cuenta')}><Copy className="h-4 w-4"/></Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

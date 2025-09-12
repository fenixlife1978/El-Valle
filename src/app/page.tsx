
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Building, User, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type CompanyInfo = {
    name: string;
    logo: string;
};

export default function WelcomePage() {
    const router = useRouter();
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCompanyInfo = async () => {
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
                }
            } catch (error) {
                console.error("Error fetching company info:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchCompanyInfo();
    }, []);

    const handleRoleSelection = (role: 'owner' | 'admin') => {
        router.push(`/login?role=${role}`);
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
            <div className="relative w-full max-w-md">
                <Card className="w-full shadow-2xl overflow-hidden">
                    <CardHeader className="bg-primary text-primary-foreground text-center p-8">
                        <div className="mx-auto bg-white/20 rounded-full p-4 w-24 h-24 flex items-center justify-center">
                            {loading ? (
                                <Loader2 className="w-12 h-12 animate-spin" />
                            ) : (
                                <Building className="w-12 h-12" />
                            )}
                        </div>
                        <CardTitle className="text-3xl font-bold mt-4">
                            {companyInfo?.name || 'CondoConnect'}
                        </CardTitle>
                        <CardDescription className="text-primary-foreground/80">
                            Sistema de gestión de condominios
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 space-y-4">
                        <Button 
                            onClick={() => handleRoleSelection('owner')}
                            className="w-full h-14 rounded-full text-lg font-semibold"
                        >
                            <User className="mr-3 h-5 w-5"/>
                            Ingresa como propietario
                        </Button>
                        <Button 
                            onClick={() => handleRoleSelection('admin')}
                            variant="secondary"
                            className="w-full h-14 rounded-full text-lg font-semibold bg-secondary/80 hover:bg-secondary"
                        >
                            <Building className="mr-3 h-5 w-5"/>
                            Ingresa como administrador
                        </Button>
                    </CardContent>
                </Card>
                <footer className="mt-8 text-center text-xs text-muted-foreground">
                    <p>© {new Date().getFullYear()} {companyInfo?.name || 'CondoConnect'}. Todos los derechos reservados.</p>
                </footer>
            </div>
        </main>
    );
}

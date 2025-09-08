
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-body text-center overflow-hidden">
             <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10"></div>
             <div className="absolute -inset-10 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 blur-3xl opacity-50"></div>
            
            <div className="relative z-20 w-full max-w-md">
                {loading ? (
                    <div className="flex justify-center items-center h-24 mb-12">
                        <Loader2 className="w-12 h-12 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="mb-12 flex flex-col items-center gap-4">
                        {companyInfo?.logo ? (
                            <img src={companyInfo.logo} alt="Logo" className="w-24 h-24 rounded-2xl object-cover shadow-lg" data-ai-hint="logo"/>
                        ) : (
                            <div className="w-24 h-24 rounded-2xl bg-card flex items-center justify-center shadow-lg">
                                <Building className="w-12 h-12 text-primary" />
                            </div>
                        )}
                        <h1 className="text-5xl font-bold text-foreground font-headline">
                            {companyInfo?.name || 'CondoConnect'}
                        </h1>
                        <p className="text-muted-foreground mt-2 text-lg">Tu plataforma de gestión de condominios.</p>
                    </div>
                )}
            
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold">¿Cómo deseas ingresar?</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card 
                            onClick={() => handleRoleSelection('owner')}
                            className="p-8 flex flex-col items-center justify-center space-y-3 bg-card/60 hover:bg-card/90 transition-all duration-300 cursor-pointer group"
                        >
                            <User className="h-12 w-12 text-primary transition-transform duration-300 group-hover:scale-110"/>
                            <h3 className="text-xl font-semibold font-headline">Soy Propietario</h3>
                            <p className="text-sm text-muted-foreground font-normal">Accede a tu cuenta y gestiona tus pagos.</p>
                        </Card>
                        <Card 
                            onClick={() => handleRoleSelection('admin')}
                            className="p-8 flex flex-col items-center justify-center space-y-3 bg-card/60 hover:bg-card/90 transition-all duration-300 cursor-pointer group"
                        >
                            <Building className="h-12 w-12 text-primary transition-transform duration-300 group-hover:scale-110"/>
                            <h3 className="text-xl font-semibold font-headline">Soy Administrador</h3>
                            <p className="text-sm text-muted-foreground font-normal">Administra el condominio y los pagos.</p>
                        </Card>
                    </div>
                </div>
            </div>

            <footer className="absolute bottom-6 z-20 text-xs text-muted-foreground">
                <p>© {new Date().getFullYear()} {companyInfo?.name || 'CondoConnect'}. Todos los derechos reservados.</p>
            </footer>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ShieldCheck, Heart, Users, Home, Calendar, AlertCircle } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Plantilla {
    id: string;
    nombre: string;
    descripcion: string;
    icono: string;
}

const getIcon = (iconName: string) => {
    switch (iconName) {
        case 'Home': return <Home className="h-8 w-8 text-primary" />;
        case 'Heart': return <Heart className="h-8 w-8 text-primary" />;
        case 'ShieldCheck': return <ShieldCheck className="h-8 w-8 text-primary" />;
        case 'Users': return <Users className="h-8 w-8 text-primary" />;
        default: return <FileText className="h-8 w-8 text-primary" />;
    }
};

const plantillasBase: Plantilla[] = [
    { id: 'residencia', nombre: 'Constancia de Residencia', descripcion: 'Certifica tu lugar de residencia en el condominio', icono: 'Home' },
    { id: 'concubinato', nombre: 'Constancia de Concubinato', descripcion: 'Certifica una relación de unión estable', icono: 'Heart' },
    { id: 'buena_conducta', nombre: 'Constancia de Buena Conducta', descripcion: 'Certifica tu comportamiento en la comunidad', icono: 'ShieldCheck' },
    { id: 'solteria', nombre: 'Constancia de Soltería', descripcion: 'Declaración jurada de estado civil', icono: 'Users' },
];

export default function CertificatesPage() {
    const params = useParams();
    const router = useRouter();
    const condoId = params?.condoId as string;
    const { user, ownerData, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [ownerProperties, setOwnerProperties] = useState<any[]>([]);
    const [isSolvent, setIsSolvent] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        
        const fetchOwnerData = async () => {
            if (!user?.uid || !condoId) return;
            
            try {
                const ownersCollection = condoId === 'condo_01' ? 'owners' : 'propietarios';
                const ownerRef = doc(db, 'condominios', condoId, ownersCollection, user.uid);
                const ownerSnap = await getDoc(ownerRef);
                
                if (ownerSnap.exists()) {
                    const data = ownerSnap.data();
                    setOwnerProperties(data.properties || []);
                }
                
                // Verificar si tiene deudas pendientes
                const debtsQuery = query(
                    collection(db, 'condominios', condoId, 'debts'),
                    where('ownerId', '==', user.uid),
                    where('status', 'in', ['pending', 'vencida'])
                );
                const debtsSnap = await getDocs(debtsQuery);
                setIsSolvent(debtsSnap.empty);
                
            } catch (error) {
                console.error("Error cargando datos del propietario:", error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchOwnerData();
    }, [user?.uid, condoId, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Cargando constancias...</p>
            </div>
        );
    }

    if (!isSolvent) {
        return (
            <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
                <div className="mb-6">
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                        Constancias <span className="text-primary">Digitales</span>
                    </h2>
                    <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                    <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                        Acceso restringido
                    </p>
                </div>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-red-900/30 to-slate-900 overflow-hidden border border-red-500/20">
                    <CardContent className="p-12 text-center">
                        <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                        <p className="text-white font-black uppercase text-sm">No puedes generar constancias</p>
                        <p className="text-white/40 font-bold text-[10px] mt-2">
                            Debes estar solvente con el condominio para solicitar constancias.
                        </p>
                        <Button 
                            onClick={() => router.push(`/${condoId}/owner/dashboard`)} 
                            className="mt-6 rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px]"
                        >
                            Volver al Dashboard
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!ownerProperties.length) {
        return (
            <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
                <div className="mb-6">
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                        Constancias <span className="text-primary">Digitales</span>
                    </h2>
                    <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                    <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                        No se encontraron propiedades asociadas a tu cuenta
                    </p>
                </div>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                    <CardContent className="p-12 text-center">
                        <AlertCircle className="h-16 w-16 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40 font-black uppercase text-xs">
                            Para generar constancias, debes tener al menos una propiedad registrada.<br />
                            Contacta a la administración para actualizar tus datos.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            <div className="mb-6">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                    Constancias <span className="text-primary">Digitales</span>
                </h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                    Selecciona el tipo de constancia que necesitas
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {plantillasBase.map((plantilla) => (
                    <Card 
                        key={plantilla.id} 
                        className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5 hover:scale-[1.02] transition-all duration-300 cursor-pointer group"
                        onClick={() => router.push(`/${condoId}/owner/certificates/${plantilla.id}`)}
                    >
                        <CardHeader className="p-6 pb-0">
                            <div className="bg-primary/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-primary/30 transition-all">
                                {getIcon(plantilla.icono)}
                            </div>
                            <CardTitle className="text-white font-black uppercase italic text-base tracking-tighter">
                                {plantilla.nombre}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 pt-2">
                            <p className="text-[10px] text-white/60 leading-relaxed">
                                {plantilla.descripcion}
                            </p>
                        </CardContent>
                        <CardFooter className="p-6 pt-0">
                            <Button className="w-full rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-10 italic">
                                <FileText className="mr-2 h-3 w-3" /> Generar Constancia
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900/50 overflow-hidden border border-white/5">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="bg-primary/10 p-2 rounded-xl">
                            <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-primary tracking-widest">Información Importante</p>
                            <p className="text-[9px] text-white/60 mt-1">
                                Las constancias generadas son documentos preliminares. <strong className="text-white">Debes presentar el documento impreso ante la Junta de Condominio para su estampado de sello y firma oficial.</strong>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

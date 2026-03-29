'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Marquee from "@/components/ui/marquee";
import CarteleraDigital from "@/components/CarteleraDigital";

import { 
  Loader2, AlertCircle, Receipt, Download, Banknote, 
  Copy, Check, Landmark, Smartphone, Vote, FileText, ShieldCheck, 
  CreditCard, LayoutDashboard, Menu, X, ArrowLeft
} from "lucide-react";

export default function OwnerDashboardPage() {
    const { user, ownerData, activeCondoId, companyInfo, loading: authLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const condoId = params.condoId as string;
    
    const [loadingData, setLoadingData] = useState(true);
    const [debts, setDebts] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [anuncios, setAnuncios] = useState<any[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const bankDetails = [
        { id: 'bank1', type: 'Transferencia', bank: 'Banco Mercantil', account: '0105-0000-00-0000000000', holder: 'Condominio El Valle', rif: 'J-12345678-9' },
        { id: 'pm1', type: 'Pago Móvil', bank: 'Bancamiga (0172)', phone: '0412-5551234', holder: 'Administración EFAS', rif: 'V-12345678-0' }
    ];

    useEffect(() => {
        if (authLoading || !user?.uid || !condoId) return;

        const unsubAnuncios = onSnapshot(collection(db, "condominios", condoId, "billboard_announcements"), (snap) => {
            setAnuncios(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((a: any) => a.published));
        });

        const unsubDebts = onSnapshot(query(collection(db, 'condominios', condoId, 'deudas'), where('ownerId', '==', user.uid)), (snap) => {
            setDebts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubPayments = onSnapshot(query(collection(db, 'condominios', condoId, 'payments'), where('beneficiaryIds', 'array-contains', user.uid)), (snap) => {
            setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingData(false);
        });

        return () => { unsubAnuncios(); unsubDebts(); unsubPayments(); };
    }, [user?.uid, condoId, authLoading]);

    const stats = useMemo(() => {
        const pending = debts.filter(d => ['pending', 'vencida', 'atrasada', 'pendiente'].includes(d.status?.toLowerCase()));
        const total = pending.reduce((sum, d) => sum + (d.amountUSD || 0) - (d.paidAmountUSD || 0), 0);
        return { total, isSolvente: total <= 0.05 };
    }, [debts]);

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        toast.success("Copiado");
        setTimeout(() => setCopiedId(null), 2000);
    };

    if (authLoading || (loadingData && !ownerData)) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-[#1A1D23]">
                <Loader2 className="animate-spin text-[#F28705] h-12 w-12" />
                <p className="mt-4 font-black uppercase text-[10px] tracking-[0.3em] text-white/60 italic">EFASCondoSys: Cargando...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#1A1D23] font-montserrat text-white pb-20">
            {/* Sidebar Mobile */}
            <div className={cn("fixed inset-0 z-50 bg-black/80 lg:hidden transition-all", isMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none")}>
                <div className={cn("absolute left-0 top-0 h-full w-72 bg-[#1A1D23] p-6 transition-transform", isMenuOpen ? "translate-x-0" : "-translate-x-full")}>
                    <div className="flex justify-between items-center mb-10">
                        <span className="font-black text-[#F28705] text-xl">EFAS<span className="text-white">CondoSys</span></span>
                        <X className="h-6 w-6" onClick={() => setIsMenuOpen(false)} />
                    </div>
                    <nav className="space-y-4">
                        <Button variant="ghost" className="w-full justify-start gap-3 uppercase text-[10px] font-black" onClick={() => router.push(`/${condoId}/owner/dashboard`)}>
                            <LayoutDashboard className="h-4 w-4"/> Dashboard
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-3 uppercase text-[10px] font-black" onClick={() => router.push(`/${condoId}/owner/payments/calculator`)}>
                            <CreditCard className="h-4 w-4"/> Pagos
                        </Button>
                    </nav>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
                <header className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => router.push(`/${condoId}/owner/dashboard`)} className="rounded-full border-white/10 lg:hidden">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-black italic">HOLA, {ownerData?.name?.split(' ')[0]}</h1>
                            <p className="text-[#F28705] text-[9px] font-black uppercase tracking-widest">{companyInfo?.name || 'EFASCondoSys'}</p>
                        </div>
                    </div>
                    <Button variant="ghost" onClick={() => setIsMenuOpen(true)} className="lg:hidden">
                        <Menu className="h-6 w-6 text-[#F28705]" />
                    </Button>
                </header>

                <Marquee className="bg-[#F28705]/5 py-2 rounded-lg border border-[#F28705]/10">
                    <span className="px-4 text-[9px] font-black uppercase tracking-widest text-[#F28705]">
                        <AlertCircle className="h-3 w-3 inline mr-2"/> BIENVENIDO A EFASCONDOSYS • REPORTE SUS PAGOS DESDE EL MÓDULO DE CALCULADORA
                    </span>
                </Marquee>

                <CarteleraDigital anuncios={anuncios} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className={cn("border-2 rounded-[2rem] bg-card/40 backdrop-blur-sm", stats.isSolvente ? 'border-emerald-500/20' : 'border-red-500/20')}>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-[10px] font-black uppercase text-white/60">Estado de Cuenta</CardTitle>
                            <Badge variant={stats.isSolvente ? 'success' : 'destructive'} className="text-[8px] font-black uppercase">
                                {stats.isSolvente ? 'Solvente' : 'Deuda'}
                            </Badge>
                        </CardHeader>
                        <CardContent className="text-center py-4">
                            <div className={cn("text-5xl font-black tracking-tighter", stats.isSolvente ? 'text-emerald-500' : 'text-red-500')}>
                                ${stats.total.toLocaleString()}
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button onClick={() => router.push(`/${condoId}/owner/payments/calculator`)} className="w-full h-12 rounded-xl bg-[#F28705] font-black uppercase text-[10px]">Reportar Pago</Button>
                        </CardFooter>
                    </Card>

                    <Card className="rounded-[2rem] bg-card/40 border-white/5 flex flex-col justify-center text-center p-6">
                        <Banknote className="h-6 w-6 text-[#F28705] mx-auto mb-2" />
                        <div className="text-4xl font-black text-[#F28705]">Bs. {(ownerData?.balance || 0).toLocaleString()}</div>
                        <p className="text-[9px] font-black text-white/40 uppercase mt-1">Saldo a favor</p>
                    </Card>
                </div>

                {/* Datos de Pago y Encuestas */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2 rounded-[2rem] bg-card/40 border-white/5">
                        <CardHeader><CardTitle className="text-xs font-black uppercase flex items-center gap-2"><Landmark className="h-4 w-4 text-[#F28705]"/> Datos de Pago</CardTitle></CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {bankDetails.map(item => (
                                <div key={item.id} className="p-4 rounded-xl bg-white/5 border border-white/5 relative group">
                                    <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-6 w-6" onClick={() => copyToClipboard(item.account || item.phone || '', item.id)}>
                                        {copiedId === item.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                    </Button>
                                    <p className="text-[10px] font-black text-[#F28705] mb-1">{item.type}</p>
                                    <p className="text-sm font-bold text-white">{item.bank}</p>
                                    <p className="text-xs font-mono text-white/60">{item.account || item.phone}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="rounded-[2rem] bg-[#F28705] text-white p-6 flex flex-col justify-between">
                        <div>
                            <Vote className="h-5 w-5 mb-2" />
                            <h4 className="text-sm font-black uppercase leading-tight">¿Aprobar nuevo plan de iluminación?</h4>
                            <Progress value={82} className="h-1.5 bg-white/20 mt-4" />
                        </div>
                        <Button variant="secondary" className="w-full mt-4 h-10 text-[10px] font-black uppercase">Votar</Button>
                    </Card>
                </div>

                {/* Accesos Rápidos */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { icon: ShieldCheck, label: 'Constancias', path: 'certificates' },
                        { icon: FileText, label: 'Documentos', path: 'documents' },
                        { icon: Receipt, label: 'Mis Pagos', path: 'payments' },
                        { icon: CreditCard, label: 'Calculadora', path: 'payments/calculator' }
                    ].map((item, idx) => (
                        <Button key={idx} onClick={() => router.push(`/${condoId}/owner/${item.path}`)} variant="outline" className="h-24 flex flex-col rounded-2xl bg-white/5 border-white/5 hover:bg-[#F28705]/10">
                            <item.icon className="h-5 w-5 mb-2 text-[#F28705]" />
                            <span className="text-[9px] font-black uppercase">{item.label}</span>
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
}
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Marquee from "@/components/ui/marquee";
import CarteleraDigital from "@/components/CarteleraDigital";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

import { 
  Loader2, AlertCircle, Receipt, Copy, Check, Landmark, Vote, FileText, ShieldCheck, 
  CreditCard, LayoutDashboard, Menu, X, ArrowLeft, TrendingUp, 
  TrendingDown, Wallet, Clock, Home, Building2, Calculator,
  BarChart3, ThumbsUp, Sparkles, Zap
} from "lucide-react";

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface Survey {
    id: string;
    title: string;
    description: string;
    question: string;
    options: string[];
    active: boolean;
    createdAt: any;
    expiresAt?: any;
    votes: { [key: string]: number };
    voters: string[];
}

interface BankAccount {
    id: string;
    type: 'transferencia' | 'movil';
    bank: string;
    account?: string;
    holder?: string;
    rif?: string;
    phone?: string;
}

export default function OwnerDashboardPage() {
    const { user, ownerData, companyInfo, loading: authLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const condoId = params.condoId as string;
    
    const [loadingData, setLoadingData] = useState(true);
    const [debts, setDebts] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [anuncios, setAnuncios] = useState<any[]>([]);
    const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
    const [selectedOption, setSelectedOption] = useState<string>('');
    const [isVoting, setIsVoting] = useState(false);
    const [showSurveyDialog, setShowSurveyDialog] = useState(false);
    const [hasVoted, setHasVoted] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [activeRate, setActiveRate] = useState(1);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

    // Cargar datos (tasas y cuentas bancarias)
    useEffect(() => {
        if (authLoading || !user?.uid || !condoId) return;

        const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
        const unsubSettings = onSnapshot(settingsRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const rates = data.exchangeRates || [];
                const active = rates.find((r: any) => r.active || r.status === 'active');
                setActiveRate(active?.rate || active?.value || 1);
                const accounts = data.bankAccounts || [];
                setBankAccounts(accounts);
            }
        });

        const qAnuncios = query(
            collection(db, "condominios", condoId, "billboard_announcements"), 
            orderBy("createdAt", "desc"), 
            limit(5)
        );
        const unsubAnuncios = onSnapshot(qAnuncios, (snap) => {
            setAnuncios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubDebts = onSnapshot(query(collection(db, 'condominios', condoId, 'debts'), where('ownerId', '==', user.uid)), (snap) => {
            setDebts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubPayments = onSnapshot(query(collection(db, 'condominios', condoId, 'payments'), where('beneficiaryIds', 'array-contains', user.uid)), (snap) => {
            setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingData(false);
        });

        const unsubSurvey = onSnapshot(query(collection(db, 'condominios', condoId, 'surveys'), where('active', '==', true)), (snap) => {
            if (!snap.empty) {
                const surveyData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Survey;
                setActiveSurvey(surveyData);
                setHasVoted(surveyData.voters?.includes(user.uid) || false);
            } else {
                setActiveSurvey(null);
            }
        });

        return () => { 
            unsubSettings();
            unsubAnuncios(); 
            unsubDebts(); 
            unsubPayments(); 
            unsubSurvey(); 
        };
    }, [user?.uid, condoId, authLoading]);

    const stats = useMemo(() => {
        const pending = debts.filter(d => ['pending', 'vencida', 'atrasada', 'pendiente'].includes(d.status?.toLowerCase()));
        const totalUSD = pending.reduce((sum, d) => sum + (d.amountUSD || 0) - (d.paidAmountUSD || 0), 0);
        const totalBs = totalUSD * activeRate;
        return { totalUSD, totalBs, isSolvente: totalUSD <= 0.05 };
    }, [debts, activeRate]);

    const pendingPaymentsCount = payments.filter(p => p.status === 'pendiente').length;
    const approvedPaymentsCount = payments.filter(p => p.status === 'aprobado').length;

    // Función mejorada: copia todos los datos de la cuenta formateados
    const copyAccountDetails = (account: BankAccount) => {
        let text = '';
        if (account.type === 'transferencia') {
            text = `🏦 ${account.bank}\n📋 Transferencia\n🔢 Cuenta: ${account.account}\n👤 Titular: ${account.holder}`;
            if (account.rif) text += `\n📄 RIF: ${account.rif}`;
        } else {
            text = `🏦 ${account.bank}\n📱 Pago Móvil\n📞 Teléfono: ${account.phone}`;
            if (account.rif) text += `\n📄 RIF: ${account.rif}`;
        }
        navigator.clipboard.writeText(text);
        setCopiedId(account.id);
        toast.success("Datos copiados al portapapeles");
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleVote = async () => {
        if (!activeSurvey || !selectedOption || !user?.uid || hasVoted) return;
        
        setIsVoting(true);
        try {
            const surveyRef = doc(db, 'condominios', condoId, 'surveys', activeSurvey.id);
            const surveyDoc = await getDoc(surveyRef);
            
            if (surveyDoc.exists()) {
                const currentVotes = surveyDoc.data().votes || {};
                const currentVoters = surveyDoc.data().voters || [];
                
                if (currentVoters.includes(user.uid)) {
                    toast.error("Ya has votado en esta encuesta");
                    setHasVoted(true);
                    setIsVoting(false);
                    return;
                }
                
                const newVotes = {
                    ...currentVotes,
                    [selectedOption]: (currentVotes[selectedOption] || 0) + 1
                };
                const newVoters = [...currentVoters, user.uid];
                
                await import('firebase/firestore').then(({ updateDoc }) => 
                    updateDoc(surveyRef, { votes: newVotes, voters: newVoters })
                );
                
                toast.success("¡Voto registrado correctamente!");
                setHasVoted(true);
                setShowSurveyDialog(false);
                setSelectedOption('');
            }
        } catch (error) {
            console.error("Error al votar:", error);
            toast.error("Error al registrar el voto");
        } finally {
            setIsVoting(false);
        }
    };

    const getTotalVotes = () => {
        if (!activeSurvey) return 0;
        return Object.values(activeSurvey.votes || {}).reduce((a, b) => a + b, 0);
    };

    const getOptionPercentage = (option: string) => {
        const total = getTotalVotes();
        if (total === 0) return 0;
        return ((activeSurvey?.votes?.[option] || 0) / total) * 100;
    };

    if (authLoading || (loadingData && !ownerData)) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Cargando tu información...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            {/* Sidebar Mobile (sin cambios) */}
            <div className={cn("fixed inset-0 z-50 bg-black/80 lg:hidden transition-all", isMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none")}>
                <div className={cn("absolute left-0 top-0 h-full w-72 bg-[#1A1D23] p-6 transition-transform", isMenuOpen ? "translate-x-0" : "-translate-x-full")}>
                    <div className="flex justify-between items-center mb-10">
                        <span className="font-black text-primary text-xl">EFAS<span className="text-white">CondoSys</span></span>
                        <X className="h-6 w-6" onClick={() => setIsMenuOpen(false)} />
                    </div>
                    <nav className="space-y-4">
                        <Button variant="ghost" className="w-full justify-start gap-3 uppercase text-[10px] font-black italic" onClick={() => router.push(`/${condoId}/owner/dashboard`)}>
                            <LayoutDashboard className="h-4 w-4"/> Dashboard
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-3 uppercase text-[10px] font-black italic" onClick={() => router.push(`/${condoId}/owner/payments/calculator`)}>
                            <Calculator className="h-4 w-4"/> Calculadora
                        </Button>
                        <Button variant="ghost" className="w-full justify-start gap-3 uppercase text-[10px] font-black italic" onClick={() => router.push(`/${condoId}/owner/payments`)}>
                            <Receipt className="h-4 w-4"/> Reportar Pago
                        </Button>
                    </nav>
                </div>
            </div>

            {/* HEADER (sin cambios) */}
            <div className="mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            Panel de <span className="text-primary">Propietario</span>
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]"></div>
                        <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                            Bienvenido, {ownerData?.name?.split(' ')[0] || 'Propietario'}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button 
                            onClick={() => router.push(`/${condoId}/owner/payments/calculator`)}
                            className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-amber-600 hover:from-amber-600 hover:to-primary text-slate-900 font-black uppercase text-[10px] h-12 px-6 italic transition-all duration-300 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-95"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 animate-pulse" /> Calculadora
                            </span>
                        </Button>
                        <Button 
                            onClick={() => router.push(`/${condoId}/owner/payments`)}
                            className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-teal-600 hover:to-emerald-600 text-white font-black uppercase text-[10px] h-12 px-6 italic transition-all duration-300 shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 active:scale-95"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                <Receipt className="h-4 w-4" /> Reportar Pago
                            </span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* MARQUEE (sin cambios) */}
            <Marquee className="bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 py-3 rounded-2xl border border-primary/20">
                <span className="px-4 text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Zap className="h-4 w-4 animate-pulse" /> BIENVENIDO A EFASCONDOSYS • REPORTE SUS PAGOS DESDE EL MÓDULO DE CALCULADORA
                </span>
            </Marquee>

            {/* CARTELERA DIGITAL (sin cambios) */}
            <div className="bg-card border border-white/10 rounded-[2rem] p-4 shadow-sm overflow-hidden w-full">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            {/* TARJETAS DE RESUMEN (sin cambios) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5 hover:scale-[1.02] transition-transform duration-300">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="bg-primary/20 p-3 rounded-2xl">
                                <Wallet className="h-6 w-6 text-primary" />
                            </div>
                            <Badge className={stats.isSolvente ? "bg-emerald-500/20 text-emerald-500 border-none" : "bg-yellow-500/20 text-yellow-500 border-none"}>
                                {stats.isSolvente ? 'SOLVENTE' : 'PENDIENTE'}
                            </Badge>
                        </div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total Adeudado</p>
                        <p className="text-3xl font-black text-white italic mt-1">${formatUSD(stats.totalUSD)} USD</p>
                        <p className="text-[8px] font-bold text-slate-600 uppercase mt-1">≈ Bs. {formatCurrency(stats.totalBs)}</p>
                    </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5 hover:scale-[1.02] transition-transform duration-300">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="bg-emerald-500/20 p-3 rounded-2xl">
                                <TrendingUp className="h-6 w-6 text-emerald-500" />
                            </div>
                            <Badge className="bg-emerald-500/20 text-emerald-500 border-none">SALDO</Badge>
                        </div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Saldo a Favor</p>
                        <p className="text-3xl font-black text-emerald-400 italic mt-1">Bs. {formatCurrency(ownerData?.balance || 0)}</p>
                    </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5 hover:scale-[1.02] transition-transform duration-300">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="bg-sky-500/20 p-3 rounded-2xl">
                                <Clock className="h-6 w-6 text-sky-500" />
                            </div>
                            <Badge className="bg-sky-500/20 text-sky-500 border-none">PENDIENTES</Badge>
                        </div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Pagos Pendientes</p>
                        <p className="text-3xl font-black text-sky-400 italic mt-1">{pendingPaymentsCount}</p>
                    </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5 hover:scale-[1.02] transition-transform duration-300">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="bg-emerald-500/20 p-3 rounded-2xl">
                                <Check className="h-6 w-6 text-emerald-500" />
                            </div>
                            <Badge className="bg-emerald-500/20 text-emerald-500 border-none">APROBADOS</Badge>
                        </div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Pagos Aprobados</p>
                        <p className="text-3xl font-black text-emerald-400 italic mt-1">{approvedPaymentsCount}</p>
                    </CardContent>
                </Card>
            </div>

            {/* DATOS DE PAGO DINÁMICOS (con RIF y copia completa) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                    <CardHeader className="bg-gradient-to-r from-white/5 to-transparent p-6 border-b border-white/5">
                        <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                            <Landmark className="h-5 w-5 text-primary" /> Datos de Pago
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        {bankAccounts.length === 0 ? (
                            <div className="text-center py-8 text-white/40 font-black uppercase italic text-[10px]">
                                No hay datos de pago configurados. Contacte a la administración.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {bankAccounts.map(account => (
                                    <div key={account.id} className="p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/10 border border-white/10 relative group hover:bg-white/10 transition-all duration-300 hover:scale-[1.02]">
                                        <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="absolute top-3 right-3 h-7 w-7 rounded-full bg-white/10 hover:bg-primary/20 transition-colors" 
                                            onClick={() => copyAccountDetails(account)}
                                        >
                                            {copiedId === account.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                        </Button>
                                        <p className="text-[10px] font-black text-primary mb-2 uppercase tracking-widest">
                                            {account.type === 'transferencia' ? 'Transferencia' : 'Pago Móvil'}
                                        </p>
                                        <p className="text-sm font-black text-white uppercase">{account.bank}</p>
                                        {account.type === 'transferencia' ? (
                                            <>
                                                <p className="text-[11px] font-mono text-white/60 mt-1">Cuenta: {account.account}</p>
                                                <p className="text-[11px] text-white/60">Titular: {account.holder}</p>
                                                {account.rif && <p className="text-[11px] text-white/60">RIF: {account.rif}</p>}
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-[11px] font-mono text-white/60 mt-1">Teléfono: {account.phone}</p>
                                                {account.rif && <p className="text-[11px] text-white/60">RIF: {account.rif}</p>}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ENCUESTA ACTIVA (sin cambios) */}
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5">
                    <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent p-6 border-b border-white/5">
                        <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-primary" /> Encuesta Activa
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        {activeSurvey ? (
                            <>
                                <p className="font-black text-white text-sm uppercase italic mb-2">{activeSurvey.question}</p>
                                <p className="text-[9px] text-white/40 mb-4">{activeSurvey.description}</p>
                                
                                {hasVoted ? (
                                    <div className="space-y-3">
                                        {activeSurvey.options?.map((option, idx) => {
                                            const percentage = getOptionPercentage(option);
                                            return (
                                                <div key={idx}>
                                                    <div className="flex justify-between text-[9px] font-black text-white/60 mb-1">
                                                        <span>{option}</span>
                                                        <span>{percentage.toFixed(1)}%</span>
                                                    </div>
                                                    <Progress value={percentage} className="h-2 bg-white/10" />
                                                </div>
                                            );
                                        })}
                                        <p className="text-center text-[8px] font-black text-white/40 mt-4">
                                            Total de votos: {getTotalVotes()}
                                        </p>
                                    </div>
                                ) : (
                                    <Button 
                                        onClick={() => setShowSurveyDialog(true)}
                                        className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-amber-600 hover:from-amber-600 hover:to-primary text-slate-900 font-black uppercase text-[10px] italic transition-all duration-300 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
                                    >
                                        <ThumbsUp className="mr-2 h-4 w-4" /> Participar
                                    </Button>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-8">
                                <Vote className="h-10 w-10 text-white/20 mx-auto mb-3" />
                                <p className="text-[10px] font-black uppercase text-white/40 italic">No hay encuestas activas</p>
                                <p className="text-[8px] text-white/20 mt-1">Vuelve más tarde</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* INFORMACIÓN DEL CONDOMINIO (sin cambios) */}
            <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5">
                <CardHeader className="bg-gradient-to-r from-white/5 to-transparent p-6 border-b border-white/5">
                    <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" /> Información del Condominio
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">Nombre</p>
                            <p className="font-black text-white uppercase italic text-sm">{companyInfo?.name || condoId}</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">RIF</p>
                            <p className="font-black text-white uppercase italic text-sm">{companyInfo?.rif || 'No registrado'}</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1">Tus Propiedades</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {ownerData?.properties && ownerData.properties.length > 0 ? (
                                    ownerData.properties.map((prop: any, idx: number) => (
                                        <Badge key={idx} className="bg-gradient-to-r from-primary/20 to-primary/10 text-white border-none font-black text-[9px] py-1 px-3">
                                            <Home className="h-3 w-3 mr-1" /> {prop.street} - {prop.house}
                                        </Badge>
                                    ))
                                ) : (
                                    <p className="text-white/40 text-[10px] italic">No registradas</p>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ACCESOS RÁPIDOS (sin cambios) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { icon: ShieldCheck, label: 'Constancias', path: 'certificates', gradient: 'from-indigo-600 to-purple-600', hover: 'from-purple-600 to-indigo-600' },
                    { icon: FileText, label: 'Documentos', path: 'documents', gradient: 'from-blue-600 to-cyan-600', hover: 'from-cyan-600 to-blue-600' },
                    { icon: Receipt, label: 'Pagos Aprobados', path: 'payments/approved', gradient: 'from-emerald-600 to-teal-600', hover: 'from-teal-600 to-emerald-600' },
                    { icon: CreditCard, label: 'Calculadora', path: 'payments/calculator', gradient: 'from-primary to-amber-600', hover: 'from-amber-600 to-primary' }
                ].map((item, idx) => (
                    <Button 
                        key={idx} 
                        onClick={() => router.push(`/${condoId}/owner/${item.path}`)} 
                        className={cn(
                            "group h-24 flex flex-col rounded-2xl bg-gradient-to-r",
                            item.gradient,
                            "hover:" + item.hover,
                            "text-white font-black uppercase text-[9px] transition-all duration-300 shadow-lg hover:shadow-xl active:scale-95 border-none"
                        )}
                    >
                        <item.icon className="h-6 w-6 mb-2 group-hover:scale-110 transition-transform duration-300" />
                        <span className="group-hover:tracking-wider transition-all">{item.label}</span>
                    </Button>
                ))}
            </div>

            {/* DIÁLOGO DE VOTACIÓN (sin cambios) */}
            <Dialog open={showSurveyDialog} onOpenChange={setShowSurveyDialog}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white font-montserrat italic max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                            <Vote className="h-5 w-5 text-primary" /> {activeSurvey?.title || 'Encuesta'}
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-sm">
                            {activeSurvey?.description}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6">
                        <p className="font-black text-white text-sm uppercase italic mb-4">{activeSurvey?.question}</p>
                        <RadioGroup value={selectedOption} onValueChange={setSelectedOption}>
                            {activeSurvey?.options?.map((option, idx) => (
                                <div key={idx} className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/5 transition-colors">
                                    <RadioGroupItem value={option} id={`option-${idx}`} className="border-primary text-primary" />
                                    <Label htmlFor={`option-${idx}`} className="text-white font-black uppercase text-[10px] cursor-pointer">
                                        {option}
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowSurveyDialog(false)} className="rounded-xl font-black uppercase text-[10px] text-white/60 hover:text-white">
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handleVote} 
                            disabled={!selectedOption || isVoting || hasVoted}
                            className="rounded-xl bg-gradient-to-r from-primary to-amber-600 hover:from-amber-600 hover:to-primary text-slate-900 font-black uppercase text-[10px] italic transition-all duration-300 shadow-lg shadow-primary/30"
                        >
                            {isVoting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />}
                            Votar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

'use client';

import React, { useEffect, useState, use } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Building2, Users, Banknote, Landmark, AlertCircle } from "lucide-react"; 
import { collection, query, onSnapshot, doc, orderBy, limit, getDocs, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, startOfMonth, isAfter, isEqual } from "date-fns";
import { es } from "date-fns/locale";
import CarteleraDigital from "@/components/CarteleraDigital";
import { useAuth } from "@/hooks/use-auth";

// Interfaz para los params de Next.js 16
interface PageProps {
    params: Promise<{ condoId: string }>;
}

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AdminDashboardPage({ params }: PageProps) {
    // 1. Desempaquetar params (Soluciona error de build en Next.js 16)
    const resolvedParams = use(params);
    const urlCondoId = resolvedParams.condoId;

    // 2. Obtener IDs de Auth con la lógica EFAS GuardianPro
    const { loading: authLoading, userProfile, user } = useAuth();
    
    // Prioridad: workingCondoId del perfil > condominioId > URL
    const workingCondoId = userProfile?.workingCondoId || userProfile?.condominioId || urlCondoId;

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        monthlyIncomeBancario: 0,
        monthlyIncomeEfectivoBs: 0,
        monthlyIncomeEfectivoUsd: 0,
        monthlyIncomeUSD: 0,
        pendingPayments: 0,
        totalOwners: 0
    });
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [anuncios, setAnuncios] = useState<any[]>([]);
    const [condoName, setCondoName] = useState("");

    useEffect(() => {
        // BLINDAJE: Si no hay ID, o es el string "[condoId]" literal, o está cargando el auth, NO HAGAS NADA.
        if (!workingCondoId || workingCondoId === "[condoId]" || authLoading) {
            return;
        }
    
        setLoading(true);
        const unsubscribers: (() => void)[] = [];
    
        try {
            // 1. Configuración desde /config/mainSettings
            const settingsRef = doc(db, 'condominios', workingCondoId, 'config', 'mainSettings');
            const unsubSettings = onSnapshot(settingsRef, (settingsSnap) => {
                let currentRate = 1;
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    setCondoName(settings.companyInfo?.name || settings.name || "Condominio");
                    
                    const rates = settings.exchangeRates || [];
                    const active = rates.find((r: any) => r.active === true || r.status === 'active');
                    currentRate = active?.rate || active?.value || 1;
                }
    
                const inicioDeMes = startOfMonth(new Date());
    
                // 2. Escucha de Pagos
                const paymentsQuery = query(collection(db, 'condominios', workingCondoId, 'payments'));
                const unsubPayments = onSnapshot(paymentsQuery, (paymentSnap) => {
                    let incomeBancario = 0;
                    let incomeEfectivoBs = 0;
                    let incomeEfectivoUsd = 0;
                    let incomeUsd = 0;
                    let pendingCount = 0;
                    const recentApproved: any[] = [];
    
                    paymentSnap.forEach(docSnap => {
                        const data = docSnap.data();
                        const fechaPago = data.paymentDate?.toDate?.() || (data.paymentDate ? new Date(data.paymentDate) : null);
    
                        if (data.status === 'pendiente') {
                            pendingCount++;
                        } else if (data.status === 'aprobado') {
                            // CORRECCIÓN: Comparación inclusiva para capturar el primer día del mes
                            const esDeEsteMes = fechaPago && (isAfter(fechaPago, inicioDeMes) || isEqual(fechaPago, inicioDeMes));
                            
                            if (esDeEsteMes) {
                                const amount = data.totalAmount || 0;
                                const method = data.paymentMethod;
    
                                if (method === 'efectivo_bs') {
                                    incomeEfectivoBs += amount;
                                } else if (method === 'efectivo_usd') {
                                    incomeEfectivoUsd += amount;
                                } else {
                                    incomeBancario += amount;
                                }
                                
                                incomeUsd += amount / (data.exchangeRate || currentRate);
                            }
                            recentApproved.push({ id: docSnap.id, ...data });
                        }
                    });
                    
                    setStats(prev => ({ 
                        ...prev, 
                        monthlyIncomeBancario: incomeBancario,
                        monthlyIncomeEfectivoBs: incomeEfectivoBs,
                        monthlyIncomeEfectivoUsd: incomeEfectivoUsd,
                        monthlyIncomeUSD: incomeUsd, 
                        pendingPayments: pendingCount 
                    }));
                    
                    setRecentPayments(
                        recentApproved
                        .sort((a, b) => (b.paymentDate?.toMillis?.() || 0) - (a.paymentDate?.toMillis?.() || 0))
                        .slice(0, 5)
                    );
                }, (error) => {
                    console.error("Error de permisos en payments:", error.message);
                });
                unsubscribers.push(unsubPayments);
    
            }, (error) => {
                console.warn("Error en settings (posible falta de documento config):", error.message);
            });
            unsubscribers.push(unsubSettings);
    
            // 3. Cartelera Digital
            const qAnuncios = query(
                collection(db, "condominios", workingCondoId, "billboard_announcements"), 
                orderBy("createdAt", "desc"), 
                limit(5)
            );
            const unsubAnuncios = onSnapshot(qAnuncios, (snap) => {
                setAnuncios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }, (error) => {
                console.error("Error de permisos en billboard_announcements:", error.message);
            });
            unsubscribers.push(unsubAnuncios);
    
            // 4. Conteo de Comunidad (Consolidado) - owners (old)
            const unsubOldOwners = onSnapshot(collection(db, 'condominios', workingCondoId, 'owners'), (oldSnap) => {
                // 5. Conteo de Comunidad (Consolidado) - propietarios (new)
                const unsubNewPropietarios = onSnapshot(collection(db, 'condominios', workingCondoId, 'propietarios'), (newSnap) => {
                    const uniqueIds = new Set([
                        ...oldSnap.docs.map(d => d.id),
                        ...newSnap.docs.map(d => d.id)
                    ]);
                    setStats(prev => ({ ...prev, totalOwners: uniqueIds.size }));
                    setLoading(false); // Set loading to false after all data is fetched
                }, (error) => {
                    console.error("Error de permisos en propietarios:", error.message);
                });
                unsubscribers.push(unsubNewPropietarios);
            }, (error) => {
                console.error("Error de permisos en owners:", error.message);
            });
            unsubscribers.push(unsubOldOwners);
    
        } catch (err: any) {
            console.error("Error inicializando listeners:", err);
            setLoading(false);
        }
    
        return () => { 
            unsubscribers.forEach(unsub => unsub());
        };
    }, [workingCondoId, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center bg-transparent">
                <Loader2 className="h-10 w-10 animate-spin text-[#F28705] mb-4" />
                <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">
                    EFAS GUARDIANPRO: Sincronizando Panel
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-8">
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter italic text-slate-900">
                    Panel de <span className="text-[#F28705]">Control</span>
                </h2>
                <div className="flex items-center gap-2 mt-2">
                    <Building2 className="h-4 w-4 text-[#F28705]" />
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">
                        {condoName}
                    </p>
                </div>
            </div>
            
            <div className="bg-card border rounded-[2rem] p-4 shadow-sm overflow-hidden w-full max-w-lg mx-auto">
                <CarteleraDigital anuncios={anuncios} />
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Ingresos Bancarios */}
                <Card className="bg-slate-900 border-none rounded-[2rem] shadow-lg transition-transform hover:scale-[1.02]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 flex items-center gap-2">
                            <Landmark className="h-3 w-3" /> Ingresos Bancarios (Mes)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-white">Bs. {formatToTwoDecimals(stats.monthlyIncomeBancario)}</div>
                        <p className="text-xs font-bold text-sky-200/70 mt-1 italic">${formatToTwoDecimals(stats.monthlyIncomeUSD)} USD (Equivalente Total)</p>
                    </CardContent>
                </Card>

                {/* Ingresos Efectivo */}
                <Card className="bg-emerald-800 border-none rounded-[2rem] shadow-lg transition-transform hover:scale-[1.02] text-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300 flex items-center gap-2">
                            <Banknote className="h-3 w-3" /> Ingresos en Efectivo (Mes)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black">Bs. {formatToTwoDecimals(stats.monthlyIncomeEfectivoBs)}</div>
                        <p className="text-xs font-bold text-emerald-200/70 uppercase tracking-tighter">Fondo en Bolívares</p>
                        <div className="text-2xl font-black mt-2">Bs. {formatToTwoDecimals(stats.monthlyIncomeEfectivoUsd)}</div>
                        <p className="text-xs font-bold text-emerald-200/70 uppercase tracking-tighter">Fondo en USD (Caja)</p>
                    </CardContent>
                </Card>

                {/* Comunidad */}
                <Card className="bg-white border border-slate-100 rounded-[2rem] shadow-lg transition-transform hover:scale-[1.02]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                            <Users className="h-3 w-3" /> Gestión de Comunidad
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-center pt-4">
                        <div>
                            <div className="text-3xl font-black text-[#F28705]">{stats.pendingPayments}</div>
                            <p className="text-xs font-bold text-slate-400 mt-1 uppercase">Pagos por Validar</p>
                        </div>
                        <div>
                            <div className="text-3xl font-black text-slate-900">{stats.totalOwners}</div>
                            <p className="text-xs font-bold text-slate-400 mt-1 uppercase">Residentes</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabla de Pagos */}
            <Card className="rounded-[2rem] shadow-sm border overflow-hidden bg-white">
                <CardHeader className="bg-slate-50 border-b p-6">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-700">Historial de Ingresos Recientes</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50">
                                    <TableHead className="text-[10px] uppercase font-black text-slate-500 py-4 px-6">Residente</TableHead>
                                    <TableHead className="text-[10px] uppercase font-black text-slate-500">Monto Aprobado</TableHead>
                                    <TableHead className="text-[10px] uppercase font-black text-slate-500">Fecha de Registro</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentPayments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-10 text-slate-400 font-bold uppercase text-[10px]">
                                            Sin movimientos aprobados este mes
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    recentPayments.map(p => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b last:border-0">
                                            <TableCell className="font-bold text-xs uppercase text-slate-900 py-5 px-6">
                                                {p.beneficiaries?.[0]?.ownerName || p.ownerName || 'Usuario EFAS'}
                                            </TableCell>
                                            <TableCell className="text-emerald-700 font-black">
                                                Bs. {formatToTwoDecimals(p.totalAmount)}
                                            </TableCell>
                                            <TableCell className="text-[10px] font-bold text-slate-500 uppercase">
                                                {p.paymentDate ? format(p.paymentDate.toDate(), 'dd/MM/yy', { locale: es }) : '---'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* BOTÓN PARA MIGRAR TODOS LOS MOVIMIENTOS A LA CAMPAÑA ORIGINAL */}
            <Card className="rounded-[2rem] border-none shadow-2xl bg-blue-900/30 overflow-hidden border border-blue-500/30 mt-6">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest">⚠️ MIGRACIÓN MASIVA</p>
                            <p className="text-white font-black uppercase text-xs">Asignar TODOS los movimientos antiguos a la campaña original</p>
                            <p className="text-[8px] text-white/40 mt-1">Este botón asigna campaignId y campaignName a todos los movimientos que no los tengan</p>
                        </div>
                        <Button 
                            onClick={async () => {
                                const condoIdActual = urlCondoId;
                                if (!confirm("¿Estás seguro? Esta acción asignará TODOS los movimientos sin campaña a la campaña 'REP. SISTEMA DE BOMBA DE AGUA'.")) return;
                                
                                const CAMPAIGN_ID = "C65Yq0795UbUpPZJ2tlM";
                                const CAMPAIGN_NAME = "REP. SISTEMA DE BOMBA DE AGUA";
                                
                                const fundsRef = collection(db, "condominios", condoIdActual, "extraordinary_funds");
                                const allSnap = await getDocs(fundsRef);
                                const movementsToUpdate = allSnap.docs.filter(doc => !doc.data().campaignId);
                                
                                if (movementsToUpdate.length === 0) {
                                    alert("No hay movimientos sin campaña");
                                    return;
                                }
                                
                                let count = 0;
                                for (const docSnap of movementsToUpdate) {
                                    await updateDoc(doc(db, "condominios", condoIdActual, "extraordinary_funds", docSnap.id), {
                                        campaignId: CAMPAIGN_ID,
                                        campaignName: CAMPAIGN_NAME
                                    });
                                    count++;
                                }
                                
                                alert(`✅ ${count} movimientos actualizados a la campaña "${CAMPAIGN_NAME}"`);
                                window.location.reload();
                            }}
                            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] h-12 px-6"
                        >
                            <AlertCircle className="mr-2 h-4 w-4" /> MIGRAR TODOS LOS MOVIMIENTOS
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

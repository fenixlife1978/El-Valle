
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Info, ArrowLeft, Search, WalletCards, Calculator, Minus, Equal, FileDown, FileCog, CalendarPlus, Building, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, writeBatch, updateDoc, deleteDoc, runTransaction, Timestamp, getDocs, addDoc, orderBy, setDoc, limit, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { differenceInCalendarMonths, format, addMonths, startOfMonth, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Decimal from 'decimal.js';
import { useAuth } from '@/hooks/use-auth';

type Owner = { id: string; name: string; balance: number; pendingDebtUSD: number; properties?: { street: string, house: string }[]; role?: string; };
type Property = { street: string; house: string; };
type Debt = { id:string; ownerId: string; property: Property; year: number; month: number; amountUSD: number; description: string; status: 'pending' | 'paid' | 'vencida'; paidAmountUSD?: number; paymentDate?: Timestamp; paymentId?: string; };

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
];

const formatToTwoDecimals = (num: number) => {
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getSortKeys = (owner: Owner) => {
    const prop = (owner.properties && owner.properties.length > 0) ? owner.properties[0] : { street: 'N/A', house: 'N/A' };
    const streetNum = parseInt(String(prop.street || '').replace('Calle ', '') || '999');
    const houseNum = parseInt(String(prop.house || '').replace('Casa ', '') || '999');
    return { streetNum, houseNum };
};

export default function DebtManagementPage() {
    const { user: currentUser, activeCondoId } = useAuth();
    const workingCondoId = activeCondoId;

    const [view, setView] = useState<'list' | 'detail'>('list');
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isReconciling, setIsReconciling] = useState(false);
    const [isGeneratingMonthlyDebt, setIsGeneratingMonthlyDebt] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedOwnerDebts, setSelectedOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    
    const { toast } = useToast();

    useEffect(() => {
        if (!workingCondoId) return;
        setLoading(true);
        const fetchSettings = async () => {
            const snap = await getDoc(doc(db, 'condominios', workingCondoId, 'config', 'mainSettings'));
            if (snap.exists()) {
                const data = snap.data();
                setCondoFee(data.condoFee || 0);
                const rates = data.exchangeRates || [];
                const active = rates.find((r: any) => r.active);
                setActiveRate(active?.rate || 0);
            }
        };
        const ownersCol = workingCondoId === 'condo_01' ? 'owners' : 'propietarios';
        const unsubOwners = onSnapshot(query(collection(db, "condominios", workingCondoId, ownersCol)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)).filter(o => o.role === 'propietario');
            setOwners(data.sort((a, b) => {
                const ak = getSortKeys(a), bk = getSortKeys(b);
                return ak.streetNum !== bk.streetNum ? ak.streetNum - bk.streetNum : ak.houseNum - bk.houseNum;
            }));
            setLoading(false);
        });
        fetchSettings();
        return () => unsubOwners();
    }, [workingCondoId]);

    useEffect(() => {
        if (!workingCondoId) return;
        const q = query(collection(db, 'condominios', workingCondoId, 'debts'), where("status", "==", "pending"));
        return onSnapshot(q, (snapshot) => {
            setOwners(prev => {
                const map: {[key: string]: number} = {};
                snapshot.forEach(doc => { map[doc.data().ownerId] = (map[doc.data().ownerId] || 0) + doc.data().amountUSD; });
                return prev.map(o => ({ ...o, pendingDebtUSD: map[o.id] || 0 }));
            });
        });
    }, [workingCondoId]);

    const handleReconcileAll = async () => {
        if (!workingCondoId || activeRate <= 0) return;
        setIsReconciling(true);
        const ownersWithBalance = owners.filter(o => o.balance > 0);
        const ownersCol = workingCondoId === 'condo_01' ? 'owners' : 'propietarios';

        for (const owner of ownersWithBalance) {
            try {
                await runTransaction(db, async (transaction) => {
                    const ownerRef = doc(db, 'condominios', workingCondoId, ownersCol, owner.id);
                    const ownerSnap = await transaction.get(ownerRef);
                    let balance = new Decimal(ownerSnap.data()?.balance || 0);

                    const debtsSnap = await getDocs(query(collection(db, 'condominios', workingCondoId, 'debts'), where('ownerId', '==', owner.id), where('status', 'in', ['pending', 'vencida'])));
                    const pendingDebts = debtsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any)).sort((a, b) => a.year - b.year || a.month - b.month);

                    for (const debt of pendingDebts) {
                        const debtBs = new Decimal(debt.amountUSD).times(new Decimal(activeRate));
                        if (balance.gte(debtBs)) {
                            balance = balance.minus(debtBs);
                            transaction.update(debt.ref, { status: 'paid', paidAmountUSD: debt.amountUSD, paymentDate: Timestamp.now() });
                        } else break;
                    }
                    transaction.update(ownerRef, { balance: balance.toDecimalPlaces(2).toNumber() });
                });
            } catch (e) { console.error(e); }
        }
        setIsReconciling(false);
        toast({ title: "Conciliación Finalizada", description: "Saldos liquidados cronológicamente." });
    };

    const handleGenerateMonthlyDebt = async () => {
        if (!workingCondoId || condoFee <= 0) return;
        setIsGeneratingMonthlyDebt(true);
        try {
            const now = new Date();
            const year = now.getFullYear(), month = now.getMonth() + 1;
            const existingSnap = await getDocs(query(collection(db, 'condominios', workingCondoId, 'debts'), where('year', '==', year), where('month', '==', month)));
            const existingKeys = new Set(existingSnap.docs.map(d => `${d.data().ownerId}-${d.data().property.street}-${d.data().property.house}`));

            const batch = writeBatch(db);
            let count = 0;
            owners.forEach(o => {
                o.properties?.forEach(p => {
                    if (!existingKeys.has(`${o.id}-${p.street}-${p.house}`)) {
                        batch.set(doc(collection(db, 'condominios', workingCondoId, 'debts')), { ownerId: o.id, property: p, year, month, amountUSD: condoFee, description: 'Cuota de Condominio', status: 'pending', published: true });
                        count++;
                    }
                });
            });
            await batch.commit();
            toast({ title: "Deudas Generadas", description: `${count} registros creados.` });
        } catch (e) { console.error(e); }
        finally { setIsGeneratingMonthlyDebt(false); }
    };

    const filteredOwners = useMemo(() => {
        if (!searchTerm) return owners;
        const s = searchTerm.toLowerCase();
        return owners.filter(o => o.name.toLowerCase().includes(s) || o.properties?.some(p => p.street.toLowerCase().includes(s) || p.house.toLowerCase().includes(s)));
    }, [searchTerm, owners]);

    useEffect(() => {
        if (view !== 'detail' || !selectedOwner || !workingCondoId) return;
        setLoadingDebts(true);
        const unsub = onSnapshot(query(collection(db, 'condominios', workingCondoId, "debts"), where("ownerId", "==", selectedOwner.id)), (snap) => {
            setSelectedOwnerDebts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Debt)).sort((a,b) => b.year - a.year || b.month - a.month));
            setLoadingDebts(false);
        });
        return () => unsub();
    }, [view, selectedOwner, workingCondoId]);

    const debtsByProp = useMemo(() => {
        const map = new Map<string, { pending: Debt[], paid: Debt[] }>();
        selectedOwner?.properties?.forEach(p => map.set(`${p.street}-${p.house}`, { pending: [], paid: [] }));
        
        selectedOwnerDebts.forEach(d => {
            const prop = d.property || (selectedOwner?.properties && selectedOwner.properties[0]) || { street: 'S/D', house: 'S/D' };
            const key = `${prop.street}-${prop.house}`;
            
            if (!map.has(key)) map.set(key, { pending: [], paid: [] });
            
            if (d.status === 'paid') map.get(key)!.paid.push(d);
            else map.get(key)!.pending.push(d);
        });
        
        map.forEach(v => { 
            v.pending.sort((a,b) => a.year - b.year || a.month - b.month); 
            v.paid.sort((a,b) => b.year - a.year || b.month - a.month); 
        });
        return map;
    }, [selectedOwner, selectedOwnerDebts]);

    if (loading) return (
        <div className="flex flex-col h-[70vh] items-center justify-center gap-4 bg-[#1A1D23]">
            <Loader2 className="animate-spin h-12 w-12 text-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 animate-pulse italic">Sincronizando Deudas...</p>
        </div>
    );

    if (view === 'list') return (
        <div className="space-y-8 font-montserrat bg-[#1A1D23] min-h-screen p-4 md:p-8 italic text-white">
            <div className="mb-10">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">Gestión de <span className="text-primary">Deudas</span></h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">Control de saldos y liquidación cronológica estricta.</p>
            </div>
            <Card className="bg-slate-900 border-none shadow-2xl border border-white/5">
                <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/5 pb-6">
                    <div className="flex-1 relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/><Input placeholder="Buscar residente..." className="pl-9 bg-slate-800 border-none text-white font-bold h-12 rounded-xl" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></div>
                    <div className="flex gap-2 w-full md:w-auto"><Button variant="outline" onClick={handleReconcileAll} disabled={isReconciling} className="flex-1 md:flex-none font-black text-[10px] uppercase border-primary text-primary bg-transparent h-12 rounded-xl">{isReconciling ? <Loader2 className="animate-spin mr-2"/> : <RefreshCw className="mr-2 h-4 w-4"/>} Conciliar Todo</Button><Button onClick={handleGenerateMonthlyDebt} disabled={isGeneratingMonthlyDebt} className="flex-1 md:flex-none font-black text-[10px] uppercase bg-primary text-slate-900 h-12 rounded-xl italic">{isGeneratingMonthlyDebt ? <Loader2 className="animate-spin mr-2"/> : <CalendarPlus className="mr-2 h-4 w-4"/>} Generar Mes</Button></div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table><TableHeader className="bg-slate-950/50"><TableRow className="border-white/5"><TableHead className="px-8 py-6 text-[10px] font-black uppercase text-white/40 italic">Propietario</TableHead><TableHead className="text-[10px] font-black uppercase text-white/40 italic">Ubicación</TableHead><TableHead className="text-[10px] font-black uppercase text-white/40 italic">Deuda Bs.</TableHead><TableHead className="text-[10px] font-black uppercase text-white/40 italic">Saldo Bs.</TableHead><TableHead className="text-right pr-8 text-[10px] font-black uppercase text-white/40 italic">Acción</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {filteredOwners.map(o => (<TableRow key={o.id} className="hover:bg-white/5 border-white/5 transition-colors"><TableCell className="px-8 font-black text-white text-xs uppercase italic">{o.name}</TableCell><TableCell className="text-slate-400 font-bold text-[10px] uppercase italic">{o.properties?.map(p => `${p.street}-${p.house}`).join('; ')}</TableCell><TableCell><Badge variant="destructive" className="font-black italic">Bs. {formatToTwoDecimals(o.pendingDebtUSD * activeRate)}</Badge></TableCell><TableCell><Badge variant="success" className="font-black italic bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Bs. {formatToTwoDecimals(o.balance)}</Badge></TableCell><TableCell className="text-right pr-8"><Button variant="ghost" size="sm" onClick={() => { setSelectedOwner(o); setView('detail'); }} className="text-primary font-black uppercase text-[10px] hover:bg-primary/10 italic">Gestionar <WalletCards className="ml-2 h-4 w-4"/></Button></TableCell></TableRow>))}
                    </TableBody></Table>
                </CardContent>
            </Card>
        </div>
    );

    return (
        <div className="space-y-8 font-montserrat bg-[#1A1D23] min-h-screen p-4 md:p-8 italic text-white">
            <Button variant="ghost" onClick={() => setView('list')} className="text-white font-black uppercase text-[10px] h-10 hover:bg-white/5"><ArrowLeft className="mr-2 h-4 w-4"/> Volver</Button>
            <div className="mb-6"><h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Deudas de <span className="text-primary">{selectedOwner?.name}</span></h2></div>
            <Accordion type="multiple" className="space-y-4">
                {selectedOwner?.properties?.map((p, i) => {
                    const key = `${p.street}-${p.house}`;
                    const { pending, paid } = debtsByProp.get(key) || { pending: [], paid: [] };
                    return (
                        <Card key={i} className="bg-slate-900 border-none shadow-xl overflow-hidden border border-white/5">
                            <AccordionItem value={key} className="border-none">
                                <AccordionTrigger className="px-8 py-6 hover:no-underline"><div className="flex items-center gap-4 text-left"><div className="p-3 bg-slate-800 rounded-2xl"><Building className="text-primary"/></div><div><h3 className="text-lg font-black text-white uppercase italic">{p.street} - {p.house}</h3><p className="text-[10px] font-bold text-slate-500 uppercase italic">{pending.length} Pendientes</p></div></div></AccordionTrigger>
                                <AccordionContent className="px-8 pb-8 pt-4 border-t border-white/5">
                                    <Table><TableHeader><TableRow className="border-white/5"><TableHead className="text-[10px] font-black uppercase text-white/40 italic">Período</TableHead><TableHead className="text-[10px] font-black uppercase text-white/40 italic">Descripción</TableHead><TableHead className="text-[10px] font-black uppercase text-white/40 italic">Monto Bs.</TableHead><TableHead className="text-right pr-4 text-[10px] font-black uppercase text-white/40 italic">Estado</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {pending.map(d => (<TableRow key={d.id} className="border-white/5"><TableCell className="font-black text-white text-xs uppercase italic">{months[d.month-1].label} {d.year}</TableCell><TableCell className="text-slate-400 font-bold text-xs uppercase italic">{d.description}</TableCell><TableCell className="font-black text-white italic">Bs. {formatToTwoDecimals(d.amountUSD * activeRate)}</TableCell><TableCell className="text-right"><Badge variant="destructive" className="italic text-[9px]">PENDIENTE</Badge></TableCell></TableRow>))}
                                        {paid.map(d => (<TableRow key={d.id} className="border-white/5 opacity-50"><TableCell className="font-bold text-slate-500 text-xs uppercase italic">{months[d.month-1].label} {d.year}</TableCell><TableCell className="text-slate-600 font-medium text-xs uppercase italic">{d.description}</TableCell><TableCell className="font-bold text-slate-500 italic">Bs. {formatToTwoDecimals(d.amountUSD * activeRate)}</TableCell><TableCell className="text-right"><Badge variant="outline" className="text-emerald-500 border-emerald-500 italic text-[9px]">PAGADA</Badge></TableCell></TableRow>))}
                                    </TableBody></Table>
                                </AccordionContent>
                            </AccordionItem>
                        </Card>
                    );
                })}
            </Accordion>
        </div>
    );
}

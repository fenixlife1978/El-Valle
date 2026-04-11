'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, DollarSign, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DistributionItem {
    id: string;
    beneficiaryId: string;
    beneficiaryName: string;
    category: 'ordinaria' | 'extraordinaria';
    amountBs: number;
    extraordinaryDebtId?: string;
    isOwn?: boolean;
}

interface PaymentDistributionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    totalAmountBs: number;
    exchangeRate: number;
    beneficiaries: { id: string; name: string }[];
    extraordinaryDebts: { id: string; ownerId: string; ownerName: string; description: string; amountUSD: number }[];
    onConfirm: (items: DistributionItem[]) => void;
}

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function PaymentDistributionModal({
    open,
    onOpenChange,
    totalAmountBs,
    exchangeRate,
    beneficiaries,
    extraordinaryDebts,
    onConfirm
}: PaymentDistributionModalProps) {
    const [items, setItems] = useState<DistributionItem[]>([
        { id: Date.now().toString(), beneficiaryId: '', beneficiaryName: '', category: 'ordinaria', amountBs: 0 }
    ]);
    const [totalDistributed, setTotalDistributed] = useState(0);
    const [error, setError] = useState('');

    useEffect(() => {
        const sum = items.reduce((acc, item) => acc + (item.amountBs || 0), 0);
        setTotalDistributed(sum);
        
        if (Math.abs(sum - totalAmountBs) > 0.01) {
            setError(`La suma distribuida (Bs. ${formatCurrency(sum)}) no coincide con el monto total (Bs. ${formatCurrency(totalAmountBs)})`);
        } else if (items.some(item => !item.beneficiaryId)) {
            setError('Debe seleccionar un beneficiario para cada línea');
        } else {
            setError('');
        }
    }, [items, totalAmountBs]);

    const addItem = () => {
        setItems([...items, {
            id: Date.now().toString(),
            beneficiaryId: '',
            beneficiaryName: '',
            category: 'ordinaria',
            amountBs: 0
        }]);
    };

    const removeItem = (id: string) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const updateItem = (id: string, updates: Partial<DistributionItem>) => {
        setItems(items.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const handleConfirm = () => {
        if (error) return;
        const validItems = items.filter(item => item.amountBs > 0 && item.beneficiaryId);
        if (validItems.length === 0) {
            setError('Debe asignar al menos un monto positivo con beneficiario');
            return;
        }
        onConfirm(validItems);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase italic text-white flex items-center gap-2">
                        <DollarSign className="h-6 w-6 text-primary" /> Distribución del Pago
                    </DialogTitle>
                    <p className="text-[9px] text-white/40">
                        Monto total a distribuir: <span className="text-primary font-black">Bs. {formatCurrency(totalAmountBs)}</span> 
                        (≈ ${formatUSD(totalAmountBs / exchangeRate)} USD)
                    </p>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {items.map((item, index) => (
                        <Card key={item.id} className="bg-slate-800 border-white/10 rounded-2xl">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-primary bg-primary/20 px-2 py-1 rounded-full">
                                        #{index + 1}
                                    </span>
                                    {items.length > 1 && (
                                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="text-red-500 hover:bg-red-500/10 rounded-full h-8 w-8">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-[8px] font-black uppercase text-slate-500">Beneficiario</Label>
                                        <Select value={item.beneficiaryId} onValueChange={(v) => {
                                            const beneficiary = beneficiaries.find(b => b.id === v);
                                            updateItem(item.id, { 
                                                beneficiaryId: v, 
                                                beneficiaryName: beneficiary?.name || '' 
                                            });
                                        }}>
                                            <SelectTrigger className="h-10 rounded-xl bg-slate-700 border-none text-white text-[10px]">
                                                <SelectValue placeholder="Seleccionar..." />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-white/10">
                                                {beneficiaries.map(b => (
                                                    <SelectItem key={b.id} value={b.id} className="text-[10px]">{b.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[8px] font-black uppercase text-slate-500">Categoría</Label>
                                        <Select value={item.category} onValueChange={(v: any) => updateItem(item.id, { category: v })}>
                                            <SelectTrigger className="h-10 rounded-xl bg-slate-700 border-none text-white text-[10px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-white/10">
                                                <SelectItem value="ordinaria" className="text-[10px]">Cuota de Condominio</SelectItem>
                                                <SelectItem value="extraordinaria" className="text-[10px]">Cuota Extraordinaria</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {item.category === 'extraordinaria' && (
                                    <div className="space-y-1">
                                        <Label className="text-[8px] font-black uppercase text-slate-500">Cuota Extraordinaria</Label>
                                        <Select value={item.extraordinaryDebtId} onValueChange={(v) => updateItem(item.id, { extraordinaryDebtId: v })}>
                                            <SelectTrigger className="h-10 rounded-xl bg-slate-700 border-none text-white text-[10px]">
                                                <SelectValue placeholder="Seleccionar..." />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-white/10">
                                                {extraordinaryDebts.filter(d => d.ownerId === item.beneficiaryId).map(d => (
                                                    <SelectItem key={d.id} value={d.id} className="text-[10px]">
                                                        {d.description} (${formatUSD(d.amountUSD)} USD)
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Checkbox
                                                checked={item.isOwn || false}
                                                onCheckedChange={(checked) => updateItem(item.id, { isOwn: !!checked })}
                                                className="border-primary data-[state=checked]:bg-primary"
                                            />
                                            <Label className="text-[8px] text-white/60">Es propio (no afecta balance del beneficiario)</Label>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-[8px] font-black uppercase text-slate-500">Monto (Bs.)</Label>
                                        <Input
                                            type="number"
                                            placeholder="0,00"
                                            value={item.amountBs || ''}
                                            onChange={(e) => updateItem(item.id, { amountBs: parseFloat(e.target.value) || 0 })}
                                            className="h-10 rounded-xl bg-slate-700 border-none text-white font-black text-right"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[8px] font-black uppercase text-slate-500">Equivalente (USD)</Label>
                                        <div className="h-10 rounded-xl bg-slate-700/50 flex items-center justify-end px-3">
                                            <span className="text-emerald-400 font-black text-sm">
                                                ${formatUSD((item.amountBs || 0) / exchangeRate)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    <Button type="button" variant="outline" onClick={addItem} className="w-full rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10">
                        <Plus className="mr-2 h-4 w-4" /> Agregar Línea
                    </Button>

                    <div className="bg-slate-800 rounded-2xl p-4 space-y-2">
                        <div className="flex justify-between">
                            <span className="text-[9px] font-black uppercase text-slate-500">Total Distribuido:</span>
                            <span className={cn("font-black text-sm", Math.abs(totalDistributed - totalAmountBs) <= 0.01 ? 'text-emerald-400' : 'text-red-400')}>
                                Bs. {formatCurrency(totalDistributed)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[9px] font-black uppercase text-slate-500">Monto del Pago:</span>
                            <span className="font-black text-sm text-white">Bs. {formatCurrency(totalAmountBs)}</span>
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 mt-2 p-2 bg-red-500/10 rounded-xl">
                                <AlertCircle className="h-4 w-4 text-red-400" />
                                <span className="text-[9px] text-red-400 font-black">{error}</span>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-black uppercase text-[10px]">
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={!!error || totalDistributed === 0} className="rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] italic">
                        Confirmar Distribución
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, deleteDoc, doc, updateDoc, getDocs, where } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Calendar, FileText, Info, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { downloadPDF } from '@/lib/print-pdf';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface ExtraordinaryTransaction {
    id: string;
    tipo: 'ingreso' | 'egreso';
    monto: number;
    exchangeRate: number;
    descripcion: string;
    referencia?: string;
    fecha: Timestamp;
    categoria: 'extraordinaria';
    sourcePaymentId?: string;
    ownerId?: string;
    createdAt: Timestamp;
}

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function ExtraordinaryFundPage() {
    const params = useParams();
    const condoId = params?.condoId as string;
    const { toast } = useToast();
    
    const [transactions, setTransactions] = useState<ExtraordinaryTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [balance, setBalance] = useState(0);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<ExtraordinaryTransaction | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!condoId || condoId === "[condoId]") return;

        // CAMBIO: orden ascendente para que el saldo acumulado tenga sentido
        const q = query(
            collection(db, 'condominios', condoId, 'extraordinary_funds'),
            orderBy('fecha', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtraordinaryTransaction));
            setTransactions(data);
            
            const totalBalance = data.reduce((acc, tx) => {
                return acc + (tx.tipo === 'ingreso' ? tx.monto : -tx.monto);
            }, 0);
            setBalance(totalBalance);
            
            setLoading(false);
        }, (error) => {
            console.error("Error cargando fondo extraordinario:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [condoId]);

    // Función para agregar el saldo acumulado a cada transacción (respetando el orden ascendente)
    const getTransactionsWithRunningBalance = () => {
        let runningBalance = 0;
        return transactions.map(tx => {
            if (tx.tipo === 'ingreso') {
                runningBalance += tx.monto;
            } else {
                runningBalance -= tx.monto;
            }
            return { ...tx, runningBalance };
        });
    };

    const handleDeleteTransaction = async () => {
        if (!selectedTransaction || !condoId) return;
        
        setIsDeleting(true);
        try {
            // Buscar y revertir la cuota extraordinaria asociada
            if (selectedTransaction.sourcePaymentId) {
                const debtsQuery = query(
                    collection(db, 'condominios', condoId, 'owner_extraordinary_debts'),
                    where('paymentId', '==', selectedTransaction.sourcePaymentId)
                );
                const debtsSnap = await getDocs(debtsQuery);
                
                for (const debtDoc of debtsSnap.docs) {
                    const debtRef = doc(db, 'condominios', condoId, 'owner_extraordinary_debts', debtDoc.id);
                    await updateDoc(debtRef, {
                        status: 'pending',
                        paidAt: null,
                        paymentId: null,
                        amountPaidBs: null
                    });
                }
            }
            
            // Eliminar el movimiento del fondo extraordinario
            await deleteDoc(doc(db, 'condominios', condoId, 'extraordinary_funds', selectedTransaction.id));
            
            toast({ 
                title: "Movimiento eliminado", 
                description: "La cuota extraordinaria ha sido revertida a estado pendiente." 
            });
            setDeleteDialogOpen(false);
            setSelectedTransaction(null);
        } catch (error) {
            console.error("Error eliminando movimiento:", error);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo eliminar el movimiento" });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleGeneratePDF = async () => {
        const transactionsWithBalance = getTransactionsWithRunningBalance();
        const html = generateReportHTML(transactionsWithBalance, balance);
        const fileName = `Fondo_Extraordinario_${format(new Date(), 'yyyy_MM_dd')}.pdf`;
        downloadPDF(html, fileName);
    };

    const generateReportHTML = (txs: (ExtraordinaryTransaction & { runningBalance: number })[], saldo: number) => {
        const period = format(new Date(), 'MMMM yyyy', { locale: es }).toUpperCase();
        const totalIngresos = txs.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0);
        const totalEgresos = txs.filter(t => t.tipo === 'egreso').reduce((s, t) => s + t.monto, 0);
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reporte de Fondo Extraordinario</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 20px; padding: 20px; background: white; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; }
                    .header { text-align: center; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 3px solid #F28705; }
                    .header h1 { color: #1e293b; font-size: 24px; font-weight: 900; }
                    .header p { color: #64748b; font-size: 12px; margin-top: 5px; }
                    .summary { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 30px; }
                    .summary-card { flex: 1; background: #f8fafc; padding: 15px; border-radius: 12px; text-align: center; border-left: 4px solid #F28705; }
                    .summary-card label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 5px; }
                    .summary-card value { font-size: 24px; font-weight: 900; color: #1e293b; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10px; }
                    th { background: #1A1D23; color: white; padding: 12px 8px; font-weight: 700; text-transform: uppercase; font-size: 9px; }
                    td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; }
                    .text-right { text-align: right; }
                    .text-left { text-align: left; }
                    .ingreso { color: #10b981; font-weight: 700; }
                    .egreso { color: #ef4444; font-weight: 700; }
                    .footer { margin-top: 30px; padding-top: 15px; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1>FONDO EXTRAORDINARIO</h1><p>Reporte de movimientos - Período: ${period}</p></div>
                    <div class="summary">
                        <div class="summary-card"><label>Total Ingresos (Debe)</label><value class="ingreso">Bs. ${formatCurrency(totalIngresos)}</value></div>
                        <div class="summary-card"><label>Total Egresos (Haber)</label><value class="egreso">Bs. ${formatCurrency(totalEgresos)}</value></div>
                        <div class="summary-card"><label>Saldo Actual</label><value>Bs. ${formatCurrency(saldo)}</value></div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th class="text-left">FECHA</th>
                                <th class="text-left">DESCRIPCIÓN</th>
                                <th class="text-left">REFERENCIA</th>
                                <th class="text-right">DEBE (Bs.)</th>
                                <th class="text-right">HABER (Bs.)</th>
                                <th class="text-right">SALDO (Bs.)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${txs.map(t => `
                                <tr>
                                    <td class="text-left">${t.fecha?.toDate ? format(t.fecha.toDate(), 'dd/MM/yyyy') : 'N/A'}</td>
                                    <td class="text-left">${t.descripcion}</td>
                                    <td class="text-left">${t.referencia || '-'}</td>
                                    <td class="text-right ingreso">${t.tipo === 'ingreso' ? `Bs. ${formatCurrency(t.monto)}` : '-'}</td>
                                    <td class="text-right egreso">${t.tipo === 'egreso' ? `Bs. ${formatCurrency(t.monto)}` : '-'}</td>
                                    <td class="text-right">Bs. ${formatCurrency(t.runningBalance)}</td>
                                </tr>
                            `).join('')}
                            ${txs.length === 0 ? '<tr><td colspan="6" class="text-center">No hay movimientos registrados</td></tr>' : ''}
                        </tbody>
                    </table>
                    <div class="footer"><p>Documento generado por <strong>EFASCondoSys</strong> - Sistema de Autogestión de Condominios</p></div>
                </div>
            </body>
            </html>
        `;
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Cargando fondo extraordinario...</p>
            </div>
        );
    }

    const transactionsWithBalance = getTransactionsWithRunningBalance();
    const totalIngresos = transactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0);
    const totalEgresos = transactions.filter(t => t.tipo === 'egreso').reduce((s, t) => s + t.monto, 0);

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            <div className="mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            Fondo <span className="text-primary">Extraordinario</span>
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                        <p className="text-white/40 font-bold mt-3 text-sm uppercase tracking-wide">
                            Gestión independiente de cuotas extraordinarias
                        </p>
                    </div>
                    <Button onClick={handleGeneratePDF} variant="outline" className="rounded-xl border-white/10 text-white font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic">
                        <FileText className="mr-2 h-4 w-4" /> Exportar Reporte PDF
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5">
                    <CardContent className="p-6"><div className="flex items-center gap-3 mb-4"><div className="bg-emerald-500/20 p-3 rounded-2xl"><TrendingUp className="h-6 w-6 text-emerald-500" /></div><p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total Ingresos (Debe)</p></div><p className="text-3xl font-black text-emerald-400 italic">Bs. {formatCurrency(totalIngresos)}</p></CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5">
                    <CardContent className="p-6"><div className="flex items-center gap-3 mb-4"><div className="bg-red-500/20 p-3 rounded-2xl"><TrendingDown className="h-6 w-6 text-red-500" /></div><p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total Egresos (Haber)</p></div><p className="text-3xl font-black text-red-400 italic">Bs. {formatCurrency(totalEgresos)}</p></CardContent>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden border border-white/5">
                    <CardContent className="p-6"><div className="flex items-center gap-3 mb-4"><div className="bg-primary/20 p-3 rounded-2xl"><DollarSign className="h-6 w-6 text-primary" /></div><p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Saldo Disponible</p></div><p className="text-3xl font-black text-white italic">Bs. {formatCurrency(balance)}</p></CardContent>
                </Card>
            </div>

            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                <CardHeader className="bg-gradient-to-r from-white/5 to-transparent p-6 border-b border-white/5">
                    <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" /> Libro Diario - Fondo Extraordinario
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-800/30">
                                <TableRow className="border-white/5">
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">FECHA</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">DESCRIPCIÓN</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-400">REFERENCIA</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">DEBE (Bs.)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">HABER (Bs.)</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-slate-400">SALDO (Bs.)</TableHead>
                                    <TableHead className="text-center text-[10px] font-black uppercase text-slate-400">ACCIÓN</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactionsWithBalance.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} className="h-40 text-center text-slate-500 font-bold italic uppercase text-[10px]">No hay movimientos en el fondo extraordinario</TableCell></TableRow>
                                ) : (
                                    transactionsWithBalance.map((tx) => (
                                        <TableRow key={tx.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                            <TableCell className="font-black text-white text-xs italic">{tx.fecha?.toDate ? format(tx.fecha.toDate(), 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                            <TableCell className="text-white font-black uppercase text-[10px]">{tx.descripcion}</TableCell>
                                            <TableCell className="font-mono text-[10px] text-white/60">{tx.referencia || '-'}</TableCell>
                                            <TableCell className="text-right font-black text-emerald-400 italic">
                                                {tx.tipo === 'ingreso' ? `Bs. ${formatCurrency(tx.monto)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-red-400 italic">
                                                {tx.tipo === 'egreso' ? `Bs. ${formatCurrency(tx.monto)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-black text-primary italic">
                                                Bs. {formatCurrency(tx.runningBalance)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button variant="ghost" size="icon" onClick={() => { setSelectedTransaction(tx); setDeleteDialogOpen(true); }} className="text-red-500 hover:bg-red-500/10 h-8 w-8">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900/50 overflow-hidden border border-white/5">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="bg-primary/10 p-2 rounded-xl"><Info className="h-5 w-5 text-primary" /></div>
                        <div><p className="text-[10px] font-black uppercase text-primary tracking-widest">Información</p><p className="text-[9px] text-white/60 mt-1">Este fondo registra exclusivamente los movimientos de <strong className="text-white">Cuotas Extraordinarias</strong>.</p></div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white font-montserrat italic max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-red-500" /> Eliminar Movimiento
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-sm">
                            ¿Estás seguro de eliminar este movimiento? La cuota extraordinaria volverá a estado pendiente.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {selectedTransaction && (
                            <div className="space-y-2 bg-red-500/10 p-4 rounded-xl">
                                <p className="text-white font-black text-sm">{selectedTransaction.descripcion}</p>
                                <p className="text-emerald-400 font-black">Monto: Bs. {formatCurrency(selectedTransaction.monto)}</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-3">
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="rounded-xl font-black uppercase text-[10px]">Cancelar</Button>
                        <Button onClick={handleDeleteTransaction} disabled={isDeleting} variant="destructive" className="rounded-xl font-black uppercase text-[10px] italic">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Eliminar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
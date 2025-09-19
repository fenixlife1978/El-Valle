
'use client';

import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, Calendar as CalendarIcon, Bot, Loader2, CheckCircle, XCircle, FileDown, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type BankMovement = {
    date: Date;
    reference: string;
    amount: number;
    originalReference: string;
};

type AppPayment = {
    id: string;
    date: Date;
    reference: string;
    amount: number;
    ownerName: string;
};

type ReconciliationResult = {
    conciliated: { bank: BankMovement, app: AppPayment }[];
    notFoundInApp: BankMovement[];
    notFoundInBank: AppPayment[];
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function ReconciliationPage() {
    const { toast } = useToast();
    const [bankStatements, setBankStatements] = useState<BankMovement[]>([]);
    const [appPayments, setAppPayments] = useState<AppPayment[]>([]);
    const [dateRange, setDateRange] = useState<{ from?: Date, to?: Date }>();
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [reconciliationResults, setReconciliationResults] = useState<ReconciliationResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const totals = useMemo(() => {
        if (!reconciliationResults) return { conciliated: 0, notFoundInApp: 0, notFoundInBank: 0, totalBank: 0 };
        return {
            conciliated: reconciliationResults.conciliated.reduce((sum, item) => sum + item.bank.amount, 0),
            notFoundInApp: reconciliationResults.notFoundInApp.reduce((sum, item) => sum + item.amount, 0),
            notFoundInBank: reconciliationResults.notFoundInBank.reduce((sum, item) => sum + item.amount, 0),
            totalBank: bankStatements.reduce((sum, item) => sum + item.amount, 0)
        };
    }, [reconciliationResults, bankStatements]);
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setBankStatements([]);
        setReconciliationResults(null);

        try {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json: any[] = XLSX.utils.sheet_to_json(worksheet);

                    if (json.length > 0) {
                        const requiredColumns = ['Fecha', 'Referencia', 'Monto'];
                        const firstRow = json[0];
                        const hasAllColumns = requiredColumns.every(col => col in firstRow);
                        if (!hasAllColumns) {
                             toast({ variant: 'destructive', title: 'Columnas Faltantes', description: `El archivo debe contener las columnas: ${requiredColumns.join(', ')}.` });
                             setLoading(false);
                             return;
                        }
                    }

                    const parsedStatements: BankMovement[] = json.map(row => {
                        const originalRef = String(row['Referencia'] || '');
                        const amount = parseFloat(String(row['Monto'] || '0').replace(',', '.'));
                        
                        let date;
                        if(typeof row['Fecha'] === 'number') {
                            // Excel date serial number
                            date = XLSX.SSF.parse_date_code(row['Fecha']);
                            date = new Date(date.y, date.m - 1, date.d, date.H, date.M, date.S);
                        } else {
                            // String date
                            date = parse(String(row['Fecha']), 'dd/MM/yyyy', new Date());
                        }

                        if (!isValid(date) || isNaN(amount)) {
                            console.warn('Fila inválida omitida:', row);
                            return null;
                        }
                        
                        return {
                            date: date,
                            originalReference: originalRef,
                            reference: originalRef.slice(-6),
                            amount: amount,
                        };
                    }).filter((item): item is BankMovement => item !== null);
                    
                    setBankStatements(parsedStatements);
                    toast({ title: 'Archivo Cargado', description: `Se han procesado ${parsedStatements.length} movimientos bancarios.` });
                } catch (error) {
                     toast({ variant: 'destructive', title: 'Error al procesar el archivo', description: 'El archivo parece estar corrupto o en un formato inesperado.' });
                     console.error(error);
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsBinaryString(file);
        } catch (error) {
             toast({ variant: 'destructive', title: 'Error de Lectura', description: 'No se pudo leer el archivo.' });
             setLoading(false);
        }
    };
    
    const handleReconciliation = async () => {
        if (!dateRange?.from || !dateRange?.to || bankStatements.length === 0) {
            toast({ variant: 'destructive', title: 'Faltan Datos', description: 'Por favor, carga un estado de cuenta y selecciona un rango de fechas.' });
            return;
        }

        setProcessing(true);
        setReconciliationResults(null);

        try {
            // Fetch owners for name mapping
            const ownersSnapshot = await getDocs(collection(db, "owners"));
            const ownersMap = new Map(ownersSnapshot.docs.map(doc => [doc.id, doc.data().name]));

            // 1. Fetch app payments within the date range
            const q = query(
                collection(db, "payments"),
                where("paymentDate", ">=", Timestamp.fromDate(dateRange.from)),
                where("paymentDate", "<=", Timestamp.fromDate(dateRange.to))
            );
            const querySnapshot = await getDocs(q);
            const appPaymentsData: AppPayment[] = querySnapshot.docs.map(doc => {
                const data = doc.data();
                const ownerId = data.beneficiaries?.[0]?.ownerId || 'unknown';
                return {
                    id: doc.id,
                    date: (data.paymentDate as Timestamp).toDate(),
                    reference: String(data.reference || '').slice(-6),
                    amount: data.totalAmount,
                    ownerName: ownersMap.get(ownerId) || 'Desconocido',
                };
            });
            setAppPayments(appPaymentsData);

            // 2. Filter bank statements by date range
            const filteredBankStatements = bankStatements.filter(bs => 
                bs.date >= dateRange.from! && bs.date <= dateRange.to!
            );
            
            // 3. Perform reconciliation
            const conciliated: { bank: BankMovement, app: AppPayment }[] = [];
            let mutableAppPayments = [...appPaymentsData];
            const notFoundInApp: BankMovement[] = [];

            for (const bankItem of filteredBankStatements) {
                const bankDateStr = format(bankItem.date, 'yyyy-MM-dd');
                
                const matchIndex = mutableAppPayments.findIndex(appItem => {
                    const appDateStr = format(appItem.date, 'yyyy-MM-dd');
                    const amountDiff = Math.abs(appItem.amount - bankItem.amount);
                    return appItem.reference === bankItem.reference &&
                           appDateStr === bankDateStr &&
                           amountDiff <= 0.01;
                });

                if (matchIndex !== -1) {
                    const matchedAppPayment = mutableAppPayments.splice(matchIndex, 1)[0];
                    conciliated.push({ bank: bankItem, app: matchedAppPayment });
                } else {
                    notFoundInApp.push(bankItem);
                }
            }

            setReconciliationResults({
                conciliated,
                notFoundInApp,
                notFoundInBank: mutableAppPayments, // Remaining items in mutableAppPayments
            });

            toast({ title: 'Conciliación Completada', description: 'Se han comparado los movimientos.', className: 'bg-green-100 border-green-400 text-green-800' });

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error en la Conciliación', description: 'No se pudieron obtener los registros de la aplicación.' });
        } finally {
            setProcessing(false);
        }
    };


    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Conciliación Bancaria</h1>
                <p className="text-muted-foreground">Carga un estado de cuenta bancario para compararlo con los registros de la aplicación.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>1. Cargar Estado de Cuenta Bancario</CardTitle>
                        <CardDescription>Sube un archivo .xlsx con columnas: Fecha, Referencia, Monto.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Input 
                            ref={fileInputRef}
                            id="bank-statement" 
                            type="file"
                            accept=".xlsx"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                         <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            {bankStatements.length > 0 ? `${bankStatements.length} movimientos cargados` : 'Seleccionar archivo'}
                        </Button>
                        <AlertTriangle className="mt-4 text-orange-400" />
                        <p className="text-xs text-muted-foreground mt-2">La referencia debe contener al menos 6 dígitos. El sistema usará los últimos 6.</p>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>2. Rango de Fechas</CardTitle>
                        <CardDescription>Selecciona el período que deseas conciliar.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 space-y-2">
                            <Label>Desde</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange?.from && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? format(dateRange.from, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange?.from} onSelect={(date) => setDateRange(prev => ({...prev, from: date}))} initialFocus /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex-1 space-y-2">
                            <Label>Hasta</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange?.to && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.to ? format(dateRange.to, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange?.to} onSelect={(date) => setDateRange(prev => ({...prev, to: date}))} initialFocus /></PopoverContent>
                            </Popover>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="text-center">
                <Button onClick={handleReconciliation} disabled={processing || bankStatements.length === 0 || !dateRange?.from || !dateRange?.to} size="lg">
                    {processing ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Bot className="mr-2 h-5 w-5"/>}
                    {processing ? 'Conciliando...' : 'Iniciar Conciliación'}
                </Button>
            </div>

            {reconciliationResults && (
                 <Card>
                    <CardHeader>
                        <CardTitle>3. Resultados de la Conciliación</CardTitle>
                        <div className="pt-2">
                            <Label>Total Conciliado: Bs. {formatToTwoDecimals(totals.conciliated)} de Bs. {formatToTwoDecimals(totals.totalBank)}</Label>
                            <Progress value={(totals.totalBank > 0 ? (totals.conciliated / totals.totalBank) * 100 : 0)} className="mt-2"/>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="conciliated">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="conciliated">Conciliados ({reconciliationResults.conciliated.length})</TabsTrigger>
                                <TabsTrigger value="not-in-app">No en App ({reconciliationResults.notFoundInApp.length})</TabsTrigger>
                                <TabsTrigger value="not-in-bank">No en Banco ({reconciliationResults.notFoundInBank.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="conciliated">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Propietario (App)</TableHead><TableHead>Referencia</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {reconciliationResults.conciliated.map(({bank, app}) => (
                                            <TableRow key={bank.originalReference + bank.date} className="bg-green-100/50">
                                                <TableCell>{format(bank.date, 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{app.ownerName}</TableCell>
                                                <TableCell>{bank.reference}</TableCell>
                                                <TableCell className="text-right">Bs. {formatToTwoDecimals(bank.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>
                             <TabsContent value="not-in-app">
                                <Table>
                                     <TableHeader><TableRow><TableHead>Fecha (Banco)</TableHead><TableHead>Referencia (Banco)</TableHead><TableHead className="text-right">Monto (Banco)</TableHead><TableHead>Causa Probable</TableHead></TableRow></TableHeader>
                                     <TableBody>
                                         {reconciliationResults.notFoundInApp.map((item) => (
                                             <TableRow key={item.originalReference + item.date} className="bg-orange-100/50">
                                                 <TableCell>{format(item.date, 'dd/MM/yyyy')}</TableCell>
                                                 <TableCell>{item.reference}</TableCell>
                                                 <TableCell className="text-right">Bs. {formatToTwoDecimals(item.amount)}</TableCell>
                                                 <TableCell>No registrado en la app</TableCell>
                                             </TableRow>
                                         ))}
                                     </TableBody>
                                </Table>
                             </TabsContent>
                             <TabsContent value="not-in-bank">
                                <Table>
                                      <TableHeader><TableRow><TableHead>Fecha (App)</TableHead><TableHead>Propietario (App)</TableHead><TableHead>Referencia (App)</TableHead><TableHead className="text-right">Monto (App)</TableHead><TableHead>Causa Probable</TableHead></TableRow></TableHeader>
                                      <TableBody>
                                         {reconciliationResults.notFoundInBank.map((item) => (
                                             <TableRow key={item.id} className="bg-red-100/50">
                                                 <TableCell>{format(item.date, 'dd/MM/yyyy')}</TableCell>
                                                 <TableCell>{item.ownerName}</TableCell>
                                                 <TableCell>{item.reference}</TableCell>
                                                 <TableCell className="text-right">Bs. {formatToTwoDecimals(item.amount)}</TableCell>
                                                 <TableCell>No encontrado en estado de cuenta</TableCell>
                                             </TableRow>
                                         ))}
                                      </TableBody>
                                </Table>
                             </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}


'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search } from "lucide-react";
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// --- Mock Data ---
// In a real app, this would come from Firestore
const owners = [
    { id: '1', name: 'Ana Rodriguez', unit: 'A-101', email: 'ana.r@email.com', balance: 50.00, delinquency: 0, status: 'solvente' },
    { id: '2', name: 'Carlos Perez', unit: 'B-203', email: 'carlos.p@email.com', balance: 0, delinquency: 2, status: 'moroso' },
    { id: '3', name: 'Maria Garcia', unit: 'C-305', email: 'maria.g@email.com', balance: 0, delinquency: 0, status: 'solvente' },
    { id: '4', name: 'Luis Hernandez', unit: 'A-102', email: 'luis.h@email.com', balance: -120.50, delinquency: 3, status: 'moroso' },
    { id: '5', name: 'Sofia Martinez', unit: 'D-401', balance: 25.00, delinquency: 0, status: 'solvente' },
];

const payments = [
  { id: 1, userId: '1', date: '2023-10-28', amount: 250.00, description: 'Cuota Octubre' },
  { id: 2, userId: '2', date: '2023-08-27', amount: 250.00, description: 'Cuota Agosto' },
  { id: 3, userId: '3', date: '2023-10-26', amount: 250.00, description: 'Cuota Octubre' },
  { id: 4, userId: '4', date: '2023-07-25', amount: 250.00, description: 'Cuota Julio' },
  { id: 5, userId: '5', date: '2023-10-24', amount: 250.00, description: 'Cuota Octubre' },
];

export default function ReportsPage() {

    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();
    const [selectedOwner, setSelectedOwner] = useState('');
    const [delinquencyPeriod, setDelinquencyPeriod] = useState('');


    const generatePdf = (title: string, head: any[], body: any[], filename: string) => {
        const doc = new jsPDF();
        doc.text(title, 14, 16);
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-VE')}`, 14, 22);
        (doc as any).autoTable({
            head,
            body,
            startY: 30,
        });
        doc.save(`${filename}.pdf`);
    }

    const generateIndividualStatement = () => {
        if (!selectedOwner) return alert('Por favor, seleccione un propietario.');
        const owner = owners.find(o => o.id === selectedOwner);
        if (!owner) return;

        const ownerPayments = payments.filter(p => p.userId === owner.id);
        
        generatePdf(
            `Estado de Cuenta: ${owner.name}`,
            [['Fecha', 'Descripción', 'Monto (Bs.)']],
            ownerPayments.map(p => [new Date(p.date).toLocaleDateString('es-VE'), p.description, p.amount.toFixed(2)]),
            `estado_cuenta_${owner.unit}`
        );
    };

    const generateDelinquencyReport = () => {
        if (!delinquencyPeriod) return alert('Por favor, seleccione un período de morosidad.');
        const months = parseInt(delinquencyPeriod);
        const delinquentOwners = owners.filter(o => o.delinquency >= months);
        
         generatePdf(
            `Reporte de Morosidad (${months} o más meses)`,
            [['Propietario', 'Unidad', 'Meses de Deuda', 'Saldo Deudor (Bs.)']],
            delinquentOwners.map(o => [o.name, o.unit, o.delinquency, (o.balance < 0 ? Math.abs(o.balance) : 0).toFixed(2)]),
            `reporte_morosidad`
        );
    }
    
    const generateSolvencyReport = () => {
        const solventOwners = owners.filter(o => o.status === 'solvente');
         generatePdf(
            'Reporte de Solvencia',
            [['Propietario', 'Unidad', 'Email']],
            solventOwners.map(o => [o.name, o.unit, o.email || '-']),
            'reporte_solvencia'
        );
    };

    const generateBalanceFavorReport = () => {
        const ownersWithBalance = owners.filter(o => o.balance > 0);
         generatePdf(
            'Reporte de Saldos a Favor',
            [['Propietario', 'Unidad', 'Saldo a Favor (Bs.)']],
            ownersWithBalance.map(o => [o.name, o.unit, o.balance.toFixed(2)]),
            'reporte_saldos_favor'
        );
    };
    
    const generateIncomeReport = () => {
        if (!startDate || !endDate) return alert('Por favor, seleccione un rango de fechas.');
        
        const incomePayments = payments.filter(p => {
            const paymentDate = new Date(p.date);
            return paymentDate >= startDate && paymentDate <= endDate;
        });

        const totalIncome = incomePayments.reduce((sum, p) => sum + p.amount, 0);

        const doc = new jsPDF();
        doc.text('Reporte de Ingresos', 14, 16);
        doc.text(`Período: ${format(startDate, "PPP", { locale: es })} - ${format(endDate, "PPP", { locale: es })}`, 14, 22);
        (doc as any).autoTable({
            head: [['Fecha', 'Monto (Bs.)', 'Descripción']],
            body: incomePayments.map(p => [new Date(p.date).toLocaleDateString('es-VE'), p.amount.toFixed(2), p.description]),
            startY: 30,
        });
        doc.text(`Total de Ingresos: Bs. ${totalIncome.toFixed(2)}`, 14, (doc as any).lastAutoTable.finalY + 10);
        doc.save('reporte_ingresos.pdf');
    };

    const generateGeneralStatusReport = () => {
         generatePdf(
            'Reporte General de Estatus',
            [['Propietario', 'Unidad', 'Estatus', 'Saldo (Bs.)']],
            owners.map(o => [o.name, o.unit, o.status === 'solvente' ? 'Solvente' : 'Moroso', o.balance.toFixed(2)]),
            'reporte_general_estatus'
        );
    };


    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Consultas y Reportes</h1>
                <p className="text-muted-foreground">Genere y exporte reportes detallados sobre la gestión del condominio.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Reporte: Estado de Cuenta Individual */}
                <Card>
                    <CardHeader>
                        <CardTitle>Estado de Cuenta Individual</CardTitle>
                        <CardDescription>Consulte el estado de cuenta detallado de un propietario.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="owner-select">Propietario</Label>
                            <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                                <SelectTrigger id="owner-select">
                                    <SelectValue placeholder="Seleccione un propietario..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name} ({o.unit})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateIndividualStatement}>
                            <Search className="mr-2 h-4 w-4" /> Consultar
                        </Button>
                    </CardFooter>
                </Card>

                {/* Reporte: Morosidad por Periodo */}
                <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Morosidad</CardTitle>
                        <CardDescription>Liste los propietarios con pagos pendientes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                       <div className="space-y-2">
                            <Label htmlFor="delinquency-period">Período de Morosidad</Label>
                            <Select value={delinquencyPeriod} onValueChange={setDelinquencyPeriod}>
                                <SelectTrigger id="delinquency-period">
                                    <SelectValue placeholder="Seleccione período..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 o más meses</SelectItem>
                                    <SelectItem value="2">2 o más meses</SelectItem>
                                    <SelectItem value="3">3 o más meses</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full" onClick={generateDelinquencyReport}>
                            <Download className="mr-2 h-4 w-4" /> Generar y Exportar
                        </Button>
                    </CardFooter>
                </Card>

                {/* Reporte: Solvencia */}
                <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Solvencia</CardTitle>
                        <CardDescription>Genere una lista de todos los propietarios al día con sus pagos.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-20">
                         <p className="text-sm text-muted-foreground">Listo para generar.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateSolvencyReport}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
                        </Button>
                    </CardFooter>
                </Card>

                {/* Reporte: Saldos a Favor */}
                 <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Saldos a Favor</CardTitle>
                        <CardDescription>Liste todos los propietarios con saldo a favor y sus montos.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-20">
                         <p className="text-sm text-muted-foreground">Listo para generar.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateBalanceFavorReport}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
                        </Button>
                    </CardFooter>
                </Card>

                {/* Reporte: Ingresos por Período */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Reporte de Ingresos</CardTitle>
                        <CardDescription>Calcule los ingresos totales dentro de un rango de fechas específico.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start-date">Fecha de Inicio</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                    id="start-date"
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !startDate && "text-muted-foreground"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startDate ? format(startDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={startDate}
                                        onSelect={setStartDate}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="end-date">Fecha de Fin</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                    id="end-date"
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !endDate && "text-muted-foreground"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {endDate ? format(endDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={endDate}
                                        onSelect={setEndDate}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full" onClick={generateIncomeReport}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
                        </Button>
                    </CardFooter>
                </Card>

                 {/* Reporte: General de Estatus */}
                 <Card>
                    <CardHeader>
                        <CardTitle>Reporte General de Estatus</CardTitle>
                        <CardDescription>Una vista completa del estatus de pago de todas las unidades.</CardDescription>
                    </CardHeader>
                     <CardContent className="flex items-center justify-center h-20">
                         <p className="text-sm text-muted-foreground">Listo para generar.</p>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={generateGeneralStatusReport}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
                        </Button>
                    </CardFooter>
                </Card>

            </div>
        </div>
    );

    
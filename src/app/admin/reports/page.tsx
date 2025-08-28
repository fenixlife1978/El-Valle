
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

// Mock Data
const owners = [
    { id: 'owner-1', name: 'Ana Rodriguez', unit: 'A-101' },
    { id: 'owner-2', name: 'Carlos Perez', unit: 'B-203' },
    { id: 'owner-3', name: 'Maria Garcia', unit: 'C-305' },
    { id: 'owner-4', name: 'Luis Hernandez', unit: 'A-102' },
    { id: 'owner-5', name: 'Sofia Martinez', unit: 'D-401' },
];

export default function ReportsPage() {

    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();

    const generateReport = (reportType: string) => {
        console.log(`Generating report: ${reportType}`);
        // Here you would add the logic to fetch data and generate the report
        alert(`Generando reporte: ${reportType}. La funcionalidad de exportación será implementada en el backend.`);
    }

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
                            <Select>
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
                        <Button className="w-full" onClick={() => generateReport('Estado de Cuenta Individual')}>
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
                            <Select>
                                <SelectTrigger id="delinquency-period">
                                    <SelectValue placeholder="Seleccione período..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 o más meses</SelectItem>
                                    <SelectItem value="2">2 o más meses</SelectItem>
                                    <SelectItem value="3">3 o más meses</SelectItem>
                                    <SelectItem value="6">6 o más meses</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full" onClick={() => generateReport('Reporte de Morosidad')}>
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
                        <Button className="w-full" onClick={() => generateReport('Reporte de Solvencia')}>
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
                        <Button className="w-full" onClick={() => generateReport('Reporte de Saldos a Favor')}>
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
                         <Button className="w-full" onClick={() => generateReport('Reporte de Ingresos por Período')}>
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
                        <Button className="w-full" onClick={() => generateReport('Reporte General de Estatus')}>
                           <Download className="mr-2 h-4 w-4" /> Generar y Exportar
                        </Button>
                    </CardFooter>
                </Card>

            </div>
        </div>
    );
}


'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, Scale } from "lucide-react";
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type PublishedReport = {
    id: string; // e.g., '2025-10'
    type: 'balance' | 'integral';
    createdAt: string;
};

export default function OwnerHistoryPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [allReports, setAllReports] = useState<PublishedReport[]>([]);
    const [filterType, setFilterType] = useState('todos');
    
    useEffect(() => {
        const fetchReports = async () => {
            setLoading(true);
            try {
                const reportsQuery = query(collection(db, "published_reports"), orderBy('createdAt', 'desc'));
                const snapshot = await getDocs(reportsQuery);
                const reportsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PublishedReport));
                setAllReports(reportsData);
            } catch (error) {
                console.error("Error fetching published reports:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los reportes históricos.' });
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, [toast]);
    
    const filteredReports = allReports.filter(report => {
        if (filterType === 'todos') return true;
        return report.type === filterType;
    });

    const getReportName = (type: 'balance' | 'integral') => {
        return type === 'balance' ? 'Balance Financiero' : 'Reporte Integral';
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Historial de Reportes</h1>
                <p className="text-muted-foreground">Consulta todos los reportes y balances publicados por la administración.</p>
            </div>
            
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Publicaciones</CardTitle>
                         <div className="w-full max-w-xs">
                             <Select value={filterType} onValueChange={setFilterType}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Filtrar por tipo..."/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Todos los Reportes</SelectItem>
                                    <SelectItem value="integral">Reporte Integral</SelectItem>
                                    <SelectItem value="balance">Balance Financiero</SelectItem>
                                </SelectContent>
                            </Select>
                         </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tipo de Reporte</TableHead>
                                <TableHead>Fecha de Publicación</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredReports.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                        No hay reportes que coincidan con el filtro.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredReports.map((report) => (
                                    <TableRow key={report.id}>
                                        <TableCell className="font-medium flex items-center gap-2">
                                            {report.type === 'balance' ? <Scale className="h-4 w-4 text-primary"/> : <FileText className="h-4 w-4 text-primary"/>}
                                            {getReportName(report.type)}
                                        </TableCell>
                                        <TableCell>
                                            {format(new Date(report.createdAt), 'dd MMMM, yyyy - hh:mm a', {locale: es})}
                                        </TableCell>
                                        <TableCell className="text-right">
                                             <Button variant="outline" size="sm" disabled>Ver Reporte</Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}



'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, Scale, ArrowLeft } from "lucide-react";
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type PublishedReport = {
    id: string; // e.g., 'balance-2025-10'
    type: 'balance' | 'integral';
    createdAt: Date; // Changed to Date object for consistency
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

export default function OwnerHistoryPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [allReports, setAllReports] = useState<PublishedReport[]>([]);
    const [filterType, setFilterType] = useState('todos');
    
    useEffect(() => {
        const fetchReports = async () => {
            setLoading(true);
            try {
                const reportsQuery = query(collection(db, "published_reports"), orderBy('createdAt', 'desc'));
                const snapshot = await getDocs(reportsQuery);
                const reportsData = snapshot.docs.map(doc => {
                    const data = doc.data();
                    let createdAtDate: Date;
                    // Safely convert Firestore Timestamp or string to Date
                    if (data.createdAt instanceof Timestamp) {
                        createdAtDate = data.createdAt.toDate();
                    } else if (typeof data.createdAt === 'string') {
                        createdAtDate = new Date(data.createdAt);
                    } else {
                        createdAtDate = new Date(); // Fallback
                    }
                    return { ...data, id: doc.id, createdAt: createdAtDate } as PublishedReport;
                });
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

    const getReportNameAndPeriod = (report: PublishedReport) => {
        const parts = report.id.split('-');
        if (report.type === 'balance' && parts.length >= 3) {
            const year = parts[1];
            const month = parseInt(parts[2], 10);
            const monthName = monthsLocale[month] || 'Mes Desconocido';
            return `Balance Financiero - ${monthName} ${year}`;
        }
        if (report.type === 'integral') {
            return 'Reporte Integral';
        }
        return 'Reporte';
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
                                <TableHead>Tipo y Período del Reporte</TableHead>
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
                                            {getReportNameAndPeriod(report)}
                                        </TableCell>
                                        <TableCell>
                                            {format(report.createdAt, 'dd MMMM, yyyy - hh:mm a', {locale: es})}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={`/owner/report/${report.id}`}>Ver Reporte</Link>
                                            </Button>
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



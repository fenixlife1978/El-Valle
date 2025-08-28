
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CheckCircle2, XCircle, MoreHorizontal, Eye, Printer, FileDown, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';

type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentType = 'Transferencia' | 'Pago Móvil';

type Payment = {
  id: number;
  user: string;
  unit: string;
  amount: number;
  date: string;
  bank: string;
  type: PaymentType;
  reference: string;
  status: PaymentStatus;
};

const initialPayments: Payment[] = [
  { id: 1, user: 'Ana Rodriguez', unit: 'A-101', amount: 250.00, date: '2023-10-28', bank: 'Banesco', type: 'Transferencia', reference: '123456', status: 'pendiente' },
  { id: 2, user: 'Carlos Perez', unit: 'B-203', amount: 250.00, date: '2023-10-27', bank: 'Mercantil', type: 'Pago Móvil', reference: '234567', status: 'pendiente' },
  { id: 3, user: 'Maria Garcia', unit: 'C-305', amount: 250.00, date: '2023-10-26', bank: 'Provincial', type: 'Transferencia', reference: '345678', status: 'aprobado' },
  { id: 4, user: 'Luis Hernandez', unit: 'A-102', amount: 250.00, date: '2023-10-25', bank: 'Banesco', type: 'Transferencia', reference: '456789', status: 'aprobado' },
  { id: 5, user: 'Sofia Martinez', unit: 'D-401', amount: 250.00, date: '2023-10-24', bank: 'Mercantil', type: 'Pago Móvil', reference: '567890', status: 'rechazado' },
  { id: 6, user: 'Pedro Gonzalez', unit: 'B-201', amount: 250.00, date: '2023-10-23', bank: 'Banco de Venezuela', type: 'Transferencia', reference: '678901', status: 'pendiente' },
];

const statusVariantMap: { [key in PaymentStatus]: 'warning' | 'success' | 'destructive' } = {
  pendiente: 'warning',
  aprobado: 'success',
  rechazado: 'destructive',
};

const statusTextMap: { [key in PaymentStatus]: string } = {
    pendiente: 'Pendiente',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
};

export default function VerifyPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [filter, setFilter] = useState<PaymentStatus | 'todos'>('todos');
  const { toast } = useToast();

  const handleStatusChange = (id: number, status: PaymentStatus) => {
    setPayments(payments.map(p => p.id === id ? { ...p, status } : p));
    toast({
      title: 'Estado actualizado',
      description: `El pago ha sido marcado como ${statusTextMap[status].toLowerCase()}.`,
      className: 'bg-green-100 border-green-400 text-green-800'
    });
  };

  const generateReceipt = (payment: Payment) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Recibo de Pago de Condominio', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')}`, 14, 32);

    (doc as any).autoTable({
        startY: 40,
        head: [['Concepto', 'Detalle']],
        body: [
            ['ID de Pago', payment.id.toString()],
            ['Propietario', payment.user],
            ['Unidad', payment.unit],
            ['Fecha de Pago', new Date(payment.date).toLocaleDateString('es-VE')],
            ['Monto Pagado', `Bs. ${payment.amount.toFixed(2)}`],
            ['Banco Emisor', payment.bank],
            ['Tipo de Pago', payment.type],
            ['Referencia', payment.reference],
            ['Estado del Pago', statusTextMap[payment.status]],
        ],
        theme: 'striped',
        headStyles: { fillColor: [22, 160, 133] },
    });

    doc.save(`recibo-${payment.unit}-${payment.id}.pdf`);
  };

  const filteredPayments = payments.filter(p => filter === 'todos' || p.status === filter);

  return (
    <div className="space-y-8">
        <div>
            <h1 className="text-3xl font-bold font-headline">Verificación de Pagos</h1>
            <p className="text-muted-foreground">Aprueba o rechaza los pagos reportados y genera recibos.</p>
        </div>

        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Pagos Registrados</CardTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <Filter className="mr-2 h-4 w-4" />
                                Filtrar por: <span className="font-semibold ml-1 capitalize">{filter === 'todos' ? 'Todos' : statusTextMap[filter]}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setFilter('todos')}>Todos</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('pendiente')}>{statusTextMap['pendiente']}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('aprobado')}>{statusTextMap['aprobado']}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('rechazado')}>{statusTextMap['rechazado']}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Usuario</TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Banco</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredPayments.map((payment) => (
                            <TableRow key={payment.id}>
                                <TableCell className="font-medium">{payment.user}</TableCell>
                                <TableCell>{payment.unit}</TableCell>
                                <TableCell>Bs. {payment.amount.toFixed(2)}</TableCell>
                                <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                                <TableCell>{payment.bank}</TableCell>
                                <TableCell>
                                    <Badge variant={statusVariantMap[payment.status]}>
                                        {statusTextMap[payment.status]}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Abrir menú</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {payment.status === 'pendiente' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'aprobado')}>
                                                        <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                                        Aprobar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'rechazado')} className="text-destructive">
                                                        <XCircle className="mr-2 h-4 w-4" />
                                                        Rechazar
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                            <DropdownMenuItem>
                                                <Eye className="mr-2 h-4 w-4" />
                                                Ver Comprobante
                                            </DropdownMenuItem>
                                            {payment.status === 'aprobado' && (
                                                <DropdownMenuItem onClick={() => generateReceipt(payment)}>
                                                    <Printer className="mr-2 h-4 w-4" />
                                                    Generar Recibo
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                 {filteredPayments.length === 0 && (
                    <div className="text-center p-8 text-muted-foreground">
                        No hay pagos que coincidan con el filtro seleccionado.
                    </div>
                 )}
            </CardContent>
        </Card>
    </div>
  );
}

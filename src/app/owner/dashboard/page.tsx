import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCommunityUpdates } from '@/ai/flows/community-updates';

// Mock Data
const lastPayment = 250.00;
const nextPaymentDate = "15/11/2023";
const myUnit = "A-101";

const userPayments = [
  { id: 1, date: "2023-10-28", amount: 250.00, bank: "Banesco", type: "Transferencia", ref: "0123456", status: "aprobado" },
  { id: 2, date: "2023-09-28", amount: 250.00, bank: "Mercantil", type: "Pago Móvil", ref: "0123457", status: "aprobado" },
  { id: 3, date: "2023-08-29", amount: 250.00, bank: "Provincial", type: "Transferencia", ref: "0123458", status: "aprobado" },
];

export default async function OwnerDashboardPage() {
    const userProfile = "Role: Owner, Unit: A-101, Name: Juan Perez";
    const paymentHistory = "October: Paid, September: Paid, August: Paid";
    const allUpdates = [
        "Recordatorio: La cuota de mantenimiento de Noviembre vence el 15.",
        "El área de la piscina estará cerrada por mantenimiento el 10 de Noviembre.",
        "Asamblea general de propietarios el 20 de Noviembre.",
        "Nuevas normas de uso para el salón de fiestas.",
        "Fumigación general programada para el 5 de Noviembre."
    ].join('\n');

    const { updates: communityUpdates } = await getCommunityUpdates({
        userProfile,
        paymentHistory,
        allUpdates,
    });
    
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Propietario</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Último Pago</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bs. {lastPayment.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximo Pago</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nextPaymentDate}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mi Unidad</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myUnit}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Mis Últimos Pagos</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {userPayments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                        <TableCell>Bs. {payment.amount.toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                        <TableCell>{payment.bank}</TableCell>
                        <TableCell>{payment.type}</TableCell>
                        <TableCell>{payment.ref}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === 'aprobado' ? 'success' : 'warning'}>
                            {payment.status === 'aprobado' ? 'Aprobado' : 'Pendiente'}
                          </Badge>
                        </TableCell>
                         <TableCell className="flex gap-2">
                            <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4"/>
                                <span className="sr-only">Ver</span>
                            </Button>
                            <Button variant="ghost" size="icon">
                                <Printer className="h-4 w-4"/>
                                <span className="sr-only">Imprimir</span>
                            </Button>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </Card>
        </div>
        <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Comunicados Importantes</h2>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Megaphone className="h-6 w-6 text-primary" />
                        <span>Actualizaciones para ti</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-4">
                        {communityUpdates.map((update, index) => (
                            <li key={index} className="flex items-start gap-3">
                                <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                                <span>{update}</span>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}

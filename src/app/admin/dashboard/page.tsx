
'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const quickLinks = [
    {
        title: "Verificar Pagos",
        description: "Aprueba o rechaza los pagos reportados.",
        href: "/admin/payments/verify",
        icon: Landmark,
    },
    {
        title: "Gestionar Deudas",
        description: "Revisa y administra las deudas pendientes.",
        href: "/admin/debts",
        icon: AlertCircle,
    },
    {
        title: "Gestionar Propietarios",
        description: "Añade o edita los perfiles de los propietarios.",
        href: "/admin/people",
        icon: Building,
    },
    {
        title: "Generar Reportes",
        description: "Crea y exporta informes detallados.",
        href: "/admin/reports",
        icon: Printer,
    },
];

export default function AdminDashboardPage() {
    const router = useRouter();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Administrador</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => (
            <Card 
                key={link.href} 
                className="flex flex-col hover:border-primary transition-all cursor-pointer group"
                onClick={() => router.push(link.href)}
            >
                <CardHeader className="flex-row gap-4 items-center">
                    <link.icon className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                    <div>
                        <CardTitle>{link.title}</CardTitle>
                        <CardDescription className="mt-1">{link.description}</CardDescription>
                    </div>
                </CardHeader>
            </Card>
        ))}
      </div>
    </div>
  );
}

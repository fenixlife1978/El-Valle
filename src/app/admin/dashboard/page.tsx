
'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2, Home, Users, Settings, FileSearch, CircleDollarSign, TrendingUp, Wallet, Award, Palette, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

const adminModules = [
    {
        title: "Verificar Pagos",
        description: "Aprueba o rechaza los pagos reportados por los propietarios.",
        href: "/admin/payments/verify",
        icon: Landmark,
    },
    {
        title: "Gestión de Deudas",
        description: "Administra las deudas pendientes, pagadas y vencidas.",
        href: "/admin/debts",
        icon: CircleDollarSign,
    },
    {
        title: "Balance Financiero",
        description: "Registra y consulta los ingresos y egresos mensuales.",
        href: "/admin/financial-balance",
        icon: TrendingUp,
    },
    {
        title: "Caja Chica",
        description: "Lleva el control de los fondos y gastos de la caja chica.",
        href: "/admin/petty-cash",
        icon: Wallet,
    },
    {
        title: "Gestión de Personas",
        description: "Agrega, edita y consulta los perfiles de los propietarios.",
        href: "/admin/people",
        icon: Users,
    },
    {
        title: "Constancias y Permisos",
        description: "Genera documentos como constancias de residencia o solvencia.",
        href: "/admin/certificates",
        icon: Award,
    },
    {
        title: "Informes",
        description: "Genera reportes detallados de la gestión del condominio.",
        href: "/admin/reports",
        icon: FileSearch,
    },
    {
        title: "Validación de Datos",
        description: "Herramientas para el mantenimiento y corrección de la base de datos.",
        href: "/admin/validation",
        icon: ShieldCheck,
    },
    {
        title: "Configuración",
        description: "Ajusta la información de la comunidad y las reglas de negocio.",
        href: "/admin/settings",
        icon: Settings,
    },
];

export default function AdminDashboardPage() {
    const router = useRouter();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Administrador</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {adminModules.map((module) => (
            <Card 
                key={module.href} 
                className="flex flex-col hover:border-primary transition-all cursor-pointer group"
                onClick={() => router.push(module.href)}
            >
                <CardHeader className="flex-row gap-4 items-center">
                    <module.icon className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                    <div>
                        <CardTitle>{module.title}</CardTitle>
                        <CardDescription className="mt-1">{module.description}</CardDescription>
                    </div>
                </CardHeader>
            </Card>
        ))}
      </div>
    </div>
  );
}

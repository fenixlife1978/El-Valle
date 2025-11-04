
'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Landmark, History, Calculator, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

const ownerModules = [
    {
        title: "Reportar un Pago",
        description: "Registra un nuevo pago de cuotas o deudas pendientes.",
        href: "/owner/payments",
        icon: Landmark,
    },
    {
        title: "Calculadora de Pagos",
        description: "Calcula el monto total a pagar seleccionando tus deudas.",
        href: "/owner/payments/calculator",
        icon: Calculator,
    },
    {
        title: "Historial de Reportes",
        description: "Consulta los balances e informes publicados por la administración.",
        href: "/owner/history",
        icon: History,
    },
    {
        title: "Configuración",
        description: "Actualiza tu perfil y gestiona la seguridad de tu cuenta.",
        href: "/owner/settings",
        icon: Settings,
    },
];

export default function OwnerDashboardPage() {
    const router = useRouter();

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Panel de Propietario</h1>
                <p className="text-muted-foreground">Bienvenido. Aquí tienes acceso rápido a las principales funciones de tu cuenta.</p>
            </div>
          
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {ownerModules.map((module) => (
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

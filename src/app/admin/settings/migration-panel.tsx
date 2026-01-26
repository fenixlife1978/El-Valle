'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Loader2, DatabaseZap, FileBarChart, AlertCircle, MessageSquare, ClipboardCheck, Wallet, Users, LayoutDashboard } from "lucide-react";

interface MigrationPanelProps {
  condoId: string;
}

export function MigrationPanel({ condoId }: MigrationPanelProps) {
  const { toast } = useToast();
  const [migrating, setMigrating] = useState<string | null>(null);

  const migrate = async (id: string, label: string, path: string, isDoc = false) => {
    setMigrating(id);
    try {
      if (isDoc) {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          const pathParts = path.split('/');
          const collectionName = pathParts[0];
          const docId = pathParts[pathParts.length - 1];
          await setDoc(doc(db, 'condominios', condoId, collectionName, docId), snap.data());
        }
      } else {
        const snap = await getDocs(collection(db, path));
        const promises = snap.docs.map(d => 
          setDoc(doc(db, 'condominios', condoId, path, d.id), d.data())
        );
        await Promise.all(promises);
      }
      toast({ title: "Éxito", description: `${label} migrado correctamente.` });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: `Fallo en: ${label}` });
    } finally {
      setMigrating(null);
    }
  };

  const mainCollections = [
    { id: 'unid', label: 'Unidades', path: 'unidades', icon: <LayoutDashboard className="mr-2 h-4 w-4"/> },
    { id: 'prop', label: 'Propietarios', path: 'owners', icon: <Users className="mr-2 h-4 w-4"/> },
    { id: 'pagos', label: 'Pagos', path: 'payments', icon: <Wallet className="mr-2 h-4 w-4"/> },
    { id: 'cart', label: 'Cartelera', path: 'billboard_announcements', icon: <ClipboardCheck className="mr-2 h-4 w-4"/> },
  ];

  const financialCollections = [
    { id: 'fin', label: 'Estados Financieros', path: 'financial_statements', icon: <FileBarChart className="mr-2 h-4 w-4"/> },
    { id: 'debts', label: 'Deudas', path: 'debts', icon: <AlertCircle className="mr-2 h-4 w-4"/> },
    { id: 'pub', label: 'Reportes Publicados', path: 'published_reports', icon: <ClipboardCheck className="mr-2 h-4 w-4"/> },
    { id: 'feed', label: 'App Feedback', path: 'app_feedback', icon: <MessageSquare className="mr-2 h-4 w-4"/> },
    { id: 'int', label: 'Reporte Integral Esp.', path: 'integral_reports/4x8SsNTCjvF7YV74D0ST', isDoc: true, icon: <DatabaseZap className="mr-2 h-4 w-4"/> },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-orange-200 bg-orange-50/20">
        <CardHeader>
          <CardTitle className="text-orange-800 text-sm font-black uppercase tracking-tighter flex items-center gap-2">
            <DatabaseZap className="h-5 w-5" /> Migración Estructural a {condoId}
          </CardTitle>
          <CardDescription>Mueve las colecciones base y reportes financieros.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {mainCollections.map((t) => (
              <Button key={t.id} variant="outline" className="justify-start bg-white" onClick={() => migrate(t.id, t.label, t.path)} disabled={migrating !== null}>
                {migrating === t.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t.icon}
                {t.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {financialCollections.map((t) => (
              <Button key={t.id} variant="outline" className="justify-start bg-white border-orange-300" onClick={() => migrate(t.id, t.label, t.path, t.isDoc)} disabled={migrating !== null}>
                {migrating === t.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t.icon}
                {t.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
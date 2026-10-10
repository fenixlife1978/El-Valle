'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertCircle, DatabaseZap, ShieldCheck } from 'lucide-react';

interface MigrationPanelProps {
  condoId: string;
}

/**
 * Legacy Firebase-to-Firebase copy controls are intentionally disabled.
 * Each condominium must start with its own isolated Turso database; this
 * screen must never copy old tenant or financial data into the new tenant.
 */
export function MigrationPanel({ condoId }: MigrationPanelProps) {
  return (
    <Card className="border-amber-300 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-tight">
          <DatabaseZap className="h-5 w-5" /> Base de datos del condominio
        </CardTitle>
        <CardDescription>Estado de la separación de datos para {condoId}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Los datos operativos deben escribirse únicamente en la base Turso asignada a este condominio.</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>La copia de colecciones heredadas está deshabilitada para evitar importar usuarios, pagos o saldos antiguos por accidente. No se ha ejecutado ninguna importación desde esta pantalla.</p>
        </div>
      </CardContent>
    </Card>
  );
}

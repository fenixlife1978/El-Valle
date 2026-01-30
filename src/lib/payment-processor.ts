
/**
 * Lógica de Liquidación Cronológica EFAS CondoSys
 * Regla de Oro: Precisión de 2 decimales exactos
 */

interface PendingDebt {
    id: string;
    monto: number; // The amount in Bs.
    [key: string]: any; // To allow other properties from the original debt object
}

/**
 * Procesa la liquidación de un pago, aplicando a deudas y adelantos.
 * @param montoRecibido El monto recibido en el pago (en Bs).
 * @param saldoAFavorPrevio El saldo a favor existente del propietario (en Bs).
 * @param cuotasPendientes Un array de deudas pendientes, ordenadas de la más antigua a la más reciente.
 * @param costoCuotaActualBs El costo de una cuota de condominio mensual estándar (en Bs).
 * @returns Un objeto con el plan de liquidación.
 */
export const processPaymentLiquidation = (
  montoRecibido: number,
  saldoAFavorPrevio: number,
  cuotasPendientes: PendingDebt[],
  costoCuotaActualBs: number
) => {
  // 1. Convertir todo a CÉNTIMOS (Enteros) para evitar errores de coma flotante
  let saldoDisponible = Math.round((montoRecibido + saldoAFavorPrevio) * 100);
  const valorCuotaCents = Math.round(costoCuotaActualBs * 100);
  
  const cuotasLiquidadas: PendingDebt[] = [];
  let totalAbonadoDeudas = 0; // En céntimos
  let cuotasAdelantadas = 0;

  // 2. LIQUIDAR DEUDAS PENDIENTES/VENCIDAS (Orden Cronológico)
  for (const cuota of cuotasPendientes) {
    const deudaCents = Math.round(cuota.monto * 100);
    
    if (saldoDisponible >= deudaCents) {
      saldoDisponible -= deudaCents;
      totalAbonadoDeudas += deudaCents;
      cuotasLiquidadas.push({
        ...cuota,
        status: 'LIQUIDADA',
        montoAplicado: cuota.monto
      });
    } else {
      // Si no alcanza para cubrir la deuda pendiente completa, se detiene.
      break; 
    }
  }

  // 3. CALCULAR MESES POR ADELANTADO (Si aún hay saldo suficiente)
  if (valorCuotaCents > 0) {
      while (saldoDisponible >= valorCuotaCents) {
        saldoDisponible -= valorCuotaCents;
        totalAbonadoDeudas += valorCuotaCents;
        cuotasAdelantadas++;
      }
  }

  // 4. RESULTADO FINAL (Convertir de nuevo a decimales con 2 dígitos)
  return {
    montoTotalProcesado: montoRecibido,
    totalAplicadoADeudas: totalAbonadoDeudas / 100,
    cuotasLiquidadas,
    cuotasAdelantadas,
    nuevoSaldoAFavor: saldoDisponible / 100
  };
};

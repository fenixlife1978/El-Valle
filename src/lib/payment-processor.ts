
/**
 * Lógica de Liquidación Cronológica EFAS CondoSys
 * Regla de Oro: Precisión de 2 decimales exactos utilizando Decimal.js
 */
import { Decimal } from 'decimal.js';

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
  // 1. Convertir todo a objetos Decimal para evitar errores de coma flotante
  let saldoDisponible = new Decimal(montoRecibido).plus(new Decimal(saldoAFavorPrevio));
  const valorCuotaBs = new Decimal(costoCuotaActualBs);
  
  const cuotasLiquidadas: PendingDebt[] = [];
  let totalAbonadoDeudas = new Decimal(0);
  let cuotasAdelantadas = 0;

  // 2. LIQUIDAR DEUDAS PENDIENTES/VENCIDAS (Orden Cronológico)
  for (const cuota of cuotasPendientes) {
    const deudaBs = new Decimal(cuota.monto);
    
    if (saldoDisponible.gte(deudaBs)) {
      saldoDisponible = saldoDisponible.minus(deudaBs);
      totalAbonadoDeudas = totalAbonadoDeudas.plus(deudaBs);
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
  if (valorCuotaBs.greaterThan(0)) {
      while (saldoDisponible.gte(valorCuotaBs)) {
        saldoDisponible = saldoDisponible.minus(valorCuotaBs);
        totalAbonadoDeudas = totalAbonadoDeudas.plus(valorCuotaBs);
        cuotasAdelantadas++;
      }
  }

  // 4. RESULTADO FINAL (Convertir de nuevo a números estándar)
  return {
    montoTotalProcesado: montoRecibido,
    totalAplicadoADeudas: totalAbonadoDeudas.toDecimalPlaces(2).toNumber(),
    cuotasLiquidadas,
    cuotasAdelantadas,
    nuevoSaldoAFavor: saldoDisponible.toDecimalPlaces(2).toNumber()
  };
};

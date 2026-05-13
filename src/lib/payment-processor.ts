/**
 * Lógica de Liquidación de Precisión EFAS CondoSys
 * Regla de Oro: Manejo exacto de decimales para evitar discrepancias en saldos.
 */
import { Decimal } from 'decimal.js';

interface CalculationInput {
  monto_pago_recibido_bs: number;
  tasa_cambio_bcv: number;
  deuda_usd: number;
  saldo_a_favor_anterior_bs: number;
}

/**
 * Procesa la liquidación de un pago siguiendo el orden estricto de cálculo.
 */
export const processPaymentLiquidation = (input: CalculationInput) => {
  const { 
    monto_pago_recibido_bs, 
    tasa_cambio_bcv, 
    deuda_usd, 
    saldo_a_favor_anterior_bs 
  } = input;

  // 1. Conversión de Deuda a Bs (Redondeo a 2 decimales)
  const deuda_en_bs = new Decimal(deuda_usd)
    .mul(new Decimal(tasa_cambio_bcv))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // 2. Fondo Total Disponible (Pago de hoy + Crédito previo)
  const fondo_total_disponible = new Decimal(monto_pago_recibido_bs)
    .add(new Decimal(saldo_a_favor_anterior_bs))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // 3. Aplicación del Pago
  // Si el fondo total cubre o sobra, el abono a deudas es exactamente la deuda calculada.
  // Si no alcanza, se abona todo lo que hay en el fondo.
  const monto_pagado_bs = fondo_total_disponible.gte(deuda_en_bs)
    ? deuda_en_bs
    : fondo_total_disponible;

  // 4. Cálculo de Remanente (Saldo a Favor Actual)
  const saldo_a_favor_actual_bs = fondo_total_disponible
    .sub(monto_pagado_bs)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // 5. Diferencial del pago actual (lo que sobró estrictamente del pago de hoy)
  // Esto es para fines informativos en el recibo
  const diferencial_pago_hoy = new Decimal(monto_pago_recibido_bs)
    .sub(monto_pagado_bs.sub(new Decimal(saldo_a_favor_anterior_bs)))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    monto_pago_recibido_bs: new Decimal(monto_pago_recibido_bs).toNumber(),
    deuda_en_bs: deuda_en_bs.toNumber(),
    total_fondo_disponible: fondo_total_disponible.toNumber(),
    monto_pagado_bs: monto_pagado_bs.toNumber(), // Este va a la tabla de conceptos
    saldo_a_favor_anterior_bs: new Decimal(saldo_a_favor_anterior_bs).toNumber(),
    saldo_a_favor_actual_bs: saldo_a_favor_actual_bs.toNumber(),
    diferencial_pago_hoy: diferencial_pago_hoy.toNumber()
  };
};

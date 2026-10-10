/** Retired: EFAS CondoSys no longer uses Firebase Realtime Database. */
export async function syncDebtsToRealtime(): Promise<never> {
  throw new Error('Este script fue retirado. Las deudas y saldos deben gestionarse exclusivamente en la base Turso del condominio.');
}

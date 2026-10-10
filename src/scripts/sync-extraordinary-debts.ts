/** Retired maintenance script from the legacy condo_01 data model.
 * Run a reviewed, tenant-specific repair through an authorized admin workflow instead.
 */
export async function syncExtraordinaryDebts(): Promise<never> {
  throw new Error('La sincronización heredada de deudas extraordinarias está deshabilitada para proteger los datos aislados de cada condominio.');
}

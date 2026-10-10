/** Retired: legacy cross-collection migration is intentionally disabled for tenant isolation. */
export async function migrateDataToCondo(_targetCondoId: string): Promise<never> {
  throw new Error('La migración automática de colecciones heredadas está deshabilitada para evitar mezclar datos entre condominios.');
}

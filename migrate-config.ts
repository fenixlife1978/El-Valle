/** Retired: tenant databases start clean and must never import legacy global Firebase configuration. */
export async function migrateConfig(): Promise<never> {
  throw new Error('Migración de configuración heredada deshabilitada: configura cada condominio directamente en su base Turso.');
}

import { tursoExecute, type SqlValue } from '@/lib/turso/http';

const registryUrl = () => process.env.TURSO_REGISTRY_DATABASE_URL || process.env.TURSO_DATABASE_URL || '';
const registryToken = () => process.env.TURSO_REGISTRY_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '';

export interface CondoDatabaseRecord {
  condoId: string;
  displayName: string;
  databaseUrl: string;
  databaseToken: string;
  status: 'provisioning' | 'active' | 'suspended' | 'failed';
}

/** Run once against the central registry database; safe to repeat. */
export async function ensureTursoRegistrySchema(): Promise<void> {
  const url = registryUrl();
  const token = registryToken();
  if (!url || !token) throw new Error('Configura TURSO_REGISTRY_DATABASE_URL y TURSO_REGISTRY_AUTH_TOKEN (o los nombres TURSO_DATABASE_URL/TURSO_AUTH_TOKEN).');

  await tursoExecute(url, token, `
    CREATE TABLE IF NOT EXISTS condo_registry (
      condo_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      database_url TEXT NOT NULL,
      database_token TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('provisioning','active','suspended','failed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tursoExecute(url, token, `
    CREATE TABLE IF NOT EXISTS processed_operations (
      idempotency_key TEXT PRIMARY KEY,
      condo_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      outcome_json TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function findCondoDatabase(condoId: string): Promise<CondoDatabaseRecord | null> {
  const id = condoId.trim();
  if (!id || id.length > 128) return null;
  const url = registryUrl();
  const token = registryToken();
  if (!url || !token) throw new Error('El registro central de Turso no está configurado.');

  const result = await tursoExecute(
    url,
    token,
    'SELECT condo_id, display_name, database_url, database_token, status FROM condo_registry WHERE condo_id = ? LIMIT 1',
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  const [storedId, displayName, databaseUrl, databaseToken, status] = row as SqlValue[];
  if (status !== 'active') throw new Error('La base de datos de este condominio no está activa.');
  if (typeof databaseUrl !== 'string' || typeof databaseToken !== 'string') {
    throw new Error('El registro del condominio tiene credenciales inválidas.');
  }
  return {
    condoId: String(storedId),
    displayName: String(displayName),
    databaseUrl,
    databaseToken,
    status: 'active',
  };
}

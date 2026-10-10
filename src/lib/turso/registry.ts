import 'server-only';
import { decryptDatabaseToken } from '@/lib/turso/crypto';
import { tursoExecute, type SqlValue } from '@/lib/turso/http';

export interface TursoRegistryConfig {
  url: string;
  token: string;
  dedicatedRegistry: boolean;
}

/** Usa un registro dedicado si existe; de lo contrario reutiliza la base principal (condosys). */
export function getTursoRegistryConfig(): TursoRegistryConfig {
  const registryUrl = process.env.TURSO_REGISTRY_DATABASE_URL?.trim() || '';
  const registryToken = process.env.TURSO_REGISTRY_AUTH_TOKEN?.trim() || '';
  if (registryUrl || registryToken) {
    if (!registryUrl || !registryToken) {
      throw new Error('Configura ambas variables TURSO_REGISTRY_DATABASE_URL y TURSO_REGISTRY_AUTH_TOKEN, o elimina ambas para usar la base principal.');
    }
    return { url: registryUrl, token: registryToken, dedicatedRegistry: true };
  }
  const url = process.env.TURSO_DATABASE_URL?.trim() || '';
  const token = process.env.TURSO_AUTH_TOKEN?.trim() || '';
  if (!url || !token) throw new Error('Configura TURSO_DATABASE_URL y TURSO_AUTH_TOKEN para acceder a la base Turso.');
  return { url, token, dedicatedRegistry: false };
}
export interface CondoDatabaseRecord {
  condoId: string; displayName: string; databaseUrl: string; databaseToken: string;
  status: 'provisioning' | 'active' | 'suspended' | 'failed';
}
export async function ensureTursoRegistrySchema(): Promise<void> {
  const { url, token } = getTursoRegistryConfig();
  await tursoExecute(url, token, `
    CREATE TABLE IF NOT EXISTS condo_registry (
      condo_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, database_url TEXT NOT NULL,
      database_token TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('provisioning','active','suspended','failed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await tursoExecute(url, token, `
    CREATE TABLE IF NOT EXISTS auth_users (
      user_id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super-admin','admin','owner')),
      condo_id TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await tursoExecute(url, token, `
    CREATE TABLE IF NOT EXISTS auth_login_attempts (
      email TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0,
      window_started_at INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
}
export async function findCondoDatabase(condoId: string): Promise<CondoDatabaseRecord | null> {
  const id = condoId.trim();
  if (!id || id.length > 128) return null;
  const config = getTursoRegistryConfig();
  // Modo económico: los condominios comparten la base existente y se aíslan
  // por colección/ruta; no requiere tabla de registro de bases ni cifrado de tokens.
  if (!config.dedicatedRegistry) {
    const statusResult = await tursoExecute(config.url, config.token,
      'SELECT status, display_name FROM condo_registry WHERE condo_id = ? LIMIT 1', [id]);
    const statusRow = statusResult.rows[0];
    if (statusRow && String(statusRow[0]) !== 'active') {
      throw new Error('La base de datos de este condominio no está activa.');
    }
    return {
      condoId: id,
      displayName: statusRow ? String(statusRow[1]) : id,
      databaseUrl: config.url,
      databaseToken: config.token,
      status: 'active',
    };
  }
  const { url, token } = config;
  const result = await tursoExecute(url, token,
    'SELECT condo_id, display_name, database_url, database_token, status FROM condo_registry WHERE condo_id = ? LIMIT 1', [id]);
  const row = result.rows[0];
  if (!row) return null;
  const [storedId, displayName, databaseUrl, databaseToken, status] = row as SqlValue[];
  if (status !== 'active') throw new Error('La base de datos de este condominio no está activa.');
  if (typeof databaseUrl !== 'string' || typeof databaseToken !== 'string') throw new Error('El registro del condominio tiene credenciales inválidas.');
  return { condoId: String(storedId), displayName: String(displayName), databaseUrl, databaseToken: decryptDatabaseToken(databaseToken), status: 'active' };
}

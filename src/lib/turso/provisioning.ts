import 'server-only';
import { createHash } from 'node:crypto';
import { encryptDatabaseToken } from '@/lib/turso/crypto';
import { tursoExecute } from '@/lib/turso/http';
import { ensureTursoRegistrySchema } from '@/lib/turso/registry';

interface PlatformDatabaseResponse {
  database?: { Hostname?: string; hostname?: string; Name?: string; name?: string };
  jwt?: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de servidor ${name}.`);
  return value;
}

async function platformRequest(path: string, init: RequestInit): Promise<any> {
  const token = requiredEnv('TURSO_API_TOKEN');
  const response = await fetch(`https://api.turso.tech/v1/organizations/${encodeURIComponent(requiredEnv('TURSO_ORG'))}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`;
    throw new Error(`La API de Turso no pudo completar el aprovisionamiento: ${message}`);
  }
  return body;
}

function databaseName(condoId: string, displayName: string): string {
  const slug = displayName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'condominio';
  const suffix = createHash('sha256').update(condoId).digest('hex').slice(0, 12);
  return `condo-${slug}-${suffix}`.slice(0, 64);
}

/**
 * Crea una base aislada y registra sus credenciales cifradas.
 * Esta función es SOLO servidor y debe invocarse desde un flujo que ya verificó
 * identidad y autorización para registrar un condominio. No es una API pública.
 */
export async function provisionCondoDatabase(input: { condoId: string; displayName: string }): Promise<{ condoId: string; databaseName: string }> {
  const condoId = input.condoId.trim();
  const displayName = input.displayName.trim();
  if (!condoId || condoId.length > 128) throw new Error('Identificador de condominio inválido.');
  if (!displayName || displayName.length > 120) throw new Error('Nombre de condominio inválido.');

  await ensureTursoRegistrySchema();
  const registryUrl = requiredEnv('TURSO_REGISTRY_DATABASE_URL');
  const registryToken = requiredEnv('TURSO_REGISTRY_AUTH_TOKEN');

  const existing = await tursoExecute(
    registryUrl, registryToken,
    'SELECT status FROM condo_registry WHERE condo_id = ? LIMIT 1',
    [condoId]
  );
  if (existing.rows.length) throw new Error('Este condominio ya tiene un registro de base de datos; no se creará otra base automáticamente.');

  const name = databaseName(condoId, displayName);
  const created = await platformRequest('/databases', {
    method: 'POST',
    body: JSON.stringify({ name, group: requiredEnv('TURSO_GROUP') }),
  }) as PlatformDatabaseResponse;
  const hostname = created.database?.Hostname ?? created.database?.hostname;
  if (!hostname || !/^[a-z0-9.-]+$/i.test(hostname)) {
    throw new Error('Turso creó la base pero devolvió un hostname inesperado; requiere revisión manual.');
  }
  const databaseUrl = `libsql://${hostname}`;

  const tokenResult = await platformRequest(`/databases/${encodeURIComponent(name)}/auth/tokens?authorization=full-access`, {
    method: 'POST',
  }) as PlatformDatabaseResponse;
  if (!tokenResult.jwt) throw new Error('Turso creó la base pero no devolvió el token de acceso.');

  await tursoExecute(
    registryUrl, registryToken,
    `INSERT INTO condo_registry (condo_id, display_name, database_url, database_token, status)
     VALUES (?, ?, ?, ?, 'provisioning')`,
    [condoId, displayName, databaseUrl, encryptDatabaseToken(tokenResult.jwt)]
  );

  try {
    await tursoExecute(databaseUrl, tokenResult.jwt, `
      CREATE TABLE IF NOT EXISTS app_documents (
        collection_name TEXT NOT NULL,
        document_id TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        version INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (collection_name, document_id)
      )
    `);
    await tursoExecute(databaseUrl, tokenResult.jwt, `
      CREATE TABLE IF NOT EXISTS processed_operations (
        idempotency_key TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        outcome_json TEXT NOT NULL,
        processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await tursoExecute(
      registryUrl, registryToken,
      "UPDATE condo_registry SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE condo_id = ?",
      [condoId]
    );
  } catch (error) {
    await tursoExecute(
      registryUrl, registryToken,
      "UPDATE condo_registry SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE condo_id = ?",
      [condoId]
    ).catch(() => undefined);
    throw error;
  }

  return { condoId, databaseName: name };
}

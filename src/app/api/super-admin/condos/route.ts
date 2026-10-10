import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { provisionCondoDatabase } from '@/lib/turso/provisioning';
import { requireAdminSession, hashPassword } from '@/lib/turso/session';
import { ensureTursoRegistrySchema, findCondoDatabase, getTursoRegistryConfig } from '@/lib/turso/registry';
import { tursoExecute } from '@/lib/turso/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await requireAdminSession();
    if (session.role !== 'super-admin') return NextResponse.json({ error: 'Solo el superadministrador.' }, { status: 403 });
    await ensureTursoRegistrySchema();
    const { url, token } = getTursoRegistryConfig();
    const result = await tursoExecute(url, token, 'SELECT condo_id,display_name,status,created_at FROM condo_registry ORDER BY created_at DESC');
    return NextResponse.json({ condos: result.rows.map(row => ({ id: String(row[0]), name: String(row[1]), nombre: String(row[1]), status: String(row[2]), createdAt: row[3] })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'Debes iniciar sesión.' : 'No se pudo consultar el directorio de condominios.' }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    if (session.role !== 'super-admin') return NextResponse.json({ error: 'Solo el superadministrador puede crear condominios.' }, { status: 403 });
    const body = await request.json();
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const adminEmail = typeof body.adminEmail === 'string' ? body.adminEmail.trim().toLowerCase() : '';
    const adminPassword = typeof body.adminPassword === 'string' ? body.adminPassword : '';
    if (!displayName || displayName.length > 120) return NextResponse.json({ error: 'Nombre de condominio inválido.' }, { status: 400 });
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(adminEmail) || adminEmail.length > 254) return NextResponse.json({ error: 'Correo del administrador inválido.' }, { status: 400 });
    if (adminPassword.length < 12 || adminPassword.length > 200) return NextResponse.json({ error: 'La contraseña inicial debe tener al menos 12 caracteres.' }, { status: 400 });

    await ensureTursoRegistrySchema();
    const config = getTursoRegistryConfig();
    const exists = await tursoExecute(config.url, config.token, 'SELECT user_id FROM auth_users WHERE email=? LIMIT 1', [adminEmail]);
    if (exists.rows.length) return NextResponse.json({ error: 'Ese correo ya pertenece a una cuenta.' }, { status: 409 });

    const condoId = 'condo-' + randomUUID();
    let databaseName: string;
    if (config.dedicatedRegistry) {
      const provisioned = await provisionCondoDatabase({ condoId, displayName });
      databaseName = provisioned.databaseName;
    } else {
      // Modo gratuito: admite un solo condominio en la base compartida.
      // Bloqueamos un segundo registro para no mezclar datos entre condominios.
      const tenantCount = await tursoExecute(config.url, config.token, 'SELECT COUNT(*) FROM condo_registry');
      if (Number(tenantCount.rows[0]?.[0] ?? 0) > 0) {
        return NextResponse.json({
          error: 'La base gratuita compartida solo admite un condominio. Para agregar otro se necesita una base tenant aislada; no se creó ningún registro.',
        }, { status: 409 });
      }
      await tursoExecute(config.url, config.token,
        "INSERT INTO condo_registry(condo_id,display_name,database_url,database_token,status) VALUES(?,?,?,'shared-database','active')",
        [condoId, displayName, config.url]);
      databaseName = 'compartida (condosys)';
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(adminPassword);
    await tursoExecute(config.url, config.token,
      "INSERT INTO auth_users(user_id,email,password_hash,role,condo_id,active) VALUES(?,?,?,'admin',?,1)",
      [userId, adminEmail, passwordHash, condoId]);

    const db = await findCondoDatabase(condoId);
    if (!db) throw new Error('No se pudo abrir la base del condominio.');
    await tursoExecute(db.databaseUrl, db.databaseToken,
      'CREATE TABLE IF NOT EXISTS app_documents(collection_name TEXT NOT NULL,document_id TEXT NOT NULL,document_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(collection_name,document_id))');
    await tursoExecute(db.databaseUrl, db.databaseToken,
      'CREATE TABLE IF NOT EXISTS processed_operations(idempotency_key TEXT PRIMARY KEY,operation_id TEXT NOT NULL,outcome_json TEXT NOT NULL,processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');

    const now = new Date().toISOString();
    const registrationKey = 'KEY-' + randomUUID().slice(0, 8).toUpperCase();
    const condoDocument = { id: condoId, name: displayName.toUpperCase(), nombre: displayName.toUpperCase(), registrationKey, status: 'active', createdAt: now };
    await tursoExecute(db.databaseUrl, db.databaseToken,
      'INSERT INTO app_documents(collection_name,document_id,document_json) VALUES(?,?,?) ON CONFLICT(collection_name,document_id) DO UPDATE SET document_json=excluded.document_json,updated_at=CURRENT_TIMESTAMP',
      ['condominios', condoId, JSON.stringify(condoDocument)]);
    await tursoExecute(db.databaseUrl, db.databaseToken,
      'INSERT INTO app_documents(collection_name,document_id,document_json) VALUES(?,?,?) ON CONFLICT(collection_name,document_id) DO UPDATE SET document_json=excluded.document_json,updated_at=CURRENT_TIMESTAMP',
      ['condominios/' + condoId + '/config', 'mainSettings', JSON.stringify({ companyInfo: { name: displayName, logo: '' }, exchangeRates: [], lastUpdated: now })]);

    return NextResponse.json({ ok: true, condoId, databaseName, adminEmail, registrationKey }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Debes iniciar sesión como superadministrador.' : 'No se pudo crear el condominio. Revisa la configuración de Turso.' }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminSession();
    if (session.role !== 'super-admin') return NextResponse.json({ error: 'Solo el superadministrador.' }, { status: 403 });
    const body = await request.json();
    const condoId = typeof body.condoId === 'string' ? body.condoId : '';
    const status = body.status;
    if (!condoId || !['active', 'suspended'].includes(status)) return NextResponse.json({ error: 'Datos de estado inválidos.' }, { status: 400 });
    await ensureTursoRegistrySchema();
    const { url, token } = getTursoRegistryConfig();
    const result = await tursoExecute(url, token, 'UPDATE condo_registry SET status=?,updated_at=CURRENT_TIMESTAMP WHERE condo_id=?', [status, condoId]);
    if (!result.rowsAffected) return NextResponse.json({ error: 'Condominio no encontrado.' }, { status: 404 });
    return NextResponse.json({ ok: true, condoId, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'Debes iniciar sesión.' : 'No se pudo actualizar el estado.' }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

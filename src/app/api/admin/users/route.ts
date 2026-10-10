import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ensureTursoRegistrySchema, findCondoDatabase } from '@/lib/turso/registry';
import { tursoExecute, tursoBatch } from '@/lib/turso/http';
import { hashPassword, requireAdminSession } from '@/lib/turso/session';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    if (session.role !== 'admin' || !session.condoId) return NextResponse.json({ error: 'Solo un administrador de condominio puede crear cuentas de propietario.' }, { status: 403 });
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Correo inválido.' }, { status: 400 });
    if (password.length < 12 || password.length > 200) return NextResponse.json({ error: 'La contraseña debe tener al menos 12 caracteres.' }, { status: 400 });
    await ensureTursoRegistrySchema();
    const url = process.env.TURSO_REGISTRY_DATABASE_URL!;
    const token = process.env.TURSO_REGISTRY_AUTH_TOKEN!;
    const existing = await tursoExecute(url, token, 'SELECT user_id FROM auth_users WHERE email=? LIMIT 1', [email]);
    if (existing.rows.length) return NextResponse.json({ error: 'Ese correo ya está registrado.' }, { status: 409 });
    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    await tursoExecute(url, token,
      "INSERT INTO auth_users(user_id,email,password_hash,role,condo_id,active) VALUES(?,?,?,'owner',?,1)",
      [userId, email, passwordHash, session.condoId]);
    try {
      const tenant = await findCondoDatabase(session.condoId);
      if (!tenant) throw new Error('No se encontró la base del condominio.');
      await tursoExecute(tenant.databaseUrl, tenant.databaseToken,
        'CREATE TABLE IF NOT EXISTS app_documents(collection_name TEXT NOT NULL,document_id TEXT NOT NULL,document_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(collection_name,document_id))');
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0,160) : email;
      const profile = { uid:userId,userId,ownerId:userId,email,name,displayName:name,role:'propietario',condoId:session.condoId,balance:0,properties:Array.isArray(body.properties)?body.properties:[],createdAt:new Date().toISOString(),active:true };
      await tursoExecute(tenant.databaseUrl, tenant.databaseToken,
        'INSERT INTO app_documents(collection_name,document_id,document_json) VALUES(?,?,?)',
        ['condominios/'+session.condoId+'/owners',userId,JSON.stringify(profile)]);
    } catch (profileError) {
      await tursoExecute(url, token, 'DELETE FROM auth_users WHERE user_id=?', [userId]).catch(() => undefined);
      throw profileError;
    }
    return NextResponse.json({ ok: true, userId, email, role: 'owner', name: typeof body.name === 'string' ? body.name.trim() : email }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'Debes iniciar sesión.' : 'No se pudo crear la cuenta.' }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAdminSession();
    if (session.role !== 'admin' || !session.condoId) return NextResponse.json({ error: 'Solo el administrador del condominio puede eliminar cuentas de propietario.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId || userId.length > 128) return NextResponse.json({ error: 'Identificador de usuario inválido.' }, { status: 400 });
    await ensureTursoRegistrySchema();
    const url = process.env.TURSO_REGISTRY_DATABASE_URL!;
    const token = process.env.TURSO_REGISTRY_AUTH_TOKEN!;
    const account = await tursoExecute(url, token, 'SELECT role,condo_id FROM auth_users WHERE user_id=? LIMIT 1', [userId]);
    if (account.rows.length) {
      if (String(account.rows[0][0]) !== 'owner' || String(account.rows[0][1] || '') !== session.condoId) {
        return NextResponse.json({ error: 'La cuenta no pertenece a este condominio o no es una cuenta de propietario.' }, { status: 403 });
      }
      await tursoExecute(url, token, 'UPDATE auth_users SET active=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND condo_id=?', [userId, session.condoId]);
    }
    const tenant = await findCondoDatabase(session.condoId);
    if (!tenant) return NextResponse.json({ error: 'No se encontró la base del condominio.' }, { status: 404 });
    await tursoBatch(tenant.databaseUrl, tenant.databaseToken, [{
      sql: 'DELETE FROM app_documents WHERE document_id=? AND collection_name IN (?,?)',
      args: [userId, 'condominios/' + session.condoId + '/owners', 'condominios/' + session.condoId + '/propietarios']
    }]);
    if (account.rows.length) await tursoExecute(url, token, 'DELETE FROM auth_users WHERE user_id=? AND condo_id=? AND role=\'owner\'', [userId, session.condoId]);
    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'Debes iniciar sesión.' : 'No se pudo eliminar la cuenta del propietario.' }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

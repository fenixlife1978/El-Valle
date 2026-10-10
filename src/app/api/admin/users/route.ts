import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ensureTursoRegistrySchema, findCondoDatabase } from '@/lib/turso/registry';
import { tursoExecute } from '@/lib/turso/http';
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

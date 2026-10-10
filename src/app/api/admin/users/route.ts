import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ensureTursoRegistrySchema } from '@/lib/turso/registry';
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
    const passwordHash = await hashPassword(password);
    await tursoExecute(url, token,
      "INSERT INTO auth_users(user_id,email,password_hash,role,condo_id,active) VALUES(?,?,?,'owner',?,1)",
      [randomUUID(), email, passwordHash, session.condoId]);
    return NextResponse.json({ ok: true, email, role: 'owner' }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'Debes iniciar sesión.' : 'No se pudo crear la cuenta.' }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

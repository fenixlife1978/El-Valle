import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { provisionCondoDatabase } from '@/lib/turso/provisioning';
import { requireAdminSession, hashPassword } from '@/lib/turso/session';
import { ensureTursoRegistrySchema } from '@/lib/turso/registry';
import { tursoExecute } from '@/lib/turso/http';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    if (session.role !== 'super-admin') return NextResponse.json({ error: 'Solo el superadministrador puede crear condominios.' }, { status: 403 });
    const body = await request.json();
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const adminEmail = typeof body.adminEmail === 'string' ? body.adminEmail.trim().toLowerCase() : '';
    const adminPassword = typeof body.adminPassword === 'string' ? body.adminPassword : '';
    if (!displayName || displayName.length > 120) return NextResponse.json({ error: 'Nombre de condominio inválido.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.length > 254) return NextResponse.json({ error: 'Correo del administrador inválido.' }, { status: 400 });
    if (adminPassword.length < 12 || adminPassword.length > 200) return NextResponse.json({ error: 'La contraseña inicial debe tener al menos 12 caracteres.' }, { status: 400 });
    await ensureTursoRegistrySchema();
    const registryUrl = process.env.TURSO_REGISTRY_DATABASE_URL!;
    const registryToken = process.env.TURSO_REGISTRY_AUTH_TOKEN!;
    const exists = await tursoExecute(registryUrl, registryToken, 'SELECT user_id FROM auth_users WHERE email=? LIMIT 1', [adminEmail]);
    if (exists.rows.length) return NextResponse.json({ error: 'Ese correo ya pertenece a una cuenta.' }, { status: 409 });
    const condoId = `condo-${randomUUID()}`;
    const result = await provisionCondoDatabase({ condoId, displayName });
    const passwordHash = await hashPassword(adminPassword);
    await tursoExecute(registryUrl, registryToken,
      "INSERT INTO auth_users(user_id,email,password_hash,role,condo_id,active) VALUES(?,?,?,'admin',?,1)",
      [randomUUID(), adminEmail, passwordHash, condoId]);
    return NextResponse.json({ ok: true, condoId: result.condoId, databaseName: result.databaseName, adminEmail }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Debes iniciar sesión como superadministrador.' : 'No se pudo crear el condominio o su administrador. Revisa el registro central y Turso.' }, { status });
  }
}

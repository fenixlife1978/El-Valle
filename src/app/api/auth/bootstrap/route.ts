import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ensureTursoRegistrySchema } from '@/lib/turso/registry';
import { tursoExecute } from '@/lib/turso/http';
import { hashPassword } from '@/lib/turso/session';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const email = process.env.EFAS_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.EFAS_BOOTSTRAP_ADMIN_PASSWORD;
    const expectedToken = process.env.EFAS_BOOTSTRAP_TOKEN;
    const suppliedToken = request.headers.get('x-bootstrap-token') ?? '';
    if (!email || !password || !expectedToken || expectedToken.length < 32) {
      return NextResponse.json({ error: 'El bootstrap inicial no está habilitado correctamente en el servidor.' }, { status: 503 });
    }
    const expected = Buffer.from(expectedToken);
    const supplied = Buffer.from(suppliedToken);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    await ensureTursoRegistrySchema();
    const url = process.env.TURSO_REGISTRY_DATABASE_URL!;
    const token = process.env.TURSO_REGISTRY_AUTH_TOKEN!;
    const count = await tursoExecute(url, token, 'SELECT COUNT(*) FROM auth_users');
    if (Number(count.rows[0]?.[0] ?? 0) > 0) return NextResponse.json({ error: 'El bootstrap ya fue utilizado.' }, { status: 409 });
    const hash = await hashPassword(password);
    await tursoExecute(url, token, "INSERT INTO auth_users (user_id,email,password_hash,role,condo_id,active) VALUES (?,?,?,'super-admin',NULL,1)", [randomUUID(), email, hash]);
    return NextResponse.json({ ok: true, message: 'Administrador inicial creado. Retira todas las variables EFAS_BOOTSTRAP_* del servidor.' }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo inicializar la cuenta. Verifica las variables de servidor y la base central.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createSession, findAuthUser, verifyPassword } from '@/lib/turso/session';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 254 || password.length > 200) return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 400 });
    const user = await findAuthUser(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 });
    await createSession({ userId: user.userId, email: user.email, role: user.role, condoId: user.condoId });
    return NextResponse.json({ ok: true, user: { email: user.email, role: user.role, condoId: user.condoId } });
  } catch { return NextResponse.json({ error: 'No se pudo iniciar sesión. Verifica la configuración de autenticación Turso.' }, { status: 500 }); }
}

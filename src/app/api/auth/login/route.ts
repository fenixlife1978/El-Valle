import { NextResponse } from 'next/server';
import { clearLoginFailures, createSession, findAuthUser, loginLockoutSeconds, recordLoginFailure, verifyPassword } from '@/lib/turso/session';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 254 || password.length > 200) return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 400 });
    const waitSeconds = await loginLockoutSeconds(email);
    if (waitSeconds > 0) return NextResponse.json({ error: 'Demasiados intentos fallidos. Espera antes de volver a intentarlo.', retryAfterSeconds: waitSeconds }, { status: 429, headers: { 'Retry-After': String(waitSeconds) } });
    const user = await findAuthUser(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      await recordLoginFailure(email);
      return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 });
    }
    await clearLoginFailures(email);
    await createSession({ userId: user.userId, email: user.email, role: user.role, condoId: user.condoId });
    return NextResponse.json({ ok: true, user: { email: user.email, role: user.role, condoId: user.condoId } });
  } catch { return NextResponse.json({ error: 'No se pudo iniciar sesión. Verifica la configuración de autenticación Turso.' }, { status: 500 }); }
}

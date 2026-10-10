import { NextResponse } from 'next/server';
import { getSession } from '@/lib/turso/session';
import { findCondoDatabase } from '@/lib/turso/registry';
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  if (session.condoId) {
    try { await findCondoDatabase(session.condoId); }
    catch { return NextResponse.json({ authenticated: false, error: 'El condominio está suspendido o no disponible.' }, { status: 403 }); }
  }
  return NextResponse.json({ authenticated: true, user: { userId: session.userId, email: session.email, role: session.role, condoId: session.condoId, expiresAt: session.exp } });
}

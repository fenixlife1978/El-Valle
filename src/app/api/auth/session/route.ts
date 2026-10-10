import { NextResponse } from 'next/server';
import { getSession } from '@/lib/turso/session';
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user: { userId: session.userId, email: session.email, role: session.role, condoId: session.condoId, expiresAt: session.exp } });
}

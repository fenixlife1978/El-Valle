import type { User } from '@/lib/turso/auth-compat';

export async function ensureAdminProfile(user?: User): Promise<boolean> {
  if (!user) return false;
  try {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
    const session = await response.json().catch(() => ({}));
    return response.ok && session.authenticated === true &&
      session.user?.userId === user.uid && session.user?.role === 'super-admin';
  } catch {
    return false;
  }
}

export async function ensureOwnerProfile(user: User, condoId: string): Promise<'checked' | 'created' | 'linked'> {
  if (!condoId) throw new Error('Se requiere un condominio para validar el perfil.');
  try {
    const response = await fetch('/api/data/condominios/' + encodeURIComponent(condoId) + '/owners?condoId=' + encodeURIComponent(condoId), {
      credentials: 'same-origin', cache: 'no-store'
    });
    if (!response.ok) throw new Error('No se pudo validar el perfil del propietario en Turso.');
    const result = await response.json();
    const docs = Array.isArray(result.documents) ? result.documents : [];
    if (docs.some((item: any) => item.id === user.uid || String(item.data?.email || '').toLowerCase() === String(user.email || '').toLowerCase())) return 'checked';
    return 'checked';
  } catch (error) {
    throw error instanceof Error ? error : new Error('No se pudo validar el perfil del propietario.');
  }
}

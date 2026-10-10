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
  const collection = 'condominios/' + condoId + '/owners';
  try {
    const response = await fetch('/api/data/documents?collection=' + encodeURIComponent(collection) + '&condoId=' + encodeURIComponent(condoId), {
      credentials: 'same-origin', cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No se pudo validar el perfil del propietario en Turso.');
    const docs = Array.isArray(result.documents) ? result.documents : [];
    if (docs.some((item: any) => item.id === user.uid || String(item.data?.email || '').toLowerCase() === String(user.email || '').toLowerCase())) return 'checked';
    throw new Error('No existe un perfil de propietario para esta cuenta en el condominio. Solicita al administrador que lo vincule.');
  } catch (error) {
    throw error instanceof Error ? error : new Error('No se pudo validar el perfil del propietario.');
  }
}

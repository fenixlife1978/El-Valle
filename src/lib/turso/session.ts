import 'server-only';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { ensureTursoRegistrySchema, getTursoRegistryConfig } from '@/lib/turso/registry';
import { tursoExecute } from '@/lib/turso/http';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'efas_session';
const SESSION_SECONDS = 60 * 60 * 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
export interface EfasSession { userId: string; email: string; role: 'super-admin' | 'admin' | 'owner'; condoId: string | null; exp: number; }
function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
  return value;
}
function sign(value: string): string { return createHmac('sha256', secret()).update(value).digest('base64url'); }
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 200) throw new Error('La contraseña debe tener entre 12 y 200 caracteres.');
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt-v1.${salt}.${derived.toString('base64url')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, salt, digest] = encoded.split('.');
  if (version !== 'scrypt-v1' || !salt || !digest) return false;
  try {
    const expected = Buffer.from(digest, 'base64url');
    const actual = await scrypt(password, salt, expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
export async function loginLockoutSeconds(email: string): Promise<number> {
  await ensureTursoRegistrySchema();
  const { url, token } = getTursoRegistryConfig();
  const result = await tursoExecute(url, token, 'SELECT attempts, window_started_at, locked_until FROM auth_login_attempts WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
  const row = result.rows[0];
  if (!row) return 0;
  const now = Date.now();
  const attempts = Number(row[0]);
  const windowStart = Number(row[1]);
  const lockedUntil = Number(row[2]);
  if (lockedUntil > now) return Math.ceil((lockedUntil - now) / 1000);
  if (now - windowStart >= LOGIN_WINDOW_MS || attempts < LOGIN_MAX_FAILURES) return 0;
  return Math.ceil((windowStart + LOGIN_WINDOW_MS - now) / 1000);
}
/** UPSERT atómico: intentos concurrentes no pueden sobrescribir el contador con un valor antiguo. */
export async function recordLoginFailure(email: string): Promise<void> {
  await ensureTursoRegistrySchema();
  const { url, token } = getTursoRegistryConfig();
  const normalized = email.trim().toLowerCase();
  const now = Date.now();
  await tursoExecute(url, token, `INSERT INTO auth_login_attempts(email, attempts, window_started_at, locked_until, updated_at)
    VALUES(?, 1, ?, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      attempts = CASE WHEN ? - auth_login_attempts.window_started_at >= ? THEN 1 ELSE auth_login_attempts.attempts + 1 END,
      window_started_at = CASE WHEN ? - auth_login_attempts.window_started_at >= ? THEN ? ELSE auth_login_attempts.window_started_at END,
      locked_until = CASE WHEN
        (CASE WHEN ? - auth_login_attempts.window_started_at >= ? THEN 1 ELSE auth_login_attempts.attempts + 1 END) >= ?
        THEN ? + ? ELSE 0 END,
      updated_at = CURRENT_TIMESTAMP`,
    [normalized, now, now, LOGIN_WINDOW_MS, now, LOGIN_WINDOW_MS, now, now, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES, now, LOGIN_LOCK_MS]);
}
export async function clearLoginFailures(email: string): Promise<void> {
  await ensureTursoRegistrySchema();
  const { url, token } = getTursoRegistryConfig();
  await tursoExecute(url, token, 'DELETE FROM auth_login_attempts WHERE email = ?', [email.trim().toLowerCase()]);
}
export async function createSession(session: Omit<EfasSession, 'exp'>): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  const jar = await cookies();
  jar.set(COOKIE_NAME, `${payload}.${sign(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
}
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}
export async function getSession(): Promise<EfasSession | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  let expected: Buffer;
  try { expected = Buffer.from(sign(payload)); } catch { return null; }
  const actual = Buffer.from(raw.slice(dot + 1));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as EfasSession;
    if (!parsed.userId || !parsed.email || !parsed.exp || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!['super-admin', 'admin', 'owner'].includes(parsed.role)) return null;
    // Revalidate every signed cookie against the central registry so disabled or changed accounts lose access immediately.
    const { url, token } = getTursoRegistryConfig();
    const current = await tursoExecute(url, token, 'SELECT email, role, condo_id, active FROM auth_users WHERE user_id = ? LIMIT 1', [parsed.userId]);
    const row = current.rows[0];
    if (!row || (row[3] !== 1 && row[3] !== '1')) return null;
    if (String(row[0]).toLowerCase() !== parsed.email.toLowerCase() || String(row[1]) !== parsed.role || (row[2] == null ? null : String(row[2])) !== parsed.condoId) return null;
    return parsed;
  } catch { return null; }
}
export async function requireAdminSession(): Promise<EfasSession> {
  const session = await getSession();
  if (!session || !['super-admin', 'admin'].includes(session.role)) throw new Error('UNAUTHORIZED');
  if (session.condoId) {
    const { findCondoDatabase } = await import('@/lib/turso/registry');
    await findCondoDatabase(session.condoId);
  }
  return session;
}
export async function findAuthUser(email: string) {
  await ensureTursoRegistrySchema();
  const { url, token } = getTursoRegistryConfig();
  const result = await tursoExecute(url, token, 'SELECT user_id, email, password_hash, role, condo_id, active FROM auth_users WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
  const row = result.rows[0] as unknown[] | undefined;
  if (!row) return null;
  const [userId, userEmail, passwordHash, role, condoId, active] = row;
  if (active !== 1 && active !== '1') return null;
  if (!['super-admin', 'admin', 'owner'].includes(String(role))) return null;
  return { userId: String(userId), email: String(userEmail), passwordHash: String(passwordHash), role: String(role) as EfasSession['role'], condoId: condoId == null ? null : String(condoId) };
}

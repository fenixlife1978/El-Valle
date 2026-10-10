import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { findCondoDatabase } from '@/lib/turso/registry';
import { tursoExecute } from '@/lib/turso/http';
import { requireAdminSession } from '@/lib/turso/session';
export const runtime = 'nodejs';
const COLLECTION = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

async function context(request: Request, collection: string) {
  const session = await requireAdminSession();
  if (!COLLECTION.test(collection)) throw new Error('INVALID_COLLECTION');
  const requestedCondo = new URL(request.url).searchParams.get('condoId');
  const condoId = session.role === 'super-admin' ? requestedCondo : session.condoId;
  if (!condoId || (session.role !== 'super-admin' && requestedCondo && requestedCondo !== session.condoId)) throw new Error('FORBIDDEN');
  const db = await findCondoDatabase(condoId);
  if (!db) throw new Error('CONDO_NOT_FOUND');
  await tursoExecute(db.databaseUrl, db.databaseToken, `CREATE TABLE IF NOT EXISTS app_documents (
    collection_name TEXT NOT NULL, document_id TEXT NOT NULL, document_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_name, document_id))`);
  return { db };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : message === 'INVALID_COLLECTION' ? 400 : message === 'CONDO_NOT_FOUND' ? 404 : 500;
  return NextResponse.json({ error: status === 500 ? 'Error interno procesando la solicitud.' : message }, { status });
}
export async function GET(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  try {
    const { collection } = await params;
    const { db } = await context(request, collection);
    const id = new URL(request.url).searchParams.get('id');
    const result = id
      ? await tursoExecute(db.databaseUrl, db.databaseToken, 'SELECT document_id, document_json, updated_at FROM app_documents WHERE collection_name=? AND document_id=? LIMIT 1', [collection, id])
      : await tursoExecute(db.databaseUrl, db.databaseToken, 'SELECT document_id, document_json, updated_at FROM app_documents WHERE collection_name=? ORDER BY updated_at DESC LIMIT 1000', [collection]);
    return NextResponse.json({ documents: result.rows.map(row => ({ id: String(row[0]), data: JSON.parse(String(row[1])), updatedAt: row[2] })) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  try {
    const { collection } = await params;
    const { db } = await context(request, collection);
    const body = await request.json();
    const id = typeof body.id === 'string' && body.id.length <= 128 ? body.id : randomUUID();
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return NextResponse.json({ error: 'El documento debe ser un objeto JSON.' }, { status: 400 });
    const json = JSON.stringify(body.data);
    if (json.length > 500_000) return NextResponse.json({ error: 'Documento demasiado grande.' }, { status: 413 });
    await tursoExecute(db.databaseUrl, db.databaseToken, 'INSERT INTO app_documents(collection_name,document_id,document_json) VALUES(?,?,?) ON CONFLICT(collection_name,document_id) DO UPDATE SET document_json=excluded.document_json, updated_at=CURRENT_TIMESTAMP', [collection, id, json]);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  try {
    const { collection } = await params;
    const { db } = await context(request, collection);
    const body = await request.json();
    if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'Falta el ID del documento.' }, { status: 400 });
    await tursoExecute(db.databaseUrl, db.databaseToken, 'DELETE FROM app_documents WHERE collection_name=? AND document_id=?', [collection, body.id]);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}

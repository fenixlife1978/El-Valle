import { NextResponse } from 'next/server';
import { findCondoDatabase } from '@/lib/turso/registry';
import { tursoExecute } from '@/lib/turso/http';
import { requireAdminSession } from '@/lib/turso/session';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    if (!Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > 50) return NextResponse.json({ error: 'Envía entre 1 y 50 operaciones por lote.' }, { status: 400 });
    const condoId = session.role === 'super-admin' ? body.condoId : session.condoId;
    if (!condoId || (session.role !== 'super-admin' && body.condoId && body.condoId !== session.condoId)) return NextResponse.json({ error: 'Condominio no autorizado.' }, { status: 403 });
    const db = await findCondoDatabase(condoId);
    if (!db) return NextResponse.json({ error: 'Condominio no encontrado.' }, { status: 404 });
    await tursoExecute(db.databaseUrl, db.databaseToken, `CREATE TABLE IF NOT EXISTS app_documents (
      collection_name TEXT NOT NULL, document_id TEXT NOT NULL, document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection_name, document_id))`);
    await tursoExecute(db.databaseUrl, db.databaseToken, `CREATE TABLE IF NOT EXISTS processed_operations (
      idempotency_key TEXT PRIMARY KEY, operation_id TEXT NOT NULL, outcome_json TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const results: Array<{ id: string | null; status: 'success' | 'conflict'; replay?: boolean; error?: string }> = [];
    for (const op of body.operations) {
      if (!op || typeof op.idempotencyKey !== 'string' || op.idempotencyKey.length < 8 || op.idempotencyKey.length > 128 ||
          typeof op.entity !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(op.entity) ||
          !['create','update','delete'].includes(op.action) || typeof op.id !== 'string' || !op.id || op.id.length > 128) {
        results.push({ id: typeof op?.id === 'string' ? op.id : null, status: 'conflict', error: 'Operación inválida.' }); continue;
      }
      const documentId = typeof op.payload?.id === 'string' ? op.payload.id : op.id;
      if (documentId.length > 128) { results.push({ id: op.id, status: 'conflict', error: 'ID de documento inválido.' }); continue; }
      const seen = await tursoExecute(db.databaseUrl, db.databaseToken, 'SELECT outcome_json FROM processed_operations WHERE idempotency_key=? LIMIT 1', [op.idempotencyKey]);
      if (seen.rows.length) { results.push({ id: op.id, status: 'success', replay: true }); continue; }
      try {
        if (op.action === 'delete') {
          await tursoExecute(db.databaseUrl, db.databaseToken, 'DELETE FROM app_documents WHERE collection_name=? AND document_id=?', [op.entity, documentId]);
        } else {
          const document = op.payload && typeof op.payload === 'object' && !Array.isArray(op.payload) && op.payload.data && typeof op.payload.data === 'object'
            ? op.payload.data : op.payload;
          if (!document || typeof document !== 'object' || Array.isArray(document) || JSON.stringify(document).length > 500_000) throw new Error('Contenido inválido.');
          await tursoExecute(db.databaseUrl, db.databaseToken, 'INSERT INTO app_documents(collection_name,document_id,document_json) VALUES(?,?,?) ON CONFLICT(collection_name,document_id) DO UPDATE SET document_json=excluded.document_json, updated_at=CURRENT_TIMESTAMP', [op.entity, documentId, JSON.stringify(document)]);
        }
        await tursoExecute(db.databaseUrl, db.databaseToken, 'INSERT INTO processed_operations(idempotency_key,operation_id,outcome_json) VALUES(?,?,?)', [op.idempotencyKey, String(op.id), JSON.stringify({ status: 'success', documentId })]);
        results.push({ id: op.id, status: 'success' });
      } catch {
        results.push({ id: op.id, status: 'conflict', error: 'No se pudo aplicar la operación; requiere revisión.' });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? message : 'No se pudo sincronizar el lote.' }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

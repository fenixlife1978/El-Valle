import { NextResponse } from 'next/server';
import { findCondoDatabase } from '@/lib/turso/registry';
import { tursoExecute, tursoBatch } from '@/lib/turso/http';
import { getSession } from '@/lib/turso/session';

export const runtime = 'nodejs';
const PATH = /^[a-zA-Z][a-zA-Z0-9_/-]{0,190}$/;
const OWNER_WRITABLE = new Set(['payment_reports','paymentReports','payments_reported','reported_payments','_storage_files','survey_responses','surveyResponses','notifications']);
const ownerIdOf = (d: any) => d?.ownerId ?? d?.userId ?? d?.createdBy ?? d?.uid;

async function ensureSchema(db: any) {
  await tursoExecute(db.databaseUrl, db.databaseToken, 'CREATE TABLE IF NOT EXISTS app_documents(collection_name TEXT NOT NULL,document_id TEXT NOT NULL,document_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(collection_name,document_id))');
  try {
    await tursoExecute(db.databaseUrl, db.databaseToken, 'ALTER TABLE app_documents ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  } catch {}
  await tursoExecute(db.databaseUrl, db.databaseToken, 'CREATE TABLE IF NOT EXISTS processed_operations(idempotency_key TEXT PRIMARY KEY,operation_id TEXT NOT NULL,outcome_json TEXT NOT NULL,processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
}

function versionGuard(collection: string, id: string, expected: number) {
  return {
    sql: "SELECT CASE WHEN (?=0 AND NOT EXISTS(SELECT 1 FROM app_documents WHERE collection_name=? AND document_id=?)) OR EXISTS(SELECT 1 FROM app_documents WHERE collection_name=? AND document_id=? AND version=?) THEN 1 ELSE json_extract('invalid','$') END",
    args: [expected, collection, id, collection, id, expected],
  };
}

async function writeStatements(ops: any[], session: any, condoId: string, db: any) {
  const statements: any[] = [];
  for (const op of ops) {
    if (!op || typeof op.collection !== 'string' || !PATH.test(op.collection) || op.collection.includes('..') ||
        typeof op.id !== 'string' || !op.id || op.id.length > 128 || !['set','update','delete'].includes(op.action)) {
      throw new Error('Operación de lote inválida.');
    }
    const parts = op.collection.split('/');
    const pathCondo = parts[0] === 'condominios' ? parts[1] : null;
    if (pathCondo && pathCondo !== condoId) throw new Error('El lote no puede cruzar condominios.');

    let expected = typeof op.expectedVersion === 'number' && Number.isInteger(op.expectedVersion) ? op.expectedVersion : null;
    const data = op.data;
    if (session.role === 'owner') {
      const leaf = op.collection.split('/').pop() || '';
      if (!op.collection.startsWith('condominios/' + session.condoId + '/') || op.action === 'delete' ||
          !OWNER_WRITABLE.has(leaf) || ownerIdOf(data) !== session.userId ||
          (leaf === '_storage_files' && data?.shared === true)) {
        throw new Error('Operación no autorizada para propietarios.');
      }
      const old = await tursoExecute(db.databaseUrl, db.databaseToken,
        'SELECT document_json,version FROM app_documents WHERE collection_name=? AND document_id=? LIMIT 1',
        [op.collection, op.id]);
      if (old.rows.length) {
        if (ownerIdOf(JSON.parse(String(old.rows[0][0]))) !== session.userId) {
          throw new Error('No puedes modificar un documento de otro usuario.');
        }
        expected = Number(old.rows[0][1]);
      } else expected = 0;
    }

    if (op.action === 'delete') {
      if (expected !== null) statements.push(versionGuard(op.collection, op.id, expected));
      statements.push({ sql: 'DELETE FROM app_documents WHERE collection_name=? AND document_id=?', args: [op.collection, op.id] });
      continue;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 500000) {
      throw new Error('Contenido documental inválido o demasiado grande.');
    }
    const json = JSON.stringify(data);
    if (expected === null) {
      statements.push({
        sql: 'INSERT INTO app_documents(collection_name,document_id,document_json,version) VALUES(?,?,?,1) ON CONFLICT(collection_name,document_id) DO UPDATE SET document_json=excluded.document_json,version=app_documents.version+1,updated_at=CURRENT_TIMESTAMP',
        args: [op.collection, op.id, json],
      });
    } else {
      statements.push({
        sql: "INSERT INTO app_documents(collection_name,document_id,document_json,version) VALUES(?,?,?,1) ON CONFLICT(collection_name,document_id) DO UPDATE SET document_json=CASE WHEN app_documents.version=? THEN excluded.document_json ELSE json_extract('invalid','$') END,version=app_documents.version+1,updated_at=CURRENT_TIMESTAMP",
        args: [op.collection, op.id, json, expected],
      });
    }
  }
  return statements;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const body = await request.json();
    if (body.originUserId !== session.userId) {
      return NextResponse.json({ error: 'La cola offline pertenece a otra cuenta.' }, { status: 403 });
    }
    if (!Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > 50) {
      return NextResponse.json({ error: 'Envía entre 1 y 50 operaciones por lote.' }, { status: 400 });
    }
    const condoId = session.role === 'super-admin' ? body.condoId : session.condoId;
    if (!condoId || (session.role !== 'super-admin' && body.condoId && body.condoId !== session.condoId)) {
      return NextResponse.json({ error: 'Condominio no autorizado.' }, { status: 403 });
    }
    const db = await findCondoDatabase(condoId);
    if (!db) return NextResponse.json({ error: 'Condominio no encontrado.' }, { status: 404 });
    await ensureSchema(db);

    const results: any[] = [];
    for (const op of body.operations) {
      if (!op || typeof op.idempotencyKey !== 'string' || op.idempotencyKey.length < 8 || op.idempotencyKey.length > 128 ||
          typeof op.entity !== 'string' || !PATH.test(op.entity) || op.entity.includes('..') ||
          typeof op.id !== 'string' || !op.id || op.id.length > 128 || !['create','update','delete','batch'].includes(op.action)) {
        results.push({ id: op?.id || null, status: 'conflict', error: 'Operación inválida.' });
        continue;
      }
      const seen = await tursoExecute(db.databaseUrl, db.databaseToken,
        'SELECT outcome_json FROM processed_operations WHERE idempotency_key=? LIMIT 1', [op.idempotencyKey]);
      if (seen.rows.length) {
        results.push({ id: op.id, status: 'success', replay: true });
        continue;
      }

      try {
        let statements: any[] = [];
        if (op.action === 'batch') {
          if (op.entity !== 'batch' || !Array.isArray(op.payload?.operations) ||
              op.payload.operations.length < 1 || op.payload.operations.length > 100) {
            throw new Error('Lote offline inválido.');
          }
          statements = await writeStatements(op.payload.operations, session, condoId, db);
        } else {
          const payload = op.payload && typeof op.payload === 'object' ? op.payload : {};
          const id = typeof payload.id === 'string' ? payload.id : op.id;
          const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
          const collection = op.entity;
          let expected = Number.isInteger(payload.expectedVersion) && payload.expectedVersion >= 0 ? payload.expectedVersion : null;

          if (session.role === 'owner') {
            const leaf = collection.split('/').pop() || '';
            if (!collection.startsWith('condominios/' + session.condoId + '/') || !OWNER_WRITABLE.has(leaf) ||
                op.action === 'delete' || ownerIdOf(data) !== session.userId ||
                (leaf === '_storage_files' && data?.shared === true)) {
              throw new Error('Operación no autorizada para propietarios.');
            }
            const old = await tursoExecute(db.databaseUrl, db.databaseToken,
              'SELECT document_json,version FROM app_documents WHERE collection_name=? AND document_id=? LIMIT 1',
              [collection, id]);
            if (old.rows.length) {
              if (ownerIdOf(JSON.parse(String(old.rows[0][0]))) !== session.userId) {
                throw new Error('No puedes modificar un documento de otro usuario.');
              }
              expected = Number(old.rows[0][1]);
            } else expected = 0;
          }

          if (expected !== null) statements.push(versionGuard(collection, id, expected));
          if (op.action === 'delete') {
            statements.push({ sql: 'DELETE FROM app_documents WHERE collection_name=? AND document_id=?', args: [collection, id] });
          } else {
            if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 500000) {
              throw new Error('Contenido inválido.');
            }
            statements.push({
              sql: 'INSERT INTO app_documents(collection_name,document_id,document_json,version) VALUES(?,?,?,1) ON CONFLICT(collection_name,document_id) DO UPDATE SET document_json=excluded.document_json,version=app_documents.version+1,updated_at=CURRENT_TIMESTAMP',
              args: [collection, id, JSON.stringify(data)],
            });
          }
        }

        statements.push({
          sql: 'INSERT INTO processed_operations(idempotency_key,operation_id,outcome_json) VALUES(?,?,?)',
          args: [op.idempotencyKey, String(op.id), JSON.stringify({ status: 'success' })],
        });
        await tursoBatch(db.databaseUrl, db.databaseToken, statements);
        results.push({ id: op.id, status: 'success' });
      } catch {
        const replay = await tursoExecute(db.databaseUrl, db.databaseToken,
          'SELECT outcome_json FROM processed_operations WHERE idempotency_key=? LIMIT 1', [op.idempotencyKey]).catch(() => ({ rows: [] }));
        if (replay.rows.length) results.push({ id: op.id, status: 'success', replay: true });
        else results.push({ id: op.id, status: 'conflict', error: 'La operación no se aplicó; requiere revisión.' });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? message : 'No se pudo sincronizar el lote.' }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

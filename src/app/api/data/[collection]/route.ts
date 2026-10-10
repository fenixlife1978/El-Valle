import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { findCondoDatabase } from '@/lib/turso/registry';
import { tursoExecute, tursoBatch } from '@/lib/turso/http';
import { getSession } from '@/lib/turso/session';

export const runtime = 'nodejs';
const VALID_PATH = /^[a-zA-Z][a-zA-Z0-9_/-]{0,190}$/;
const OWNER_WRITABLE = new Set(['payment_reports','paymentReports','payments_reported','reported_payments','payments','_storage_files','survey_responses','surveyResponses','notifications','app_feedback','feedback']);
const OWNER_SHARED_READ = new Set(['condominios','config','settings','extraordinary_campaigns','surveys','exchange_rates','company','billboard_announcements','announcements','community_updates','payment_methods','paymentMethods','published_reports']);

async function context(request: Request, routeCollection: string) {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHORIZED');
  const url = new URL(request.url);
  const collection = routeCollection === 'documents' ? (url.searchParams.get('collection') || '') : routeCollection;
  if (!VALID_PATH.test(collection) || collection.includes('..') || collection.startsWith('/') || collection.endsWith('/')) {
    throw new Error('INVALID_COLLECTION');
  }
  const parts = collection.split('/');
  const pathCondo = parts[0] === 'condominios' ? parts[1] : null;
  const requested = url.searchParams.get('condoId') || pathCondo;
  const condoId = session.role === 'super-admin' ? requested : session.condoId;
  if (!condoId || (session.role !== 'super-admin' && requested && requested !== session.condoId)) throw new Error('FORBIDDEN');
  if (session.role === 'owner' && collection !== 'condominios' && !collection.startsWith('condominios/' + session.condoId + '/')) {
    throw new Error('FORBIDDEN');
  }
  const db = await findCondoDatabase(condoId);
  if (!db) throw new Error('CONDO_NOT_FOUND');
  return { db, collection, session, condoId };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 :
    message === 'INVALID_COLLECTION' ? 400 : message === 'CONDO_NOT_FOUND' ? 404 : 500;
  return NextResponse.json({ error: status === 500 ? 'Error interno procesando la solicitud.' : message }, { status });
}

function ownerIdOf(data: any) {
  return data?.ownerId ?? data?.userId ?? data?.createdBy ?? data?.uid ?? data?.reportedBy;
}

function canOwnerWrite(collection: string, data: any, userId: string) {
  const leaf = collection.split('/').pop() || '';
  const ownPayment = data?.status === 'pendiente' && (!Array.isArray(data?.beneficiaryIds) || data.beneficiaryIds.every((id: any) => id === userId)) && (!Array.isArray(data?.beneficiaries) || data.beneficiaries.every((item: any) => item?.ownerId === userId));
  return OWNER_WRITABLE.has(leaf) && ownerIdOf(data) === userId && (leaf !== '_storage_files' || data?.shared !== true) && (leaf !== 'payments' || ownPayment);
}

function versionGuard(collection: string, id: string, expected: number) {
  return {
    sql: "SELECT CASE WHEN (?=0 AND NOT EXISTS(SELECT 1 FROM app_documents WHERE collection_name=? AND document_id=?)) OR EXISTS(SELECT 1 FROM app_documents WHERE collection_name=? AND document_id=? AND version=?) THEN 1 ELSE json_extract('invalid','$') END",
    args: [expected, collection, id, collection, id, expected],
  };
}

async function handleBatch(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > 250 || JSON.stringify(body.operations).length > 10000000) {
      return NextResponse.json({ error: 'Lote inválido: se permiten hasta 250 operaciones y 10 MB por solicitud.' }, { status: 400 });
    }
    const first = body.operations[0];
    if (!first || typeof first.collection !== 'string') return NextResponse.json({ error: 'Falta la colección de la operación.' }, { status: 400 });
    const ctx = await context(request, first.collection);
    const statements: any[] = [];

    for (const op of body.operations) {
      if (!op || typeof op.collection !== 'string' || !VALID_PATH.test(op.collection) || op.collection.includes('..') ||
          typeof op.id !== 'string' || !op.id || op.id.length > 128 || !['set','update','delete'].includes(op.action)) {
        return NextResponse.json({ error: 'Operación de lote inválida.' }, { status: 400 });
      }
      const parts = op.collection.split('/');
      const pathCondo = parts[0] === 'condominios' ? parts[1] : null;
      if (pathCondo && pathCondo !== ctx.condoId) return NextResponse.json({ error: 'El lote no puede cruzar condominios.' }, { status: 403 });
      if (ctx.session.role === 'owner' && (!op.collection.startsWith('condominios/' + ctx.session.condoId + '/') || op.action === 'delete')) {
        return NextResponse.json({ error: 'Operación no autorizada.' }, { status: 403 });
      }

      let expected = typeof op.expectedVersion === 'number' && Number.isInteger(op.expectedVersion) ? op.expectedVersion : null;
      const data = op.data;
      if (ctx.session.role === 'owner') {
        if (!canOwnerWrite(op.collection, data, ctx.session.userId)) return NextResponse.json({ error: 'Operación no autorizada para propietarios.' }, { status: 403 });
        const old = await tursoExecute(ctx.db.databaseUrl, ctx.db.databaseToken,
          'SELECT document_json,version FROM app_documents WHERE collection_name=? AND document_id=? LIMIT 1', [op.collection, op.id]);
        if (old.rows.length) {
          const oldData = JSON.parse(String(old.rows[0][0]));
          if (ownerIdOf(oldData) !== ctx.session.userId || (op.collection.split('/').pop() === 'payments' && oldData?.status !== 'pendiente')) return NextResponse.json({ error: 'No puedes modificar un documento de otro usuario o un pago ya procesado.' }, { status: 403 });
          expected = Number(old.rows[0][1]);
        } else expected = 0;
      }

      if (op.action === 'delete') {
        if (expected !== null) statements.push(versionGuard(op.collection, op.id, expected));
        statements.push({ sql: 'DELETE FROM app_documents WHERE collection_name=? AND document_id=?', args: [op.collection, op.id] });
        continue;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 500000) {
        return NextResponse.json({ error: 'Contenido documental inválido o demasiado grande.' }, { status: 400 });
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
    await tursoBatch(ctx.db.databaseUrl, ctx.db.databaseToken, statements);
    return NextResponse.json({ ok: true, applied: body.operations.length });
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  try {
    const route = await params;
    const ctx = await context(request, route.collection);
    const search = new URL(request.url).searchParams;
    const id = search.get('id');
    const offsetValue = Number(search.get('offset') || 0);
    const offset = Number.isSafeInteger(offsetValue) ? Math.max(0, Math.min(1000000, offsetValue)) : 0;
    const sql = id
      ? 'SELECT document_id,document_json,updated_at,version FROM app_documents WHERE collection_name=? AND document_id=? LIMIT 1'
      : 'SELECT document_id,document_json,updated_at,version FROM app_documents WHERE collection_name=? ORDER BY updated_at DESC, document_id ASC LIMIT 1000 OFFSET ?';
    const result = await tursoExecute(ctx.db.databaseUrl, ctx.db.databaseToken, sql, id ? [ctx.collection, id] : [ctx.collection, offset]);
    let documents = result.rows.map(row => ({ id: String(row[0]), data: JSON.parse(String(row[1])), updatedAt: row[2], version: Number(row[3] || 1) }));
    if (ctx.session.role === 'owner') {
      const leaf = ctx.collection.split('/').pop() || '';
      if (ctx.collection === 'condominios') documents = documents.filter(d => d.id === ctx.session.condoId);
      else if (['owners','propietarios'].includes(leaf)) documents = documents.filter(d => d.id === ctx.session.userId);
      else if (leaf === 'notifications') documents = documents.filter(d => d.id === ctx.session.userId || ownerIdOf(d.data) === ctx.session.userId);
      else if (leaf === 'config') documents = documents.filter(d => d.id !== 'authorization');
      else if (leaf === '_storage_files') documents = documents.filter(d => d.data?.shared === true || ownerIdOf(d.data) === ctx.session.userId);
      else if (!OWNER_SHARED_READ.has(leaf)) documents = documents.filter(d => ownerIdOf(d.data) === ctx.session.userId);
    }
    return NextResponse.json({ documents, hasMore: !id && result.rows.length === 1000, nextOffset: !id && result.rows.length === 1000 ? offset + result.rows.length : null });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  const route = await params;
  if (route.collection === 'batch') return handleBatch(request);
  try {
    const ctx = await context(request, route.collection);
    const body = await request.json();
    const id = typeof body.id === 'string' && body.id.length <= 512 ? body.id : randomUUID();
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return NextResponse.json({ error: 'El documento debe ser un objeto JSON.' }, { status: 400 });
    }
    if (ctx.session.role === 'owner') {
      if (!canOwnerWrite(ctx.collection, body.data, ctx.session.userId)) return NextResponse.json({ error: 'Tu rol no puede modificar este tipo de documento.' }, { status: 403 });
      const old = await tursoExecute(ctx.db.databaseUrl, ctx.db.databaseToken,
        'SELECT document_json FROM app_documents WHERE collection_name=? AND document_id=? LIMIT 1', [ctx.collection, id]);
      if (old.rows.length) { const oldData = JSON.parse(String(old.rows[0][0])); if (ownerIdOf(oldData) !== ctx.session.userId || (ctx.collection.split('/').pop() === 'payments' && oldData?.status !== 'pendiente')) return NextResponse.json({ error: 'No puedes modificar un documento de otro usuario o un pago ya procesado.' }, { status: 403 }); }
    }
    const json = JSON.stringify(body.data);
    if (json.length > 500000) return NextResponse.json({ error: 'Documento demasiado grande.' }, { status: 413 });
    if (body.action === 'update') {
      if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 0) return NextResponse.json({ error: 'Falta la versión esperada del documento.' }, { status: 400 });
      let result;
      if (body.expectedVersion === 0) {
        result = await tursoExecute(ctx.db.databaseUrl, ctx.db.databaseToken,
          'INSERT INTO app_documents(collection_name,document_id,document_json,version) VALUES(?,?,?,1) ON CONFLICT(collection_name,document_id) DO NOTHING',
          [ctx.collection, id, json]);
      } else {
        result = await tursoExecute(ctx.db.databaseUrl, ctx.db.databaseToken,
          'UPDATE app_documents SET document_json=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE collection_name=? AND document_id=? AND version=?',
          [json, ctx.collection, id, body.expectedVersion]);
      }
      if (result.rowsAffected !== 1) return NextResponse.json({ error: 'El documento cambió desde la última lectura. Recarga e inténtalo de nuevo.' }, { status: 409 });
      return NextResponse.json({ ok: true, id, version: body.expectedVersion + 1 });
    }
    const saved = await tursoExecute(ctx.db.databaseUrl, ctx.db.databaseToken,
      'INSERT INTO app_documents(collection_name,document_id,document_json,version) VALUES(?,?,?,1) ON CONFLICT(collection_name,document_id) DO UPDATE SET document_json=excluded.document_json,version=app_documents.version+1,updated_at=CURRENT_TIMESTAMP RETURNING version',
      [ctx.collection, id, json]);
    return NextResponse.json({ ok: true, id, version: Number(saved.rows[0]?.[0] ?? 1) }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  try {
    const route = await params;
    const ctx = await context(request, route.collection);
    if (ctx.session.role === 'owner') return NextResponse.json({ error: 'Los propietarios no pueden eliminar documentos mediante esta operación.' }, { status: 403 });
    const body = await request.json();
    if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'Falta el ID del documento.' }, { status: 400 });
    await tursoExecute(ctx.db.databaseUrl, ctx.db.databaseToken, 'DELETE FROM app_documents WHERE collection_name=? AND document_id=?', [ctx.collection, body.id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

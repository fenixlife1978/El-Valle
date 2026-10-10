import 'server-only';

/**
 * Cliente mínimo del protocolo HTTP de Turso (Hrana v2).
 * Solo para servidor: no importar desde componentes "use client".
 */
type HranaValue =
  | { type: 'null' }
  | { type: 'text'; value: string }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'blob'; base64: string };

export type SqlValue = string | number | boolean | null | Uint8Array;

export interface TursoResult {
  columns: string[];
  rows: unknown[][];
  rowsAffected: number;
  lastInsertRowid: string | null;
}

function encodeValue(value: SqlValue): HranaValue {
  if (value === null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'text', value };
  if (typeof value === 'boolean') return { type: 'integer', value: value ? '1' : '0' };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Parámetro SQL numérico inválido.');
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return { type: 'blob', base64: btoa(binary) };
}

function decodeValue(value: any): unknown {
  if (!value || value.type === 'null') return null;
  if (value.type === 'text') return value.value;
  if (value.type === 'integer') return Number(value.value);
  if (value.type === 'float') return value.value;
  if (value.type === 'blob') return value.base64;
  return null;
}

function pipelineUrl(databaseUrl: string): string {
  const normalized = databaseUrl.trim().replace(/^libsql:\/\//i, 'https://').replace(/\/$/, '');
  const url = new URL(normalized);
  if (url.protocol !== 'https:') throw new Error('La URL de Turso debe usar HTTPS.');
  return `${url.origin}/v2/pipeline`;
}

export async function tursoExecute(
  databaseUrl: string,
  authToken: string,
  sql: string,
  args: SqlValue[] = []
): Promise<TursoResult> {
  if (!authToken?.trim()) throw new Error('Falta el token de acceso a Turso.');
  const response = await fetch(pipelineUrl(databaseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: { sql, args: args.map(encodeValue) },
        },
        { type: 'close' },
      ],
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Turso respondió HTTP ${response.status}: ${detail}`);
  }

  const body = await response.json();
  const item = body?.results?.[0];
  if (item?.type === 'error' || item?.response?.type === 'error') {
    throw new Error(String(item.error?.message ?? item.response.error?.message ?? 'Error ejecutando SQL en Turso.'));
  }
  const result = item?.response?.result;
  if (!result) throw new Error('Respuesta de Turso incompleta.');

  return {
    columns: (result.cols ?? []).map((column: any) => String(column.name ?? '')),
    rows: (result.rows ?? []).map((row: any[]) => row.map(decodeValue)),
    rowsAffected: Number(result.affected_row_count ?? 0),
    lastInsertRowid: result.last_insert_rowid == null ? null : String(result.last_insert_rowid),
  };
}

export interface TursoBatchStatement { sql: string; args?: SqlValue[]; }
/** Executes a group of statements in one Turso transaction; the batch is rolled back if a step fails. */
export async function tursoBatch(databaseUrl: string, authToken: string, statements: TursoBatchStatement[]): Promise<void> {
  if (!authToken?.trim()) throw new Error('Falta el token de acceso a Turso.');
  if (!statements.length || statements.length > 100) throw new Error('Lote SQL inválido.');
  const response = await fetch(pipelineUrl(databaseUrl), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { type: 'batch', batch: { mode: 'write', steps: statements.map(s => ({ stmt: { sql: s.sql, args: (s.args || []).map(encodeValue) } })) } },
        { type: 'close' }
      ]
    }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Turso respondió HTTP ' + response.status + ' al procesar el lote.');
  const body = await response.json();
  const item = body?.results?.[0];
  if (item?.type === 'error' || item?.response?.type === 'error') throw new Error(String(item.error?.message ?? item.response?.error?.message ?? 'Falló la transacción Turso.'));
  const batchResult = item?.response?.result;
  const stepErrors = batchResult?.step_errors ?? [];
  const firstStepError = stepErrors.find((e: any) => e != null);
  if (firstStepError) throw new Error(String(firstStepError.message ?? firstStepError.error?.message ?? 'Falló la transacción Turso.'));
  const steps = batchResult?.step_results ?? batchResult?.results ?? [];
  const failed = steps.find((s: any) => s?.type === 'error' || s?.response?.type === 'error');
  if (failed) throw new Error(String(failed.error?.message ?? failed.response?.error?.message ?? 'Falló la transacción Turso.'));
  if (batchResult?.step_errors && batchResult.step_errors.length && batchResult.step_errors.every((e: any) => e == null) === false) throw new Error('Falló una operación del lote Turso.');
}

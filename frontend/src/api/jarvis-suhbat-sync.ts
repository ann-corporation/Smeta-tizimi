import type { ServerSuhbat } from './t2-agent-ish';

type Message = { r: 'user' | 'ai'; m: string };
type ActiveSnapshot =
  | { id: string; holat: 'missing' }
  | { id: string; holat: 'same'; etag: string }
  | { id: string; holat: 'changed'; etag: string; sarlavha: string; xabarlar: Message[] | null; qisqartma: string | null; arxivlangan?: true };
export type ConversationSync = { royxat: ServerSuhbat[]; suhbat: ActiveSnapshot | null };
export type ConversationPageCursor = { at: string; row: string };
type ConversationPage = { royxat: ServerSuhbat[]; keyingi: ConversationPageCursor | null };
type Cursor = { id: string; etag: string | null };
const idPattern = /^[a-zA-Z0-9_.-]{1,40}$/;
const etagPattern = /^[a-f0-9]{32}$/;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const validListRow = (value: unknown): value is ServerSuhbat => {
  const row = record(value);
  return !!row && typeof row.id === 'string' && idPattern.test(row.id) && typeof row.sarlavha === 'string' &&
    typeof row.yangilandi === 'string' && Number.isFinite(Date.parse(row.yangilandi)) && typeof row.toliq === 'boolean';
};
const validMessage = (value: unknown): value is Message => {
  const row = record(value);
  return !!row && (row.r === 'user' || row.r === 'ai') && typeof row.m === 'string' && row.m.length > 0 && row.m.length <= 800;
};
const validList = (value: unknown): value is ServerSuhbat[] => Array.isArray(value) && value.length <= 20 &&
  value.every(validListRow) && new Set(value.map(row => row.id)).size === value.length;

export function parseConversationSync(value: unknown, cursor: Cursor | null): ConversationSync | null {
  const body = record(value);
  if (!body || body.ok !== true || !validList(body.royxat)) return null;
  const royxat = body.royxat;
  if (!cursor) return body.suhbat === null ? { royxat, suhbat: null } : null;
  const row = record(body.suhbat);
  if (!row || row.id !== cursor.id) return null;
  if (row.holat === 'missing') return { royxat, suhbat: { id: cursor.id, holat: 'missing' } };
  if (typeof row.etag !== 'string' || !etagPattern.test(row.etag)) return null;
  if (row.holat === 'same' && row.etag === cursor.etag) return { royxat, suhbat: { id: cursor.id, holat: 'same', etag: row.etag } };
  if (row.holat !== 'changed' || typeof row.sarlavha !== 'string' ||
      !(row.qisqartma === null || typeof row.qisqartma === 'string') ||
      !(row.xabarlar === null || (Array.isArray(row.xabarlar) && row.xabarlar.length <= 12 && row.xabarlar.every(validMessage)))) return null;
  return { royxat, suhbat: { id: cursor.id, holat: 'changed', etag: row.etag, sarlavha: row.sarlavha, xabarlar: row.xabarlar, qisqartma: row.qisqartma,
    ...(row.arxivlangan === true ? { arxivlangan: true as const } : {}) } };
}

export async function jarvisConversationPage(company: number, before: ConversationPageCursor | null): Promise<ConversationPage | null> {
  try {
    const response = await fetch('/api/agent-ish', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ amal: 'suhbat_page', kompaniya_id: company, before_at: before?.at ?? null, before_row: before?.row ?? null }),
    });
    if (!response.ok) return null;
    const body = record(await response.json());
    if (body?.ok !== true || !validList(body.royxat)) return null;
    if (body.keyingi === null) return { royxat: body.royxat, keyingi: null };
    const cursor = record(body.keyingi);
    if (!cursor || typeof cursor.at !== 'string' || !Number.isFinite(Date.parse(cursor.at)) ||
      typeof cursor.row !== 'string' || !/^[1-9]\d{0,18}$/.test(cursor.row) ||
      (cursor.at === before?.at && cursor.row === before.row)) return null;
    return { royxat: body.royxat, keyingi: { at: cursor.at, row: cursor.row } };
  } catch { return null; }
}

export async function syncJarvisConversation(company: number, cursor: Cursor | null, signal: AbortSignal): Promise<ConversationSync | null> {
  try {
    const response = await fetch('/api/agent-ish', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ amal: 'suhbat_sync', kompaniya_id: company, klient_id: cursor?.id ?? null, etag: cursor?.etag ?? null }),
    });
    if (!response.ok) return null;
    return parseConversationSync(await response.json(), cursor);
  } catch { return null; }
}

export async function appendJarvisMessages(
  company: number, id: string, etag: string, messages: Message[], operationId: string, actor?: number,
): Promise<{ etag: string } | { stale: true } | null> {
  if (!messages.length || messages.length > 12) return null;
  const result = await mutateJarvisConversation(company, id, etag, { harakat: 'append', xabarlar: messages, operation_id: operationId }, actor);
  return result.status === 'saved' ? { etag: result.etag } : result.status === 'stale' ? { stale: true } : null;
}

type Mutation =
  | { harakat: 'create'; sarlavha: string; xabarlar: Message[] }
  | { harakat: 'append'; xabarlar: Message[]; operation_id: string }
  | { harakat: 'rename'; sarlavha: string }
  | { harakat: 'delete' };
type MutationResult = { status: 'saved'; etag: string } | { status: 'deleted' | 'stale' | 'failed' };

export async function mutateJarvisConversation(
  company: number, id: string, etag: string | null, mutation: Mutation, actor?: number,
): Promise<MutationResult> {
  if (!idPattern.test(id) || (mutation.harakat === 'create' ? etag !== null : !etag || !etagPattern.test(etag))) return { status: 'failed' };
  try {
    const response = await fetch('/api/agent-ish', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        amal: 'suhbat_mutate', kompaniya_id: company, klient_id: id, etag, ...mutation,
        ...(actor === undefined ? {} : { outbox_actor: actor }),
      }),
    });
    if (response.status === 409 || response.status === 404) return { status: 'stale' };
    if (!response.ok) return { status: 'failed' };
    const data = record(await response.json());
    if (data?.ok !== true || data.id !== id) return { status: 'failed' };
    if (mutation.harakat === 'delete') return { status: data.holat === 'missing' ? 'deleted' : 'failed' };
    return typeof data.etag === 'string' && etagPattern.test(data.etag)
      ? { status: 'saved', etag: data.etag } : { status: 'failed' };
  } catch { return { status: 'failed' }; }
}

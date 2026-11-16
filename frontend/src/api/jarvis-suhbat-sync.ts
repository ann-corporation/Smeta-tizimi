import type { ServerSuhbat } from './t2-agent-ish';

type Message = { r: 'user' | 'ai'; m: string };
type ActiveSnapshot =
  | { id: string; holat: 'missing' }
  | { id: string; holat: 'same'; etag: string }
  | { id: string; holat: 'changed'; etag: string; sarlavha: string; xabarlar: Message[] | null; qisqartma: string | null };
export type ConversationSync = { royxat: ServerSuhbat[]; suhbat: ActiveSnapshot | null };
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

export function parseConversationSync(value: unknown, cursor: Cursor | null): ConversationSync | null {
  const body = record(value);
  if (!body || body.ok !== true || !Array.isArray(body.royxat) || body.royxat.length > 20 || !body.royxat.every(validListRow) ||
      new Set(body.royxat.map(row => row.id)).size !== body.royxat.length) return null;
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
  return { royxat, suhbat: { id: cursor.id, holat: 'changed', etag: row.etag, sarlavha: row.sarlavha, xabarlar: row.xabarlar, qisqartma: row.qisqartma } };
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

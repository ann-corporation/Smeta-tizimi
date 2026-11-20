import { afterEach, expect, it, vi } from 'vitest';
import { jarvisToolNames } from '../../../src/lib/jarvis/tool-registry';
import { jarvisSignalBatch, jarvisSignalRow, jarvisSignalYoz, type JarvisSignal } from './learning';

const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic' };
const op = '11111111-1111-4111-8111-111111111111';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each(['feedback_good', 'feedback_bad', 'feedback_unclear'] as const)('records fixed %s without transcript fields', kind => {
  const row = jarvisSignalRow({ kind, question: 'Synthetic private text', actor: 999, company: 99 } as JarvisSignal);
  expect(row).toMatchObject({ s: 'jarvis', a: kind, n: 1, o: 0 });
  expect(JSON.stringify(row)).not.toMatch(/private|999|company|question/);
});
it.each([
  ['tool_finished', 'tugadi', 't0'], ['tool_failed', 'xato', 'SOURCE_UNAVAILABLE'],
  ['no_answer', 'xato', 'NO_ANSWER'], ['permission_denied', 'xato', 'FORBIDDEN'],
] as const)('encodes %s from fixed codes, not exception/query strings', (kind, h, k) => {
  for (const tool of jarvisToolNames) expect(jarvisSignalRow({ kind, tool, ms: 4 })).toEqual({ s: 'jarvis', a: `read.${tool}`, h, k, n: 1, o: 0 });
});
it.each([[0, 't0'], [4999, 't0'], [5000, 't1'], [30000, 't2'], [120000, 't3'], [600000, 't4']] as const)('uses existing friction time bucket at %sms', (ms, k) => {
  expect(jarvisSignalRow({ kind: 'tool_finished', tool: 'object_search', ms })?.k).toBe(k);
});
it.each([
  null, { kind: 'raw_question' }, { kind: 'tool_failed', tool: 'private-name', ms: 1 },
  { kind: 'tool_failed', tool: '__proto__', ms: 1 }, { kind: 'tool_finished', tool: 'object_search', ms: -1 },
  { kind: 'tool_finished', tool: 'object_search', ms: NaN }, { kind: 'tool_finished', tool: 'object_search', ms: Infinity },
])('rejects invalid or unbounded dimensions %#', signal => expect(jarvisSignalRow(signal as JarvisSignal)).toBeNull());
it('uses the existing named RPC with authenticated scope and the same event id on retry', async () => {
  const fetcher = vi.fn(async () => Response.json({ ok: true, qabul: 1 })); vi.stubGlobal('fetch', fetcher);
  expect(await jarvisSignalYoz(env, 7, 17, { kind: 'feedback_bad' }, op)).toBe(true);
  expect(await jarvisSignalYoz(env, 7, 17, { kind: 'feedback_bad' }, op)).toBe(true);
  for (const [url, init] of fetcher.mock.calls as unknown as Array<[string, RequestInit]>) {
    expect(url).toBe(env.SUPABASE_URL + '/rest/v1/rpc/t2_osuvchi_yoz_v1');
    expect(JSON.parse(String(init.body))).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_operation_id: op,
      p_amal: 'friksiya_yubor', p_yuk: { qatorlar: [{ s: 'jarvis', a: 'feedback_bad', h: 'tashlandi', k: '', n: 1, o: 0 }] } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  }
});
it.each([{ ok: true, takror: true }, { ok: true, qabul: 1 }])('accepts existing RPC acknowledgement %j', reply => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(reply)));
  return expect(jarvisSignalYoz(env, 7, 17, { kind: 'feedback_good' })).resolves.toBe(true);
});
it.each([{ ok: false, code: 'RUXSAT' }, { ok: true, otkazildi: true }, { ok: true, qabul: 0 }, { ok: true }])('does not claim persistence for %j', reply => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(reply)));
  return expect(jarvisSignalYoz(env, 7, 17, { kind: 'feedback_bad' })).resolves.toBe(false);
});
it('never fails the answer when the source rejects or fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('synthetic network error'); }));
  expect(await jarvisSignalYoz(env, 7, 17, { kind: 'feedback_bad' })).toBe(false);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
  expect(await jarvisSignalYoz(env, 7, 17, { kind: 'feedback_bad' })).toBe(false);
});
it('rejects invalid scope/config/id before fetch; does not replace malformed retry IDs', async () => {
  const f = vi.fn(); vi.stubGlobal('fetch', f);
  for (const id of [null, '', 'not-a-uuid', 5]) expect(await jarvisSignalYoz(env, 7, 17, { kind: 'feedback_bad' }, id)).toBe(false);
  for (const [actor, company] of [[0, 17], [7, 0], [NaN, 17], [7, 1.5]]) expect(await jarvisSignalYoz(env, actor, company, { kind: 'feedback_bad' })).toBe(false);
  expect(await jarvisSignalYoz({}, 7, 17, { kind: 'feedback_bad' })).toBe(false);
  expect(f).not.toHaveBeenCalled();
});
it('aggregates repeated events and flushes once per turn even when called twice', async () => {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true, qabul: 2 })); vi.stubGlobal('fetch', f);
  const batch = jarvisSignalBatch(env, 7, 17, op);
  for (let i = 0; i < 4; i++) batch.record({ kind: 'tool_finished', tool: 'object_search', ms: 1 });
  batch.record({ kind: 'feedback_good' });
  expect(f).not.toHaveBeenCalled();
  const first = batch.flush(); expect(batch.flush()).toBe(first); await first;
  expect(f).toHaveBeenCalledTimes(1);
  const rows = JSON.parse(String(f.mock.calls[0][1]?.body)).p_yuk.qatorlar;
  expect(rows).toHaveLength(2); expect(rows[0]).toMatchObject({ a: 'read.object_search', n: 4 });
  batch.record({ kind: 'feedback_bad' }); await batch.flush(); expect(f).toHaveBeenCalledTimes(1);
});
it('keeps batches isolated and bounded instead of persisting one row per event', async () => {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true, qabul: 1 })); vi.stubGlobal('fetch', f);
  const a = jarvisSignalBatch(env, 7, 17); const b = jarvisSignalBatch(env, 8, 18);
  for (let i = 0; i < 1005; i++) a.record({ kind: 'feedback_good' });
  b.record({ kind: 'feedback_bad' });
  await Promise.all([a.flush(), b.flush()]);
  const bodies = f.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies[0]).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 17, p_yuk: { qatorlar: [{ a: 'feedback_good', n: 1000 }] } });
  expect(bodies[1]).toMatchObject({ p_actor_id: 8, p_kompaniya_id: 18, p_yuk: { qatorlar: [{ a: 'feedback_bad', n: 1 }] } });
  expect(bodies[0].p_operation_id).not.toBe(bodies[1].p_operation_id);
  const empty = jarvisSignalBatch(env, 7, 17); expect(await empty.flush()).toBe(false); expect(f).toHaveBeenCalledTimes(2);
});
it('returns within two seconds even if the transport ignores abort', async () => {
  vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
  const pending = jarvisSignalYoz(env, 7, 17, { kind: 'feedback_bad' });
  await vi.advanceTimersByTimeAsync(2000);
  expect(await pending).toBe(false);
});

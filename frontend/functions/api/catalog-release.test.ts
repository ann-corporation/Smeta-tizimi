// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../_shared/auth', () => ({ tekshir: vi.fn() }));
import { tekshir } from '../_shared/auth';
import { digest, metadata, onRequestGet, onRequestPost, validRows } from './catalog-release';
const meta = { nom: 'Каталог', tur: 'katalog', yil: 2026, kvartal: 1, nds_holati: 'nomalum', valyuta: null };
const source = 'a'.repeat(64);
function bucket() {
  const map = new Map<string, { body: string | ArrayBuffer; customMetadata: Record<string, string> }>();
  const obj = (key: string) => { const v = map.get(key); return v ? { key, size: typeof v.body === 'string' ? new TextEncoder().encode(v.body).length : v.body.byteLength, customMetadata: v.customMetadata, json: async () => JSON.parse(String(v.body)), body: v.body } : null; };
  return { map, head: vi.fn(async (key: string) => obj(key)), get: vi.fn(async (key: string) => obj(key)), put: vi.fn(async (key: string, body: string | ArrayBuffer, options: { customMetadata: Record<string, string> }) => {
    if (map.has(key)) return null;
    map.set(key, { body, customMetadata: options.customMetadata }); return obj(key);
  }), list: vi.fn(async ({ prefix }: { prefix: string }) => ({ objects: [...map.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false })) };
}
function ctx(request: Request, r2: ReturnType<typeof bucket>) {
  return { request, env: { SESSIYA_KALIT: 'test', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test', R2_CANONICAL: r2 } } as unknown as Parameters<typeof onRequestPost>[0];
}
async function post(r2: ReturnType<typeof bucket>, extra: Record<string, unknown>) {
  return onRequestPost(ctx(new Request('https://app/api/catalog-release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_sha256: source, metadata: meta, ...extra }) }), r2));
}
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(tekshir).mockResolvedValue({ foydalanuvchi_id: 7, rol: 'admin', exp: 9999999999, jti: 'test' });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ foydalanuvchi: { jami: 1 } })));
});
describe('catalog releases', () => {
  it('preserves explicit zero and unknown, rejects invalid prices and nested input', () => {
    expect(validRows([{ nom: 'Материал', narx: null, birlik: null }, { nom: 'Нулевой', narx: 0 }])).toBe(true);
    for (const narx of [-1, NaN, '10']) expect(validRows([{ nom: 'Материал', narx }])).toBe(false);
    expect(validRows([{ nom: 'x', arbitrary: {} }])).toBe(false);
    expect(metadata({ ...meta, kvartal: '1' })).toBe(null);
    expect(metadata(meta)?.valyuta).toBe(null);
  });
  it('denies anonymous and legacy sessions before storage or upstream calls', async () => {
    vi.mocked(tekshir).mockResolvedValue(null); const r2 = bucket();
    expect((await post(r2, { action: 'chunk' })).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled(); expect(r2.head).not.toHaveBeenCalled();
    expect((await onRequestGet(ctx(new Request('https://app/api/catalog-release'), r2))).status).toBe(401);
  });
  it('fresh database denial wins over cookie role', async () => {
    vi.mocked(tekshir).mockResolvedValue({ foydalanuvchi_id: 7, rol: 'superadmin', exp: 9999999999, jti: 'test' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('SUPERADMIN_KERAK', { status: 400 })));
    const r2 = bucket(); expect((await post(r2, { action: 'chunk' })).status).toBe(403); expect(r2.head).not.toHaveBeenCalled();
  });
  it('rejects cross-origin writes before checking privilege', async () => {
    const r2 = bucket();
    const request = new Request('https://app/api/catalog-release', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
    expect((await onRequestPost(ctx(request, r2))).status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed on permission service outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    const r2 = bucket(); expect((await post(r2, { action: 'chunk' })).status).toBe(502); expect(r2.put).not.toHaveBeenCalled();
  });
  it('stores the original file with a server-computed hash and deduplicates retries', async () => {
    const r2 = bucket();
    const upload = () => {
      const form = new FormData(); form.set('fayl', new File(['original source'], 'catalog.xlsx'));
      const request = new Request('https://app/api/catalog-release', { method: 'POST', body: form });
      request.headers.set('Content-Length', '1024');
      return onRequestPost(ctx(request, r2));
    };
    const first = await (await upload()).json() as { source_sha256: string; bytes: number };
    expect(first.source_sha256).toBe(await digest('original source')); expect(first.bytes).toBe(15);
    expect((await (await upload()).json() as { source_sha256: string }).source_sha256).toBe(first.source_sha256);
    expect(r2.map.size).toBe(1);
  });
  it('stores chunks idempotently and lists only a fully verified manifest', async () => {
    const r2 = bucket(); r2.map.set(`catalog-releases/sources/${source}`, { body: 'source', customMetadata: { sha256: source } });
    const rows = [{ nom: 'Материал', birlik: null, narx: null }];
    const first = await (await post(r2, { action: 'chunk', index: 0, rows })).json() as { revision: string; part: { index: number; sha256: string; rows: number } };
    const retry = await (await post(r2, { action: 'chunk', index: 0, rows })).json(); expect(retry).toEqual(first);
    const read = () => onRequestGet(ctx(new Request('https://app/api/catalog-release'), r2));
    expect((await (await read()).json() as { releases: unknown[] }).releases).toEqual([]);
    expect((await post(r2, { action: 'finalize', parts: [first.part], total_rows: 2 })).status).toBe(409);
    expect((await post(r2, { action: 'finalize', parts: [{ ...first.part, sha256: 'b'.repeat(64) }], total_rows: 1 })).status).toBe(409);
    expect((await post(r2, { action: 'finalize', parts: [first.part], total_rows: 1 })).status).toBe(200);
    const finished = await (await read()).json() as { releases: { pricing_published: boolean; metadata: { valyuta: string | null }; actor_id: number }[] }; expect(finished.releases).toHaveLength(1); expect(finished.releases[0].pricing_published).toBe(false);
    expect(finished.releases[0].metadata.valyuta).toBe(null); expect(finished.releases[0].actor_id).toBe(7);
    expect((await (await post(r2, { action: 'finalize', parts: [first.part], total_rows: 1 })).json() as { duplicate: boolean }).duplicate).toBe(true);
    expect(await digest(JSON.stringify(rows))).toBe(first.part.sha256);
  });
  it('rejects missing source, invalid indices, traversal and oversized JSON', async () => {
    const r2 = bucket(); expect((await post(r2, { action: 'chunk', index: 0, rows: [{ nom: 'x' }] })).status).toBe(409);
    expect((await onRequestGet(ctx(new Request('https://app/api/catalog-release?revision=../../secrets'), r2))).status).toBe(400);
    expect((await post(r2, { huge: 'x'.repeat(4 * 1024 * 1024) })).status).toBe(413);
  });
});

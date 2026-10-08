import { beforeEach, expect, it, vi } from 'vitest';
import { uploadCatalogRelease, type ReleaseMeta } from './client';
const meta: ReleaseMeta = { nom: 'Test', tur: 'katalog', yil: null, kvartal: null, valyuta: null, nds_holati: 'nomalum' };
beforeEach(() => { vi.restoreAllMocks(); });
it('uploads 30001 rows in bounded chunks and finalizes only after all parts', async () => {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options.body instanceof FormData) return Response.json({ ok: true, source_sha256: 'a'.repeat(64) });
    const b = JSON.parse(options.body); calls.push(b);
    return b.action === 'chunk' ? Response.json({ ok: true, part: { index: b.index, sha256: 'b'.repeat(64), rows: b.rows.length } }) : Response.json({ ok: true, revision: 'c'.repeat(64), rows: b.total_rows });
  }));
  const rows = Array.from({ length: 30001 }, (_, i) => ({ nom: `Resource ${i}`, narx: i === 0 ? null : 0, birlik: null }));
  const done = await uploadCatalogRelease(new File(['test'], 'test.xlsx'), meta, rows);
  expect(done.rows).toBe(30001); expect(calls.filter(c => c.action === 'chunk')).toHaveLength(16);
  expect(calls.filter(c => c.action === 'chunk').every(c => (c.rows as unknown[]).length <= 2000)).toBe(true);
  expect(calls.at(-1)?.action).toBe('finalize'); expect(calls.at(-1)?.total_rows).toBe(30001);
  expect((calls[0].rows as Record<string, unknown>[])[0].narx).toBe(null);
  expect((calls[0].rows as Record<string, unknown>[])[1].narx).toBe(0);
});
it('does not finalize a partial upload', async () => {
  const actions: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options.body instanceof FormData) return Response.json({ ok: true, source_sha256: 'a'.repeat(64) });
    const b = JSON.parse(options.body); actions.push(b.action); return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }));
  await expect(uploadCatalogRelease(new File(['test'], 'test.xlsx'), meta, [{ nom: 'x', narx: null }])).rejects.toThrow('unavailable');
  expect(actions).toEqual(['chunk']);
});

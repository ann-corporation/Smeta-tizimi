import { describe, expect, it } from 'vitest';
import { narxKatalogKey, onRequestGet } from './narx-katalog';
import { imzola } from '../_shared/auth';

const KALIT = 'k'.repeat(32), REV = 'f03b13183496d6bc';
async function call(query: string, objects: Record<string, { body: string; gzip?: boolean }> = {}, signed = true) {
  const asked: string[] = [];
  const r2 = { get: async (k: string) => { asked.push(k); const o = objects[k]; return o ? { body: o.body, httpMetadata: { contentEncoding: o.gzip ? 'gzip' : undefined } } : null; } };
  const cookie = signed ? 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KALIT) : '';
  const r = await onRequestGet({ request: new Request('https://x/api/narx-katalog' + query, { headers: { Cookie: cookie } }), env: { SESSIYA_KALIT: KALIT, R2_CANONICAL: r2 } } as never);
  return { r, asked };
}
describe('/api/narx-katalog', () => {
  it('session required; R2 untouched', async () => { const { r, asked } = await call(`?rev=${REV}&f=dict.json`, {}, false); expect(r.status).toBe(401); expect(asked).toEqual([]); });
  it.each([[REV, '../CURRENT.json'], [REV, 'r/1.json'], [REV, 'tree.json'], ['zz', 'dict.json'], [null, 'dict.json'], [REV, 'current']])('rejects rev=%s f=%s', (rev, f) => expect(narxKatalogKey(rev, f)).toBeNull());
  it('stays inside its own prefix (never norm-katalog or documents)', () => {
    expect(narxKatalogKey(REV, 'r/0003.json')).toBe(`narx-katalog/${REV}/r/0003.json`);
    expect(narxKatalogKey(null, 'current')).toBe('narx-katalog/CURRENT.json');
  });
  it('streams gzip with immutable private cache; CURRENT no-store; missing → 404', async () => {
    const ok = await call(`?rev=${REV}&f=dict.json`, { [`narx-katalog/${REV}/dict.json`]: { body: 'GZ', gzip: true } });
    expect(ok.r.status).toBe(200); expect(ok.r.headers.get('Content-Encoding')).toBe('gzip'); expect(ok.r.headers.get('Cache-Control')).toContain('immutable');
    const cur = await call('?f=current', { 'narx-katalog/CURRENT.json': { body: '{}' } });
    expect(cur.r.headers.get('Cache-Control')).toBe('no-store');
    expect((await call(`?rev=${REV}&f=r/0000.json`)).r.status).toBe(404);
  });
});

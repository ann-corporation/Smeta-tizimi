import { describe, expect, it } from 'vitest';
import { normKatalogKey, onRequestGet } from './norm-katalog';
import { imzola } from '../_shared/auth';

const KALIT = 'k'.repeat(32);
const REV = '632ffecac8fa5746';
function bucket(objects: Record<string, { body: string; gzip?: boolean }>) {
  const asked: string[] = [];
  return { asked, r2: { get: async (key: string) => { asked.push(key); const o = objects[key]; return o ? { body: o.body, httpMetadata: { contentEncoding: o.gzip ? 'gzip' : undefined } } : null; } } };
}
async function call(query: string, objects: Record<string, { body: string; gzip?: boolean }> = {}, signed = true) {
  const b = bucket(objects);
  const cookie = signed ? 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KALIT) : '';
  const request = new Request('https://x/api/norm-katalog' + query, { headers: { Cookie: cookie } });
  const r = await onRequestGet({ request, env: { SESSIYA_KALIT: KALIT, R2_CANONICAL: b.r2 } } as never);
  return { r, asked: b.asked };
}

describe('/api/norm-katalog', () => {
  it('session required; R2 not touched', async () => {
    const { r, asked } = await call(`?rev=${REV}&f=works.json`, {}, false);
    expect(r.status).toBe(401); expect(asked).toEqual([]);
  });
  it.each([
    [null, 'works.json'], [REV, '../CURRENT.json'], [REV, 's/../../x.json'], ['ABC', 'tree.json'],
    [REV, 'hujjat/1.pdf'], [REV, 's/12.json'], [REV, 'current'],
  ])('rejects path rev=%s f=%s', (rev, f) => expect(normKatalogKey(rev, f)).toBeNull());
  it('maps whitelisted paths into the revision prefix only', () => {
    expect(normKatalogKey(null, 'current')).toBe('norm-katalog/CURRENT.json');
    expect(normKatalogKey(REV, 's/0090.json')).toBe(`norm-katalog/${REV}/s/0090.json`);
  });
  it('invalid path is 400 before R2', async () => {
    const { r, asked } = await call(`?rev=${REV}&f=../../secret`);
    expect(r.status).toBe(400); expect(asked).toEqual([]);
  });
  it('missing object is 404, never empty data', async () => {
    const { r } = await call(`?rev=${REV}&f=tree.json`);
    expect(r.status).toBe(404);
  });
  it('revision file streams with gzip encoding and immutable private cache', async () => {
    const { r } = await call(`?rev=${REV}&f=tree.json`, { [`norm-katalog/${REV}/tree.json`]: { body: 'GZ', gzip: true } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Encoding')).toBe('gzip');
    expect(r.headers.get('Cache-Control')).toContain('immutable');
    expect(r.headers.get('Cache-Control')).toContain('private');
    expect(r.headers.get('X-Norm-Catalog-Status')).toBe('REVIEW_ONLY');
  });
  it('CURRENT pointer is never cached', async () => {
    const { r } = await call('?f=current', { 'norm-katalog/CURRENT.json': { body: '{"revision":"x"}' } });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
});

import { describe, expect, it } from 'vitest';
import { onRequestGet, koefKatalogKey } from './koef-katalog';
import { CONSTRUCT_KEY } from '../_shared/construct-koef';
import { imzola } from '../_shared/auth';
const KEY = 'synthetic-unit-test-only-key-32-chars';
async function call(query: string, signed = true, data: string | null = null) {
  const calls: string[] = [];
  const cookie = signed ? 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 900001, kompaniyalar: [{ kompaniya_id: 900001, rol: 'pto' }] }, KEY) : '';
  const request = new Request('https://test.invalid/api/koef-katalog'+query, { headers: { Cookie: cookie } });
  const response = await onRequestGet({ request, env: { SESSIYA_KALIT: KEY, R2_CANONICAL: { get: async (key: string) => {
    calls.push(key);return data == null ? null : { body: data, size: data.length, arrayBuffer: async () => new TextEncoder().encode(data).buffer };
  } } } } as never);
  return { response, calls };
}
describe('coefficient reference port', () => {
  it('preserves the active catalog path and legacy contract', async () => {
    expect(koefKatalogKey(null, 'current')).toBe('koef-katalog/CURRENT.json');
    const { response, calls } = await call('?f=current', true, '{"revision":"b53bb50b9ee82a09"}');
    expect(response.status).toBe(200);expect(calls).toEqual(['koef-katalog/CURRENT.json']);
  });
  it('requires a signed session before reading R2', async () => {
    const { response, calls } = await call('?f=construct&work=Е01-01-001-1', false);
    expect(response.status).toBe(401);expect(calls).toEqual([]);
  });
  it.each(['&limit=101', '&limit=-1', '&limit=', '&offset=-1', '&offset=NaN', '&limit=1.5'])('rejects invalid pagination %s before R2', async suffix => {
    const { response, calls } = await call('?f=construct&work=Е01-01-001-1'+suffix);
    expect(response.status).toBe(400);expect(calls).toEqual([]);
  });
  it('never lets the query select an R2 key or revision; absent source is not an empty result', async () => {
    const { response, calls } = await call('?f=construct&work=Е01-01-001-1&rev=../../secret');
    expect(response.status).toBe(503);expect(calls).toEqual([CONSTRUCT_KEY]);
    expect(await response.json()).toMatchObject({ code: 'REFERENCE_NOT_PUBLISHED' });
  });
  it('hash mismatch fails closed rather than serving corrupted source factors', async () => {
    const { response } = await call('?f=construct&work=Е01-01-001-1', true, '{"changed":true}');
    expect(response.status).toBe(502);expect(await response.json()).toMatchObject({ code: 'REFERENCE_HASH_MISMATCH' });
  });
});

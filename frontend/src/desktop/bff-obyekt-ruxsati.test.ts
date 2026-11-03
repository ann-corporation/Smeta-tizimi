import { afterEach, expect, it, vi } from 'vitest';
import { bffObyektRuxsati } from './bff-obyekt-ruxsati';

const scope = { obyektId: 3, kompaniyaId: 4, foydalanuvchiId: 5 };
const expires = Date.now() + 60_000;
const session = (overrides = {}) => Response.json({
  ok: true, zaxira_kalit: false, foydalanuvchi_id: 5, tugaydi: expires, ...overrides,
});
const paket = (overrides = {}) => Response.json({
  format: 't2-paket/1', obyekt_id: 3, kompaniya_id: 4, ...overrides,
});
const check = bffObyektRuxsati(() => true);

afterEach(() => vi.unstubAllGlobals());

it('requires a fresh session and full package check on every open', async () => {
  const fetch = vi.fn(async (url: string) => url === '/api/sessiya' ? session() : paket());
  vi.stubGlobal('fetch', fetch);
  for (let i = 0; i < 2; i++) expect(await check(scope)).toEqual({ ok: true, doira: scope });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/sessiya', '/api/obyekt-paket?obyekt_id=3', '/api/sessiya',
    '/api/sessiya', '/api/obyekt-paket?obyekt_id=3', '/api/sessiya',
  ]);
  expect(fetch).toHaveBeenCalledWith('/api/sessiya', expect.objectContaining({
    credentials: 'same-origin', cache: 'no-store', redirect: 'error',
  }));
});

it.each([401, 403, 404, 503, 304])('fails closed on package HTTP %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(new Response(null, { status })));
  expect(await check(scope)).toEqual({ ok: false, status });
});

it.each([
  { foydalanuvchi_id: 9 }, { tugaydi: 1 }, { zaxira_kalit: true },
])('rejects invalid session %j before requesting a package', async overrides => {
  const fetch = vi.fn().mockResolvedValueOnce(session(overrides));
  vi.stubGlobal('fetch', fetch);
  expect(await check(scope)).toEqual({ ok: false, status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([{ obyekt_id: 7 }, { kompaniya_id: 7 }, { format: 'unknown' }])('rejects mismatched package %j', async overrides => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(paket(overrides)));
  expect(await check(scope)).toEqual({ ok: false, status: 0 });
});

it('rejects session replacement during the package request', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(paket())
    .mockResolvedValueOnce(session({ tugaydi: expires + 1 })));
  expect(await check(scope)).toEqual({ ok: false, status: 401 });
});

it('rejects a late response after the caller invalidates the auth generation', async () => {
  let current = true;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(paket())
    .mockImplementationOnce(async () => { current = false; return session(); }));
  expect(await bffObyektRuxsati(() => current)(scope)).toEqual({ ok: false, status: 0 });
});

it('fails closed on network and malformed responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(session()).mockResolvedValueOnce(new Response('invalid json')));
  expect(await check(scope)).toEqual({ ok: false, status: 0 });
  expect(await check(scope)).toEqual({ ok: false, status: 0 });
});

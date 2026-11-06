// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestGet } from './normativ-qidir';

afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); });

async function setup() {
  const secret = 'synthetic-k3-cookie-secret';
  const source = 'a'.repeat(64);
  const bytes = new TextEncoder().encode(JSON.stringify({ source_sha: source, matn: 'Synthetic clause.' }));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  const row = {
    hujjat_id: '99999999-0000-0000-0000-000000000001', norma_kod: '06-01-01', tahrir: '1',
    nom: 'Synthetic', source_sha: source, job_sha: 'b'.repeat(64), sha256: sha,
    r2_key: 'normativ/chunks/' + sha + '.json', bayt: bytes.byteLength, unit: 'page-1',
    sahifa_pdf: 1, sahifa_bosma: null, bob_punkt: null, jadval_kod: null,
  };
  const get = vi.fn(async (_key: string) => ({ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }));
  let dbResult: object = { ok: true, natijalar: [row] };
  const rpc = vi.fn(async (url: string, _init?: RequestInit) => url.endsWith('/t2_men_v1')
    ? Response.json({ ok: true, foydalanuvchi: { holat: 'faol' },
      context_kompaniyalar: [{ kompaniya_id: 3, effective_role: 'pto', permissions: ['company.read'] }] })
    : Response.json(dbResult));
  vi.stubGlobal('fetch', rpc);
  const cookie = 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 7 }, secret);
  const env = { SESSIYA_KALIT: secret, SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_KEY: 'synthetic', NORMATIV_R2: { get } };
  const call = (query = 'kompaniya_id=3&q=06-01-01', signed = true) =>
    onRequestGet({ request: new Request('https://test.invalid/api/normativ-qidir?' + query,
      { headers: signed ? { Cookie: cookie } : {} }), env } as unknown as Parameters<typeof onRequestGet>[0]);
  return { call, row, get, rpc, bytes, db: (value: object) => { dbResult = value; } };
}

it('returns verified citation with null page fields and a protected chunk lookup', async () => {
  const h = await setup();
  const res = await h.call();
  const { natijalar: [citation] } = await res.json() as { natijalar: { havola: string }[] };
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(citation).toMatchObject({ iqtibos: 'Synthetic clause.', sha256: h.row.sha256, sahifa_bosma: null });
  expect(citation).not.toHaveProperty('r2_key');
  expect(h.get).toHaveBeenCalledWith(h.row.r2_key);
  expect(JSON.parse(String(h.rpc.mock.calls[1][1]?.body))).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 3 });
  expect((await h.call(citation.havola.split('?')[1])).status).toBe(200);
  expect(JSON.parse(String(h.rpc.mock.calls.at(-1)?.[1]?.body))).toMatchObject({ p_q: null, p_hujjat_id: h.row.hujjat_id, p_sha: h.row.sha256 });
});

it('rejects foreign tenant, unsigned access, and injected client URLs before storage access', async () => {
  const h = await setup();
  expect((await h.call('kompaniya_id=4&q=06-01-01')).status).toBe(403);
  expect((await h.call(undefined, false)).status).toBe(401);
  expect((await h.call('kompaniya_id=3&q=06-01-01&url=https://bad.invalid')).status).toBe(400);
  expect(h.get).not.toHaveBeenCalled();
  expect(h.rpc.mock.calls.every(([url]) => url.endsWith('/t2_men_v1'))).toBe(true);
});

it.each(['NOT_FOUND', 'EDITION_REQUIRED', 'REFERENCE_AMBIGUOUS'])('returns UNKNOWN on %s', async reason => {
  const h = await setup();
  h.db({ ok: true, natijalar: [], code: reason });
  expect(await (await h.call()).json()).toEqual({ ok: true, code: 'UNKNOWN', sabab: reason, natijalar: [] });
  expect(h.get).not.toHaveBeenCalled();
});

it.each(['missing', 'size', 'tamper', 'key'])('fails closed on %s source', async defect => {
  const h = await setup();
  if (defect === 'missing') h.get.mockImplementationOnce(async () => null as never);
  if (defect === 'size') h.row.bayt++;
  if (defect === 'tamper') h.bytes[0] ^= 1;
  if (defect === 'key') h.row.r2_key = 'other/private';
  expect(await (await h.call()).json()).toEqual({ ok: false, code: 'SOURCE_UNAVAILABLE' });
  if (defect === 'key') expect(h.get).not.toHaveBeenCalled();
});

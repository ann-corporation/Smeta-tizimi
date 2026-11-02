import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './obyekt-paket';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { requestPermission, SCOPED_APIS } from '../_shared/permission-policy';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); });

const PAKET = '{"format" : "t2-paket/1", "obyekt_id" : 4, "obyekt_nom" : "SINOV", "kompaniya_id" : 17, "q" : {"id":[1,2]}}';
const TOLIQ = ['company.read', 'smeta.read', 'f2.read', 'narx.read'];

type Opt = { kompaniya?: number; ruxsat?: string[] | null; status?: number; platforma?: string };
function soxtaFetch(o: Opt = {}) {
  const yol: string[] = [];
  otaKeshTozala(); vakolatKeshTozala(); // har stsenariy o'z vakolati bilan
  const ruxsat = o.ruxsat === undefined ? TOLIQ : o.ruxsat;
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const url = new URL(String(raw));
    yol.push(url.pathname + url.search);
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: o.platforma ?? 'none', foydalanuvchi: { holat: 'faol' },
      azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }],
      context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto', ...(ruxsat ? { permissions: ruxsat } : {}) }] });
    if (url.pathname === '/rest/v1/t2_obyekt') return Response.json([{ kompaniya_id: o.kompaniya ?? 17 }]);
    if (url.pathname === '/rest/v1/rpc/t2_obyekt_paket_v1') {
      if (o.status) return new Response('{"code":"42501","message":"actor bu kompaniyaning faol a\'zosi emas"}', { status: o.status });
      // Bir necha bo'lakli oqim: shlyuz uni parse qilmasdan uzatishi kerak.
      const enc = new TextEncoder();
      return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(PAKET.slice(0, 20))); c.enqueue(enc.encode(PAKET.slice(20))); c.close(); } }));
    }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  return yol;
}

async function sor(qs: string) {
  const cookie = 'sess=' + await imzola({ rol: 'pto' as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, env.SESSIYA_KALIT);
  return onRequestGet({ request: new Request('https://test/api/obyekt-paket?' + qs, { headers: { Cookie: cookie } }), env, data: {} } as never);
}
const paketSoraldi = (yol: string[]) => yol.some((y) => y.includes('/rpc/t2_obyekt_paket_v1'));

describe('obyekt-paket shlyuzi (PR1a)', () => {
  it('marshrut ro‘yxatda va middleware’da smeta.read', () => {
    expect(SCOPED_APIS.has('obyekt-paket')).toBe(true);
    expect(requestPermission('obyekt-paket', 'GET', {}, new URLSearchParams('obyekt_id=4'))).toBe('smeta.read');
  });

  it('paket: actor sessiyadan, tana o‘zgarmasdan oqim bilan, no-store, ETag yo‘q', async () => {
    const yol = soxtaFetch();
    const res = await sor('obyekt_id=4&p_actor_id=999');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('ETag')).toBeNull();
    expect(await res.text()).toBe(PAKET);
    const rpc = new URL('https://x' + yol.find((y) => y.startsWith('/rest/v1/rpc/t2_obyekt_paket_v1'))!);
    expect(rpc.searchParams.get('p_actor_id')).toBe('7');
    expect(rpc.searchParams.get('p_obyekt_id')).toBe('4');
  });

  it('If-None-Match e’tiborsiz — har doim to‘liq paket (304 yo‘q)', async () => {
    const yol = soxtaFetch();
    const cookie = 'sess=' + await imzola({ rol: 'pto' as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, env.SESSIYA_KALIT);
    const res = await onRequestGet({ request: new Request('https://test/api/obyekt-paket?obyekt_id=4', { headers: { Cookie: cookie, 'If-None-Match': '*' } }), env, data: {} } as never);
    expect(res.status).toBe(200);
    expect(paketSoraldi(yol)).toBe(true);
  });

  it('begona kompaniya, f2.read/narx.read yetishmasa, ruxsat xaritasi yo‘q (L2), noto‘g‘ri id — RPC ga yetmaydi', async () => {
    let yol = soxtaFetch({ kompaniya: 18 });
    expect((await sor('obyekt_id=4')).status).toBe(403);
    expect(paketSoraldi(yol)).toBe(false);
    yol = soxtaFetch({ ruxsat: ['company.read', 'smeta.read'] });
    expect((await sor('obyekt_id=4')).status).toBe(403);
    expect(paketSoraldi(yol)).toBe(false);
    yol = soxtaFetch({ ruxsat: null });
    const r = await sor('obyekt_id=4');
    expect(r.status).toBe(503);
    expect(((await r.json()) as { code: string }).code).toBe('AUTHORITY_SCHEMA_REQUIRED');
    expect(paketSoraldi(yol)).toBe(false);
    yol = soxtaFetch();
    expect((await sor('obyekt_id=-1')).status).toBe(400);
    expect((await sor('obyekt_id=abc')).status).toBe(400);
    expect(paketSoraldi(yol)).toBe(false);
  });

  it('platforma superadmini — ruxsat xaritasisiz ham o‘tadi (a’zolikni baza tekshiradi)', async () => {
    const yol = soxtaFetch({ ruxsat: null, platforma: 'superadmin' });
    expect((await sor('obyekt_id=4')).status).toBe(200);
    expect(paketSoraldi(yol)).toBe(true);
  });

  it('sessiyasiz — 401', async () => {
    soxtaFetch();
    const res = await onRequestGet({ request: new Request('https://test/api/obyekt-paket?obyekt_id=4'), env, data: {} } as never);
    expect(res.status).toBe(401);
  });

  it('yuqori oqim rad etsa — 403, tafsilot brauzerga chiqmaydi', async () => {
    soxtaFetch({ status: 403 });
    const res = await sor('obyekt_id=4');
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('42501');
  });
});

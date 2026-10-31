import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, etagMos, keshKaliti, revOqi } from './obyekt-paket';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { requestPermission, SCOPED_APIS } from '../_shared/permission-policy';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); });

const PAKET = '{"rev" : 7, "meta_rev" : 3, "toliq_rev" : 1, "format" : "t2-paket/1", "obyekt_id" : 4, "q" : {"id":[1,2]}}';
const PROBE = '{"rev" : 7, "meta_rev" : 3, "toliq_rev" : 1, "min_rev" : 1, "obyekt_id" : 4, "kompaniya_id" : 17}';

type Opt = { kompaniya?: number; ruxsat?: string[]; paket?: string; probe?: string; status?: number };
function soxtaFetch(o: Opt = {}) {
  const yol: string[] = [];
  otaKeshTozala(); vakolatKeshTozala(); // har stsenariy o'z vakolati bilan
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const url = new URL(String(raw));
    yol.push(url.pathname + url.search);
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' },
      azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }],
      context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto', ...(o.ruxsat ? { permissions: o.ruxsat } : {}) }] });
    if (url.pathname === '/rest/v1/t2_obyekt') return Response.json([{ kompaniya_id: o.kompaniya ?? 17 }]);
    if (url.pathname === '/rest/v1/rpc/t2_obyekt_rev_v1') return new Response(o.probe ?? PROBE, { status: o.status ?? 200 });
    if (url.pathname === '/rest/v1/rpc/t2_obyekt_paket_v1') {
      // Bir necha bo'lakli oqim: shlyuz uni parse qilmasdan uzatishi kerak.
      const matn = o.paket ?? PAKET; const enc = new TextEncoder();
      return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(matn.slice(0, 40))); c.enqueue(enc.encode(matn.slice(40))); c.close(); } }));
    }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  return yol;
}

async function sor(qs: string, o: { envQosh?: Record<string, unknown>; sarlavha?: Record<string, string>; kuting?: Promise<unknown>[] } = {}) {
  const cookie = 'sess=' + await imzola({ rol: 'pto' as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, env.SESSIYA_KALIT);
  const kut: Promise<unknown>[] = o.kuting ?? [];
  return onRequestGet({
    request: new Request('https://test/api/obyekt-paket?' + qs, { headers: { Cookie: cookie, ...(o.sarlavha ?? {}) } }),
    env: { ...env, ...(o.envQosh ?? {}) }, data: {}, waitUntil: (p: Promise<unknown>) => { kut.push(p); },
  } as never);
}

describe('obyekt-paket shlyuzi', () => {
  it('yordamchilar: rev o‘qish, ETag mosligi, R2 kaliti', () => {
    expect(revOqi(PAKET)).toEqual({ rev: 7, meta_rev: 3 });
    expect(revOqi('{"ok":false}')).toBeNull();
    expect(etagMos('W/"7.3"', '"7.3"')).toBe(true);
    expect(etagMos('"6.3", "7.3"', '"7.3"')).toBe(true);
    expect(etagMos('"7.2"', '"7.3"')).toBe(false);
    expect(keshKaliti(17, 4, 7, 3)).toBe('paket/17/4/7.3.json.gz');
  });

  it('marshrut ro‘yxatda va smeta.read talab qiladi (middleware)', () => {
    expect(SCOPED_APIS.has('obyekt-paket')).toBe(true);
    expect(requestPermission('obyekt-paket', 'GET', {}, new URLSearchParams('obyekt_id=4'))).toBe('smeta.read');
  });

  it('paket: actor sessiyadan, tana o‘zgarmasdan oqim bilan, ETag paketdan; R2 yo‘q — keshsiz', async () => {
    const yol = soxtaFetch();
    const res = await sor('obyekt_id=4&p_actor_id=999');
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"7.3"');
    expect(res.headers.get('X-Paket-Kesh')).toBe('miss');
    expect(await res.text()).toBe(PAKET);
    const rpc = yol.find((y) => y.startsWith('/rest/v1/rpc/t2_obyekt_paket_v1'))!;
    expect(new URL('https://x' + rpc).searchParams.get('p_actor_id')).toBe('7');
    expect(new URL('https://x' + rpc).searchParams.get('p_obyekt_id')).toBe('4');
  });

  it('probe (rev_faqat=1) — paket so‘ralmaydi', async () => {
    const yol = soxtaFetch();
    const res = await sor('obyekt_id=4&rev_faqat=1');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(PROBE);
    expect(yol.some((y) => y.includes('t2_obyekt_paket_v1'))).toBe(false);
  });

  it('If-None-Match mos — 304, bazaga paket so‘rovi ketmaydi', async () => {
    const yol = soxtaFetch();
    const res = await sor('obyekt_id=4', { sarlavha: { 'If-None-Match': '"7.3"' } });
    expect(res.status).toBe(304);
    expect(yol.some((y) => y.includes('t2_obyekt_paket_v1'))).toBe(false);
  });

  it('R2 hit — bazaga paket so‘rovi ketmaydi; miss — mos rev bo‘lsa keshga yoziladi', async () => {
    const saqlangan = new Map<string, ArrayBuffer>();
    const r2 = {
      get: vi.fn(async (k: string) => saqlangan.has(k) ? { body: new Response(saqlangan.get(k)).body } : null),
      put: vi.fn(async (k: string, v: ArrayBuffer) => { saqlangan.set(k, v); }),
    };
    const yol = soxtaFetch();
    const kut: Promise<unknown>[] = [];
    const miss = await sor('obyekt_id=4', { envQosh: { R2_KESH: r2 }, kuting: kut });
    expect(await miss.text()).toBe(PAKET);
    await Promise.all(kut);
    if (typeof CompressionStream === 'function') {
      expect(r2.put).toHaveBeenCalledWith('paket/17/4/7.3.json.gz', expect.anything(), expect.anything());
      const yol2 = soxtaFetch();
      const hit = await sor('obyekt_id=4', { envQosh: { R2_KESH: r2 } });
      expect(hit.headers.get('X-Paket-Kesh')).toBe('r2');
      expect(hit.headers.get('Content-Encoding')).toBe('gzip');
      expect(yol2.some((y) => y.includes('t2_obyekt_paket_v1'))).toBe(false);
    }
    expect(yol.filter((y) => y.includes('t2_obyekt_paket_v1'))).toHaveLength(1);
  });

  it('probe va paket orasida yozuv — ETag paketning o‘z revi, keshga yozilmaydi', async () => {
    const r2 = { get: vi.fn(async () => null), put: vi.fn(async () => undefined) };
    soxtaFetch({ paket: PAKET.replace('"rev" : 7', '"rev" : 8') });
    const kut: Promise<unknown>[] = [];
    const res = await sor('obyekt_id=4', { envQosh: { R2_KESH: r2 }, kuting: kut });
    expect(res.headers.get('ETag')).toBe('"8.3"');
    await res.text(); await Promise.all(kut);
    expect(r2.put).not.toHaveBeenCalled();
  });

  it('begona kompaniya obyekti, ruxsat yetmasa, noto‘g‘ri id — RPC ga yetmaydi; delta — 501', async () => {
    let yol = soxtaFetch({ kompaniya: 18 });
    expect((await sor('obyekt_id=4')).status).toBe(403);
    expect(yol.some((y) => y.includes('/rpc/t2_obyekt'))).toBe(false);
    yol = soxtaFetch({ ruxsat: ['company.read', 'smeta.read'] });
    expect((await sor('obyekt_id=4')).status).toBe(403);
    expect(yol.some((y) => y.includes('/rpc/t2_obyekt'))).toBe(false);
    yol = soxtaFetch();
    expect((await sor('obyekt_id=-1')).status).toBe(400);
    expect((await sor('obyekt_id=4&dan_rev=3')).status).toBe(501);
    expect(yol.some((y) => y.includes('/rpc/t2_obyekt'))).toBe(false);
  });

  it('sessiyasiz — 401', async () => {
    soxtaFetch();
    const res = await onRequestGet({ request: new Request('https://test/api/obyekt-paket?obyekt_id=4'), env, data: {} } as never);
    expect(res.status).toBe(401);
  });

  it('yuqori oqim rad etsa (a’zo emas) — 403, tafsilot brauzerga chiqmaydi', async () => {
    soxtaFetch({ status: 403, probe: '{"code":"42501","message":"actor bu kompaniyaning faol a\'zosi emas"}' });
    const res = await sor('obyekt_id=4');
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('42501');
  });
});

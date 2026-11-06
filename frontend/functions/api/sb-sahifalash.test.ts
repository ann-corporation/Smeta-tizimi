import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './sb';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';

const KEY = 'k'.repeat(32);
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); });

type Sorov = { offset: number; count: string | null; url: string; params: URLSearchParams; /** shu so'rov kelganda javob kutayotgan boshqa so'rovlar */ parallel: number };
let obyektSorovlari = 0;
let faol = 0;

/** PostgREST imitatsiyasi: max-rows 1000, `kalit=gt./lte.` filtrlari, `order=kalit.asc|desc`, count=exact. */
async function read(opts: { ids: number[]; failWhen?: (s: Sorov) => boolean; objectCompany?: number; table?: string; tartib?: string }) {
  const { ids, failWhen, objectCompany = 17, table = 't2_daraxt', tartib = 'id.asc' } = opts;
  const pages: Sorov[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const url = new URL(String(u));
    if (url.pathname === '/rest/v1/rpc/t2_men_v1') return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'pto', faol: true }] });
    if (url.pathname === '/rest/v1/t2_obyekt') { obyektSorovlari++; return Response.json([{ kompaniya_id: objectCompany }]); }
    const p = url.searchParams;
    const s: Sorov = { offset: Number(p.get('offset')), count: new Headers(init?.headers).get('Prefer'), url: url.toString(), params: p, parallel: faol };
    pages.push(s);
    faol++;
    await new Promise((r) => setTimeout(r, 2));
    faol--;
    if (failWhen?.(s)) return new Response('unavailable', { status: 503 });
    const [kalit, yon] = String(p.get('order')).split('.');
    const k = kalit === 'tartib' ? 'id' : kalit;
    let rows = [...ids];
    for (const f of p.getAll(k)) {
      const [op, v] = f.split('.'); const n = Number(v);
      rows = rows.filter((x) => (op === 'gt' ? x > n : op === 'lte' ? x <= n : true));
    }
    const jami = rows.length;
    if (yon === 'desc') rows.reverse();
    const page = rows.slice(s.offset, s.offset + Math.min(1000, Number(p.get('limit'))));
    return new Response(JSON.stringify(page.map((x) => ({ [k]: x }))), {
      headers: { 'content-range': `${s.offset}-${s.offset + page.length - 1}/${s.count ? jami : '*'}` },
    });
  }));
  const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
  const request = new Request('https://x/api/sb', { method: 'POST', headers: { Cookie: 'sess=' + sess },
    body: JSON.stringify({ jadval: table, filtr: 'obyekt_id=eq.127', tartib, limit: 200000 }) });
  const response = await onRequestPost({ request, env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY } } as never);
  return { response, json: await response.json() as { ok: boolean; toliq: boolean; jamiServerda: number; soni: number; qatorlar?: Array<Record<string, number>> }, pages };
}
const oraliq = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const kalitlar = (q: Array<Record<string, number>> | undefined, k = 'id') => (q ?? []).map((r) => r[k]);

describe('large financial reads count once', () => {
  it.each(['t2_daraxt', 't2_qator_holat'])('retains exact completeness and object filter on all %s requests', async (table) => {
    const { json, pages } = await read({ ids: oraliq(1, 2503), table });
    expect(json).toMatchObject({ ok: true, toliq: true, jamiServerda: 2503, soni: 2503 });
    expect(pages.filter((p) => p.count)).toHaveLength(1);
    expect(pages.every((p) => p.url.includes('obyekt_id=eq.127'))).toBe(true);
    if (table === 't2_daraxt') expect(pages.every((p) => p.params.get('kompaniya_id') === 'in.(17)')).toBe(true);
    expect(kalitlar(json.qatorlar)).toEqual(oraliq(1, 2503));
  });
  it('reads the rest by key ranges, never by OFFSET (OFFSET recomputes skipped financial rows)', async () => {
    const { json, pages } = await read({ ids: oraliq(1, 2503) });
    expect(pages.every((p) => p.offset === 0)).toBe(true);
    expect(pages.some((p) => p.params.get('order') === 'id.desc')).toBe(true);
    expect(pages.filter((p) => p.params.getAll('id').some((f) => f.startsWith('lte.'))).length).toBeGreaterThan(0);
    expect(json.toliq).toBe(true);
  });
  it('sparse keys: ranges that overflow continue from their cursor; the result is complete and ordered', async () => {
    const ids = [...oraliq(1, 1000), ...oraliq(5000, 7999), ...oraliq(90000, 90010)];
    const { json } = await read({ ids, table: 't2_qator_holat', tartib: 'qator_id.asc' });
    expect(json).toMatchObject({ ok: true, toliq: true, soni: ids.length });
    expect(kalitlar(json.qatorlar, 'qator_id')).toEqual(ids);
  });
  it('never requests financial pages from an object in another company', async () => {
    const { response, json, pages } = await read({ ids: oraliq(1, 2503), objectCompany: 18, table: 't2_qator_holat' });
    expect(response.status).toBe(403); expect(json.ok).toBe(false); expect(pages).toEqual([]);
  });
  it('still exposes incompleteness beyond worker budget: an ordered prefix, never a smaller financial total', async () => {
    const { json, pages } = await read({ ids: oraliq(1, 60000) });
    expect(json).toMatchObject({ ok: true, toliq: false, jamiServerda: 60000 });
    expect(json.soni).toBeGreaterThan(25000);
    expect(json.soni).toBeLessThan(60000);
    expect(kalitlar(json.qatorlar)).toEqual(oraliq(1, json.soni));
    expect(pages.filter((p) => p.count)).toHaveLength(1);
    expect(pages.length).toBeLessThanOrEqual(40);
  });
  it('does not turn a failed continuation into financial success', async () => {
    const { json } = await read({ ids: oraliq(1, 2503), failWhen: (s) => s.params.getAll('id').length > 0 });
    expect(json.ok).toBe(false); expect(json.qatorlar).toBeUndefined();
  });
  it('without a unique ascending key it keeps the old OFFSET pages', async () => {
    const { json, pages } = await read({ ids: oraliq(1, 2503), tartib: 'tartib.asc' });
    expect(json).toMatchObject({ ok: true, toliq: true, soni: 2503 });
    expect(pages.map((p) => p.offset)).toEqual([0, 1000, 2000]);
  });
});

/* Sun'iy ko'l (obyekt 153) id taqsimotining sintetik nusxasi: ~25 000 lik zich blok, 38 120 va 19 094 lik bo'shliqlar,
   kichik dum bloklari — jami 26 475 qator (prod 2026-11-06). Eski bir tekis reja bunda ~5000 qatorlik prefiks berardi. */
const sunIyKol = () => [...oraliq(887725, 912754), ...oraliq(950874, 951262), ...oraliq(970356, 971103), ...oraliq(974445, 974752)];

describe('one /api/sb call returns a whole ~26k-row object', () => {
  it.each([
    ['Sun\'iy ko\'l taqsimoti (zich blok + katta bo\'shliqlar)', sunIyKol()],
    ['26 475 zich ketma-ket id', oraliq(1, 26475)],
    ['siyrak boshlanish, zich dum', [...oraliq(1, 2000).map((x) => x * 40), ...oraliq(200000, 223999)]],
  ])('%s: toliq, tartibli, takrorsiz, byudjet ichida', async (_nom, ids) => {
    const { json, pages } = await read({ ids, table: 't2_qator_holat', tartib: 'qator_id.asc' });
    expect(json).toMatchObject({ ok: true, toliq: true, jamiServerda: ids.length, soni: ids.length });
    const k = kalitlar(json.qatorlar, 'qator_id');
    expect(new Set(k).size).toBe(ids.length);
    expect(k).toEqual(ids);
    expect(pages.length).toBeLessThanOrEqual(40);
    expect(pages.filter((p) => p.count)).toHaveLength(1);
    expect(pages.every((p) => p.params.get('obyekt_id') === 'eq.127')).toBe(true);
  });
  it('tenant filter (kompaniya_id) is forced on every key-range subrequest', async () => {
    const { json, pages } = await read({ ids: sunIyKol() });
    expect(json).toMatchObject({ ok: true, toliq: true, soni: 26475 });
    expect(pages.length).toBeGreaterThan(26);
    expect(pages.every((p) => p.params.get('kompaniya_id') === 'in.(17)' && p.params.get('obyekt_id') === 'eq.127')).toBe(true);
  });
  it('toliq is false only when truly partial: a failed range in the middle fails the whole read', async () => {
    let bir = true;
    const { json } = await read({ ids: sunIyKol(), failWhen: (s) => {
      if (bir && s.params.getAll('id').some((f) => f === 'gt.900000' || /^gt\.90\d{4}$/.test(f))) { bir = false; return true; }
      return false;
    } });
    expect(json.ok).toBe(false); expect(json.qatorlar).toBeUndefined();
  });
});

describe('fewer sequential round trips to the remote database', () => {
  it('asks for the max key in parallel with the first page, not after it', async () => {
    const { json, pages } = await read({ ids: oraliq(1, 2503) });
    expect(json.toliq).toBe(true);
    const maks = pages.find((p) => p.params.get('order') === 'id.desc');
    const birinchi = pages.find((p) => p.count);
    expect(Math.max(maks?.parallel ?? 0, birinchi?.parallel ?? 0)).toBeGreaterThanOrEqual(1);
  });
  it('caches the object company for repeated reads (one lookup for two reads)', async () => {
    obyektSorovlari = 0;
    expect((await read({ ids: oraliq(1, 10), table: 't2_qator_holat' })).json.ok).toBe(true);
    expect((await read({ ids: oraliq(1, 10), table: 't2_qator_holat' })).json.ok).toBe(true);
    expect(obyektSorovlari).toBe(1);
  });
  it('a cached company never grants access to a non-member company', async () => {
    expect((await read({ ids: oraliq(1, 10), objectCompany: 18, table: 't2_qator_holat' })).response.status).toBe(403);
    expect((await read({ ids: oraliq(1, 10), objectCompany: 18, table: 't2_qator_holat' })).response.status).toBe(403);
  });
});

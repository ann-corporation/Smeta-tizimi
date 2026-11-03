import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './sb';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';

const KEY = 'k'.repeat(32);
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); });

type Row = { id: number; obyekt_id: number; kompaniya_id: number; versiya_holat: 'faol' | 'almashtirilgan'; nom: string };
const EGIZAK_USTUNLAR = 'id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,qoshimcha,replaces_line_id,operation_id';

/** Prod ko'rinishi (2026-11-03, obyekt 167/168): 3584 almashtirilgan + 1796 faol; faol qatorlar siyrak:
 *  1000 zich, 786 keyingi 1000 oraliqda, 10 ta ~15 000 narida; egizak (168) qatorlari bilan aralash. */
function jadvalQur(): Row[] {
  const rows: Row[] = [];
  const qosh = (oid: number, id: number, h: Row['versiya_holat']) => rows.push({ id, obyekt_id: oid, kompaniya_id: 123, versiya_holat: h, nom: 'q' + id });
  for (const [oid, shift] of [[167, 0], [168, 1786]] as const) {
    for (let i = 0; i < 3584; i++) qosh(oid, 944387 + shift + i * 20, 'almashtirilgan');
    for (let i = 0; i < 1000; i++) qosh(oid, 1082234 + shift + i, 'faol');
    for (let i = 0; i < 786; i++) qosh(oid, 1083300 + shift + i, 'faol');
    for (let i = 0; i < 10; i++) qosh(oid, 1097800 + shift + i, 'faol');
  }
  // boshqa obyekt (katta) — ayni oraliqlarda
  for (let i = 0; i < 3000; i++) qosh(153, 1082500 + i * 3, 'faol');
  return rows.sort((a, b) => a.id - b.id);
}

async function oqi(opts: { rows: Row[]; so?: Record<string, unknown>; failWhen?: (p: URLSearchParams) => boolean }) {
  const { rows, failWhen } = opts;
  const sorovlar: URLSearchParams[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const url = new URL(String(u));
    if (url.pathname === '/rest/v1/rpc/t2_men_v1') return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 123, rol: 'pto', faol: true }] });
    if (url.pathname === '/rest/v1/t2_obyekt') return Response.json([{ kompaniya_id: 123 }]);
    const p = url.searchParams;
    sorovlar.push(p);
    if (failWhen?.(p)) return new Response('boom', { status: 503 });
    let r = rows;
    for (const f of p.getAll('obyekt_id')) r = r.filter((x) => x.obyekt_id === Number(f.split('.')[1]));
    for (const f of p.getAll('versiya_holat')) r = r.filter((x) => x.versiya_holat === f.split('.')[1]);
    for (const f of p.getAll('kompaniya_id')) { const ok = f.replace('in.(', '').replace(')', '').split(',').map(Number); r = r.filter((x) => ok.includes(x.kompaniya_id)); }
    for (const f of p.getAll('id')) { const [op, v] = f.split('.'); const n = Number(v); r = r.filter((x) => (op === 'gt' ? x.id > n : op === 'lte' ? x.id <= n : true)); }
    const jami = r.length;
    const [, yon] = String(p.get('order')).split('.');
    r = [...r]; if (yon === 'desc') r.reverse();
    const off = Number(p.get('offset')); // PostgREST max-rows = 1000
    const page = r.slice(off, off + Math.min(1000, Number(p.get('limit'))));
    const sana = new Headers(init?.headers).get('Prefer') === 'count=exact';
    return new Response(JSON.stringify(page.map((x) => Object.fromEntries(String(p.get('select')).split(',').map((k) => [k, (x as never)[k] ?? null])))), {
      status: page.length < jami ? 206 : 200,
      headers: { 'content-range': `${off}-${off + page.length - 1}/${sana ? jami : '*'}` },
    });
  }));
  const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 123, rol: 'pto' }] }, KEY);
  const request = new Request('https://x/api/sb', { method: 'POST', headers: { Cookie: 'sess=' + sess },
    body: JSON.stringify({ jadval: 't2_qator', filtr: 'obyekt_id=eq.167', ustunlar: EGIZAK_USTUNLAR, tartib: 'id.asc', limit: 50000, ...opts.so }) });
  const response = await onRequestPost({ request, env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY } } as never);
  return { response, json: await response.json() as { ok: boolean; toliq: boolean; soni: number; jamiServerda: number; soro: number; qatorlar?: Array<{ id: number }> }, sorovlar };
}

describe('sb.ts: katta obyekt (5380 qator) t2_qator o‘qishi — egizak yuklagichi', () => {
  const rows = jadvalQur();

  it('faol versiya: 1796 qator to‘liq, id tartibida, tenant va versiya filtri har so‘rovda', async () => {
    const { json, sorovlar } = await oqi({ rows });
    expect(json).toMatchObject({ ok: true, toliq: true, jamiServerda: 1796, soni: 1796 });
    const kutilgan = rows.filter((r) => r.obyekt_id === 167 && r.versiya_holat === 'faol').map((r) => r.id);
    expect(json.qatorlar!.map((r) => r.id)).toEqual(kutilgan);
    expect(sorovlar.every((p) => p.get('obyekt_id') === 'eq.167' && p.get('kompaniya_id') === 'in.(123)' && p.get('versiya_holat') === 'eq.faol')).toBe(true);
    expect(sorovlar.every((p) => p.get('offset') === '0' || p.get('order') === 'id.asc')).toBe(true);
  });

  it('versiya:tarix — 5380 qatorning hammasi (almashtirilgan + faol), takrorsiz', async () => {
    const { json, sorovlar } = await oqi({ rows, so: { versiya: 'tarix' } });
    expect(json).toMatchObject({ ok: true, toliq: true, jamiServerda: 5380, soni: 5380 });
    const ids = json.qatorlar!.map((r) => r.id);
    expect(new Set(ids).size).toBe(5380);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(sorovlar.some((p) => p.get('versiya_holat'))).toBe(false);
    expect(json.soro).toBeLessThanOrEqual(20);
  });

  it('toliq:false bo‘lsa — kalit=gt.<oxirgi> bilan davom etish mumkin va birlashganda 5380 ga teng', async () => {
    // Worker byudjeti yetmaydigan holat: juda ko‘p qator, ketma-ket davom.
    const katta: Row[] = [];
    for (let i = 0; i < 25030; i++) katta.push({ id: 1 + i, obyekt_id: 167, kompaniya_id: 123, versiya_holat: 'faol', nom: '' });
    const a = await oqi({ rows: katta });
    expect(a.json).toMatchObject({ ok: true, toliq: false });
    const oxirgi = a.json.qatorlar![a.json.qatorlar!.length - 1].id;
    const b = await oqi({ rows: katta, so: { filtr: `obyekt_id=eq.167&id=gt.${oxirgi}` } });
    expect(b.json.ok).toBe(true);
    expect(a.json.soni + b.json.soni).toBeGreaterThanOrEqual(25030);
    expect([...a.json.qatorlar!, ...b.json.qatorlar!].map((r) => r.id).slice(0, 25030)).toEqual(katta.map((r) => r.id));
  });

  it('upstream xato jim yarim natijaga aylanmaydi (ok:false)', async () => {
    const { json } = await oqi({ rows, failWhen: (p) => p.getAll('id').length > 0 });
    expect(json.ok).toBe(false);
    expect(json.qatorlar).toBeUndefined();
  });
});

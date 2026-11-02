import { afterEach, describe, expect, it, vi } from 'vitest';
import { sbOqi, sbT2QatorHolatOl, type SbSoro } from './supabase';
import { t2ToliqOqi } from './t2-toliq-oqish';

/** /api/sb simulyatori `t2_qator_holat` uchun: qator_id filtri (gte/lte/gt), tartib, bir chaqiruvda ≤ chegara qator. */
function fetchSim(rows: Array<Record<string, unknown> & { qator_id: number }>, chegara: number) {
  const chaqiruvlar: SbSoro[] = [];
  const f = vi.fn(async (_url: string, init: RequestInit) => {
    const s = JSON.parse(String(init.body)) as SbSoro;
    chaqiruvlar.push(s);
    let r = rows;
    for (const m of (s.filtr ?? '').matchAll(/qator_id=(gte|lte|gt)\.(\d+)/g)) {
      const v = Number(m[2]);
      r = r.filter((x) => (m[1] === 'gte' ? x.qator_id >= v : m[1] === 'lte' ? x.qator_id <= v : x.qator_id > v));
    }
    if (s.tartib === 'qator_id.desc') r = [...r].reverse();
    const bolak = r.slice(0, Math.min(s.limit ?? 200000, chegara));
    const qatorlar = s.ustunlar === 'qator_id' ? bolak.map((x) => ({ qator_id: x.qator_id })) : bolak;
    return new Response(JSON.stringify({ ok: true, toliq: bolak.length >= r.length, jamiServerda: r.length, qatorlar }));
  });
  return { f, chaqiruvlar };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('sbT2QatorHolatOl — katta obyekt holati parallel o‘qiladi', () => {
  // Notekis qator_id lar (boshqa obyektlar aralash); NULL qiymatlar NULL bo'lib qoladi.
  const rows = [...Array.from({ length: 18000 }, (_, i) => ({ qator_id: 500000 + i, fakt_hajm: i % 3 ? 1 : 0, qoldiq_summa: i % 5 ? i : null })),
    ...Array.from({ length: 7100 }, (_, i) => ({ qator_id: 640000 + i * 3, fakt_hajm: 0, qoldiq_summa: null }))];

  it('natija ketma-ket o‘qish bilan AYNAN bir xil (tartib, soni, NULL lar)', async () => {
    const seqSim = fetchSim(rows, 5000);
    vi.stubGlobal('fetch', seqSim.f);
    const seq = await t2ToliqOqi(sbOqi, { jadval: 't2_qator_holat', filtr: 'obyekt_id=eq.7', limit: 200000 }, 'qator_id');
    vi.unstubAllGlobals();

    const parSim = fetchSim(rows, 5000);
    vi.stubGlobal('fetch', parSim.f);
    const par = await sbT2QatorHolatOl(7);
    expect(par.ok).toBe(true);
    expect(par.toliq).toBe(true);
    expect(par.qatorlar).toEqual(seq.qatorlar);
    expect(par.qatorlar).toHaveLength(rows.length);
    // Oynalarga bo'lingan (qator_id gte/lte), obyekt filtri har so'rovda saqlangan.
    expect(parSim.chaqiruvlar.some((s) => /qator_id=gte\.\d+&qator_id=lte\.\d+/.test(s.filtr ?? ''))).toBe(true);
    expect(parSim.chaqiruvlar.every((s) => (s.filtr ?? '').startsWith('obyekt_id=eq.7'))).toBe(true);
  });

  it('kichik obyekt — oddiy ketma-ket yo‘l, natija to‘liq', async () => {
    const kichik = rows.slice(0, 1200);
    vi.stubGlobal('fetch', fetchSim(kichik, 5000).f);
    const r = await sbT2QatorHolatOl(7, 'qator_id,fakt_hajm,qoldiq_summa');
    expect(r).toMatchObject({ ok: true, toliq: true });
    expect(r.qatorlar).toEqual(kichik);
  });
});

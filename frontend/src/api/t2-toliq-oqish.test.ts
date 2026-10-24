import { describe, expect, it, vi } from 'vitest';
import type { SbSoro } from './supabase';
import { t2ToliqOqi, t2ToliqOqiParallel } from './t2-toliq-oqish';

/** /api/sb simulyatori: filtr (obyekt_id, id=gte/lte/gt) va tartib; bir chaqiruvda ko'pi bilan `chegara` qator (toliq:false). */
function serverSim(rows: Array<{ id: number }>, chegara: number, buz?: (s: SbSoro) => boolean) {
  return vi.fn(async (s: SbSoro) => {
    if (buz?.(s)) return { ok: false, error: 'upstream' };
    let r = rows;
    for (const m of (s.filtr ?? '').matchAll(/id=(gte|lte|gt)\.(\d+)/g)) {
      const v = Number(m[2]);
      r = r.filter((x) => (m[1] === 'gte' ? x.id >= v : m[1] === 'lte' ? x.id <= v : x.id > v));
    }
    if (s.tartib === 'id.desc') r = [...r].reverse();
    const lim = Math.min(s.limit ?? 200000, chegara);
    const bolak = r.slice(0, lim);
    return { ok: true, toliq: bolak.length >= r.length, jamiServerda: r.length, qatorlar: s.ustunlar === 'id' ? bolak.map((x) => ({ id: x.id })) : bolak };
  });
}

describe('t2ToliqOqiParallel — kalit oynalari bilan parallel o‘qish', () => {
  // Notekis id lar: zich blok + siyrak dum (boshqa obyektlar id lari aralash).
  const rows = [...Array.from({ length: 20000 }, (_, i) => ({ id: 887000 + i, nom: `a${i}` })),
    ...Array.from({ length: 5201 }, (_, i) => ({ id: 910000 + i * 7, nom: `b${i}` }))];

  it('natija ketma-ket o‘qish bilan AYNAN bir xil, chaqiruvlar parallel oynalarda', async () => {
    const seq = await t2ToliqOqi(serverSim(rows, 5000), { jadval: 't2_daraxt', filtr: 'obyekt_id=eq.153', limit: 200000 }, 'id');
    const sim = serverSim(rows, 5000);
    const par = await t2ToliqOqiParallel(sim, { jadval: 't2_daraxt', filtr: 'obyekt_id=eq.153', limit: 200000 }, 'id');
    expect(par.ok).toBe(true);
    expect(par.qatorlar).toEqual(seq.qatorlar);
    expect(par).toMatchObject({ toliq: true, soni: 25201, jamiServerda: 25201 });
    expect(sim.mock.calls.every((c) => (c[0].filtr as string).startsWith('obyekt_id=eq.153'))).toBe(true);
  });

  it('biror oyna xato bersa — ketma-ket o‘qishga qaytadi (natija to‘liq)', async () => {
    let bir = true;
    const sim = serverSim(rows, 5000, (s) => { if (bir && /gte\.\d+&id=lte/.test(s.filtr ?? '') && /gte\.89/.test(s.filtr ?? '')) { bir = false; return true; } return false; });
    const par = await t2ToliqOqiParallel(sim, { jadval: 't2_daraxt', filtr: 'obyekt_id=eq.153', limit: 200000 }, 'id');
    expect(par.ok).toBe(true);
    expect(par.qatorlar).toEqual(rows);
  });

  it('kichik jadval — oddiy ketma-ket yo‘l', async () => {
    const kichik = rows.slice(0, 3000);
    const sim = serverSim(kichik, 5000);
    const par = await t2ToliqOqiParallel(sim, { jadval: 't2_daraxt', filtr: 'obyekt_id=eq.1' }, 'id');
    expect(par.qatorlar).toEqual(kichik);
  });
});

describe('full financial reads beyond gateway subrequest budget', () => {
  it('joins 20000 + 5030 with tenant/object filter retained and unique stable cursor', async () => {
    const all = Array.from({ length: 25030 }, (_, i) => ({ id: 740000 + i, summa: i === 0 ? null : i === 1 ? 0 : 1 }));
    const read = vi.fn().mockResolvedValueOnce({ ok: true, toliq: false, jamiServerda: 25030, qatorlar: all.slice(0, 20000) })
      .mockResolvedValueOnce({ ok: true, toliq: true, jamiServerda: 5030, qatorlar: all.slice(20000) });
    const r = await t2ToliqOqi(read, { jadval: 't2_daraxt', filtr: 'obyekt_id=eq.129', limit: 200000 }, 'id');
    expect(r).toMatchObject({ ok: true, toliq: true, soni: 25030, jamiServerda: 25030 });
    expect(r.qatorlar).toEqual(all);
    expect(read.mock.calls[1][0]).toMatchObject({ filtr: 'obyekt_id=eq.129&id=gt.759999', tartib: 'id.asc' });
  });
  it('uses qator_id when thin state projections omit id', async () => {
    const read = vi.fn().mockResolvedValueOnce({ ok: true, toliq: false, jamiServerda: 2, qatorlar: [{ qator_id: 9 }] })
      .mockResolvedValueOnce({ ok: true, toliq: true, jamiServerda: 1, qatorlar: [{ qator_id: 12 }] });
    expect(await t2ToliqOqi(read, { jadval: 't2_qator_holat', filtr: 'obyekt_id=eq.129' }, 'qator_id')).toMatchObject({ ok: true, soni: 2 });
    expect(read.mock.calls[1][0].filtr).toBe('obyekt_id=eq.129&qator_id=gt.9');
  });
  it.each([
    { ok: false, error: 'upstream' },
    { ok: true, toliq: false, qatorlar: [] },
    { ok: true, toliq: true, qatorlar: [{ id: 1 }] },
    { ok: true, toliq: true, qatorlar: [] },
  ])('never exposes partial financial rows when remainder fails/stalls/changes', async (next) => {
    const read = vi.fn().mockResolvedValueOnce({ ok: true, toliq: false, jamiServerda: 2, qatorlar: [{ id: 1 }] })
      .mockResolvedValueOnce(next);
    expect(await t2ToliqOqi(read, { jadval: 't2_daraxt', filtr: 'obyekt_id=eq.129' }, 'id')).toMatchObject({ ok: false, toliq: false, qatorlar: [] });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { t2ToliqOqi } from './t2-toliq-oqish';

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

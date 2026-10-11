import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { F2Akt, F2Tugun } from './smeta-anatomiya/f2';
import { f2IshchiOl, f2IshchiSaqla, f2MinusTaklif, f2QoralamaBogTekshir, f2ServerOl, f2ServerSaqla, type F2IshchiQoralama } from './f2-ishchi-qoralama';
import { f2Indeks, yozishManbasi, type IshJoyi } from './f2-moslash-v3/ishJoyi';
import { exactWrite } from './f2-exact-write';

const node = (uid: string, hajm: number, yol = ['Fundament']): F2Tugun => ({ uid, tur: 'mat', nom: 'БЕТОН B20', kod: 'x', birlik: 'м3', hajm,
  narx: 100, summa: hajm * 100, yol, bolalar: [], barg: true, manzil: { fayl: 'f', varaq: 'A', qator: 1 } });
const akt = (nodes: F2Tugun[]) => ({ daraxt: nodes } as F2Akt);
const ij = (pairs: Array<[string, number]>): IshJoyi => ({ bog: new Map(pairs.map(([u, id]) => [u, { qatorId: id, holat: 'qolda', usul: 'qolda' }])), otkaz: new Set() });
const api = vi.hoisted(() => ({ create: vi.fn(), advance: vi.fn(), save: vi.fn(), job: vi.fn(), rows: vi.fn() }));
vi.mock('../api/supabase', () => ({ sbT2F2ImportJobYarat: api.create, sbT2F2ImportJobIlgarilash: api.advance,
  sbT2F2ImportDraftSaqla: api.save, sbT2F2ImportJobHolat: api.job, sbT2F2ImportDraftRoyxat: api.rows }));
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.create.mockResolvedValue({ ok: true, job_id: 11 });
  api.advance.mockImplementation(async ({ expectedVersiya }: { expectedVersiya: number }) => ({ ok: true, versiya: expectedVersiya + 1 }));
  api.save.mockImplementation(async ({ qatorlar }: { qatorlar: unknown[] }) => ({ ok: true, saqlandi: qatorlar.length }));
});
afterEach(() => vi.unstubAllGlobals());

describe('F2 corrective rows and working draft safety', () => {
  it('suggests an unresolved minus only, requires confirmation and preserves signed source totals', () => {
    const a = akt([node('minus', -10), node('plus', 12)]);
    const result = f2MinusTaklif(a, ij([['plus', 7]]));
    expect(result.soni).toBe(1);
    expect(result.ij.bog.get('minus')).toMatchObject({ qatorId: 7, holat: 'taklif' });
    expect(yozishManbasi(f2Indeks(a.daraxt), result.ij).toxtatish[0]).toContain('hal qilinmagan');
    const confirmed = ij([['minus', 7], ['plus', 7]]);
    const source = yozishManbasi(f2Indeks(a.daraxt), confirmed);
    expect(source.toxtatish).toEqual([]);
    expect(exactWrite(source.nodes, source.mapping)[0]).toMatchObject({ certifiedQuantity: 2, certifiedAmount: 200 });
    expect(a.daraxt[0].hajm).toBe(-10);
  });

  it('does not guess across sections, units, grades or ambiguous confirmed targets', () => {
    const a = akt([node('m', -10), node('a', 12), node('b', 8)]);
    expect(f2MinusTaklif(a, ij([['a', 7], ['b', 8]])).soni).toBe(0);
    for (const changed of [{ yol: ['Sahna'] }, { birlik: 'т' }, { nom: 'БЕТОН B25' }]) {
      const b = akt([node('m', -10), { ...node('a', 12), ...changed }]);
      expect(f2MinusTaklif(b, ij([['a', 7]])).soni).toBe(0);
    }
  });

  it('preserves manual decisions and exclusions, removes only deleted canonical IDs', () => {
    const before = ij([['a', 7], ['b', 8]]); (before.otkaz as Set<string>).add('c');
    const after = f2QoralamaBogTekshir(before, new Set([7]));
    expect([...after.bog.keys()]).toEqual(['a']); expect(after.otkaz.has('c')).toBe(true);
    expect(before.bog.size).toBe(2);
  });

  it('reports save success only after IndexedDB transaction commit; abort is an error', async () => {
    const tx = { objectStore: () => ({ put: vi.fn() }), oncomplete: null as (() => void) | null,
      onabort: null as (() => void) | null, onerror: null as (() => void) | null, error: new Error('quota') };
    const db = { transaction: () => tx, close: vi.fn() };
    vi.stubGlobal('indexedDB', { open: () => { const r = { result: db, onsuccess: null as (() => void) | null }; queueMicrotask(() => r.onsuccess?.()); return r; } });
    const draft = { version: 1, companyId: 5, objectId: 3 } as F2IshchiQoralama;
    let completed = false;
    const saving = f2IshchiSaqla(draft).then(() => { completed = true; });
    await vi.waitFor(() => expect(tx.oncomplete).not.toBeNull());
    expect(completed).toBe(false); tx.oncomplete!(); await saving; expect(completed).toBe(true);
    tx.oncomplete = null;
    const failed = expect(f2IshchiSaqla(draft)).rejects.toThrow('quota');
    await vi.waitFor(() => expect(tx.oncomplete).not.toBeNull()); tx.onabort!(); await failed;
    expect(db.close).toHaveBeenCalledTimes(2);
  });

  it('never restores a different company or object', async () => {
    const drafts = [{ version: 1, companyId: 8, objectId: 3, savedAt: 5 }, { version: 1, companyId: 5, objectId: 4, savedAt: 9 }];
    vi.stubGlobal('indexedDB', { open: () => {
      const r = { result: { close: vi.fn(), transaction: () => ({ objectStore: () => ({ getAll: () => {
        const read = { result: drafts, onsuccess: null as (() => void) | null }; queueMicrotask(() => read.onsuccess?.()); return read;
      } }) }) }, onsuccess: null as (() => void) | null }; queueMicrotask(() => r.onsuccess?.()); return r;
    } });
    expect(await f2IshchiOl(5, 3)).toBeNull();
    expect(await f2IshchiOl(5, 4)).toMatchObject({ companyId: 5, objectId: 4 });
  });

  it('server saves 1001 unresolved signed/NULL/explicit-zero rows in chunks without creating an act', async () => {
    const nodes = Array.from({ length: 1001 }, (_, i) => node(String(i), i ? 0 : -10));
    nodes[0].narx = null; nodes[0].summa = null;
    const d = { aktlar: [akt(nodes)], aktIdx: 0, objectId: 3, operationId: 'op', sourceOperationId: 'source',
      davr: '2026-10', source: { name: 'F2.xlsx' }, ij: ij([]), rzBog: new Map() } as F2IshchiQoralama;
    const state = await f2ServerSaqla(d, 42);
    expect(api.save.mock.calls.map(([p]) => p.qatorlar.length)).toEqual([1000, 1]);
    expect(api.save.mock.calls[0][0].qatorlar[0]).toMatchObject({ holat: 'hal_qilinmagan', hajm: -10, narx: undefined, summa: undefined });
    expect(api.save.mock.calls[0][0].qatorlar[1]).toMatchObject({ hajm: 0, summa: 0 });
    expect(api.advance.mock.calls[0][0].cursor.complete).toBe(false);
    expect(api.advance.mock.calls[1][0].cursor).toMatchObject({ complete: true, savedRows: 1001, sourceDocumentId: 42 });
    expect(state.rows.size).toBe(1001);
    await f2ServerSaqla(d, 42, state);
    expect(api.save.mock.calls[2][0].qatorlar[0].expectedVersiya).toBe(1);
  });

  it('stale or partially failed server save is never claimed complete or overwritten by blind retry', async () => {
    const d = { aktlar: [akt([node('m', -1)])], aktIdx: 0, objectId: 3, operationId: 'op',
      davr: '2026-10', source: { name: 'F2.xlsx' }, ij: ij([]), rzBog: new Map() } as F2IshchiQoralama;
    api.save.mockResolvedValue({ ok: false, code: 'STALE_DRAFT_VERSION' });
    await expect(f2ServerSaqla(d, 42)).rejects.toThrow('STALE_DRAFT_VERSION');
    expect(d.server?.jobId).toBe(11); expect(api.advance).toHaveBeenCalledTimes(1);
    api.job.mockResolvedValue({ ok: true, obyekt_id: 3, versiya: 2, total_rows: 1, cursor: { phase: 'f2_v3_review', complete: false, savedRows: 1 } });
    api.rows.mockResolvedValue({ ok: true, qatorlar: [{ uid: 'm', holat: 'hal_qilinmagan', versiya: 1 }] });
    await expect(f2ServerOl(11)).rejects.toThrow('to‘liq emas');
  });
});

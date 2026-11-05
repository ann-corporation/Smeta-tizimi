import { describe, expect, it, vi } from 'vitest';
import type { EgizakQator } from './f2-moslash-v3/egizak';
import { aslMoslash, egizakObyektlar, egizakOpId } from './f2-moslash-v3/egizak';
import { faktEgizakReja, faktEgizakYoz, faktdanKiritmalar, qoshimchaXarita, type EgizakTomon } from './fakt-egizak';

const q = (id: number, ota: number | null, tur: string, nom: string, x: Partial<EgizakQator> = {}): EgizakQator =>
  ({ id, ota_id: ota, daraja: 0, tartib: id, tur, kod: null, nom, birlik: tur === 'rz' ? null : 'М3', hajm: tur === 'rz' ? null : 10, qoshimcha: false, ...x });
const asl = (d: number) => [q(1 + d, null, 'rz', 'Bo‘lim'), q(2 + d, 1 + d, 'bl', 'Ish 1', { kod: 'E1' }), q(3 + d, 1 + d, 'mat', 'Beton'), q(4 + d, 1 + d, 'bl', 'Ish 2', { kod: 'E2' })];
const A = asl(0);
const tomon = (id: number, rows: EgizakQator[], smeta: Record<number, number | null>, fakt: Record<number, number> = {}): EgizakTomon =>
  ({ id, nom: `Egizak ${id}`, qatorlar: rows, smeta: new Map(Object.entries(smeta).map(([k, v]) => [Number(k), v])), fakt: new Map(Object.entries(fakt).map(([k, v]) => [Number(k), v])) });

describe('fakt egizak: moslash (F2 egizak yadrosi)', () => {
  it('bir xil tuzilma — qat’iy xarita (aslXarita); yumshoq rejimda topilmaganlar', () => {
    const m = aslMoslash(A, asl(100));
    expect(m.qatiy).toBe(true);
    expect([...m.map]).toEqual([[1, 101], [2, 102], [3, 103], [4, 104]]);
    const kam = asl(100).filter((x) => x.id !== 103);
    const y = aslMoslash(A, kam);
    expect(y.qatiy).toBe(false);
    expect(y.topilmadi).toEqual([3]);
    expect(y.map.get(4)).toBe(104);
  });
  it('egizaklar — bir loyihadagi boshqa obyektlar', () => {
    const o = [{ id: 1, loyiha_id: 5 }, { id: 2, loyiha_id: 5 }, { id: 3, loyiha_id: 6 }, { id: 4, loyiha_id: null }];
    expect(egizakObyektlar(o, 1).map((x) => x.id)).toEqual([2]);
    expect(egizakObyektlar(o, 4)).toEqual([]);
  });
});

describe('fakt egizak: reja', () => {
  it('foiz har egizakning o‘z smetasidan; «+» va «=» saqlanadi', () => {
    const B = asl(100); const C = asl(200);
    const kirit = { 2: { rejim: '+' as const, qiymat: '50%' }, 4: { rejim: '=' as const, qiymat: '6' } };
    const rb = faktEgizakReja(A, kirit, tomon(10, B, { 102: 10, 104: 10 }, { 104: 1 }), new Map());
    const rc = faktEgizakReja(A, kirit, tomon(11, C, { 202: 40, 204: 10 }), new Map());
    expect(rb.paket).toEqual([{ qator_id: 102, hajm: 5 }, { qator_id: 104, hajm: 5 }]);
    expect(rc.paket).toEqual([{ qator_id: 202, hajm: 20 }, { qator_id: 204, hajm: 6 }]);
    expect(rb.moslar.map((x) => x.rejim)).toEqual(['+', '=']);
    expect(rb.moslar[1]).toMatchObject({ joriy: 1, delta: 5, yangi: 6 });
  });
  it('mos kelmagan qatorlar sabab bilan; minus hajm va F2 dan kam fakt ruxsat', () => {
    const B = asl(100).filter((x) => x.id !== 103);
    const kirit = { 3: { rejim: '+' as const, qiymat: '2' }, 2: { rejim: '+' as const, qiymat: '-1' }, 1: { rejim: '+' as const, qiymat: '1' }, 99: { rejim: '+' as const, qiymat: '1' } };
    const r = faktEgizakReja([...A, q(99, 1, 'mat', 'Qo‘shimcha', { qoshimcha: true })], kirit, tomon(10, B, { 102: 10, 104: 10 }, { 102: 4 }), new Map());
    expect(r.paket).toEqual([{ qator_id: 102, hajm: -1 }]);
    expect(Object.fromEntries(r.radlar.map((x) => [x.aId, x.sabab]))).toEqual({ 3: 'topilmadi', 1: 'tur', 99: 'qoshimcha_yoq' });
  });
  it('smetasiz egizakda foiz — to‘qilmaydi (FOIZ_SMETASIZ); NULL ≠ 0', () => {
    const r = faktEgizakReja(A, { 2: { rejim: '=', qiymat: '50%' } }, tomon(10, asl(100), { 102: null }), new Map());
    expect(r.paket).toEqual([]);
    expect(r.radlar).toEqual([{ aId: 2, nom: 'Ish 1', sabab: 'FOIZ_SMETASIZ' }]);
  });
  it('qo‘shimcha qator operation_id orqali egizakdagi nusxasiga', async () => {
    const aq = q(50, 1, 'mat', 'Qosh', { qoshimcha: true });
    const bq = q(150, 101, 'mat', 'Qosh', { qoshimcha: true, operation_id: (await egizakOpId(50, 10)).toUpperCase() });
    const x = await qoshimchaXarita([...A, aq], [...asl(100), bq], 10);
    expect(x.get(50)).toBe(150);
    const r = faktEgizakReja([...A, aq], { 50: { rejim: '+', qiymat: '3' } }, tomon(10, [...asl(100), bq], { 150: 5 }), x);
    expect(r.paket).toEqual([{ qator_id: 150, hajm: 3 }]);
  });
  it('qo‘shimcha qator egizakda alohida qo‘shilgan (operation_id yo‘q) — mazmun kaliti bo‘yicha, faqat yagona mos bo‘lsa', async () => {
    const aq = q(50, 1, 'bl', 'ЗАСЫПКА ТРАНШЕЙ', { qoshimcha: true, kod: 'E1-1-33', hajm: 0.66 });
    const bq = q(150, 101, 'bl', 'ЗАСЫПКА  ТРАНШЕЙ', { qoshimcha: true, kod: 'E1-1-33', hajm: '0.66' });
    const x = await qoshimchaXarita([...A, aq], [...asl(100), bq], 10);
    expect(x.get(50)).toBe(150);
    // egizakda ikkita bir xil qo'shimcha — taxmin qilinmaydi
    const bq2 = q(151, 101, 'bl', 'ЗАСЫПКА ТРАНШЕЙ', { qoshimcha: true, kod: 'E1-1-33', hajm: 0.66 });
    expect((await qoshimchaXarita([...A, aq], [...asl(100), bq, bq2], 10)).has(50)).toBe(false);
    // hajm farq qilsa — bog'lanmaydi
    const bq3 = q(152, 101, 'bl', 'ЗАСЫПКА ТРАНШЕЙ', { qoshimcha: true, kod: 'E1-1-33', hajm: 0.7 });
    expect((await qoshimchaXarita([...A, aq], [...asl(100), bq3], 10)).has(50)).toBe(false);
  });
  it('faktdanKiritmalar: faqat bl/mat/ob va fakt ≠ 0', () => {
    expect(faktdanKiritmalar([{ id: 1, tur: 'bl', fakt: 4 }, { id: 2, tur: 'rs', fakt: 4 }, { id: 3, tur: 'mat', fakt: 0 }, { id: 4, tur: 'ob', fakt: -2 }]))
      .toEqual({ 1: { rejim: '=', qiymat: '4' }, 4: { rejim: '=', qiymat: '-2' } });
  });
});

describe('fakt egizak: yozish — egizaklar bir-biriga to‘sqinlik qilmaydi', () => {
  const rejalar = () => [10, 11, 12].map((id) => faktEgizakReja(A, { 4: { rejim: '=', qiymat: '6' } }, tomon(id, asl(id * 10), { [id * 10 + 4]: 10 }, { [id * 10 + 4]: 1 }), new Map()));
  it('bitta egizakda ziddiyat — shu egizak to‘xtaydi, qolganlari yoziladi; har biri o‘z operation_id si bilan', async () => {
    const yoz = vi.fn(async (_o: number, _p: unknown, _op: string) => ({ ok: true }));
    const ops = new Map([[10, 'op-10'], [11, 'op-11'], [12, 'op-12']]);
    const res = await faktEgizakYoz(rejalar(), ops, {
      serverFakt: async (oid, idlar) => new Map(idlar.map((i) => [i, oid === 11 ? 3 : 1] as const)), // 11 da fakt boshqa joyda o‘zgargan
      yoz,
    });
    expect(res.map((x) => x.holat)).toEqual(['yozildi', 'ziddiyat', 'yozildi']);
    expect(yoz.mock.calls.map((c) => [c[0], c[2]])).toEqual([[10, 'op-10'], [12, 'op-12']]);
  });
  it('xato (tarmoq/ruxsat) faqat o‘z egizagini to‘xtatadi', async () => {
    const yoz = vi.fn(async (oid: number) => { if (oid === 10) throw new Error('403'); return oid === 11 ? { ok: false, xato: 'FAKT_LINE_INVALID' } : { ok: true }; });
    const ops = new Map([[10, 'a'], [11, 'b'], [12, 'c']]);
    const res = await faktEgizakYoz(rejalar(), ops, { serverFakt: async (_o, idlar) => new Map(idlar.map((i) => [i, 1] as const)), yoz });
    expect(res.map((x) => x.holat)).toEqual(['xato', 'xato', 'yozildi']);
    expect(res[1].xabar).toBe('FAKT_LINE_INVALID');
  });
});

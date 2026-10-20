import { describe, expect, it, vi } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import type { IshJoyi } from './ishJoyi';
import { ijniAlmashtir, rejaliniYoz, rejaliOchir, rejaliQatorlar, yangiTempIdlar, type RejaliBuyruq } from './rejali';

const q = (id: number, ota: number | null, tartib: number) => ({ id, ota_id: ota, tartib, tur: 'bl', nom: `Q${id}` }) as unknown as T2Qator;
const ROWS = [q(1, null, 1), q(10, 1, 1), q(11, 1, 2), q(12, 1, 3)];
const b = (o: Partial<RejaliBuyruq>): RejaliBuyruq => ({
  tempId: -1, resursTempIds: [], f2Uid: 'f', f2ResursUidlar: [], kind: 'additional', tur: 'bl', otaQatorId: 1,
  nom: 'YANGI', birlik: 'м3', hajm: 2, sabab: 's', resurslar: [], operationId: 'op', ...o,
});
const ij = (pairs: Array<[string, number]>): IshJoyi => ({ bog: new Map(pairs.map(([u, id]) => [u, { qatorId: id, holat: 'qolda', usul: 'qolda' }])), otkaz: new Set() } as unknown as IshJoyi);

describe('F2 import — rejali (oxirida bittada yoziladigan) o‘zgarishlar', () => {
  it('vaqtinchalik id lar manfiy va to‘qnashmaydi', () => {
    expect(yangiTempIdlar([], 3)).toEqual([-1, -2, -3]);
    expect(yangiTempIdlar([-1, -2, -5], 2)).toEqual([-6, -7]);
  });

  it('joylashuv: zamena eski qatordan keyin, keyinId bo‘lsa undan keyin, aks holda oxirida; resurslar ish ichida', () => {
    const v = rejaliQatorlar([
      b({ tempId: -1, kind: 'replacement', almashtirilayotganQatorId: 11, keyinQatorId: 11 }),
      b({ tempId: -2, keyinQatorId: 10 }),
      b({ tempId: -3, resursTempIds: [-4], resurslar: [{ tur: 'mat', nom: 'QUM', birlik: 'м3', hajm: 1 }] }),
    ], ROWS);
    const t = new Map(v.map((r) => [r.id, r]));
    expect(t.get(-1)!.tartib).toBe(2.5);
    expect((t.get(-1) as T2Qator & { zamena: boolean }).zamena).toBe(true);
    expect(t.get(-2)!.tartib).toBe(1.5);
    expect(Number(t.get(-3)!.tartib)).toBeGreaterThan(3);
    expect(t.get(-4)!.ota_id).toBe(-3);
  });

  it('bog‘lanishlardagi vaqtinchalik id lar haqiqiysiga almashtiriladi, boshqalari o‘zgarmaydi', () => {
    const r = ijniAlmashtir(ij([['a', -1], ['b', 10]]), new Map([[-1, 500]]));
    expect(r.bog.get('a')!.qatorId).toBe(500);
    expect(r.bog.get('b')!.qatorId).toBe(10);
  });

  it('buyruqni olib tashlash unga tayangan buyruqlarni ham oladi va F2 qatorlarini bo‘shatadi', () => {
    const list = [b({ tempId: -1, resursTempIds: [-2] }), b({ tempId: -3, kind: 'resource', tur: 'mat', otaQatorId: -1 }), b({ tempId: -4 })];
    const r = rejaliOchir(list, ij([['a', -1], ['ar', -2], ['c', -3], ['d', -4], ['e', 10]]), -1);
    expect(r.buyruqlar.map((x) => x.tempId)).toEqual([-4]);
    expect([...r.ij.bog.keys()].sort()).toEqual(['d', 'e']);
  });

  it('ketma-ket yoziladi: ota vaqtinchalik bo‘lsa haqiqiy id ishlatiladi; xatoda to‘xtaydi, qolganlari saqlanadi', async () => {
    const yarat = vi.fn(async (x: RejaliBuyruq, real: { otaQatorId: number }) => {
      if (x.tempId === -4) throw new Error('STALE_VERSION');
      return { qatorId: 100 - x.tempId, resursIdlar: x.resursTempIds.map((t) => 200 - t) };
    });
    const versiya = vi.fn(async () => 7);
    const list = [b({ tempId: -1, resursTempIds: [-2] }), b({ tempId: -3, kind: 'resource', tur: 'mat', otaQatorId: -1 }), b({ tempId: -4 }), b({ tempId: -5 })];
    const r = await rejaliniYoz(list, { yarat, versiya });
    expect(r.map.get(-1)).toBe(101); expect(r.map.get(-2)).toBe(202); expect(r.map.get(-3)).toBe(103);
    expect(yarat.mock.calls[1][1]).toMatchObject({ otaQatorId: 101, otaVersiya: 7 });
    expect(r.qolgan.map((x) => x.tempId)).toEqual([-4, -5]);
    expect(r.xato).toMatch(/STALE_VERSION/);
  });
});

describe('rejali yozish — ota versiyasi keshlanadi', () => {
  it('javobda otaVersiya bo‘lsa keyingi buyruq versiyani qayta o‘qimaydi', async () => {
    let v = 5;
    const yarat = vi.fn(async (x: RejaliBuyruq, real: { otaVersiya: number }) => ({ qatorId: 100 - x.tempId + real.otaVersiya * 0, resursIdlar: [], otaVersiya: ++v }));
    const versiya = vi.fn(async () => 5);
    const list = [b({ tempId: -1 }), b({ tempId: -2 }), b({ tempId: -3 })];
    await rejaliniYoz(list, { yarat, versiya });
    expect(versiya).toHaveBeenCalledTimes(1);
    expect(yarat.mock.calls.map((c) => c[1].otaVersiya)).toEqual([5, 6, 7]);
  });
});

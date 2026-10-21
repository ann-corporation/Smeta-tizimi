import { describe, expect, it, vi } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import { BOLIM_ILDIZ, rejaliniYoz, rejaliOchir, rejaliQatorlar, type RejaliBuyruq } from './rejali';
import type { IshJoyi } from './ishJoyi';

/* Egasi 2026-10-21: «razdelni yasash va o'chirish funksiyasi ham kerak» — bo'lim ham qoralamada, «F2 ni yozish» da yoziladi. */
const q = (id: number, ota: number | null, tartib: number, tur = 'bl') => ({ id, ota_id: ota, tartib, tur, nom: `Q${id}` }) as unknown as T2Qator;
const ROWS = [q(1, null, 1, 'rz'), q(10, 1, 2), q(2, null, 5, 'rz')];
const b = (o: Partial<RejaliBuyruq>): RejaliBuyruq => ({
  tempId: -1, resursTempIds: [], f2Uid: '', f2ResursUidlar: [], kind: 'bolim', tur: 'rz', otaQatorId: BOLIM_ILDIZ,
  nom: 'КРОВЛЯ', birlik: '', sabab: 's', resurslar: [], operationId: 'op', ...o,
});

describe('F2 import — qoralamadagi bo‘lim', () => {
  it('yuqori darajadagi bo‘lim ildizda (ota yo‘q) va oxirida; keyinId berilsa o‘sha bo‘limdan keyin; ichki bo‘lim — ota ichida', () => {
    const v = rejaliQatorlar([
      b({ tempId: -1 }),
      b({ tempId: -2, nom: 'ПОЛ', keyinQatorId: 1 }),
      b({ tempId: -3, nom: 'СТЯЖКА', otaQatorId: -2 }),
      b({ tempId: -4, kind: 'additional', tur: 'bl', otaQatorId: -3, nom: 'СТЯЖКА 50 ММ', birlik: 'м2', hajm: 10 }),
    ], ROWS);
    const t = new Map(v.map((r) => [r.id, r]));
    expect(t.get(-1)!.ota_id).toBeNull();
    expect(t.get(-1)!.tur).toBe('rz');
    expect(Number(t.get(-1)!.tartib)).toBeGreaterThan(5);
    expect(t.get(-2)!.ota_id).toBeNull();
    expect(t.get(-2)!.tartib).toBe(1.5);
    expect(t.get(-3)!.ota_id).toBe(-2);
    expect(t.get(-4)!.ota_id).toBe(-3);
  });

  it('«F2 ni yozish»: bo‘lim avval yoziladi (ildiz = 0), ichidagi ish haqiqiy id bilan; bo‘limni olib tashlash ichidagilarni ham oladi', async () => {
    const buyruqlar = [b({ tempId: -1 }), b({ tempId: -2, kind: 'additional', tur: 'bl', otaQatorId: -1, nom: 'ISH', birlik: 'м2', hajm: 3, f2Uid: 'f' })];
    const yarat = vi.fn(async (x: RejaliBuyruq, real: { otaQatorId: number }) => ({ qatorId: x.kind === 'bolim' ? 900 : 901, resursIdlar: [], otaVersiya: real.otaQatorId === 900 ? 2 : null }));
    const versiya = vi.fn(async () => 1);
    const r = await rejaliniYoz(buyruqlar, { yarat, versiya });
    expect(r.xato).toBeUndefined();
    expect(yarat.mock.calls[0][1]).toMatchObject({ otaQatorId: BOLIM_ILDIZ });
    expect(yarat.mock.calls[1][1]).toMatchObject({ otaQatorId: 900, otaVersiya: 1 });
    expect(r.map.get(-1)).toBe(900); expect(r.map.get(-2)).toBe(901);
    const ij = { bog: new Map([['f', { qatorId: -2, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() } as unknown as IshJoyi;
    const o = rejaliOchir(buyruqlar, ij, -1);
    expect(o.buyruqlar).toEqual([]);
    expect(o.ij.bog.has('f')).toBe(false);
  });
});
